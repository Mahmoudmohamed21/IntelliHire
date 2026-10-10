from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.application import Application
from app.models.job import Job
from app.models.skill import Skill, JobSkill


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"]
)


@router.post("/")
def create_job(
    title: str,
    description: Optional[str] = None,
    location: Optional[str] = None,
    employment_type: Optional[str] = None,
    required_education: Optional[str] = None,
    minimum_experience: int = 0,
    # Query(...) is required: without it FastAPI treats a List[str]
    # parameter as a JSON *body*, and query-string skills are dropped.
    skills: Optional[List[str]] = Query(default=None),
    db: Session = Depends(get_db)
):

    if skills is None:
        skills = []

    try:

        # Temporary recruiter ID
        recruiter_id = 1

        job = Job(
            recruiter_id=recruiter_id,
            title=title,
            description=description,
            location=location,
            employment_type=employment_type,
            required_education=required_education,
            minimum_experience=minimum_experience,
            status="open"
        )

        db.add(job)
        db.flush()

        # Add job skills
        for skill_name in skills:

            if not skill_name:
                continue

            skill_name = skill_name.strip()

            if not skill_name:
                continue

            skill = (
                db.query(Skill)
                .filter(Skill.name == skill_name)
                .first()
            )

            if not skill:

                skill = Skill(
                    name=skill_name,
                    category=None
                )

                db.add(skill)
                db.flush()

            existing_job_skill = (
                db.query(JobSkill)
                .filter(
                    JobSkill.job_id == job.id,
                    JobSkill.skill_id == skill.id
                )
                .first()
            )

            if not existing_job_skill:

                job_skill = JobSkill(
                    job_id=job.id,
                    skill_id=skill.id,
                    is_required=1,
                    minimum_years=0
                )

                db.add(job_skill)

        db.commit()
        db.refresh(job)

        return {
            "message": "Job created successfully",
            "job_id": job.id,
            "title": job.title,
            "skills": skills
        }

    except Exception as e:

        db.rollback()

        print("\n========== JOB CREATION ERROR ==========")
        print(str(e))
        print("========================================\n")

        raise HTTPException(
            status_code=500,
            detail=f"Failed to create job: {str(e)}"
        )

# ============================================================
# CREATE (JSON body)  - used by the web GUI.
# Same logic as POST /jobs/, but long descriptions are not
# squeezed into the URL.
# ============================================================

class JobCreate(BaseModel):

    title: str = Field(min_length=1, max_length=200)

    description: Optional[str] = None

    location: Optional[str] = None

    employment_type: Optional[str] = None

    required_education: Optional[str] = None

    minimum_experience: int = Field(default=0, ge=0, le=60)

    skills: List[str] = Field(default_factory=list)


@router.post("/create")
def create_job_json(
    payload: JobCreate,
    db: Session = Depends(get_db)
):

    return create_job(
        title=payload.title.strip(),
        description=payload.description,
        location=payload.location,
        employment_type=payload.employment_type,
        required_education=payload.required_education,
        minimum_experience=payload.minimum_experience,
        skills=payload.skills,
        db=db
    )


# ============================================================
# LIST / DETAIL  (added for the web GUI)
# ============================================================

def _serialize_job(job: Job) -> dict:

    return {
        "job_id": job.id,
        "title": job.title,
        "description": job.description,
        "location": job.location,
        "employment_type": job.employment_type,
        "required_education": job.required_education,
        "minimum_experience": job.minimum_experience or 0,
        "status": job.status,
        "created_at": (
            job.created_at.isoformat()
            if job.created_at
            else None
        ),
        "skills": [
            js.skill.name
            for js in job.skills
            if js.skill and js.is_required == 1
        ],
    }


@router.get("/")
def list_jobs(
    db: Session = Depends(get_db)
):

    jobs = (
        db.query(Job)
        .order_by(Job.id.desc())
        .all()
    )

    return {
        "total": len(jobs),
        "jobs": [_serialize_job(job) for job in jobs]
    }


@router.get("/{job_id}")
def get_job(
    job_id: int,
    db: Session = Depends(get_db)
):

    job = (
        db.query(Job)
        .filter(Job.id == job_id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found"
        )

    return _serialize_job(job)


# ============================================================
# DELETE
# ============================================================

@router.delete("/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db)
):
    """Delete a job together with its required skills and applications."""

    job = (
        db.query(Job)
        .filter(Job.id == job_id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found"
        )

    title = job.title

    try:

        applications = (
            db.query(Application)
            .filter(Application.job_id == job_id)
            .delete(synchronize_session=False)
        )

        db.query(JobSkill).filter(
            JobSkill.job_id == job_id
        ).delete(synchronize_session=False)

        db.query(Job).filter(
            Job.id == job_id
        ).delete(synchronize_session=False)

        db.commit()

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Delete failed: {str(e)}"
        )

    return {
        "message": "Job deleted.",
        "job_id": job_id,
        "title": title,
        "applications_removed": applications
    }
