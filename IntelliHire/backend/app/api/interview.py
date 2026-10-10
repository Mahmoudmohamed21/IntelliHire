from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)

from sqlalchemy.orm import Session

from app.database.database import get_db

from app.services.interview_service import (
    generate_interview
)


router = APIRouter(
    prefix="/interview",
    tags=["Interview"]
)


@router.post("/generate")
def generate_interview_questions(
    candidate_id: int,
    job_id: int,
    db: Session = Depends(get_db)
):

    try:

        result = generate_interview(
            db=db,
            candidate_id=candidate_id,
            job_id=job_id
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
                f"Interview generation failed: "
                f"{str(e)}"
            )
        )