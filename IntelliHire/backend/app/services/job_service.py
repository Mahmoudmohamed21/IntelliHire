from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.skill import Skill, JobSkill
from app.services.job_parser import JobData
from app.services.skill_normalization_service import (
    normalize_skill
)

def save_job_to_database(
    db: Session,
    job_data: JobData,
    recruiter_id: int
):
    try:

        # ==========================================
        # CREATE JOB
        # ==========================================

        job = Job(
            recruiter_id=recruiter_id,
            title=job_data.title,
            description=job_data.description,
            location=job_data.location,
            employment_type=job_data.employment_type,
            required_education=job_data.required_education,
            minimum_experience=job_data.minimum_experience,
            status="open"
        )

        db.add(job)

        # Get generated job ID
        db.flush()

        # ==========================================
        # SAVE SKILLS
        # ==========================================

        saved_skills = []

        for skill_data in job_data.skills:

            skill_name = normalize_skill(
                skill_data.name
            )

            if not skill_name:
                continue

            # Check if skill already exists
            skill = (
                db.query(Skill)
                .filter(
                    Skill.name.ilike(skill_name)
                )
                .first()
            )

            # Create skill if it doesn't exist
            if not skill:

                skill = Skill(
                    name=skill_name,
                    category=None
                )

                db.add(skill)
                db.flush()

            # Check duplicate job-skill
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
                    is_required=(
                        1 if skill_data.is_required else 0
                    ),
                    minimum_years=skill_data.minimum_years
                )

                db.add(job_skill)

            saved_skills.append(skill.name)

        # ==========================================
        # COMMIT
        # ==========================================

        db.commit()

        db.refresh(job)

        return {
            "job_id": job.id,
            "title": job.title,
            "skills": saved_skills,
            "minimum_experience": job.minimum_experience,
            "message": "Job saved successfully"
        }

    except Exception:

        db.rollback()

        raise   