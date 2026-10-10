"""
Regression tests for: "AI returned JSON, but it does not match InterviewEvaluation
schema ... technical_score ... unable to parse string as a number ': 0'".

Run from the backend folder:  python test_interview_evaluation_robustness.py
Only the LLM is faked; the service, models and API route are real.
"""
import os, sys, types, json, logging

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, os.getcwd())
import sqlalchemy
from sqlalchemy.pool import StaticPool
_ce = sqlalchemy.create_engine
sqlalchemy.create_engine = lambda url, **kw: _ce(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)

import app.services.interview_evaluation_service as ev

QA = [{"question": "What is a decorator?", "answer": "A function wrapping another function."},
      {"question": "Explain SQL indexes.", "answer": "They speed up lookups."}]

def reply(d): return json.dumps(d)
class Fake:
    def __init__(self, *replies): self.replies, self.calls = list(replies), 0
    def invoke(self, inputs):
        self.calls += 1
        r = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        return types.SimpleNamespace(content=r)

# ------------------------------------------------------------- coerce_score
c = ev.coerce_score
assert c(": 0") == 0.0 and c("85") == 85.0 and c("85/100") == 85.0 and c("85%") == 85.0
assert c("8/10") == 80.0 and c("4/5") == 80.0 and c(7.5) == 7.5 and c("score: 72.4 points") == 72.4
assert c(250) == 100.0 and c(-5) == 0.0 and c("-3") == 0.0
assert c(None) is None and c("great") is None and c("") is None and c(True) is None and c([1]) is None
print("1. coerce_score handles ': 0', '85/100', '8/10', '85%', out-of-range, garbage")

# ------------------------------------------- the EXACT reported failure
broken = {"overall_score": 72, "technical_score": ": 0", "communication_score": 80, "relevance_score": 75,
          "strengths": ["Clear"], "weaknesses": ["Shallow"], "recommendation": "Hire", "summary": "OK",
          "evaluations": [{"question": "q", "answer": "a", "score": 70, "technical_accuracy": 70, "communication": 80,
                           "relevance": 75, "strengths": [], "weaknesses": [], "feedback": "fine"}]}
old_style_error = None
try: ev.InterviewEvaluation.model_validate(broken)
except Exception as e: old_style_error = str(e)
assert old_style_error and "technical_score" in old_style_error       # proves this input DID break the old code
norm = ev.normalize_evaluation(broken, QA)
model = ev.InterviewEvaluation.model_validate(norm)
assert model.technical_score == 0.0 and model.overall_score == 72
print("2. the exact payload that crashed before now validates (technical_score ': 0' -> 0.0)")

# -------------------------------------------------- repair of other shapes
sloppy = {"overall_score": "78/100", "strengths": "Good fundamentals", "weaknesses": None,
          "recommendation": "I would hire this candidate", "summary": None,
          "evaluations": [{"question": "REWRITTEN BY MODEL", "answer": "ALSO WRONG", "technical_accuracy": "9/10"}]}
n = ev.normalize_evaluation(sloppy, QA)
assert n["overall_score"] == 78.0 and n["strengths"] == ["Good fundamentals"] and n["weaknesses"] == []
assert n["recommendation"] == "Hire" and n["summary"] == ""
assert len(n["evaluations"]) == 2                                   # one per real answer, even though model gave one
assert n["evaluations"][0]["question"] == QA[0]["question"] and n["evaluations"][0]["answer"] == QA[0]["answer"]
assert n["evaluations"][0]["technical_accuracy"] == 90.0 and n["evaluations"][0]["score"] == 90.0
assert n["evaluations"][1]["score"] == 78.0                         # missing -> falls back to overall
ev.InterviewEvaluation.model_validate(n)
print("3. strings->lists, missing fields, wrong echo, fewer items than answers: all repaired")

d = ev.normalize_evaluation({"evaluations": [{"score": 60, "technical_accuracy": 50, "communication": 70, "relevance": 60},
                                              {"score": 80, "technical_accuracy": 90, "communication": 70, "relevance": 80}]}, QA)
assert d["overall_score"] == 70.0 and d["technical_score"] == 70.0 and d["communication_score"] == 70.0
assert d["recommendation"] == "Hire"
print("4. totals derived from per-answer scores when the model omits them")

for text, overall, want in [("Strong Hire", 0, "Strong Hire"), ("strong hire!", 0, "Strong Hire"), ("Do not hire", 90, "Reject"),
                            ("Reject", 90, "Reject"), ("Consider", 90, "Consider"), ("", 90, "Strong Hire"),
                            ("", 72, "Hire"), (None, 60, "Consider"), ("???", 20, "Reject")]:
    assert ev.normalize_recommendation(text, overall) == want, (text, overall)
print("5. recommendation normalised / derived from the score")

try: ev.normalize_evaluation({"summary": "no numbers at all"}, QA); raise SystemExit("should fail")
except ValueError as e: assert "no usable scores" in str(e)
print("6. a reply with no scores at all is rejected clearly")

# ------------------------------------------------------- retry behaviour
good = {"overall_score": 82, "technical_score": 85, "communication_score": 80, "relevance_score": 81,
        "recommendation": "Hire", "summary": "Solid", "strengths": ["a"], "weaknesses": ["b"], "evaluations": []}
blank = {"overall_score": 0, "technical_score": 0, "communication_score": 0, "relevance_score": 0, "evaluations": []}

assert ev.run_evaluation(Fake(reply(good)), {}, QA).overall_score == 82
try: ev.run_evaluation(Fake(reply(blank)), {}, QA); raise SystemExit("blank accepted")
except ValueError as e: assert "empty template" in str(e)
for bad in ["", "no json here", "{broken json"]:
    try: ev.run_evaluation(Fake(bad), {}, QA); raise SystemExit("bad accepted: " + bad)
    except ValueError: pass
print("7. blank template / empty / non-JSON replies are rejected")

# ------------------------------------------------ full service + API route
logging.disable(logging.CRITICAL)
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.database.database import Base, engine, SessionLocal, get_db
from app.models import User, Candidate, Recruiter, Resume, Skill, CandidateSkill, JobSkill, Job, Application
from app.api import interview_evaluation
Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add(User(id=1, full_name="Hager Essam", email="p@x", password_hash="x", role="candidate")); db.add(Recruiter(id=1, user_id=1)); db.commit()
cand = Candidate(user_id=1, years_of_experience=2); db.add(cand)
job = Job(recruiter_id=1, title="Data Engineer", minimum_experience=1); db.add(job); db.commit()
cand_id, job_id = cand.id, job.id

app = FastAPI(); app.include_router(interview_evaluation.router)
def _db():
    yield db
app.dependency_overrides[get_db] = _db
client = TestClient(app)
body = {"candidate_id": cand_id, "job_id": job_id, "answers": QA}

# first attempt = the reported bad payload; must succeed with ONE call (no retry needed)
f1, f2 = Fake(reply(broken)), Fake(reply(good))
ev.chain, ev.retry_chain = f1, f2
r = client.post("/interview/evaluate", json=body)
assert r.status_code == 200, r.text
j = r.json(); assert j["technical_score"] == 0.0 and len(j["evaluations"]) == 2 and f1.calls == 1 and f2.calls == 0
print("8. POST /interview/evaluate returns 200 for the exact payload that used to fail")

# first attempt unusable -> second attempt (retry chain) succeeds
f1, f2 = Fake("total garbage"), Fake(reply(good))
ev.chain, ev.retry_chain = f1, f2
r = client.post("/interview/evaluate", json=body)
assert r.status_code == 200 and r.json()["overall_score"] == 82 and (f1.calls, f2.calls) == (1, 1), r.text
print("9. unusable first reply -> automatic second attempt succeeds")

# both unusable -> clear 500 (not a misleading 404), with an actionable message
ev.chain, ev.retry_chain = Fake("garbage"), Fake(reply(blank))
r = client.post("/interview/evaluate", json=body)
assert r.status_code == 500 and "after 2 attempts" in r.json()["detail"] and "try again" in r.json()["detail"].lower(), r.text
assert client.post("/interview/evaluate", json={**body, "candidate_id": 99999}).status_code == 404
assert client.post("/interview/evaluate", json={**body, "answers": []}).status_code == 400
print("10. both attempts bad -> clear 500; unknown candidate -> 404; no answers -> 400")

# interview question generator no longer demands type/difficulty
from app.services.interview_service import InterviewQuestion
q = InterviewQuestion.model_validate({"question": "Why Python?"})
assert (q.type, q.difficulty) == ("technical", "medium")
print("11. question generator tolerates missing type/difficulty")
print("\nALL INTERVIEW-EVALUATION CHECKS PASSED")
