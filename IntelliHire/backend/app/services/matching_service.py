from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.candidate import Candidate
from app.models.skill import JobSkill, CandidateSkill


def calculate_match_score(
    candidate: Candidate,
    job: Job
):
    job_skills = job.skills

    required_skills = [
        js for js in job_skills
        if js.is_required == 1
    ]

    if not required_skills:
        skill_score = 100
        matched_skills = []
        missing_skills = []
    else:
        candidate_skill_ids = {
            cs.skill_id
            for cs in candidate.skills
        }

        matched_skills = []
        missing_skills = []

        for job_skill in required_skills:

            skill_name = job_skill.skill.name

            if job_skill.skill_id in candidate_skill_ids:
                matched_skills.append(skill_name)
            else:
                missing_skills.append(skill_name)

        skill_score = (
            len(matched_skills)
            / len(required_skills)
        ) * 70

    # ---------------------------------
    # EXPERIENCE SCORE
    # ---------------------------------

    required_experience = job.minimum_experience or 0
    candidate_experience = (
        candidate.years_of_experience or 0
    )

    if required_experience == 0:
        experience_score = 20

    elif candidate_experience >= required_experience:
        experience_score = 20

    else:
        experience_score = (
            candidate_experience
            / required_experience
        ) * 20

    # ---------------------------------
    # FINAL SCORE
    # ---------------------------------

    final_score = skill_score + experience_score

    return {
        "candidate_id": candidate.id,
        "match_score": round(final_score, 2),
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "candidate_experience": candidate_experience,
        "required_experience": required_experience,
        "experience_match": (
            candidate_experience >= required_experience
        )
    }


def find_matching_candidates(
    db: Session,
    job_id: int
):

    job = (
        db.query(Job)
        .filter(Job.id == job_id)
        .first()
    )

    if not job:
        raise ValueError("Job not found")

    candidates = (
        db.query(Candidate)
        .all()
    )

    results = []

    for candidate in candidates:

        result = calculate_match_score(
            candidate,
            job
        )

        results.append(result)

    # Highest score first
    results.sort(
        key=lambda x: x["match_score"],
        reverse=True
    )

    return results