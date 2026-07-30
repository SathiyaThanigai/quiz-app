"""Export endpoints for quiz results."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io

from app.core.database import get_db
from app.models.user import User
from app.models.quiz_session import QuizSession
from app.models.participant import Participant
from app.schemas.participant import ParticipantScoreUpdate
from app.api.deps import get_current_admin
from app.services.export import export_results_csv, export_results_excel
from app.services.scoring import adjust_participant_score, get_leaderboard_data

router = APIRouter(prefix="/sessions/{session_id}", tags=["Export & Scoring"])


@router.get("/export/csv")
async def export_csv(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Export session results as CSV."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    csv_content = export_results_csv(db, session_id)

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=quiz_results_{session.session_code}.csv"
        },
    )


@router.get("/export/excel")
async def export_excel(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Export session results as Excel."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    excel_bytes = export_results_excel(db, session_id)

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=quiz_results_{session.session_code}.xlsx"
        },
    )


@router.get("/leaderboard")
async def get_leaderboard(
    session_id: str,
    db: Session = Depends(get_db),
):
    """Get leaderboard for a session (public endpoint)."""
    session = db.query(QuizSession).filter(QuizSession.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return get_leaderboard_data(db, session_id)


@router.post("/adjust-score")
async def adjust_score(
    session_id: str,
    score_data: ParticipantScoreUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Manually adjust a participant's score."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    participant = db.query(Participant).filter(
        Participant.id == score_data.participant_id,
        Participant.session_id == session_id,
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    result = adjust_participant_score(
        db, score_data.participant_id, score_data.score_adjustment, score_data.reason
    )

    return {
        "participant_id": result.id,
        "team_name": result.team_name,
        "new_score": result.total_score,
        "new_rank": result.rank,
    }


@router.get("/participants")
async def list_participants(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """List all participants in a session."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    participants = (
        db.query(Participant)
        .filter(Participant.session_id == session_id)
        .order_by(Participant.rank.asc().nullslast())
        .all()
    )

    return participants
