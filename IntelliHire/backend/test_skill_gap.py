from app.database.database import SessionLocal

from app.models.candidate import Candidate
from app.models.job import Job

from app.services.skill_gap_service import (
    analyze_skill_gap
)


db = SessionLocal()

try:

    candidate_id = 1003
    job_id = 6

    candidate = (
        db.query(Candidate)
        .filter(
            Candidate.id == candidate_id
        )
        .first()
    )

    job = (
        db.query(Job)
        .filter(
            Job.id == job_id
        )
        .first()
    )

    if not candidate:
        print(
            f"Candidate {candidate_id} not found"
        )

    elif not job:
        print(
            f"Job {job_id} not found"
        )

    else:

        result = analyze_skill_gap(
            candidate,
            job
        )

        print(
            "\n========== SKILL GAP ANALYSIS =========="
        )

        print(
            f"Candidate: {candidate.id}"
        )

        print(
            f"Job: {job.title}"
        )

        print(
            f"Required Skills: "
            f"{result['total_required_skills']}"
        )

        print(
            f"Matched Skills: "
            f"{result['matched_count']}"
        )

        print(
            f"Missing Skills: "
            f"{result['missing_count']}"
        )

        print(
            f"Skill Match: "
            f"{result['skill_match_percentage']}%"
        )

        print(
            f"Skill Gap: "
            f"{result['skill_gap_percentage']}%"
        )

        print(
            f"Matched: "
            f"{result['matched_skills']}"
        )

        print(
            f"Missing: "
            f"{result['missing_skills']}"
        )

finally:

    db.close()