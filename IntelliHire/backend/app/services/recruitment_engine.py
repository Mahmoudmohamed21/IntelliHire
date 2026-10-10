from typing import List, Dict, Optional

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.job import Job
from app.services.skill_gap_service import (
    analyze_skill_gap
)
from app.services.embedding_service import (
    create_embedding,
    job_to_text
)

from app.services.faiss_service import (
    search_candidates,
    get_index_info
)
from app.services.skill_normalization_service import (
    normalize_skill
)
from app.services.candidate_index_service import (
    sync_candidate_index
)

# ==========================================
# WEIGHTS
# ==========================================

SEMANTIC_WEIGHT = 0.40
SKILL_WEIGHT = 0.40
EXPERIENCE_WEIGHT = 0.20



# ==========================================
# CALCULATE SKILL MATCH
# ==========================================

def calculate_skill_match(
    candidate: Candidate,
    job: Job
) -> Dict:

    # Candidate skills
    candidate_skill_names = {
        normalize_skill(cs.skill.name)
        for cs in candidate.skills
        if cs.skill
    }

    # Required job skills
    required_job_skills = [
        js
        for js in job.skills
        if js.is_required == 1
    ]

    if not required_job_skills:

        return {
            "score": 100.0,
            "matched_skills": [],
            "missing_skills": []
        }

    matched_skills = []
    missing_skills = []

    for job_skill in required_job_skills:

        if not job_skill.skill:
            continue

        required_skill = normalize_skill(
            job_skill.skill.name
        )

        if required_skill in candidate_skill_names:

            matched_skills.append(
                job_skill.skill.name
            )

        else:

            missing_skills.append(
                job_skill.skill.name
            )

    score = (
        len(matched_skills)
        /
        len(required_job_skills)
    ) * 100

    return {
        "score": round(score, 2),
        "matched_skills": matched_skills,
        "missing_skills": missing_skills
    }


# ==========================================
# CALCULATE EXPERIENCE
# ==========================================

def calculate_experience_match(
    candidate: Candidate,
    job: Job
) -> Dict:

    candidate_experience = (
        candidate.years_of_experience or 0
    )

    required_experience = (
        job.minimum_experience or 0
    )

    if required_experience == 0:

        return {
            "score": 100.0,
            "candidate_experience":
                candidate_experience,
            "required_experience":
                required_experience,
            "experience_match": True
        }

    if candidate_experience >= required_experience:

        score = 100.0
        experience_match = True

    else:

        score = (
            candidate_experience
            /
            required_experience
        ) * 100

        experience_match = False

    return {
        "score": round(
            min(score, 100),
            2
        ),
        "candidate_experience":
            candidate_experience,
        "required_experience":
            required_experience,
        "experience_match":
            experience_match
    }


# ==========================================
# BUILD JOB TEXT FROM DATABASE
# ==========================================

def build_job_text(job: Job) -> str:

    skills_text = ", ".join(
        [
            skill.skill.name
            for skill in job.skills
            if skill.skill
        ]
    )

    return f"""
Job Title:
{job.title or ''}

Description:
{job.description or ''}

Location:
{job.location or ''}

Employment Type:
{job.employment_type or ''}

Required Education:
{job.required_education or ''}

Minimum Experience:
{job.minimum_experience or 0}

Required Skills:
{skills_text}
""".strip()


# ==========================================
# RECRUITMENT ENGINE
# ==========================================

def rank_candidates(
    db: Session,
    job_id: int,
    top_k: Optional[int] = 10
) -> List[Dict]:
    """
    Rank every indexed candidate for a job (rank 1 = best).

    ``top_k`` only limits how many ranked rows are *returned*; all
    candidates are always scored so ranks are correct, and so a
    candidate can never be dropped by a search cutoff.
    ``top_k=None`` returns everyone.
    """

    # --------------------------------------
    # Get Job
    # --------------------------------------

    job = (
        db.query(Job)
        .filter(Job.id == job_id)
        .first()
    )

    if not job:

        raise ValueError(
            f"Job {job_id} not found"
        )

    # --------------------------------------
    # Self-heal: embed any CV that is missing
    # from the vector index (and drop vectors
    # of deleted candidates) before searching.
    # --------------------------------------

    try:
        sync_candidate_index(db)
    except Exception as e:
        print(f"[rank_candidates] index sync failed: {e}")

    # --------------------------------------
    # Create Job Embedding
    # --------------------------------------

    job_text = build_job_text(job)

    job_embedding = create_embedding(
        job_text
    )

    # --------------------------------------
    # FAISS Search
    # --------------------------------------

    faiss_results = search_candidates(
        query_embedding=job_embedding,
        top_k=get_index_info()["total_vectors"] or 1
    )

    ranked_candidates = []

    # --------------------------------------
    # Process Candidates
    # --------------------------------------

    for faiss_result in faiss_results:

        candidate_id = (
            faiss_result["candidate_id"]
        )

        similarity = (
            faiss_result["similarity_score"]
        )

        # FAISS cosine similarity is
        # approximately between -1 and 1.
        # Convert to percentage.

        semantic_score = max(
            0,
            min(
                similarity * 100,
                100
            )
        )

        # ----------------------------------
        # Get Candidate
        # ----------------------------------

        candidate = (
            db.query(Candidate)
            .filter(
                Candidate.id == candidate_id
            )
            .first()
        )

        if not candidate:
            continue

        # ----------------------------------
        # Skill Match
        # ----------------------------------

        skill_result = calculate_skill_match(
            candidate,
            job
        )

        # ----------------------------------
        # Experience Match
        # ----------------------------------

        experience_result = (
            calculate_experience_match(
                candidate,
                job
            )
        )
       
        skill_gap_result = analyze_skill_gap(
            candidate,
            job
        )

        # ----------------------------------
        # Final Score
        # ----------------------------------

        final_score = (

            semantic_score
            * SEMANTIC_WEIGHT

            +

            skill_result["score"]
            * SKILL_WEIGHT

            +

            experience_result["score"]
            * EXPERIENCE_WEIGHT
        )

        ranked_candidates.append(
    {
        "candidate_id":
            candidate.id,

        "semantic_score":
            round(
                semantic_score,
                2
            ),

        "skill_score":
            skill_result["score"],

        "experience_score":
            experience_result["score"],

        "final_match_score":
            round(
                final_score,
                2
            ),

        # -------------------------------
        # Skill Matching
        # -------------------------------

        "matched_skills":
            skill_result[
                "matched_skills"
            ],

        "missing_skills":
            skill_result[
                "missing_skills"
            ],

        # -------------------------------
        # Skill Gap
        # -------------------------------

        "skill_match_percentage":
            skill_gap_result[
                "skill_match_percentage"
            ],

        "skill_gap_percentage":
            skill_gap_result[
                "skill_gap_percentage"
            ],

        "total_required_skills":
            skill_gap_result[
                "total_required_skills"
            ],

        "matched_skill_count":
            skill_gap_result[
                "matched_count"
            ],

        "missing_skill_count":
            skill_gap_result[
                "missing_count"
            ],

        # -------------------------------
        # Experience
        # -------------------------------

        "candidate_experience":
            experience_result[
                "candidate_experience"
            ],

        "required_experience":
            experience_result[
                "required_experience"
            ],

        "experience_match":
            experience_result[
                "experience_match"
            ]
    }
)

    # --------------------------------------
    # Sort by Final Score
    # --------------------------------------

    ranked_candidates.sort(
        key=lambda x:
            x["final_match_score"],
        reverse=True
    )

    # Add ranking
    for index, candidate in enumerate(
        ranked_candidates,
        start=1
    ):

        candidate["rank"] = index

    if top_k is not None:
        return ranked_candidates[:top_k]

    return ranked_candidates


# ==========================================
# ONE CANDIDATE'S MATCH
# ==========================================

def get_candidate_match(
    db: Session,
    job_id: int,
    candidate_id: int
) -> Dict:
    """
    Match details (with the candidate's rank among all candidates)
    for one candidate and one job.
    """

    matches = rank_candidates(
        db=db,
        job_id=job_id,
        top_k=None
    )

    for match in matches:

        if match["candidate_id"] == candidate_id:

            match["total_candidates"] = len(matches)

            return match

    raise ValueError(
        f"Candidate {candidate_id} could not be embedded, so "
        "it cannot be matched. Re-index the CV from the CV library "
        "(or upload it again)."
    )
