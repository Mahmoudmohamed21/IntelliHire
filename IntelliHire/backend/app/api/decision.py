from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)

from sqlalchemy.orm import Session

from pydantic import BaseModel

from app.database.database import get_db

from app.services.decision_service import (
    calculate_final_decision
)


router = APIRouter(
    prefix="/decision",
    tags=["Recruitment Decision"]
)


class DecisionRequest(BaseModel):

    candidate_id: int

    job_id: int

    interview_score: float


@router.post("/final")
def get_final_decision(
    request: DecisionRequest,
    db: Session = Depends(get_db)
):

    try:

        result = calculate_final_decision(
            db=db,
            candidate_id=request.candidate_id,
            job_id=request.job_id,
            interview_score=request.interview_score
        )

        return result

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=(
                f"Final decision failed: "
                f"{str(e)}"
            )
        )