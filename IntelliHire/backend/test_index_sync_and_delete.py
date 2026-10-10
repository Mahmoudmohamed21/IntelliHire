"""
Regression test for the "candidate is not in the job's search results" bug
and for CV deletion.

Run from the backend folder:   python test_index_sync_and_delete.py

Uses real FAISS and the real SQLAlchemy models (in-memory SQLite). Only the
heavy ML pieces (sentence-transformers, the Ollama CV parser) are stubbed,
so no model downloads, SQL Server or Ollama are needed.
"""
import os, sys, types, json, tempfile, hashlib, importlib
import numpy as np

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, os.getcwd())

# ---- stub heavy modules -------------------------------------------------
def fake_embed(text):
    # deterministic 384-d unit vector derived from text tokens
    v = np.zeros(384, dtype="float32")
    for tok in text.lower().split():
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        v[h % 384] += 1.0
    n = np.linalg.norm(v) or 1.0
    return (v / n).tolist()

from pydantic import BaseModel
from typing import List, Optional
class _Edu(BaseModel):
    degree: Optional[str]=None; institution: Optional[str]=None; field: Optional[str]=None; graduation_year: Optional[str]=None
class _Exp(BaseModel):
    job_title: Optional[str]=None; company: Optional[str]=None; duration: Optional[str]=None; description: Optional[str]=None
class _Lang(BaseModel):
    language: Optional[str]=None; proficiency: Optional[str]=None
class _Proj(BaseModel):
    title: Optional[str]=None; description: Optional[str]=None
class CVData(BaseModel):
    name: Optional[str]=None; email: Optional[str]=None; phone: Optional[str]=None; summary: Optional[str]=None
    skills: List[str]=[]; education: List[_Edu]=[]; experience: List[_Exp]=[]
    certifications: List[str]=[]; languages: List[_Lang]=[]; projects: List[_Proj]=[]

cvp = types.ModuleType("app.services.cv_parser"); cvp.CVData = CVData; cvp.parse_cv = lambda t: CVData()
sys.modules["app.services.cv_parser"] = cvp
jp = types.ModuleType("app.services.job_parser")
class JobData(BaseModel): pass
jp.JobData = JobData
sys.modules["app.services.job_parser"] = jp

emb = types.ModuleType("app.services.embedding_service")
def cv_to_text(cv): return f"{cv.name} {cv.summary} {' '.join(cv.skills)}"
def create_embedding(text): return fake_embed(text)
def create_cv_embedding(cv):
    t = cv_to_text(cv); return {"text": t, "embedding": fake_embed(t)}   # SAME SHAPE AS REAL ONE
emb.create_embedding = create_embedding; emb.create_cv_embedding = create_cv_embedding
emb.cv_to_text = cv_to_text; emb.job_to_text = lambda j: ""
sys.modules["app.services.embedding_service"] = emb

# redirect data dirs to a temp folder
tmp = tempfile.mkdtemp()
import app.services.faiss_service as fs
fs.FAISS_DIR = os.path.join(tmp, "faiss"); fs.INDEX_FILE = os.path.join(fs.FAISS_DIR, "c.index"); fs.METADATA_FILE = os.path.join(fs.FAISS_DIR, "c.json")
import app.services.rag.rag_store as rs
from pathlib import Path
rs.RAG_DIR = Path(tmp) / "rag"; rs.RAG_DIR.mkdir(); rs.INDEX_PATH = rs.RAG_DIR / "d.index"; rs.METADATA_PATH = rs.RAG_DIR / "d.json"

# ---- DB -----------------------------------------------------------------
from app.database.database import Base, engine, SessionLocal
from app.models import User, Candidate, Recruiter, Resume, Skill, CandidateSkill, JobSkill, Job, Application
Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add(User(id=1, full_name="placeholder", email="p@x", password_hash="x", role="candidate")); db.commit()

import app.services.candidate_index_service as cis

def make_cv(name, skills, fname):
    path = os.path.join(tmp, fname); open(path, "wb").write(b"%PDF fake")
    cand = Candidate(user_id=1, years_of_experience=2); db.add(cand); db.flush()
    sk = []
    for s in skills:
        row = db.query(Skill).filter(Skill.name == s).first() or Skill(name=s)
        db.add(row); db.flush(); db.add(CandidateSkill(candidate_id=cand.id, skill_id=row.id)); 
    cv = CVData(name=name, summary=f"{name} engineer", skills=skills)
    r = Resume(candidate_id=cand.id, file_name=fname, file_path=path, extracted_text=("word "*300), parsed_data=json.dumps(cv.model_dump()))
    db.add(r); db.commit()
    return cand.id, r.id, path

# 1) ORIGINAL BUG: passing the whole dict used to blow up -> candidate never indexed
a, ra, pa = make_cv("Alice", ["python","sql"], "alice.pdf")
b, rb, pb = make_cv("Bob", ["java"], "bob.pdf")
cv = CVData(name="Alice", skills=["python"])
res = fs.add_candidate(a, create_cv_embedding(cv))          # whole dict (old buggy call shape) now tolerated
assert res["success"] and res["added"], res
print("1. add_candidate accepts dict result:", res["message"])

# 2) Bob was never embedded (simulates the user's broken upload)
assert fs.get_indexed_ids() == [a]
print("2. Bob missing from index (the reported bug state):", fs.get_indexed_ids())

# 3) self-heal embeds Bob
out = cis.sync_candidate_index(db)
assert out["embedded"] == [b] and not out["failed"], out
assert sorted(fs.get_indexed_ids()) == sorted([a, b])
print("3. sync_candidate_index repaired it:", out)

# 4) update existing keeps count
fs.add_candidate(a, fake_embed("totally different"))
assert len(fs.get_indexed_ids()) == 2 and fs.get_index_info()["total_vectors"] == 2
print("4. update in place OK:", fs.get_index_info())

# 5) RAG add + remove
rs.add_document_chunks(ra, ["alpha chunk one", "alpha chunk two"]); rs.add_document_chunks(rb, ["bob chunk"])
assert rs.remove_document(ra) == 2
left = rs.load_metadata(); assert [m["document_id"] for m in left] == [rb] and rs.load_index().ntotal == 1
print("5. rag remove_document OK")

# 6) full delete
rs.add_document_chunks(ra, ["alpha again"])
res = cis.delete_candidate_completely(db, a)
assert res["vector_removed"] and res["files_removed"] == 1 and not os.path.exists(pa)
assert db.query(Candidate).filter(Candidate.id == a).first() is None
assert db.query(Resume).filter(Resume.candidate_id == a).count() == 0
assert db.query(CandidateSkill).filter(CandidateSkill.candidate_id == a).count() == 0
assert fs.get_indexed_ids() == [b] and all(m["document_id"] != ra for m in rs.load_metadata())
assert os.path.exists(pb)   # other CV untouched
print("6. delete_candidate_completely OK:", res)

# 7) orphan vector (candidate deleted behind our back) gets pruned
c, rc, pc = make_cv("Cara", ["go"], "cara.pdf"); cis.sync_candidate_index(db)
db.query(CandidateSkill).filter(CandidateSkill.candidate_id == c).delete(); db.query(Resume).filter(Resume.candidate_id == c).delete(); db.query(Candidate).filter(Candidate.id == c).delete(); db.commit()
out = cis.sync_candidate_index(db); assert out["orphans_removed"] == [c], out
print("7. orphan pruned:", out)

# 8) desync recovery: corrupt metadata -> index resets, sync rebuilds from DB
json.dump([], open(fs.METADATA_FILE, "w"))
assert fs.get_indexed_ids() == []
cis.sync_candidate_index(db); assert fs.get_indexed_ids() == [b]
print("8. desync recovery OK")

# 9) delete unknown
try: cis.delete_candidate_completely(db, 99999); raise SystemExit("should fail")
except ValueError as e: print("9. unknown id ->", e)
print("\nALL BACKEND CHECKS PASSED")

# ---- ranking path -------------------------------------------------------
import logging; logging.disable(logging.CRITICAL)
import app.services.recruitment_engine as eng
job = Job(recruiter_id=1, title="Python Dev", description="python sql backend", minimum_experience=1, status="open")
db.add(job); db.flush()
for s in ["python", "sql"]:
    sk = db.query(Skill).filter(Skill.name == s).first() or Skill(name=s); db.add(sk); db.flush()
    db.add(JobSkill(job_id=job.id, skill_id=sk.id, is_required=1, minimum_years=0))
db.commit()
d, rd, pd_ = make_cv("Dan", ["python", "sql"], "dan.pdf")     # NEVER embedded -> must be healed by ranking
assert d not in fs.get_indexed_ids()
m = eng.get_candidate_match(db, job.id, d)
assert m["candidate_id"] == d and m["total_candidates"] == 2 and m["rank"] in (1, 2)
assert d in fs.get_indexed_ids()
top1 = eng.rank_candidates(db, job.id, top_k=1)
assert len(top1) == 1 and top1[0]["rank"] == 1
allm = eng.rank_candidates(db, job.id, top_k=None); assert len(allm) == 2
print("10. get_candidate_match self-heals + ranks:", {k: m[k] for k in ("candidate_id","rank","final_match_score","matched_skills")})
try: eng.get_candidate_match(db, job.id, 424242); raise SystemExit("should fail")
except ValueError as e: print("11. unknown candidate ->", str(e)[:70], "...")
print("RANKING CHECKS PASSED")
