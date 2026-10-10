from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.candidate import Candidate

from app.api.candidates import candidate_display_name

from app.services.recruitment_engine import (
    rank_candidates,
    get_candidate_match
)


router = APIRouter(
    prefix="/matching",
    tags=["Matching"]
)


@router.get("/job/{job_id}")
def get_job_matches(
    job_id: int,
    top_k: int = 10,
    db: Session = Depends(get_db)
):

    try:

        results = rank_candidates(
            db=db,
            job_id=job_id,
            top_k=top_k
        )

        # Attach readable candidate names (one query).
        ids = [r["candidate_id"] for r in results]

        candidates = {}

        if ids:
            candidates = {
                c.id: c
                for c in db.query(Candidate)
                .filter(Candidate.id.in_(ids))
                .all()
            }

        for result in results:

            candidate = candidates.get(result["candidate_id"])

            result["candidate_name"] = (
                candidate_display_name(candidate)
                if candidate
                else f"Candidate #{result['candidate_id']}"
            )

        return {
            "job_id": job_id,
            "total_candidates": len(results),
            "matches": results
        }

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Matching failed: {str(e)}"
        )


@router.get("/job/{job_id}/candidate/{candidate_id}")
def get_single_candidate_match(
    job_id: int,
    candidate_id: int,
    db: Session = Depends(get_db)
):
    """
    Match details for ONE candidate, including their rank among all
    candidates. Never depends on a top-k cutoff, and embeds the CV on
    the fly if it was missing from the vector index.
    """

    try:

        match = get_candidate_match(
            db=db,
            job_id=job_id,
            candidate_id=candidate_id
        )

        candidate = (
            db.query(Candidate)
            .filter(Candidate.id == candidate_id)
            .first()
        )

        match["candidate_name"] = (
            candidate_display_name(candidate)
            if candidate
            else f"Candidate #{candidate_id}"
        )

        return {
            "job_id": job_id,
            "total_candidates": match["total_candidates"],
            "match": match
        }

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Matching failed: {str(e)}"
        )
