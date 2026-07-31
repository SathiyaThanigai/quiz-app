import io
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.models.quiz_session import QuizSession
from app.models.question import Question, QuestionOption
from app.schemas.question import (
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
)
from app.api.deps import get_current_admin

router = APIRouter(prefix="/sessions/{session_id}/questions", tags=["Questions"])


def get_session_or_404(session_id: str, user_id: str, db: Session) -> QuizSession:
    """Get a session ensuring it belongs to the user."""
    session = db.query(QuizSession).filter(
        QuizSession.id == session_id,
        QuizSession.creator_id == user_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def question_to_response(question: Question) -> dict:
    """Convert question model to response dict with image_urls parsed from JSON."""
    image_urls = []
    if question.image_urls:
        try:
            image_urls = json.loads(question.image_urls)
        except (json.JSONDecodeError, TypeError):
            image_urls = []

    return {
        "id": question.id,
        "session_id": question.session_id,
        "question_text": question.question_text,
        "question_type": question.question_type or "mcq",
        "image_urls": image_urls,
        "correct_answer": question.correct_answer,
        "difficulty": question.difficulty,
        "category": question.category,
        "explanation": question.explanation,
        "timer_seconds": question.timer_seconds,
        "order_index": question.order_index,
        "options": [
            {
                "id": opt.id,
                "option_label": opt.option_label,
                "option_text": opt.option_text,
                "is_correct": opt.is_correct,
            }
            for opt in question.options
        ],
        "created_at": question.created_at,
    }


@router.get("/")
async def list_questions(
    session_id: str,
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """List all questions in a session with optional filters."""
    get_session_or_404(session_id, current_user.id, db)

    query = db.query(Question).filter(Question.session_id == session_id)

    if category:
        query = query.filter(Question.category == category)
    if difficulty:
        query = query.filter(Question.difficulty == difficulty)
    if search:
        query = query.filter(Question.question_text.ilike(f"%{search}%"))

    questions = query.order_by(Question.order_index).all()
    return [question_to_response(q) for q in questions]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_question(
    session_id: str,
    question_data: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Create a new question in a session."""
    get_session_or_404(session_id, current_user.id, db)

    # Determine order_index
    if question_data.order_index is not None:
        order_index = question_data.order_index
    else:
        max_order = db.query(Question).filter(
            Question.session_id == session_id
        ).count()
        order_index = max_order

    # Serialize image_urls to JSON
    image_urls_json = json.dumps(question_data.image_urls) if question_data.image_urls else None

    # Determine correct_answer based on type
    if question_data.question_type == "mcq":
        correct_answer = question_data.correct_answer.upper()
    else:
        correct_answer = question_data.correct_answer.strip()

    # Create question
    question = Question(
        session_id=session_id,
        question_text=question_data.question_text,
        question_type=question_data.question_type,
        image_urls=image_urls_json,
        correct_answer=correct_answer,
        difficulty=question_data.difficulty,
        category=question_data.category,
        explanation=question_data.explanation,
        timer_seconds=question_data.timer_seconds,
        order_index=order_index,
    )
    db.add(question)
    db.flush()

    # Create options only for MCQ
    if question_data.question_type == "mcq" and question_data.options:
        for opt in question_data.options:
            option = QuestionOption(
                question_id=question.id,
                option_label=opt.option_label.upper(),
                option_text=opt.option_text,
                is_correct=(opt.option_label.upper() == correct_answer),
            )
            db.add(option)

    db.commit()
    db.refresh(question)
    return question_to_response(question)


@router.get("/{question_id}")
async def get_question(
    session_id: str,
    question_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Get a specific question."""
    get_session_or_404(session_id, current_user.id, db)

    question = db.query(Question).filter(
        Question.id == question_id,
        Question.session_id == session_id,
    ).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    return question_to_response(question)


@router.put("/{question_id}")
async def update_question(
    session_id: str,
    question_id: str,
    question_data: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Update a question."""
    get_session_or_404(session_id, current_user.id, db)

    question = db.query(Question).filter(
        Question.id == question_id,
        Question.session_id == session_id,
    ).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    update_data = question_data.model_dump(exclude_unset=True, exclude={"options"})

    if "correct_answer" in update_data and update_data["correct_answer"]:
        # For MCQ, uppercase; for text, strip whitespace
        question_type = update_data.get("question_type", question.question_type or "mcq")
        if question_type == "mcq":
            update_data["correct_answer"] = update_data["correct_answer"].upper()
        else:
            update_data["correct_answer"] = update_data["correct_answer"].strip()

    # Handle image_urls serialization
    if "image_urls" in update_data:
        urls = update_data["image_urls"]
        update_data["image_urls"] = json.dumps(urls) if urls else None

    for key, value in update_data.items():
        setattr(question, key, value)

    # Update options if provided (only relevant for MCQ)
    if question_data.options is not None:
        # Remove existing options
        db.query(QuestionOption).filter(
            QuestionOption.question_id == question_id
        ).delete()

        # Create new options
        correct = question.correct_answer
        for opt in question_data.options:
            option = QuestionOption(
                question_id=question_id,
                option_label=opt.option_label.upper(),
                option_text=opt.option_text,
                is_correct=(opt.option_label.upper() == correct),
            )
            db.add(option)
    elif (question.question_type or "mcq") == "text":
        # If switching to text type, remove existing options
        db.query(QuestionOption).filter(
            QuestionOption.question_id == question_id
        ).delete()

    db.commit()
    db.refresh(question)
    return question_to_response(question)


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    session_id: str,
    question_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Delete a question and clean up uploaded images."""
    import os

    get_session_or_404(session_id, current_user.id, db)

    question = db.query(Question).filter(
        Question.id == question_id,
        Question.session_id == session_id,
    ).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Delete uploaded images
    if question.image_urls:
        upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
        try:
            urls = json.loads(question.image_urls)
            for url in urls:
                filename = url.split("/")[-1]
                filepath = os.path.join(upload_dir, filename)
                if os.path.exists(filepath):
                    os.remove(filepath)
        except (json.JSONDecodeError, TypeError, OSError):
            pass

    db.delete(question)
    db.commit()


@router.post("/{question_id}/duplicate")
async def duplicate_question(
    session_id: str,
    question_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Duplicate a question within the same session."""
    get_session_or_404(session_id, current_user.id, db)

    question = db.query(Question).filter(
        Question.id == question_id,
        Question.session_id == session_id,
    ).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Get next order index
    max_order = db.query(Question).filter(
        Question.session_id == session_id
    ).count()

    new_question = Question(
        session_id=session_id,
        question_text=question.question_text,
        question_type=question.question_type or "mcq",
        image_urls=question.image_urls,
        correct_answer=question.correct_answer,
        difficulty=question.difficulty,
        category=question.category,
        explanation=question.explanation,
        timer_seconds=question.timer_seconds,
        order_index=max_order,
    )
    db.add(new_question)
    db.flush()

    for option in question.options:
        new_option = QuestionOption(
            question_id=new_question.id,
            option_label=option.option_label,
            option_text=option.option_text,
            is_correct=option.is_correct,
        )
        db.add(new_option)

    db.commit()
    db.refresh(new_question)
    return question_to_response(new_question)


@router.post("/import")
async def import_questions(
    session_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    """Import questions from CSV or Excel file."""
    import pandas as pd

    get_session_or_404(session_id, current_user.id, db)

    # Read file
    content = await file.read()

    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Use CSV or Excel.",
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

    # Required columns (option columns only required for MCQ)
    required_cols = ["question_text", "correct_answer"]
    missing = [col for col in required_cols if col not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}",
        )

    # Get current max order
    current_count = db.query(Question).filter(
        Question.session_id == session_id
    ).count()

    created_questions = []
    for idx, row in df.iterrows():
        question_type = str(row.get("question_type", "mcq")).strip().lower()
        if question_type not in ("mcq", "text"):
            question_type = "mcq"

        correct = str(row["correct_answer"]).strip()

        if question_type == "mcq":
            correct = correct.upper()
            if correct not in ["A", "B", "C", "D"]:
                continue
            # Check option columns exist for MCQ
            if not all(col in df.columns for col in ["option_a", "option_b", "option_c", "option_d"]):
                continue

        question = Question(
            session_id=session_id,
            question_text=str(row["question_text"]),
            question_type=question_type,
            correct_answer=correct,
            difficulty=str(row.get("difficulty", "")) or None,
            category=str(row.get("category", "")) or None,
            explanation=str(row.get("explanation", "")) or None,
            timer_seconds=int(row.get("timer_seconds", 20)),
            order_index=current_count + idx,
        )
        db.add(question)
        db.flush()

        # Create options only for MCQ
        if question_type == "mcq":
            options_data = [
                ("A", str(row["option_a"])),
                ("B", str(row["option_b"])),
                ("C", str(row["option_c"])),
                ("D", str(row["option_d"])),
            ]

            for label, text in options_data:
                option = QuestionOption(
                    question_id=question.id,
                    option_label=label,
                    option_text=text,
                    is_correct=(label == correct),
                )
                db.add(option)

        created_questions.append(question)

    db.commit()

    # Refresh all
    for q in created_questions:
        db.refresh(q)

    return [question_to_response(q) for q in created_questions]
