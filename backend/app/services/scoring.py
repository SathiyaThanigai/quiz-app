"""Speed-based scoring engine for the quiz application.

Scoring Rules:
- Wrong answer = 0 points
- No submission = 0 points
- Correct answers ranked by submission timestamp:
  - 1st correct = 10 points
  - 2nd correct = 9 points
  - 3rd correct = 8 points
  - 4th correct = 7 points
  - 5th correct = 6 points
  - Remaining correct = 5 points
- Identical timestamps receive the same score
"""

from typing import List, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.response import Response
from app.models.participant import Participant
from app.models.question import Question
from app.models.quiz_session import QuizSession


# Points distribution for correct answers by rank
POINTS_DISTRIBUTION = {
    1: 10,
    2: 9,
    3: 8,
    4: 7,
    5: 6,
}
DEFAULT_POINTS = 5  # For ranks 6+


def get_points_for_rank(rank: int) -> int:
    """Get points for a given submission rank."""
    return POINTS_DISTRIBUTION.get(rank, DEFAULT_POINTS)


def calculate_scores(db: Session, question_id: str, session_id: str):
    """
    Calculate and assign scores for a question based on submission speed.

    This processes all correct responses, ranks them by submission time,
    and awards points accordingly.
    """
    # Get all correct responses for this question, ordered by submission time
    correct_responses = (
        db.query(Response)
        .filter(
            Response.question_id == question_id,
            Response.is_correct == True,
        )
        .order_by(Response.response_time.asc())
        .all()
    )

    if not correct_responses:
        return

    # Assign ranks - handle ties (same response_time gets same rank)
    current_rank = 1
    prev_response_time = None

    for i, response in enumerate(correct_responses):
        if prev_response_time is not None and response.response_time != prev_response_time:
            current_rank = i + 1

        response.submission_rank = current_rank
        response.points_awarded = get_points_for_rank(current_rank)
        prev_response_time = response.response_time

    db.commit()

    # Update participant totals
    update_participant_scores(db, session_id)


def update_participant_scores(db: Session, session_id: str):
    """Recalculate total scores for all participants in a session."""
    participants = (
        db.query(Participant)
        .filter(Participant.session_id == session_id)
        .all()
    )

    for participant in participants:
        # Get all responses for this participant in this session
        responses = (
            db.query(Response)
            .filter(
                Response.participant_id == participant.id,
                Response.session_id == session_id,
            )
            .all()
        )

        total_score = sum(r.points_awarded for r in responses)
        correct_answers = sum(1 for r in responses if r.is_correct)
        response_times = [r.response_time for r in responses if r.is_correct]

        participant.total_score = total_score
        participant.correct_answers = correct_answers

        if response_times:
            participant.total_response_time = sum(response_times)
            participant.fastest_response_time = min(response_times)
        else:
            participant.total_response_time = 0.0
            participant.fastest_response_time = None

    db.commit()

    # Update ranks
    update_participant_ranks(db, session_id)


def update_participant_ranks(db: Session, session_id: str):
    """
    Update participant ranks using standard competition ranking (1, 2, 2, 4).
    Based on:
    1. Total Score (descending)
    2. Correct Answers (descending)
    3. Average Response Time (ascending - faster is better)
    """
    participants = (
        db.query(Participant)
        .filter(Participant.session_id == session_id)
        .all()
    )

    # Sort participants
    def sort_key(p):
        avg_time = (
            p.total_response_time / p.correct_answers
            if p.correct_answers > 0
            else float('inf')
        )
        return (-p.total_score, -p.correct_answers, avg_time)

    sorted_participants = sorted(participants, key=sort_key)

    # Standard competition ranking: shared ranks for ties
    current_rank = 1
    for i, participant in enumerate(sorted_participants):
        if i > 0:
            prev = sorted_participants[i - 1]
            # If score differs, rank jumps to position
            if participant.total_score != prev.total_score:
                current_rank = i + 1
        participant.rank = current_rank

    db.commit()


def get_leaderboard_data(db: Session, session_id: str) -> Dict[str, Any]:
    """Get formatted final leaderboard data for a session with accuracy stats."""
    # Get session info
    session = db.query(QuizSession).filter(QuizSession.id == session_id).first()
    if not session:
        return {"entries": [], "total_questions": 0, "current_question": 0}

    total_questions = len(session.questions)
    questions_asked = session.current_question_index + 1 if session.current_question_index >= 0 else 0

    # Get participants ordered by rank
    participants = (
        db.query(Participant)
        .filter(Participant.session_id == session_id)
        .order_by(Participant.rank.asc().nullslast())
        .all()
    )

    entries = []
    for participant in participants:
        # Count wrong answers
        wrong_answers = (
            db.query(Response)
            .filter(
                Response.participant_id == participant.id,
                Response.session_id == session_id,
                Response.is_correct == False,
            )
            .count()
        )

        total_answered = participant.correct_answers + wrong_answers
        accuracy = round((participant.correct_answers / questions_asked * 100), 1) if questions_asked > 0 else 0.0

        avg_response_time = (
            round(participant.total_response_time / participant.correct_answers, 2)
            if participant.correct_answers > 0
            else 0.0
        )

        entries.append({
            "rank": participant.rank or 0,
            "participant_id": participant.id,
            "team_name": participant.team_name,
            "total_score": participant.total_score,
            "correct_answers": participant.correct_answers,
            "wrong_answers": wrong_answers,
            "accuracy": accuracy,
            "average_response_time": avg_response_time,
            "fastest_response_time": (
                round(participant.fastest_response_time, 2)
                if participant.fastest_response_time
                else None
            ),
        })

    return {
        "session_id": session_id,
        "entries": entries,
        "total_questions": total_questions,
        "current_question": questions_asked,
    }


def adjust_participant_score(
    db: Session, participant_id: str, adjustment: int, reason: str = None
):
    """Manually adjust a participant's score (admin action)."""
    participant = db.query(Participant).filter(
        Participant.id == participant_id
    ).first()

    if not participant:
        return None

    participant.total_score += adjustment
    db.commit()

    # Update ranks
    update_participant_ranks(db, participant.session_id)
    return participant
