"""WebSocket route handlers for admin, participant, and display connections."""

import json
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.models.quiz_session import QuizSession, SessionStatus
from app.models.question import Question
from app.models.participant import Participant
from app.models.response import Response
from app.websocket.manager import manager
from app.services.scoring import calculate_scores, get_leaderboard_data

router = APIRouter()


def get_db_session():
    """Get a database session for WebSocket handlers."""
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


@router.websocket("/ws/admin/{session_id}")
async def admin_websocket(websocket: WebSocket, session_id: str, token: str = Query(...)):
    """WebSocket endpoint for admin controlling a quiz session."""
    # Verify token
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = payload.get("sub")
    db = get_db_session()

    try:
        # Verify session ownership
        session = db.query(QuizSession).filter(
            QuizSession.id == session_id,
            QuizSession.creator_id == user_id,
        ).first()

        if not session:
            await websocket.close(code=4004, reason="Session not found")
            db.close()
            return

        await manager.connect(websocket, session_id, "admin", user_id)

        # Send initial state
        await websocket.send_json({
            "type": "connection_established",
            "data": {
                "session_id": session_id,
                "status": session.status,
                "connected_participants": manager.get_participant_count(session_id),
            }
        })

        # Listen for admin commands
        while True:
            data = await websocket.receive_json()
            await handle_admin_message(data, session_id, db)

    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id, "admin", user_id)
    except Exception as e:
        manager.disconnect(websocket, session_id, "admin", user_id)
    finally:
        db.close()


@router.websocket("/ws/participant/{session_id}")
async def participant_websocket(
    websocket: WebSocket,
    session_id: str,
    participant_id: str = Query(...),
):
    """WebSocket endpoint for participants in a quiz session."""
    db = get_db_session()

    try:
        # Verify participant
        participant = db.query(Participant).filter(
            Participant.id == participant_id,
            Participant.session_id == session_id,
        ).first()

        if not participant:
            await websocket.close(code=4004, reason="Participant not found")
            db.close()
            return

        await manager.connect(websocket, session_id, "participant", participant_id)

        # Update participant status
        participant.is_connected = True
        participant.last_active = datetime.utcnow()
        db.commit()

        # Notify admin of new connection
        await manager.send_to_admin(session_id, {
            "type": "participant_connected",
            "data": {
                "participant_id": participant_id,
                "team_name": participant.team_name,
                "connected_count": manager.get_participant_count(session_id),
            }
        })

        # Also notify displays
        await manager.send_to_displays(session_id, {
            "type": "participant_count_update",
            "data": {"count": manager.get_participant_count(session_id)}
        })

        # Send current session state to participant
        session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
        await websocket.send_json({
            "type": "connection_established",
            "data": {
                "session_id": session_id,
                "status": session.status,
                "team_name": participant.team_name,
            }
        })

        # If quiz is already active and on a question, send it
        if session.status == SessionStatus.ACTIVE.value and session.current_question_index >= 0:
            question = db.query(Question).filter(
                Question.session_id == session_id,
                Question.order_index == session.current_question_index,
            ).first()
            if question:
                # Check if participant already answered
                existing_response = db.query(Response).filter(
                    Response.participant_id == participant_id,
                    Response.question_id == question.id,
                ).first()

                if existing_response:
                    await websocket.send_json({
                        "type": "already_answered",
                        "data": {"question_index": session.current_question_index}
                    })
                else:
                    import json as _json
                    _img_urls = []
                    if question.image_urls:
                        try:
                            _img_urls = _json.loads(question.image_urls)
                        except:
                            _img_urls = []
                    await websocket.send_json({
                        "type": "question_started",
                        "data": {
                            "question_id": question.id,
                            "question_index": session.current_question_index,
                            "question_text": question.question_text,
                            "question_type": question.question_type or "mcq",
                            "image_urls": _img_urls,
                            "options": [
                                {"label": opt.option_label, "text": opt.option_text}
                                for opt in question.options
                            ],
                            "timer_seconds": question.timer_seconds,
                            "server_time": datetime.utcnow().isoformat(),
                            "total_questions": len(session.questions),
                        }
                    })

        # Listen for participant messages
        while True:
            data = await websocket.receive_json()
            await handle_participant_message(data, session_id, participant_id, db)

    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id, "participant", participant_id)
        # Update participant status
        try:
            participant = db.query(Participant).filter(
                Participant.id == participant_id
            ).first()
            if participant:
                participant.is_connected = False
                db.commit()
        except Exception:
            pass

        # Notify admin
        await manager.send_to_admin(session_id, {
            "type": "participant_disconnected",
            "data": {
                "participant_id": participant_id,
                "connected_count": manager.get_participant_count(session_id),
            }
        })
    except Exception:
        manager.disconnect(websocket, session_id, "participant", participant_id)
    finally:
        db.close()


@router.websocket("/ws/display/{session_id}")
async def display_websocket(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for public display/leaderboard screens."""
    db = get_db_session()

    try:
        # Look up by ID first, then by session code
        session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
        if not session:
            session = db.query(QuizSession).filter(
                QuizSession.session_code == session_id.upper()
            ).first()
        if not session:
            await websocket.close(code=4004, reason="Session not found")
            db.close()
            return

        actual_session_id = session.id
        display_id = f"display_{id(websocket)}"
        await manager.connect(websocket, actual_session_id, "display", display_id)

        # Send initial state
        await websocket.send_json({
            "type": "connection_established",
            "data": {
                "session_id": actual_session_id,
                "session_title": session.title,
                "status": session.status,
                "participant_count": manager.get_participant_count(actual_session_id),
                "total_questions": len(session.questions),
                "current_question_index": session.current_question_index,
            }
        })

        # Keep connection alive
        while True:
            try:
                data = await websocket.receive_json()
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Display WebSocket error: {e}")
    finally:
        manager.disconnect(websocket, actual_session_id if 'actual_session_id' in dir() else session_id, "display", display_id if 'display_id' in dir() else "")
        db.close()


async def handle_admin_message(data: dict, session_id: str, db: Session):
    """Handle messages from the admin WebSocket."""
    msg_type = data.get("type")

    if msg_type == "start_question":
        index = data.get("data", {}).get("index")
        await start_question(session_id, db, index)

    elif msg_type == "end_question":
        await end_question(session_id, db)

    elif msg_type == "reveal_answer":
        await reveal_answer(session_id, db)

    elif msg_type == "show_leaderboard":
        await show_leaderboard(session_id, db)

    elif msg_type == "next_question":
        await next_question(session_id, db)

    elif msg_type == "go_to_question":
        index = data.get("data", {}).get("index", 0)
        await go_to_question(session_id, index, db)

    elif msg_type == "ping":
        await manager.send_to_admin(session_id, {"type": "pong"})


async def start_question(session_id: str, db: Session, index=None):
    """Start the current question - send it to all participants.
    Clears any previous responses for this question so participants can re-answer.
    """
    import json as _json

    session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
    if not session or session.status != SessionStatus.ACTIVE.value:
        return

    # If index is provided, update current_question_index
    if index is not None:
        session.current_question_index = index
        db.commit()

    question = db.query(Question).filter(
        Question.session_id == session_id,
        Question.order_index == session.current_question_index,
    ).first()

    if not question:
        return

    # Clear previous responses for this question (allows re-answering on restart)
    db.query(Response).filter(Response.question_id == question.id).delete()
    db.commit()

    image_urls = []
    if question.image_urls:
        try:
            image_urls = _json.loads(question.image_urls)
        except:
            image_urls = []

    message = {
        "type": "question_started",
        "data": {
            "question_id": question.id,
            "question_index": session.current_question_index,
            "question_text": question.question_text,
            "question_type": question.question_type or "mcq",
            "image_urls": image_urls,
            "options": [
                {"label": opt.option_label, "text": opt.option_text}
                for opt in question.options
            ],
            "timer_seconds": question.timer_seconds,
            "server_time": datetime.utcnow().isoformat(),
            "total_questions": len(session.questions),
        }
    }

    # Broadcast to all (participants, display, admin gets confirmation)
    await manager.send_to_session(session_id, message)


async def end_question(session_id: str, db: Session):
    """End the current question - stop accepting answers, auto-reveal answer."""
    session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
    if not session:
        return

    question = db.query(Question).filter(
        Question.session_id == session_id,
        Question.order_index == session.current_question_index,
    ).first()

    if not question:
        return

    # Calculate scores for this question
    calculate_scores(db, question.id, session_id)

    # Get response statistics
    total_responses = db.query(Response).filter(
        Response.question_id == question.id
    ).count()

    correct_responses = db.query(Response).filter(
        Response.question_id == question.id,
        Response.is_correct == True,
    ).count()

    # Get correct responses ranked by response time (fastest first) - per-question leaderboard
    from app.models.participant import Participant as ParticipantModel
    correct_answers = (
        db.query(Response, ParticipantModel.team_name)
        .join(ParticipantModel, Response.participant_id == ParticipantModel.id)
        .filter(Response.question_id == question.id, Response.is_correct == True)
        .order_by(Response.response_time.asc())
        .all()
    )

    per_question_leaderboard = []
    for rank, (resp, team_name) in enumerate(correct_answers, 1):
        per_question_leaderboard.append({
            "rank": rank,
            "team_name": team_name,
            "response_time": round(resp.response_time, 2),
            "points": resp.points_awarded,
        })

    # Get wrong answers (for display context, not ranked)
    wrong_answers = (
        db.query(Response, ParticipantModel.team_name)
        .join(ParticipantModel, Response.participant_id == ParticipantModel.id)
        .filter(Response.question_id == question.id, Response.is_correct == False)
        .order_by(Response.response_time.asc())
        .all()
    )

    wrong_list = []
    for resp, team_name in wrong_answers:
        wrong_list.append({
            "team_name": team_name,
            "selected_answer": resp.selected_answer,
            "response_time": round(resp.response_time, 2),
        })

    # Send question_ended first
    await manager.send_to_session(session_id, {
        "type": "question_ended",
        "data": {
            "question_index": session.current_question_index,
            "submissions_count": total_responses,
        }
    })

    # Auto-reveal the answer with per-question leaderboard
    await manager.send_to_session(session_id, {
        "type": "answer_revealed",
        "data": {
            "question_index": session.current_question_index,
            "correct_answer": question.correct_answer,
            "explanation": question.explanation,
            "total_responses": total_responses,
            "correct_responses": correct_responses,
            "correct_percentage": round(
                (correct_responses / total_responses * 100) if total_responses > 0 else 0, 1
            ),
            "per_question_leaderboard": per_question_leaderboard,
            "wrong_answers": wrong_list,
        }
    })


async def reveal_answer(session_id: str, db: Session):
    """Reveal the correct answer for the current question."""
    session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
    if not session:
        return

    question = db.query(Question).filter(
        Question.session_id == session_id,
        Question.order_index == session.current_question_index,
    ).first()

    if not question:
        return

    # Get response statistics
    total_responses = db.query(Response).filter(
        Response.question_id == question.id
    ).count()

    correct_responses = db.query(Response).filter(
        Response.question_id == question.id,
        Response.is_correct == True,
    ).count()

    message = {
        "type": "answer_revealed",
        "data": {
            "question_index": session.current_question_index,
            "correct_answer": question.correct_answer,
            "explanation": question.explanation,
            "total_responses": total_responses,
            "correct_responses": correct_responses,
            "correct_percentage": round(
                (correct_responses / total_responses * 100) if total_responses > 0 else 0, 1
            ),
        }
    }
    await manager.send_to_session(session_id, message)


async def show_leaderboard(session_id: str, db: Session):
    """Send leaderboard data to all connected clients."""
    leaderboard = get_leaderboard_data(db, session_id)

    message = {
        "type": "leaderboard_update",
        "data": leaderboard,
    }
    await manager.send_to_session(session_id, message)


async def next_question(session_id: str, db: Session):
    """Move to the next question."""
    session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
    if not session:
        return

    next_index = session.current_question_index + 1
    total_questions = len(session.questions)

    if next_index >= total_questions:
        # Quiz is complete
        session.status = SessionStatus.COMPLETED.value
        session.ended_at = datetime.utcnow()
        db.commit()

        await manager.send_to_session(session_id, {
            "type": "quiz_completed",
            "data": {
                "total_questions": total_questions,
                "leaderboard": get_leaderboard_data(db, session_id),
            }
        })
        return

    session.current_question_index = next_index
    db.commit()

    # Notify all clients
    await manager.send_to_session(session_id, {
        "type": "next_question_ready",
        "data": {
            "question_index": next_index,
            "total_questions": total_questions,
        }
    })


async def go_to_question(session_id: str, index: int, db: Session):
    """Navigate to a specific question index (prev/next arrows)."""
    session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
    if not session:
        return

    total_questions = len(session.questions)
    if index < 0 or index >= total_questions:
        return

    session.current_question_index = index
    db.commit()

    # Notify all clients
    await manager.send_to_session(session_id, {
        "type": "next_question_ready",
        "data": {
            "question_index": index,
            "total_questions": total_questions,
        }
    })


async def handle_participant_message(
    data: dict, session_id: str, participant_id: str, db: Session
):
    """Handle messages from participant WebSockets."""
    msg_type = data.get("type")

    if msg_type == "submit_answer":
        await handle_answer_submission(data, session_id, participant_id, db)
    elif msg_type == "ping":
        await manager.send_to_participant(participant_id, {"type": "pong"})


async def handle_answer_submission(
    data: dict, session_id: str, participant_id: str, db: Session
):
    """Process a participant's answer submission."""
    answer_data = data.get("data", {})
    question_id = answer_data.get("question_id")
    selected_answer = answer_data.get("selected_answer", "")
    response_time = answer_data.get("response_time", 0)

    if not question_id or not selected_answer:
        await manager.send_to_participant(participant_id, {
            "type": "error",
            "data": {"message": "Invalid submission data"}
        })
        return

    # Check for duplicate submission
    existing = db.query(Response).filter(
        Response.participant_id == participant_id,
        Response.question_id == question_id,
    ).first()

    if existing:
        await manager.send_to_participant(participant_id, {
            "type": "error",
            "data": {"message": "Already submitted an answer for this question"}
        })
        return

    # Get the question to check correctness
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        await manager.send_to_participant(participant_id, {
            "type": "error",
            "data": {"message": "Question not found"}
        })
        return

    # Verify session is still active
    session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
    if not session or session.status != SessionStatus.ACTIVE.value:
        await manager.send_to_participant(participant_id, {
            "type": "error",
            "data": {"message": "Session is not active"}
        })
        return

    # Determine correctness based on question type
    question_type = question.question_type or "mcq"
    if question_type == "mcq":
        selected_answer = selected_answer.upper()
        is_correct = selected_answer == question.correct_answer
    else:
        # Text type: case-insensitive, trimmed comparison
        is_correct = selected_answer.strip().lower() == question.correct_answer.strip().lower()

    # Create response
    response = Response(
        participant_id=participant_id,
        question_id=question_id,
        session_id=session_id,
        selected_answer=selected_answer,
        is_correct=is_correct,
        response_time=response_time,
        submitted_at=datetime.utcnow(),
    )
    db.add(response)
    db.commit()

    # Confirm to participant
    await manager.send_to_participant(participant_id, {
        "type": "answer_submitted",
        "data": {
            "question_id": question_id,
            "submitted": True,
        }
    })

    # Notify admin of submission count
    submission_count = db.query(Response).filter(
        Response.question_id == question_id
    ).count()

    total_participants = db.query(Participant).filter(
        Participant.session_id == session_id
    ).count()

    await manager.send_to_admin(session_id, {
        "type": "submission_update",
        "data": {
            "question_id": question_id,
            "submissions": submission_count,
            "total_participants": total_participants,
            "participant_name": db.query(Participant).filter(
                Participant.id == participant_id
            ).first().team_name,
        }
    })

    # Also notify display
    await manager.send_to_displays(session_id, {
        "type": "submission_update",
        "data": {
            "submissions": submission_count,
            "total_participants": total_participants,
        }
    })
