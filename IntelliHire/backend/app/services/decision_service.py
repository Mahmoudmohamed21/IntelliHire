from typing import Dict

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.job import Job

from app.services.recruitment_engine import (
    get_candidate_match
)

from app.services.skill_gap_service import (
    analyze_skill_gap
)


# =========================================================
# Weights
# =========================================================

MATCH_WEIGHT = 0.50

INTERVIEW_WEIGHT = 0.30

SKILL_MATCH_WEIGHT = 0.20


# =========================================================
# Recommendation
# =========================================================

def get_recommendation(
    final_score: float
) -> str:

    if final_score >= 85:

        return "Strong Hire"

    if final_score >= 70:

        return "Hire"

    if final_score >= 55:

        return "Consider"

    return "Reject"


# =========================================================
# Final Decision
# =========================================================

def calculate_final_decision(
    db: Session,
    candidate_id: int,
    job_id: int,
    interview_score: float
) -> Dict:

    # -----------------------------------------------------
    # Candidate
    # -----------------------------------------------------

    candidate = (
        db.query(Candidate)
        .filter(
            Candidate.id == candidate_id
        )
        .first()
    )

    if not candidate:

        raise ValueError(
            f"Candidate {candidate_id} not found"
        )

    # -----------------------------------------------------
    # Job
    # -----------------------------------------------------

    job = (
        db.query(Job)
        .filter(
            Job.id == job_id
        )
        .first()
    )

    if not job:

        raise ValueError(
            f"Job {job_id} not found"
        )

    # -----------------------------------------------------
    # Validate interview score
    # -----------------------------------------------------

    if interview_score < 0:

        raise ValueError(
            "Interview score cannot be negative"
        )

    if interview_score > 100:

        raise ValueError(
            "Interview score cannot exceed 100"
        )

    # -----------------------------------------------------
    # Recruitment Engine
    # -----------------------------------------------------

    candidate_match = get_candidate_match(
        db=db,
        job_id=job_id,
        candidate_id=candidate_id
    )

    # -----------------------------------------------------
    # Match Score
    # -----------------------------------------------------

    match_score = float(
        candidate_match[
            "final_match_score"
        ]
    )

    # -----------------------------------------------------
    # Skill Gap
    # -----------------------------------------------------

    skill_gap = analyze_skill_gap(
        candidate,
        job
    )

    skill_match_score = float(
        skill_gap[
            "skill_match_percentage"
        ]
    )

    # -----------------------------------------------------
    # Final Score
    # -----------------------------------------------------

    final_score = (

        match_score
        * MATCH_WEIGHT

        +

        interview_score
        * INTERVIEW_WEIGHT

        +

        skill_match_score
        * SKILL_MATCH_WEIGHT

    )

    final_score = round(
        final_score,
        2
    )

    # -----------------------------------------------------
    # Recommendation
    # -----------------------------------------------------

    recommendation = get_recommendation(
        final_score
    )

    # -----------------------------------------------------
    # Return
    # -----------------------------------------------------

    return {

        "candidate_id":
            candidate_id,

        "job_id":
            job_id,

        "candidate_name":
            (
                candidate.user.full_name
                if candidate.user
                else None
            ),

        "job_title":
            job.title,

        # ---------------------------------------------
        # Components
        # ---------------------------------------------

        "match_score":
            round(
                match_score,
                2
            ),

        "interview_score":
            round(
                interview_score,
                2
            ),

        "skill_match_score":
            round(
                skill_match_score,
                2
            ),

        # ---------------------------------------------
        # Final
        # ---------------------------------------------

        "final_score":
            final_score,

        "recommendation":
            recommendation,

        # ---------------------------------------------
        # Skill information
        # ---------------------------------------------

        "matched_skills":
            skill_gap[
                "matched_skills"
            ],

        "missing_skills":
            skill_gap[
                "missing_skills"
            ],

        "skill_gap_percentage":
            skill_gap[
                "skill_gap_percentage"
            ],

        # ---------------------------------------------
        # Experience
        # ---------------------------------------------

        "candidate_experience":
            candidate.years_of_experience or 0,

        "required_experience":
            job.minimum_experience or 0,

        "experience_match":
            (
                candidate.years_of_experience or 0
            )
            >=
            (
                job.minimum_experience or 0
            )
    }