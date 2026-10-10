import json
import os

from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.candidate import Candidate
from app.models.resume import Resume
from app.models.skill import CandidateSkill

from app.services.cv_parser import CVData
from app.services.embedding_service import create_cv_embedding
from app.services.faiss_service import (
    add_candidate,
    get_indexed_ids,
    remove_candidate
)
from app.services.rag.document_service import split_text
from app.services.rag.rag_store import (
    add_document_chunks,
    remove_document
)


# ==========================================
# INDEX ONE CANDIDATE
# ==========================================

def index_candidate(
    db: Session,
    candidate_id: int
):
    resume = (
        db.query(Resume)
        .filter(
            Resume.candidate_id == candidate_id
        )
        .order_by(
            Resume.id.desc()
        )
        .first()
    )

    if not resume:
        raise ValueError(
            f"No resume found for candidate {candidate_id}"
        )

    if not resume.parsed_data:
        raise ValueError(
            f"Candidate {candidate_id} "
            "does not have parsed CV data"
        )

    parsed_data = json.loads(
        resume.parsed_data
    )

    cv_data = CVData.model_validate(
        parsed_data
    )

    embedding_result = create_cv_embedding(
        cv_data
    )

    faiss_result = add_candidate(
        candidate_id=candidate_id,
        embedding=embedding_result["embedding"]
    )

    return {
        "candidate_id": candidate_id,
        "resume_id": resume.id,
        "faiss_result": faiss_result
    }


# ==========================================
# INDEX ALL CANDIDATES
# ==========================================

def index_all_candidates(
    db: Session
):
    candidates = (
        db.query(Candidate)
        .all()
    )

    results = []

    for candidate in candidates:

        try:

            result = index_candidate(
                db=db,
                candidate_id=candidate.id
            )

            results.append(
                {
                    "success": True,
                    **result
                }
            )

        except Exception as e:

            results.append(
                {
                    "success": False,
                    "candidate_id": candidate.id,
                    "error": str(e)
                }
            )

    return results


# ==========================================
# SELF-HEALING SYNC
# ==========================================

def sync_candidate_index(
    db: Session
):
    """
    Make the FAISS index match the database:

    * candidates that have a parsed CV but no vector are embedded
      (this repairs CVs whose embedding failed at upload time);
    * vectors whose candidate no longer exists are removed.

    Cheap when nothing is out of date (one id query + one file read).
    """

    db_ids = {
        row[0]
        for row in (
            db.query(Resume.candidate_id)
            .filter(Resume.parsed_data.isnot(None))
            .distinct()
            .all()
        )
    }

    existing_ids = {
        row[0]
        for row in db.query(Candidate.id).all()
    }

    indexed_ids = set(get_indexed_ids())

    added = []
    failed = []
    removed = []

    for candidate_id in sorted(db_ids - indexed_ids):

        try:
            index_candidate(db=db, candidate_id=candidate_id)
            added.append(candidate_id)

        except Exception as e:
            print(f"[sync] could not embed candidate {candidate_id}: {e}")
            failed.append(
                {"candidate_id": candidate_id, "error": str(e)}
            )

    for candidate_id in sorted(indexed_ids - existing_ids):

        if remove_candidate(candidate_id):
            removed.append(candidate_id)

    return {
        "embedded": added,
        "failed": failed,
        "orphans_removed": removed
    }


# ==========================================
# RE-INDEX ONE CANDIDATE (FAISS + RAG)
# ==========================================

def reindex_candidate(
    db: Session,
    candidate_id: int
):

    result = index_candidate(db=db, candidate_id=candidate_id)

    resume = (
        db.query(Resume)
        .filter(Resume.id == result["resume_id"])
        .first()
    )

    chunks_added = 0

    if resume and resume.extracted_text:

        remove_document(resume.id)

        rag = add_document_chunks(
            document_id=resume.id,
            chunks=split_text(resume.extracted_text)
        )

        chunks_added = rag["chunks_added"]

    return {
        **result,
        "rag_chunks": chunks_added
    }


# ==========================================
# DELETE A CANDIDATE EVERYWHERE
# ==========================================

def delete_candidate_completely(
    db: Session,
    candidate_id: int
):
    """
    Remove a candidate and every trace of their CV:
    database rows, the uploaded PDF, the FAISS vector and RAG chunks.
    """

    candidate = (
        db.query(Candidate)
        .filter(Candidate.id == candidate_id)
        .first()
    )

    if not candidate:
        raise ValueError(f"Candidate {candidate_id} not found")

    resumes = (
        db.query(Resume)
        .filter(Resume.candidate_id == candidate_id)
        .all()
    )

    resume_ids = [r.id for r in resumes]

    file_paths = {r.file_path for r in resumes if r.file_path}

    file_name = resumes[0].file_name if resumes else None

    # ---- database (children first) ------------------------------
    db.query(CandidateSkill).filter(
        CandidateSkill.candidate_id == candidate_id
    ).delete(synchronize_session=False)

    db.query(Application).filter(
        Application.candidate_id == candidate_id
    ).delete(synchronize_session=False)

    db.query(Resume).filter(
        Resume.candidate_id == candidate_id
    ).delete(synchronize_session=False)

    db.query(Candidate).filter(
        Candidate.id == candidate_id
    ).delete(synchronize_session=False)

    db.commit()

    # ---- vector stores (after the DB commit succeeded) ----------
    vector_removed = remove_candidate(candidate_id)

    chunks_removed = sum(remove_document(rid) for rid in resume_ids)

    # ---- uploaded files -----------------------------------------
    files_removed = []

    for path in file_paths:

        still_used = (
            db.query(Resume.id)
            .filter(Resume.file_path == path)
            .first()
        )

        if still_used:
            continue

        try:
            if os.path.isfile(path):
                os.remove(path)
                files_removed.append(path)
        except OSError as e:
            print(f"[delete] could not remove file {path}: {e}")

    return {
        "candidate_id": candidate_id,
        "file_name": file_name,
        "vector_removed": vector_removed,
        "rag_chunks_removed": chunks_removed,
        "files_removed": len(files_removed)
    }
