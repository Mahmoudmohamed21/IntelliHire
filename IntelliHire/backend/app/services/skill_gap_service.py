from typing import Dict, List

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.job import Job

from app.services.skill_normalization_service import (
    normalize_skill
)



def analyze_skill_gap(
    candidate: Candidate,
    job: Job
) -> Dict:

    # -----------------------------------------
    # Candidate skills
    # -----------------------------------------

    candidate_skills = {
        normalize_skill(cs.skill.name)
        for cs in candidate.skills
        if cs.skill
    }

    # -----------------------------------------
    # Required job skills
    # -----------------------------------------

    required_skills = [
        js
        for js in job.skills
        if js.is_required == 1
        and js.skill
    ]

    # -----------------------------------------
    # No required skills
    # -----------------------------------------

    if not required_skills:

        return {
            "total_required_skills": 0,
            "matched_count": 0,
            "missing_count": 0,
            "skill_match_percentage": 100.0,
            "skill_gap_percentage": 0.0,
            "matched_skills": [],
            "missing_skills": [],
        }

    matched_skills: List[str] = []
    missing_skills: List[str] = []

    # -----------------------------------------
    # Compare skills
    # -----------------------------------------

    for job_skill in required_skills:

        required_skill = normalize_skill(
            job_skill.skill.name
        )

        if required_skill in candidate_skills:

            matched_skills.append(
                job_skill.skill.name
            )

        else:

            missing_skills.append(
                job_skill.skill.name
            )

    # -----------------------------------------
    # Calculate gap
    # -----------------------------------------

    total_required = len(
        required_skills
    )

    matched_count = len(
        matched_skills
    )

    missing_count = len(
        missing_skills
    )

    skill_gap_percentage = (
        missing_count
        /
        total_required
    ) * 100

    skill_match_percentage = (
        matched_count
        /
        total_required
    ) * 100

    return {
        "total_required_skills":
            total_required,

        "matched_count":
            matched_count,

        "missing_count":
            missing_count,

        "skill_match_percentage":
            round(
                skill_match_percentage,
                2
            ),

        "skill_gap_percentage":
            round(
                skill_gap_percentage,
                2
            ),

        "matched_skills":
            matched_skills,

        "missing_skills":
            missing_skills,
    }