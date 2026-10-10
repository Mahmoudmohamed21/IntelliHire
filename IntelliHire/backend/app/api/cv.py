import os
import json
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends

from app.database.database import get_db

from app.models.candidate import Candidate
from app.models.resume import Resume
from app.models.skill import Skill, CandidateSkill

from app.services.pdf_service import extract_text_from_pdf
from app.services.cv_parser import parse_cv
from app.services.embedding_service import create_cv_embedding
from app.services.faiss_service import add_candidate
from app.services.skill_normalization_service import normalize_skill

# RAG
from app.services.rag.document_service import split_text
from app.services.rag.rag_store import add_document_chunks


router = APIRouter(
    prefix="/cv",
    tags=["CV"]
)


UPLOAD_DIR = Path("uploads")

UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True
)


def _discard_file(path: Path):
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


# ============================================================
# CALCULATE YEARS OF EXPERIENCE
# ============================================================

def calculate_years_of_experience(
    experiences
) -> int:

    total_months = 0

    for experience in experiences:

        duration = experience.duration

        if not duration:
            continue

        duration = duration.lower()

        years_match = re.search(
            r"(\d+)\s*(?:year|years|yr|yrs)",
            duration
        )

        months_match = re.search(
            r"(\d+)\s*(?:month|months|mo|mos)",
            duration
        )

        if years_match:

            total_months += (
                int(years_match.group(1)) * 12
            )

        if months_match:

            total_months += int(
                months_match.group(1)
            )

    return total_months // 12


# ============================================================
# UPLOAD CV
# ============================================================

@router.post("/upload")
async def upload_cv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):

    # ========================================================
    # VALIDATE FILE
    # ========================================================

    if not file.filename:

        raise HTTPException(
            status_code=400,
            detail="File name is missing."
        )

    extension = Path(
        file.filename
    ).suffix.lower()

    if extension != ".pdf":

        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported."
        )

    if file.content_type != "application/pdf":

        raise HTTPException(
            status_code=400,
            detail="Uploaded file must be a PDF."
        )

    # ========================================================
    # SAVE FILE
    # ========================================================

    safe_filename = os.path.basename(
        file.filename
    )

    # Stored under a unique name so two CVs called "cv.pdf" never
    # overwrite each other (and deleting one never removes the other).
    file_path = UPLOAD_DIR / f"{uuid.uuid4().hex[:10]}_{safe_filename}"

    file_content = await file.read()

    if not file_content:

        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty."
        )

    with open(
        file_path,
        "wb"
    ) as buffer:

        buffer.write(file_content)

    # ========================================================
    # EXTRACT PDF TEXT
    # ========================================================

    try:

        cv_text = extract_text_from_pdf(
            str(file_path)
        )

    except Exception as e:

        _discard_file(file_path)

        raise HTTPException(
            status_code=500,
            detail=f"PDF text extraction failed: {str(e)}"
        )

    if not cv_text or not cv_text.strip():

        _discard_file(file_path)

        raise HTTPException(
            status_code=400,
            detail="Could not extract text from the PDF."
        )

    # ========================================================
    # AI CV PARSING
    # ========================================================

    try:

        cv_data = parse_cv(
            cv_text
        )

    except Exception as e:

        _discard_file(file_path)

        raise HTTPException(
            status_code=500,
            detail=f"CV parsing failed: {str(e)}"
        )

    # ========================================================
    # CALCULATE EXPERIENCE
    # ========================================================

    years_of_experience = (
        calculate_years_of_experience(
            cv_data.experience
        )
    )

    # ========================================================
    # CREATE CANDIDATE
    # ========================================================

    candidate = Candidate(

        # Temporary user until authentication
        # is connected to the project.
        user_id=1,

        phone=cv_data.phone,

        location=None,

        summary=cv_data.summary,

        years_of_experience=(
            years_of_experience
        )
    )

    db.add(candidate)

    db.flush()

    # ========================================================
    # SAVE CANDIDATE SKILLS
    # ========================================================

    skills_saved = []

    for skill_name in cv_data.skills:

        if not skill_name:
            continue

        # Normalize skill name
        normalized_name = normalize_skill(
            skill_name
        )

        if not normalized_name:
            continue

        # Search existing skill
        skill = (
            db.query(Skill)
            .filter(
                Skill.name == normalized_name
            )
            .first()
        )

        # Create skill if it doesn't exist
        if not skill:

            skill = Skill(
                name=normalized_name
            )

            db.add(skill)

            db.flush()

        # Create candidate-skill relationship
        candidate_skill = CandidateSkill(

            candidate_id=candidate.id,

            skill_id=skill.id,

            proficiency_level=None,

            years_experience=0
        )

        db.add(candidate_skill)

        skills_saved.append(
            normalized_name
        )

    # ========================================================
    # SAVE RESUME
    # ========================================================

    resume = Resume(

        candidate_id=candidate.id,

        file_name=safe_filename,

        file_path=str(file_path),

        extracted_text=cv_text,

        parsed_data=json.dumps(
            cv_data.model_dump(),
            ensure_ascii=False
        )
    )

    db.add(resume)

    db.commit()

    db.refresh(candidate)
    db.refresh(resume)

    # ========================================================
    # CREATE CANDIDATE EMBEDDING
    # ========================================================

    try:

        # create_cv_embedding() returns {"text": ..., "embedding": [...]}.
        # Passing that whole dict to add_candidate() used to raise inside
        # numpy, the error was swallowed below, and the CV was saved
        # WITHOUT a vector - which later showed up as "This candidate is
        # not in the job's search results".
        cv_embedding = create_cv_embedding(
            cv_data
        )

        faiss_result = add_candidate(
            candidate_id=candidate.id,
            embedding=cv_embedding["embedding"]
        )

    except Exception as e:

        print(
            f"Candidate embedding failed for "
            f"candidate {candidate.id}: {str(e)}"
        )

        faiss_result = {
            "success": False,
            "error": str(e)
        }

    # ========================================================
    # RAG INDEXING
    # ========================================================

    try:

        chunks = split_text(
            cv_text
        )

        rag_result = add_document_chunks(
            document_id=resume.id,
            chunks=chunks
        )

        rag_indexed = (
            rag_result["chunks_added"] > 0
        )

        print(
            "\n========== RAG INDEXING =========="
        )

        print(
            f"Resume ID: {resume.id}"
        )

        print(
            f"Chunks: {rag_result['chunks_added']}"
        )

        print(
            "RAG indexing successful"
        )

        print(
            "==================================\n"
        )

    except Exception as e:

        rag_indexed = False

        rag_result = {
            "document_id": resume.id,
            "chunks_added": 0,
            "error": str(e)
        }

        print(
            f"RAG indexing failed: {str(e)}"
        )

    # ========================================================
    # RESPONSE
    # ========================================================

    return {

        "message": (
            "CV uploaded, parsed, saved, "
            "embedded and indexed successfully."
            if faiss_result.get("success") and rag_indexed
            else "CV saved, but some indexing steps failed. "
                 "Use Re-index on the CV to retry."
        ),

        "candidate_id": candidate.id,

        "resume_id": resume.id,

        "filename": safe_filename,

        "text_length": len(cv_text),

        "years_of_experience": (
            years_of_experience
        ),

        "skills_saved": skills_saved,

        "parsed_cv": cv_data.model_dump(),

        "faiss": faiss_result,

        "rag": {

            "indexed": rag_indexed,

            "document_id": (
                rag_result["document_id"]
            ),

            "chunks": (
                rag_result["chunks_added"]
            )
        }
    }