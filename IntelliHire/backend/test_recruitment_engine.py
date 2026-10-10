from app.database.database import SessionLocal

from app.services.recruitment_engine import (
    rank_candidates
)


db = SessionLocal()

try:

    # Your existing Data Analyst job
    job_id = 6

    results = rank_candidates(
        db=db,
        job_id=job_id,
        top_k=10
    )

    print(
        "\n========== RECRUITMENT RESULTS =========="
    )

    if not results:

        print(
            "No candidates found in FAISS."
        )

    for candidate in results:

        print("\n--------------------------------")

        print(
            f"Rank: "
            f"{candidate['rank']}"
        )

        print(
            f"Candidate ID: "
            f"{candidate['candidate_id']}"
        )

        print(
            f"Semantic Score: "
            f"{candidate['semantic_score']}%"
        )

        print(
            f"Skill Score: "
            f"{candidate['skill_score']}%"
        )

        print(
            f"Experience Score: "
            f"{candidate['experience_score']}%"
        )

        print(
            f"FINAL MATCH SCORE: "
            f"{candidate['final_match_score']}%"
        )

        print(
            f"Matched Skills: "
            f"{candidate['matched_skills']}"
        )

        print(
            f"Missing Skills: "
            f"{candidate['missing_skills']}"
        )

        print(
            f"Experience: "
            f"{candidate['candidate_experience']} "
            f"/ "
            f"{candidate['required_experience']}"
        )

        print(
            f"Experience Match: "
            f"{candidate['experience_match']}"
        ) 
        print(
           f"Skill Match: "
           f"{candidate['skill_match_percentage']}%"
        )

        print(
           f"Skill Gap: "
          f"{candidate['skill_gap_percentage']}%"
        )

        print(
           f"Missing Skill Count: "
           f"{candidate['missing_skill_count']}"
        )

        print(
            f"Matched Skill Count: "
            f"{candidate['matched_skill_count']}"
        )

finally:

    db.close()