import json
import re
from typing import List, Optional

from pydantic import BaseModel, Field

from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama

from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.job import Job


# =========================================================
# Pydantic Models
# =========================================================

class AnswerEvaluation(BaseModel):

    question: str

    answer: str

    score: float

    technical_accuracy: float

    communication: float

    relevance: float

    strengths: List[str] = Field(
        default_factory=list
    )

    weaknesses: List[str] = Field(
        default_factory=list
    )

    feedback: str


class InterviewEvaluation(BaseModel):

    overall_score: float

    technical_score: float

    communication_score: float

    relevance_score: float

    strengths: List[str] = Field(
        default_factory=list
    )

    weaknesses: List[str] = Field(
        default_factory=list
    )

    recommendation: str

    summary: str

    evaluations: List[AnswerEvaluation] = Field(
        default_factory=list
    )


# =========================================================
# Ollama
# =========================================================

llm = ChatOllama(
    model="qwen3:4b",
    temperature=0,
    num_predict=2500,
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
You are an AI interview evaluator for a recruitment system.

Evaluate the candidate's interview answers based ONLY on:

1. Job requirements
2. Interview questions
3. Candidate answers

Return ONLY valid JSON.

Do not explain outside JSON.
Do not use markdown.
Do not use code fences.
Do not add extra fields.

Use EXACTLY this structure:

{{
  "overall_score": 0,
  "technical_score": 0,
  "communication_score": 0,
  "relevance_score": 0,

  "strengths": [],

  "weaknesses": [],

  "recommendation": "",

  "summary": "",

  "evaluations": [
    {{
      "question": "",
      "answer": "",
      "score": 0,
      "technical_accuracy": 0,
      "communication": 0,
      "relevance": 0,
      "strengths": [],
      "weaknesses": [],
      "feedback": ""
    }}
  ]
}}

SCORING:

All scores must be between 0 and 100.

score:
Overall quality of the individual answer.

technical_accuracy:
How technically correct the answer is.

communication:
How clearly and professionally the candidate communicates.

relevance:
How directly the answer addresses the question.

overall_score:
Overall interview performance.

technical_score:
Overall technical performance.

communication_score:
Overall communication performance.

relevance_score:
Overall relevance of answers.

RECOMMENDATION must be one of:

- Strong Hire
- Hire
- Consider
- Reject

IMPORTANT:

- Do not give a high score just because an answer is long.
- Do not penalize short answers if they are correct.
- Do not invent candidate experience.
- Evaluate the actual answer.
- Be objective.
- Technical answers must be judged according to the job requirements.
"""
        ),
        (
            "human",
            """
JOB:

Title:
{job_title}

Description:
{job_description}

Required Skills:
{required_skills}

Minimum Experience:
{minimum_experience}


CANDIDATE:

Name:
{candidate_name}

Summary:
{candidate_summary}

Experience:
{candidate_experience} years


INTERVIEW:

{interview_data}
"""
        )
    ]
)


chain = prompt | llm

# Second attempt uses a little randomness: at temperature 0 the model
# would simply repeat the same malformed answer.
retry_llm = ChatOllama(
    model="qwen3:4b",
    temperature=0.3,
    num_predict=2500,
    reasoning=False,
    format="json"
)

retry_chain = prompt | retry_llm


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
# Tolerant normalisation of the model's JSON
# =========================================================
#
# Small local models often return almost-right JSON: a score as the
# string ": 0" or "85/100", a missing field, a string instead of a list.
# Rather than rejecting the whole evaluation, repair what can be repaired.

_NUMBER = re.compile(r"-?\d+(?:\.\d+)?")

_SMALL_SCALE = re.compile(r"/\s*(10|5)\b")


def coerce_score(value) -> Optional[float]:
    """A 0-100 number from whatever the model wrote, or None."""

    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        number = float(value)

    elif isinstance(value, str):

        match = _NUMBER.search(value)

        if not match:
            return None

        number = float(match.group())

        # "8/10" or "4/5" -> percentage
        scale = _SMALL_SCALE.search(value)

        if scale and 0 <= number <= float(scale.group(1)):
            number = number / float(scale.group(1)) * 100

    else:
        return None

    if number != number:  # NaN
        return None

    return round(max(0.0, min(100.0, number)), 1)


def _mean(values) -> Optional[float]:

    usable = [v for v in values if v is not None]

    return round(sum(usable) / len(usable), 1) if usable else None


def _text_list(value) -> List[str]:

    if value is None:
        return []

    if isinstance(value, str):
        return [value.strip()] if value.strip() else []

    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]

    return []


def normalize_recommendation(value, overall: float) -> str:

    text = str(value or "").lower()

    if "strong" in text:
        return "Strong Hire"

    if "reject" in text or "not hire" in text or "no hire" in text:
        return "Reject"

    if "consider" in text or "maybe" in text:
        return "Consider"

    if "hire" in text:
        return "Hire"

    # Missing or unrecognised: derive from the score (same bands the
    # final-decision service uses).
    if overall >= 85:
        return "Strong Hire"
    if overall >= 70:
        return "Hire"
    if overall >= 55:
        return "Consider"
    return "Reject"


def normalize_evaluation(data: dict, interview_data: List[dict]) -> dict:
    """
    Turn the model's JSON into a complete, valid evaluation.

    * numbers are extracted from strings and clamped to 0-100
    * question/answer text always comes from the real interview
    * missing scores are derived from the ones that are present
    """

    raw_items = data.get("evaluations")

    raw_items = raw_items if isinstance(raw_items, list) else []

    answers = []

    for index, qa in enumerate(interview_data):

        raw = (
            raw_items[index]
            if index < len(raw_items)
            and isinstance(raw_items[index], dict)
            else {}
        )

        technical = coerce_score(raw.get("technical_accuracy"))
        communication = coerce_score(raw.get("communication"))
        relevance = coerce_score(raw.get("relevance"))

        score = coerce_score(raw.get("score"))

        if score is None:
            score = _mean([technical, communication, relevance])

        answers.append(
            {
                "question": qa.get("question", ""),
                "answer": qa.get("answer", ""),
                "score": score,
                "technical_accuracy": technical,
                "communication": communication,
                "relevance": relevance,
                "strengths": _text_list(raw.get("strengths")),
                "weaknesses": _text_list(raw.get("weaknesses")),
                "feedback": str(raw.get("feedback") or "").strip(),
            }
        )

    technical_score = coerce_score(data.get("technical_score"))
    communication_score = coerce_score(data.get("communication_score"))
    relevance_score = coerce_score(data.get("relevance_score"))

    if technical_score is None:
        technical_score = _mean([a["technical_accuracy"] for a in answers])
    if communication_score is None:
        communication_score = _mean([a["communication"] for a in answers])
    if relevance_score is None:
        relevance_score = _mean([a["relevance"] for a in answers])

    overall = coerce_score(data.get("overall_score"))

    if overall is None:
        overall = _mean(
            [technical_score, communication_score, relevance_score]
        )

    if overall is None:
        overall = _mean([a["score"] for a in answers])

    if overall is None:
        raise ValueError("The AI response contained no usable scores.")

    technical_score = overall if technical_score is None else technical_score
    communication_score = overall if communication_score is None else communication_score
    relevance_score = overall if relevance_score is None else relevance_score

    for a in answers:
        for key, fallback in (
            ("technical_accuracy", technical_score),
            ("communication", communication_score),
            ("relevance", relevance_score),
            ("score", overall),
        ):
            if a[key] is None:
                a[key] = fallback

    return {
        "overall_score": overall,
        "technical_score": technical_score,
        "communication_score": communication_score,
        "relevance_score": relevance_score,
        "strengths": _text_list(data.get("strengths")),
        "weaknesses": _text_list(data.get("weaknesses")),
        "recommendation": normalize_recommendation(
            data.get("recommendation"), overall
        ),
        "summary": str(data.get("summary") or "").strip(),
        "evaluations": answers,
    }


def is_blank_evaluation(evaluation: dict) -> bool:
    """True when the model just echoed the all-zero template."""

    return (
        evaluation["overall_score"] == 0
        and evaluation["technical_score"] == 0
        and evaluation["communication_score"] == 0
        and evaluation["relevance_score"] == 0
        and all(a["score"] == 0 for a in evaluation["evaluations"])
    )


def run_evaluation(llm_chain, inputs: dict, interview_data: List[dict]):
    """One model call -> validated InterviewEvaluation."""

    response = llm_chain.invoke(inputs)

    raw_output = response.content

    print("\n========== RAW INTERVIEW EVALUATION ==========")
    print(raw_output)
    print("================================================\n")

    data = extract_json(raw_output)

    normalized = normalize_evaluation(data, interview_data)

    if is_blank_evaluation(normalized):
        raise ValueError(
            "The AI returned the empty template instead of scores."
        )

    return InterviewEvaluation.model_validate(normalized)


# =========================================================
# Evaluate Interview
# =========================================================

def evaluate_interview(
    db: Session,
    candidate_id: int,
    job_id: int,
    interview_data: List[dict]
):

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
    # Required Skills
    # -----------------------------------------------------

    required_skills = [
        js.skill.name
        for js in job.skills
        if js.is_required == 1
        and js.skill
    ]

    # -----------------------------------------------------
    # Convert interview data to JSON
    # -----------------------------------------------------

    interview_json = json.dumps(
        interview_data,
        ensure_ascii=False,
        indent=2
    )

    # -----------------------------------------------------
    # AI Evaluation
    # -----------------------------------------------------

    inputs = {
            "job_title":
                job.title or "",

            "job_description":
                job.description or "",

            "required_skills":
                ", ".join(
                    required_skills
                ),

            "minimum_experience":
                job.minimum_experience or 0,

            "candidate_name":
                (
                    candidate.user.full_name
                    if candidate.user
                    else ""
                ),

            "candidate_summary":
                candidate.summary or "",

            "candidate_experience":
                candidate.years_of_experience or 0,

            "interview_data":
                interview_json
        }

    # Two attempts: a malformed answer from a small local model is
    # usually fine the second time.
    evaluation = None
    last_error = None

    for attempt_chain in (chain, retry_chain):

        try:

            evaluation = run_evaluation(
                attempt_chain,
                inputs,
                interview_data
            )

            break

        except ValueError as e:

            last_error = e

            print(f"Interview evaluation attempt failed: {e}")

    if evaluation is None:

        # RuntimeError (not ValueError): the API maps ValueError to
        # "404 not found", which this is not.
        raise RuntimeError(
            "The AI evaluation could not be read after 2 attempts "
            f"({last_error}). Please try again."
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

        "overall_score":
            evaluation.overall_score,

        "technical_score":
            evaluation.technical_score,

        "communication_score":
            evaluation.communication_score,

        "relevance_score":
            evaluation.relevance_score,

        "recommendation":
            evaluation.recommendation,

        "strengths":
            evaluation.strengths,

        "weaknesses":
            evaluation.weaknesses,

        "summary":
            evaluation.summary,

        "evaluations":
            [
                item.model_dump()
                for item
                in evaluation.evaluations
            ]
    }