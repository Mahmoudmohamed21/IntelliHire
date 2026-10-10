"""
Tests for the improved AI answers (reasoning-leak cleaning, grounded context,
follow-up history) and for DELETE /jobs/{id}.

Run from the backend folder:  python test_ai_answers_and_job_delete.py
Stubs only the embedding model and the LLM - everything else is real.
"""
import os, sys, types, json, tempfile, hashlib, logging
import numpy as np

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, os.getcwd())

# FastAPI's TestClient runs endpoints in worker threads; let the in-memory
# SQLite test database be shared across them (SQL Server is unaffected).
import sqlalchemy
from sqlalchemy.pool import StaticPool
_create_engine = sqlalchemy.create_engine
sqlalchemy.create_engine = lambda url, **kw: _create_engine(
    url, connect_args={"check_same_thread": False}, poolclass=StaticPool
)

def fake_embed(text):
    v = np.zeros(384, dtype="float32")
    for tok in text.lower().split():
        v[int(hashlib.md5(tok.encode()).hexdigest(), 16) % 384] += 1.0
    return (v / (np.linalg.norm(v) or 1.0)).tolist()

emb = types.ModuleType("app.services.embedding_service")
emb.create_embedding = fake_embed
emb.create_cv_embedding = lambda cv: {"text": "", "embedding": fake_embed("x")}
emb.job_to_text = lambda j: ""; emb.cv_to_text = lambda c: ""
sys.modules["app.services.embedding_service"] = emb
for name in ("cv_parser", "job_parser"):
    m = types.ModuleType(f"app.services.{name}")
    m.CVData = type("CVData", (), {}); m.JobData = type("JobData", (), {}); m.parse_cv = lambda t: None
    sys.modules[f"app.services.{name}"] = m

tmp = tempfile.mkdtemp()
from pathlib import Path
import app.services.rag.rag_store as rs
rs.RAG_DIR = Path(tmp); rs.INDEX_PATH = rs.RAG_DIR / "d.index"; rs.METADATA_PATH = rs.RAG_DIR / "d.json"

import app.services.rag.rag_service as svc
from app.services.rag.profile_service import build_cv_profile

# ---------------------------------------------------------------- cleaning
LEAKED = """Hmm, the user wants me to summarize a CV based on the provided document context. I need to be careful to only use the information from this document and not add anything extra.

Looking at the document context, I see it's structured with sections: CERTIFICATIONS, SKILLS, LANGUAGES, PROFESSIONAL EXPERIENCE, EDUCATION, and PROJECTS.

For the summary, I'll focus on the key points:
- The person is a Mechanical Engineering student at Ain Shams University
- They have three internships

I notice the document has some formatting issues and repetitions, but I'll work with what's provided.

The user wants only the final answer without any extra text or reasoning. I'll structure it as a bullet-point summary.

I'll create a clean summary that captures the essence without the repetition issues in the original document.

- Mechanical Engineering student (expected graduation June 2025) at Ain Shams University with Mechatronics minor
- Relevant internships: Cheiron Petroleum Corporation (2024), Egyptian National Railways (2023), Arab Contractors Company (2022)
- Key skills: Mechanical design, PLC/SCADA/HMI, industrial automation, robotics
- Graduation project: Developed an intelligent, fully automated testing machine"""

out = svc.clean_response(LEAKED)
assert out.startswith("- Mechanical Engineering student"), out[:80]
assert "Hmm" not in out and "the user" not in out.lower() and "I'll" not in out
assert out.count("\n- ") == 3 and len(out.splitlines()) == 4
print("1. the EXACT leaked reply you pasted is cleaned to just the 4 bullets")

assert svc.clean_response("<think>plan plan</think>\n<answer>\n- A\n- B\n</answer>") == "- A\n- B"
assert svc.clean_response("Let me think. <answer>- Real</answer> trailing") == "- Real"
assert svc.clean_response("<answer>\n- cut off by token limit\n- second") == "- cut off by token limit\n- second"
assert svc.clean_response("<think>unclosed reasoning forever") == ""
assert svc.clean_response("<answer>first</answer> hmm <answer>second</answer>") == "second"
print("2. <answer> tags / <think> blocks / unclosed tags handled")

plain = "Hager worked as Senior Sales at Le Voil for 1 year.\n\nShe studied Commerce at Cairo University."
assert svc.clean_response(plain) == plain
assert svc.clean_response("Final answer: She speaks Arabic.") == "She speaks Arabic."
print("3. normal answers pass through untouched")

assert svc.is_broad_question("Summarize this CV") and svc.is_broad_question("tell me about her")
assert not svc.is_broad_question("Which university did she attend?")
print("4. broad vs specific question detection OK")

# ----------------------------------------------------------------- profile
cv = {"name": "Hager Essam", "email": "h@x.com", "skills": ["Sales", "CRM"],
      "education": [{"degree": "BCom", "institution": "Cairo University", "graduation_year": "2024"}],
      "experience": [{"job_title": "Senior Sales", "company": "Le Voil", "duration": "1 year", "description": "Sold scarves"}],
      "certifications": ["CRM 101"], "languages": [{"language": "Arabic", "proficiency": "Native"}], "projects": []}
profile = build_cv_profile(cv, 1)
for needle in ("Hager Essam", "Skills: Sales, CRM", "Senior Sales at Le Voil (1 year)", "Cairo University", "Arabic - Native", "years of experience: 1"):
    assert needle in profile, needle
assert build_cv_profile({}) == ""
print("5. structured CV profile built")

# ------------------------------------------------------- ask_document logic
class FakeChain:
    def __init__(self, replies): self.replies, self.calls = list(replies), []
    def invoke(self, inputs):
        self.calls.append(inputs)
        return types.SimpleNamespace(content=self.replies.pop(0))

rs.add_document_chunks(1, ["Hager studied Commerce at Cairo University", "Skills: Sales and CRM"])
FULL = "FULLTEXT-MARKER " + "x " * 50

chain = FakeChain(["<answer>- Sales professional</answer>"]); svc.chain = chain
r = svc.ask_document("Summarize this CV", 1, profile=profile, full_text=FULL, history=[])
ctx = chain.calls[0]["context"]
assert r["answer"] == "- Sales professional"
assert "STRUCTURED PROFILE" in ctx and "FULL CV TEXT" in ctx and "FULLTEXT-MARKER" in ctx
print("6. summary question -> profile + FULL CV text in the prompt")

chain = FakeChain(["<answer>Cairo University</answer>"]); svc.chain = chain
r = svc.ask_document("Where did she study?", 1, profile=profile, full_text=FULL,
                     history=[{"role": "user", "content": "Summarize"}, {"role": "assistant", "content": "- Sales"}])
call = chain.calls[0]
assert "RELEVANT CV EXCERPTS" in call["context"] and "FULLTEXT-MARKER" not in call["context"]
assert call["history"] == [("human", "Summarize"), ("ai", "- Sales")]
assert r["sources"] and r["answer"] == "Cairo University"
print("7. specific question -> excerpts + conversation history; sources returned")

chain = FakeChain(["<think>hmm</think>", "<answer>Second try worked</answer>"]); svc.chain = chain
assert svc.ask_document("Languages?", 1, profile=profile)["answer"] == "Second try worked" and len(chain.calls) == 2
print("8. empty model output is retried once")

svc.chain = FakeChain(["", ""])
assert "couldn't generate" in svc.ask_document("Languages?", 1, profile=profile)["answer"]
svc.chain = FakeChain(["x"])
assert "could not find any information" in svc.ask_document("anything", 999)["answer"]
print("9. graceful fallbacks")

# real prompt formatting (history placeholder + braces inside CV text)
real = svc.prompt.format_messages(context="Skills: {C++} {x}", question="Q?", history=[("human", "a"), ("ai", "b")])
assert [m.type for m in real] == ["system", "human", "ai", "human"] and "{C++}" in real[0].content
print("10. real prompt template formats correctly (history + braces in CV text)")

# ---------------------------------------------------- chat endpoint + job delete
logging.disable(logging.CRITICAL)
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.database.database import Base, engine, SessionLocal, get_db
from app.models import User, Candidate, Recruiter, Resume, Skill, CandidateSkill, JobSkill, Job, Application
Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add(User(id=1, full_name="p", email="p@x", password_hash="x", role="candidate"))
db.add(Recruiter(id=1, user_id=1, company_name="Co")) if "company_name" in Recruiter.__table__.columns else db.add(Recruiter(id=1, user_id=1))
db.commit()

from app.api import chat, jobs
app = FastAPI(); app.include_router(chat.router); app.include_router(jobs.router)
def _override_db():
    yield db
app.dependency_overrides[get_db] = _override_db
client = TestClient(app)

cand = Candidate(user_id=1, years_of_experience=1); db.add(cand); db.flush()
res = Resume(candidate_id=cand.id, file_name="h.pdf", file_path="x", extracted_text=FULL, parsed_data=json.dumps(cv)); db.add(res); db.commit()
rs.add_document_chunks(res.id, ["Hager studied Commerce at Cairo University"])

chain = FakeChain(["<answer>- Studied at Cairo University</answer>"]); svc.chain = chain
r = client.post("/chat/ask", json={"document_id": res.id, "question": "Summarize",
                                   "history": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]})
assert r.status_code == 200 and r.json()["answer"] == "- Studied at Cairo University", r.text
assert "Senior Sales at Le Voil" in chain.calls[0]["context"] and "years of experience: 1" in chain.calls[0]["context"]
assert chain.calls[0]["history"] == [("human", "hi"), ("ai", "hello")]
assert client.post("/chat/ask", json={"document_id": res.id, "question": "  "}).status_code == 400
assert client.post("/chat/ask", json={"document_id": res.id, "question": "q", "history": [{"role": "system", "content": "x"}]}).status_code == 422
print("11. POST /chat/ask loads the resume's profile + history from the DB; validates input")

job = Job(recruiter_id=1, title="Data Engineer", minimum_experience=1); db.add(job); db.flush()
sk = Skill(name="python"); db.add(sk); db.flush()
db.add(JobSkill(job_id=job.id, skill_id=sk.id, is_required=1)); db.add(Application(candidate_id=cand.id, job_id=job.id)); db.commit()
other = Job(recruiter_id=1, title="Keep me"); db.add(other); db.commit()
job_id, other_id, cand_id = job.id, other.id, cand.id   # ids captured before the rows are deleted

r = client.delete(f"/jobs/{job_id}")
assert r.status_code == 200 and r.json()["title"] == "Data Engineer" and r.json()["applications_removed"] == 1, r.text
assert db.query(Job).filter(Job.id == job_id).first() is None
assert db.query(JobSkill).filter(JobSkill.job_id == job_id).count() == 0
assert db.query(Application).filter(Application.job_id == job_id).count() == 0
assert db.query(Job).filter(Job.id == other_id).first() is not None          # other jobs untouched
assert db.query(Candidate).filter(Candidate.id == cand_id).first() is not None   # candidates untouched
assert db.query(Skill).filter(Skill.name == "python").first() is not None
assert client.delete(f"/jobs/{job_id}").status_code == 404
print("12. DELETE /jobs/{id} removes job + skills + applications only; 404 when missing")
print("\nALL AI-ANSWER + JOB-DELETE CHECKS PASSED")
