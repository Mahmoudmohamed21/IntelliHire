import os

from fastapi import FastAPI
from app.api.cv import router as cv_router
from app.api import matching
from app.api import jobs
from app.api import interview
from app.database.database import Base, engine
from app.api import interview_evaluation
from app.api import decision
from app.api import chat
from app.api import candidates
from app.api import cv
from fastapi.middleware.cors import CORSMiddleware
from app.models import (
    User,
    Candidate,
    Recruiter,
    Resume,
    Skill,
    CandidateSkill,
    JobSkill,
    Job,
    Application
)


# Create database tables
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="IntelliHire API",
    description="AI-Powered Recruitment & Talent Intelligence Platform",
    version="1.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(cv_router)
app.include_router(matching.router)
app.include_router(jobs.router)
app.include_router(
    interview.router
)
app.include_router(chat.router)
app.include_router(candidates.router)

app.include_router(
    interview_evaluation.router
)
app.include_router(
    decision.router
)
@app.get("/")
def root():
    return {
        "message": "Welcome to IntelliHire API",
        "status": "running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "database": "SQL Server"
    }
