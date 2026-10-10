import json
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.candidate import Candidate
from app.services.faiss_service import get_indexed_ids
from app.services.candidate_index_service import (
    delete_candidate_completely,
    reindex_candidate,
    sync_candidate_index
)


router = APIRouter(
    prefix="/candidates",
    tags=["Candidates"]
)


# ============================================================
# HELPERS (also imported by other routers)
# ============================================================

def latest_resume(candidate: Candidate):
    """Return the most recently uploaded resume, or None."""

    if not candidate.resumes:
        return None

    return sorted(
        candidate.resumes,
        key=lambda r: r.uploaded_at or datetime.min,
        reverse=True
    )[0]


def parsed_cv(candidate: Candidate) -> Dict[str, Any]:
    """Parsed CV JSON of the latest resume ({} if unavailable)."""

    resume = latest_resume(candidate)

    if not resume or not resume.parsed_data:
        return {}

    try:
        data = json.loads(resume.parsed_data)
        return data if isinstance(data, dict) else {}
    except (TypeError, ValueError):
        return {}


def candidate_display_name(candidate: Candidate) -> str:
    """
    Real name from the parsed CV. Falls back to the linked user
    (a placeholder until authentication exists) and then to an ID.
    """

    name = (parsed_cv(candidate).get("name") or "").strip()

    if name:
        return name

    if candidate.user and candidate.user.full_name:
        return candidate.user.full_name

    return f"Candidate #{candidate.id}"


def serialize_candidate(
    candidate: Candidate,
    detail: bool = False,
    indexed_ids: Any = None
) -> Dict[str, Any]:

    cv = parsed_cv(candidate)
    resume = latest_resume(candidate)

    data: Dict[str, Any] = {
        "candidate_id": candidate.id,
        "name": candidate_display_name(candidate),
        "email": cv.get("email"),
        "phone": candidate.phone,
        "summary": candidate.summary,
        "years_of_experience": candidate.years_of_experience or 0,
        "skills": sorted(
            {
                cs.skill.name
                for cs in candidate.skills
                if cs.skill
            }
        ),
        # True when the CV has a search vector (needed for matching).
        "indexed": (
            candidate.id in indexed_ids
            if indexed_ids is not None
            else None
        ),
        "resume_id": resume.id if resume else None,
        "resume_file": resume.file_name if resume else None,
        "uploaded_at": (
            resume.uploaded_at.isoformat()
            if resume and resume.uploaded_at
            else None
        ),
    }

    if detail:
        data["parsed_cv"] = cv

    return data


# ============================================================
# ENDPOINTS
# ============================================================

@router.get("/")
def list_candidates(
    db: Session = Depends(get_db)
):

    candidates: List[Candidate] = (
        db.query(Candidate)
        .order_by(Candidate.id.desc())
        .all()
    )

    indexed_ids = set(get_indexed_ids())

    return {
        "total": len(candidates),
        "candidates": [
            serialize_candidate(c, indexed_ids=indexed_ids)
            for c in candidates
        ]
    }


@router.get("/{candidate_id}")
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db)
):

    candidate = (
        db.query(Candidate)
        .filter(Candidate.id == candidate_id)
        .first()
    )

    if not candidate:
        raise HTTPException(
            status_code=404,
            detail=f"Candidate {candidate_id} not found"
        )

    return serialize_candidate(
        candidate,
        detail=True,
        indexed_ids=set(get_indexed_ids())
    )


@router.delete("/{candidate_id}")
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a candidate and everything derived from their CV:
    database rows, the uploaded PDF, the search vector and chat chunks.
    """

    try:

        result = delete_candidate_completely(
            db=db,
            candidate_id=candidate_id
        )

        return {
            "message": "Candidate and CV deleted.",
            **result
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Delete failed: {str(e)}"
        )


@router.post("/{candidate_id}/reindex")
def reindex(
    candidate_id: int,
    db: Session = Depends(get_db)
):
    """Re-create the search embedding and chat index for one CV."""

    try:

        result = reindex_candidate(db=db, candidate_id=candidate_id)

        return {"message": "CV re-indexed.", **result}

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Re-index failed: {str(e)}"
        )


@router.post("/sync-index")
def sync_index(
    db: Session = Depends(get_db)
):
    """Embed every CV missing from the index and drop stale vectors."""

    return sync_candidate_index(db)
