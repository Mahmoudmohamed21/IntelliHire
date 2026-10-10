from typing import List

from sentence_transformers import SentenceTransformer

from app.services.job_parser import JobData
from app.services.cv_parser import CVData


# ==========================================
# EMBEDDING MODEL
# ==========================================

MODEL_NAME = "all-MiniLM-L6-v2"

embedding_model = SentenceTransformer(MODEL_NAME)


# ==========================================
# CV → SEARCHABLE TEXT
# ==========================================

def cv_to_text(cv: CVData) -> str:

    education_text = "\n".join(
        [
            f"{edu.degree or ''} "
            f"{edu.field or ''} "
            f"{edu.institution or ''} "
            f"{edu.graduation_year or ''}"
            for edu in cv.education
        ]
    )

    experience_text = "\n".join(
        [
            f"{exp.job_title or ''} "
            f"{exp.company or ''} "
            f"{exp.duration or ''} "
            f"{exp.description or ''}"
            for exp in cv.experience
        ]
    )

    skills_text = ", ".join(cv.skills)

    languages_text = ", ".join(
        [
            f"{lang.language or ''} "
            f"{lang.proficiency or ''}"
            for lang in cv.languages
        ]
    )

    projects_text = "\n".join(
        [
            f"{project.title or ''} "
            f"{project.description or ''}"
            for project in cv.projects
        ]
    )

    text = f"""
Candidate Name:
{cv.name or ''}

Summary:
{cv.summary or ''}

Skills:
{skills_text}

Education:
{education_text}

Experience:
{experience_text}

Certifications:
{', '.join(cv.certifications)}

Languages:
{languages_text}

Projects:
{projects_text}
"""

    return text.strip()


# ==========================================
# JOB → SEARCHABLE TEXT
# ==========================================

def job_to_text(job: JobData) -> str:

    skills_text = ", ".join(
        [
            skill.name
            for skill in job.skills
        ]
    )

    text = f"""
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
{job.minimum_experience}

Required Skills:
{skills_text}
"""

    return text.strip()


# ==========================================
# CREATE EMBEDDING
# ==========================================

def create_embedding(text: str) -> List[float]:

    if not text or not text.strip():
        raise ValueError(
            "Cannot create embedding from empty text."
        )

    embedding = embedding_model.encode(
        text,
        normalize_embeddings=True
    )

    return embedding.tolist()


# ==========================================
# CV EMBEDDING
# ==========================================

def create_cv_embedding(cv: CVData):

    text = cv_to_text(cv)

    embedding = create_embedding(text)

    return {
        "text": text,
        "embedding": embedding
    }


# ==========================================
# JOB EMBEDDING
# ==========================================

def create_job_embedding(job: JobData):

    text = job_to_text(job)

    embedding = create_embedding(text)

    return {
        "text": text,
        "embedding": embedding
    }