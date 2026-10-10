import json
import re
from typing import List

from pydantic import BaseModel, Field

from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.job import Job

from app.services.skill_gap_service import (
    analyze_skill_gap
)


# =========================================================
# Pydantic Models
# =========================================================

class InterviewQuestion(BaseModel):

    question: str

    type: str = "technical"

    skill: str | None = None

    difficulty: str = "medium"


class InterviewData(BaseModel):

    questions: List[InterviewQuestion] = Field(
        default_factory=list
    )


# =========================================================
# Ollama
# =========================================================

llm = ChatOllama(
    model="qwen3:4b",
    temperature=0.2,
    num_predict=1800,
    reasoning=False,
    format="json"
)


# =========================================================
# Prompt
# =========================================================

prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
You are an AI technical recruitment interviewer.

Generate interview questions based ONLY on the
provided job and candidate information.

Return ONLY valid JSON.

Do not explain.
Do not use markdown.
Do not use code fences.
Do not add extra fields.

Generate exactly 8 questions.

The JSON structure must be:

{{
  "questions": [
    {{
      "question": "",
      "type": "",
      "skill": null,
      "difficulty": ""
    }}
  ]
}}

Question types must be one of:

- technical
- behavioral
- situational

Difficulty must be one of:

- easy
- medium
- hard

Rules:

1. Generate technical questions for important job skills.
2. Give special attention to missing candidate skills.
3. Generate behavioral questions related to the job.
4. Generate situational questions when appropriate.
5. Do not ask about skills that are unrelated to the job.
6. The skill field should contain the related skill.
7. For behavioral and general situational questions,
   skill may be null.
8. Questions should be realistic interview questions.
9. Do not provide answers.
"""
        ),
        (
            "human",
            """
JOB INFORMATION:

Title:
{job_title}

Description:
{job_description}

Required Education:
{required_education}

Minimum Experience:
{minimum_experience}

Required Skills:
{required_skills}


CANDIDATE INFORMATION:

Summary:
{candidate_summary}

Candidate Experience:
{candidate_experience} years

Candidate Skills:
{candidate_skills}


SKILL GAP:

Matched Skills:
{matched_skills}

Missing Skills:
{missing_skills}

Skill Gap Percentage:
{skill_gap_percentage}%
"""
        )
    ]
)


chain = prompt | llm


# =========================================================
# JSON Extraction
# =========================================================

def extract_json(text: str) -> dict:

    if not text:

        raise ValueError(
            "AI returned an empty response."
        )

    text = text.strip()

    text = re.sub(
        r"```json\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(
        r"```\s*",
        "",
        text
    )

    text = text.strip()

    start = text.find("{")

    if start == -1:

        raise ValueError(
            "No JSON object found in AI response."
        )

    json_text = text[start:]

    decoder = json.JSONDecoder()

    try:

        data, _ = decoder.raw_decode(
            json_text
        )

    except json.JSONDecodeError as e:

        raise ValueError(
            f"Could not extract valid JSON: {e}"
        ) from e

    if not isinstance(data, dict):

        raise ValueError(
            "AI response JSON must be an object."
        )

    return data


# =========================================================
# Generate Interview
# =========================================================

def generate_interview(
    db: Session,
    candidate_id: int,
    job_id: int
):

    # -----------------------------------------------------
    # Get Candidate
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
    # Get Job
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
    # Skill Gap
    # -----------------------------------------------------

    skill_gap = analyze_skill_gap(
        candidate,
        job
    )

    # -----------------------------------------------------
    # Required Skills
    # -----------------------------------------------------

    required_skills = [
        js.skill.name
        for js in job.skills
        if js.is_required == 1
        and js.skill
    ]

    # -----------------------------------------------------
    # Candidate Skills
    # -----------------------------------------------------

    candidate_skills = [
        cs.skill.name
        for cs in candidate.skills
        if cs.skill
    ]

    # -----------------------------------------------------
    # Experience
    # -----------------------------------------------------

    candidate_experience = (
        candidate.years_of_experience or 0
    )

    # -----------------------------------------------------
    # Invoke AI
    # -----------------------------------------------------

    response = chain.invoke(
        {
            "job_title":
                job.title or "",

            "job_description":
                job.description or "",

            "required_education":
                job.required_education or "",

            "minimum_experience":
                job.minimum_experience or 0,

            "required_skills":
                ", ".join(
                    required_skills
                ),

            "candidate_summary":
                candidate.summary or "",

            "candidate_experience":
                candidate_experience,

            "candidate_skills":
                ", ".join(
                    candidate_skills
                ),

            "matched_skills":
                ", ".join(
                    skill_gap[
                        "matched_skills"
                    ]
                ),

            "missing_skills":
                ", ".join(
                    skill_gap[
                        "missing_skills"
                    ]
                ),

            "skill_gap_percentage":
                skill_gap[
                    "skill_gap_percentage"
                ]
        }
    )

    raw_output = response.content

    print(
        "\n========== RAW INTERVIEW AI RESPONSE =========="
    )

    print(raw_output)

    print(
        "================================================\n"
    )

    # -----------------------------------------------------
    # Parse JSON
    # -----------------------------------------------------

    data = extract_json(
        raw_output
    )

    try:

        interview_data = (
            InterviewData.model_validate(
                data
            )
        )

    except Exception as e:

        raise ValueError(
            "AI returned JSON, but it does not "
            "match InterviewData schema: "
            f"{e}"
        )

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

        "skill_gap":
            skill_gap,

        "questions":
            [
                question.model_dump()
                for question
                in interview_data.questions
            ]
    }