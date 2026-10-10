from typing import List, Dict

from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)

from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from app.database.database import get_db

from app.services.interview_evaluation_service import (
    evaluate_interview
)


router = APIRouter(
    prefix="/interview",
    tags=["Interview"]
)


# =========================================================
# Request Models
# =========================================================

class InterviewAnswer(BaseModel):

    question: str

    answer: str


class InterviewEvaluationRequest(BaseModel):

    candidate_id: int

    job_id: int

    answers: List[InterviewAnswer] = Field(
        default_factory=list
    )


# =========================================================
# Endpoint
# =========================================================

@router.post("/evaluate")
def evaluate_candidate_interview(
    request: InterviewEvaluationRequest,
    db: Session = Depends(get_db)
):

    if not request.answers:

        raise HTTPException(
            status_code=400,
            detail="At least one interview answer is required."
        )

    try:

        interview_data = [
            answer.model_dump()
            for answer in request.answers
        ]

        result = evaluate_interview(
            db=db,
            candidate_id=request.candidate_id,
            job_id=request.job_id,
            interview_data=interview_data
        )

        return result

    except ValueError as e:

        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                f"Interview evaluation failed: "
                f"{str(e)}"
            )
        )