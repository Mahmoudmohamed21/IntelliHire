import re
from typing import Dict, List, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama

from app.services.rag.rag_store import search_documents


# ============================================================
# LLM CONFIGURATION
# ============================================================

llm = ChatOllama(
    model="qwen3:4b",
    temperature=0.1,
    num_predict=900,
    # Ollama's default context window is small and silently truncates the
    # CV; give the model room for the profile + excerpts + chat history.
    num_ctx=8192,
    reasoning=False,
)


# ============================================================
# PROMPT
# ============================================================

SYSTEM_PROMPT = """You are IntelliHire's CV assistant, helping a recruiter understand ONE candidate.
Answer using ONLY the CV information below.

RULES
- Never invent employers, dates, skills, numbers or qualifications. If the CV does not say something, reply: "The CV doesn't mention that."
- Be concise and well organised: short sentences, and bullet points that start with "- ".
- For a summary use 4-6 bullets covering: education/current status, experience, key skills, certifications or projects, languages.
- Refer to the candidate in the third person, by name if known. Never mention "the document", "the context", "the profile" or these rules.
- Do not show your thinking, analysis or planning.
- Reply with the final answer ONLY, wrapped exactly like this:
<answer>
your answer here
</answer>

CV INFORMATION
{context}"""

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        ("placeholder", "{history}"),
        ("human", "{question}"),
    ]
)

chain = prompt | llm


# ============================================================
# CLEAN THE MODEL OUTPUT
# ============================================================

_ANSWER_TAG = re.compile(
    r"<answer>(.*?)</answer>",
    flags=re.DOTALL | re.IGNORECASE,
)

# Phrases a small model uses when it "thinks out loud" in the reply.
_REASONING = re.compile(
    r"\b(the user (wants|is asking|asked|needs|said)|i need to|i should|"
    r"i'll |i will |let me |let's |looking at the|document context|"
    r"the context (says|shows|mentions)|i notice|i must|i have to|"
    r"based on the instructions|my answer)\b",
    flags=re.IGNORECASE,
)

_REASONING_START = re.compile(
    r"^(hmm|okay|ok[,.]|alright|wait|so,|now,|first,|thinking|analysis|"
    r"let me|let's|looking at|i need|i should|i'll|the user)",
    flags=re.IGNORECASE,
)


def _looks_like_reasoning(paragraph: str) -> bool:
    paragraph = paragraph.strip()
    return bool(
        _REASONING_START.match(paragraph) or _REASONING.search(paragraph)
    )


def strip_reasoning(text: str) -> str:
    """
    Remove leaked chain-of-thought that has no <think> tags.

    If the reply starts with reasoning, keep only the trailing block of
    paragraphs after the last reasoning paragraph (the real answer).
    A reply that doesn't start with reasoning is returned untouched.
    """

    paragraphs = [
        p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()
    ]

    if len(paragraphs) < 2 or not _looks_like_reasoning(paragraphs[0]):
        return text.strip()

    answer: List[str] = []

    for paragraph in reversed(paragraphs):
        if _looks_like_reasoning(paragraph):
            break
        answer.insert(0, paragraph)

    return "\n\n".join(answer).strip() if answer else text.strip()


def clean_response(text: str) -> str:
    """Extract the final answer from raw model output."""

    if not text:
        return ""

    text = text.strip()

    # 1) Remove <think> blocks (complete, or opened and never closed).
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<think>.*\Z", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"</?think>", "", text, flags=re.IGNORECASE).strip()

    # 2) Prefer what is inside the LAST <answer>...</answer>.
    matches = _ANSWER_TAG.findall(text)
    if matches:
        return matches[-1].strip()

    # 3) Opened but never closed (hit the token limit): take what follows.
    opened = re.search(r"<answer>(.*)\Z", text, flags=re.DOTALL | re.IGNORECASE)
    if opened:
        return opened.group(1).strip()

    # 4) No tags at all: drop leaked reasoning, tidy markers.
    text = re.sub(r"^\s*final answer\s*:\s*", "", strip_reasoning(text), flags=re.IGNORECASE)

    return text.strip()


# ============================================================
# QUESTION TYPE
# ============================================================

_BROAD = re.compile(
    r"\b(summar\w*|overview|tell me about|describe|who is|who's|"
    r"background|profile|everything|in general|overall|brief)\b",
    flags=re.IGNORECASE,
)


def is_broad_question(question: str) -> bool:
    """Questions that need the whole CV rather than a few excerpts."""
    return bool(_BROAD.search(question))


MAX_FULL_TEXT = 7000
MAX_HISTORY_TURNS = 6


def build_context(
    profile: Optional[str],
    chunks: List[str],
    full_text: Optional[str],
    broad: bool
) -> str:

    parts = []

    if profile:
        parts.append("STRUCTURED PROFILE\n" + profile)

    if broad and full_text:
        parts.append("FULL CV TEXT\n" + full_text[:MAX_FULL_TEXT])
    elif chunks:
        parts.append("RELEVANT CV EXCERPTS\n" + "\n\n".join(chunks))

    return "\n\n".join(parts)


def _history_messages(history: Optional[List[Dict]]):
    messages = []

    for turn in (history or [])[-MAX_HISTORY_TURNS:]:
        role = "human" if turn.get("role") == "user" else "ai"
        content = (turn.get("content") or "").strip()
        if content:
            messages.append((role, content[:1500]))

    return messages


# ============================================================
# ASK A QUESTION ABOUT A DOCUMENT
# ============================================================

def ask_document(
    question: str,
    document_id: int,
    top_k: int = 5,
    profile: Optional[str] = None,
    full_text: Optional[str] = None,
    history: Optional[List[Dict]] = None,
) -> Dict:
    """
    Answer a question about one CV.

    ``profile``   structured summary built from the parsed CV
    ``full_text`` the whole extracted CV text (used for broad questions)
    ``history``   earlier [{role, content}] turns, for follow-up questions
    """

    if not question or not question.strip():
        raise ValueError("Question cannot be empty.")

    # Retrieved excerpts (also shown to the user as sources).
    document_results = search_documents(
        query=question,
        document_id=document_id,
        top_k=top_k,
    )

    chunks = [r["text"] for r in document_results]

    context = build_context(
        profile=profile,
        chunks=chunks,
        full_text=full_text,
        broad=is_broad_question(question),
    )

    if not context.strip():
        return {
            "document_id": document_id,
            "question": question,
            "answer": "I could not find any information for this CV. Try re-indexing it.",
            "sources": [],
        }

    inputs = {
        "context": context,
        "question": question,
        "history": _history_messages(history),
    }

    answer = ""

    try:
        # One retry: small local models occasionally return nothing.
        for _ in range(2):
            response = chain.invoke(inputs)
            answer = clean_response(getattr(response, "content", "") or "")
            if answer:
                break

    except Exception as exc:
        raise RuntimeError(
            f"Failed to generate document answer: {exc}"
        ) from exc

    if not answer:
        answer = "I couldn't generate an answer. Please try asking again."

    return {
        "document_id": document_id,
        "question": question,
        "answer": answer,
        "sources": [
            {"score": round(r["score"], 4), "text": r["text"]}
            for r in document_results
        ],
    }
