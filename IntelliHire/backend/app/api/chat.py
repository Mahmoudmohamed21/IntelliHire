import json
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.resume import Resume
from app.services.rag.profile_service import build_cv_profile

from app.services.rag.document_service import (
    split_text
)

from app.services.rag.rag_store import (
    add_document_chunks
)

from app.services.rag.rag_service import (
    ask_document
)


router = APIRouter(
    prefix="/chat",
    tags=["AI Chat"]
)


# ============================================================
# INDEX REQUEST
# ============================================================

class IndexDocumentRequest(BaseModel):

    document_id: int

    text: str


# ============================================================
# CHAT REQUEST
# ============================================================

class ChatTurn(BaseModel):

    role: Literal["user", "assistant"]

    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):

    document_id: int

    question: str = Field(max_length=2000)

    # Earlier turns of this conversation, so follow-ups like
    # "and where did she study?" make sense.
    history: List[ChatTurn] = Field(
        default_factory=list,
        max_length=20
    )

    top_k: int = Field(
        default=5,
        ge=1,
        le=10
    )


# ============================================================
# INDEX DOCUMENT
# ============================================================

@router.post("/index")
def index_document(
    request: IndexDocumentRequest
):

    if not request.text.strip():

        raise HTTPException(
            status_code=400,
            detail="Document text is empty."
        )

    chunks = split_text(
        request.text
    )

    result = add_document_chunks(
        document_id=request.document_id,
        chunks=chunks
    )

    return {

        "message": (
            "Document indexed successfully."
        ),

        **result
    }


# ============================================================
# ASK DOCUMENT
# ============================================================

@router.post("/ask")
def chat_with_document(
    request: ChatRequest,
    db: Session = Depends(get_db)
):

    if not request.question.strip():

        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )

    # document_id is the resume id. Load its structured data so the
    # answer is grounded in the whole CV, not just a few excerpts.
    profile = None
    full_text = None

    resume = (
        db.query(Resume)
        .filter(Resume.id == request.document_id)
        .first()
    )

    if resume:

        full_text = resume.extracted_text

        try:
            parsed = json.loads(resume.parsed_data or "{}")
        except (TypeError, ValueError):
            parsed = {}

        years = (
            resume.candidate.years_of_experience
            if resume.candidate
            else None
        )

        profile = build_cv_profile(
            parsed if isinstance(parsed, dict) else {},
            years
        )

    try:

        return ask_document(
            question=request.question,
            document_id=request.document_id,
            top_k=request.top_k,
            profile=profile,
            full_text=full_text,
            history=[t.model_dump() for t in request.history],
        )

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"RAG failed: {str(e)}"
        )
