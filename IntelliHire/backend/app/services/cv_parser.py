
import json
import re
from typing import List, Optional

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama


# ============================================================
# Structured CV Schema
# ============================================================

class Education(BaseModel):
    degree: Optional[str] = None
    institution: Optional[str] = None
    field: Optional[str] = None
    graduation_year: Optional[str] = None


class Experience(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None
    duration: Optional[str] = None
    description: Optional[str] = None


class Language(BaseModel):
    language: Optional[str] = None
    proficiency: Optional[str] = None


class Project(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None


class CVData(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

    summary: Optional[str] = None

    skills: List[str] = Field(default_factory=list)

    education: List[Education] = Field(default_factory=list)

    experience: List[Experience] = Field(default_factory=list)

    certifications: List[str] = Field(default_factory=list)

    languages: List[Language] = Field(default_factory=list)

    projects: List[Project] = Field(default_factory=list)

# ============================================================
# Local Ollama Model
# ============================================================
llm = ChatOllama(
    model="qwen3:4b",
    temperature=0,
    num_predict=2000,
    reasoning=False,
    format="json"
)
# ============================================================
# Prompt
# ============================================================

prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """
You are a CV information extraction system.

Extract information from the CV and return ONLY one valid JSON object.

IMPORTANT:
- Return ONLY JSON.
- Do NOT explain.
- Do NOT reason.
- Do NOT use markdown.
- Do NOT use code fences.
- Follow the JSON structure EXACTLY.
- Do not change the type of any field.
- Do not invent information.

Use EXACTLY this structure:

{{
  "name": null,
  "email": null,
  "phone": null,
  "summary": null,
  "skills": [],
  "education": [
    {{
      "degree": null,
      "institution": null,
      "field": null,
      "graduation_year": null
    }}
  ],
  "experience": [
    {{
      "job_title": null,
      "company": null,
      "duration": null,
      "description": null
    }}
  ],
  "certifications": [],
  "languages": [
    {{
      "language": null,
      "proficiency": null
    }}
  ],
  "projects": [
    {{
      "title": null,
      "description": null
    }}
  ]
}}

FIELD RULES:

name:
- Candidate full name.

email:
- Candidate email.

phone:
- Candidate phone number.

summary:
- Short professional summary from the CV.

skills:
- MUST be an array of strings.
- Example: ["Python", "SQL", "Power BI"]

education:
- MUST be an array of objects.
- Each object MUST contain:
  degree
  institution
  field
  graduation_year

experience:
- MUST be an array of objects.
- Each object MUST contain:
  job_title
  company
  duration
  description
- If the CV contains NO work experience, return an EMPTY array [].
- NEVER create an empty experience object.

Example when no experience exists:
"experience": []
certifications:
- MUST be an array of strings.

languages:
- MUST be an array of OBJECTS.
- NEVER return languages as strings.
- Each language object MUST contain:
  language
  proficiency

Example:
[
  {{
    "language": "Arabic",
    "proficiency": "Native"
  }},
  {{
    "language": "English",
    "proficiency": "Very Good"
  }}
]

projects:
- MUST be an array of OBJECTS.
- NEVER return projects as strings.
- Each project object MUST contain:
  title
  description

Example:
[
  {{
    "title": "AI CV Parser",
    "description": "Developed an AI-based CV parser."
  }}
]

If proficiency, description, or another value is not available, use null.

Return complete valid JSON.
"""
        ),
        (
            "human",
            "{cv_text}"
        ),
    ]
)

# ============================================================
# Chain
# ============================================================

# IMPORTANT:
# The variable is called "llm", not "chat_model".
chain = prompt | llm


# ============================================================
# JSON Extraction
# ============================================================

def extract_json(text: str) -> dict:
    """
    Extract the first valid JSON object from the LLM response.

    Handles:
    - Markdown code fences
    - Extra text before JSON
    - Extra text after JSON
    - Qwen thinking/reasoning text
    """

    if not text:
        raise ValueError("AI returned an empty response.")

    text = text.strip()

    # --------------------------------------------------------
    # Remove Markdown code fences
    # --------------------------------------------------------

    text = re.sub(
        r"```json\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"```\s*",
        "",
        text,
    )

    text = text.strip()

    # --------------------------------------------------------
    # Find first JSON object
    # --------------------------------------------------------

    start = text.find("{")

    if start == -1:
        raise ValueError(
            "No JSON object found in AI response."
        )

    json_text = text[start:]

    # --------------------------------------------------------
    # Decode first valid JSON object
    # --------------------------------------------------------

    decoder = json.JSONDecoder()

    try:
        data, _ = decoder.raw_decode(json_text)

    except json.JSONDecodeError as e:
        raise ValueError(
            f"Could not extract valid JSON from AI response: {e}"
        ) from e

    # --------------------------------------------------------
    # Make sure JSON root is an object
    # --------------------------------------------------------

    if not isinstance(data, dict):
        raise ValueError(
            "AI response JSON must be an object."
        )

    return data


# ============================================================
# CV Parser
# ============================================================

def parse_cv(cv_text: str) -> CVData:
    """
    Parse CV text using local Ollama qwen3:4b.

    Pipeline:

        CV Text
           ↓
        LangChain
           ↓
        Ollama qwen3:4b
           ↓
        JSON
           ↓
        CVData validation
    """

    # --------------------------------------------------------
    # Validate input
    # --------------------------------------------------------

    if not cv_text or not cv_text.strip():
        raise ValueError(
            "CV text is empty."
        )

    # --------------------------------------------------------
    # Send CV to Ollama
    # --------------------------------------------------------

    response = chain.invoke(
        {
            "cv_text": cv_text
        }
    )

    # --------------------------------------------------------
    # Get model response
    # --------------------------------------------------------

    raw_output = response.content

    print("\n========== RAW AI RESPONSE ==========")
    print(raw_output)
    print("=====================================\n")

    # --------------------------------------------------------
    # Extract JSON
    # --------------------------------------------------------

    data = extract_json(raw_output)

    # --------------------------------------------------------
    # Validate against CVData
    # --------------------------------------------------------

    try:
        cv_data = CVData.model_validate(data)

    except Exception as e:
        raise ValueError(
            f"AI returned JSON, but it does not match CVData schema: {e}"
        ) from e

    return cv_data
