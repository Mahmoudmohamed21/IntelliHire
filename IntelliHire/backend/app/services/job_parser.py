import json
import re
from typing import List, Optional

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama


# ==========================================
# JOB DATA MODELS
# ==========================================

class JobSkillData(BaseModel):
    name: str
    is_required: bool = True
    minimum_years: int = 0


class JobData(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    required_education: Optional[str] = None
    minimum_experience: int = 0
    skills: List[JobSkillData] = Field(default_factory=list)


# ==========================================
# OLLAMA MODEL
# ==========================================
llm = ChatOllama(
    model="qwen3:4b",
    temperature=0,
    num_predict=1200,
    reasoning=False,
    format="json",
)


# ==========================================
# PROMPT
# ==========================================

prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
Extract structured information from the job description.

Return ONLY valid JSON.
Do not explain.
Do not use markdown.
Do not use code fences.
Do not add extra fields.

The JSON must have exactly these fields:

{{
  "title": null,
  "description": null,
  "location": null,
  "employment_type": null,
  "required_education": null,
  "minimum_experience": 0,
  "skills": []
}}

The skills field must be an array of objects.
Each skill object must have exactly:

{{
  "name": "",
  "is_required": true,
  "minimum_years": 0
}}

Rules:

- Extract only information present in the job description.
- minimum_experience must be an integer.
- If experience is not specified, use 0.
- is_required must be true for explicitly required skills.
- minimum_years must be an integer.
- If a skill has no specific experience requirement, use 0.
- If a field is not mentioned, use null.
"""
        ),
        (
            "human",
            "{job_text}"
        )
    ]
)

chain = prompt | llm


# ==========================================
# JSON EXTRACTION
# ==========================================

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
        data, _ = decoder.raw_decode(json_text)

    except json.JSONDecodeError as e:
        raise ValueError(
            f"Could not extract valid JSON: {e}"
        ) from e

    if not isinstance(data, dict):
        raise ValueError(
            "AI response JSON must be an object."
        )

    return data


# ==========================================
# PARSE JOB
# ==========================================

def parse_job(job_text: str) -> JobData:

    if not job_text or not job_text.strip():
        raise ValueError(
            "Job text is empty."
        )

    response = chain.invoke(
        {
            "job_text": job_text
        }
    )

    raw_output = response.content

    print("\n========== RAW JOB AI RESPONSE ==========")
    print(raw_output)
    print("=========================================\n")

    data = extract_json(raw_output)

    try:

        job_data = JobData.model_validate(data)

    except Exception as e:

        raise ValueError(
            "AI returned JSON, but it does not match "
            f"JobData schema: {e}"
        ) from e

    return job_data