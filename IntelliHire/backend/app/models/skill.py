from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from app.database.database import Base


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(
        String(100),
        unique=True,
        nullable=False
    )

    category = Column(String(100))

    candidate_skills = relationship(
        "CandidateSkill",
        back_populates="skill"
    )

    job_skills = relationship(
        "JobSkill",
        back_populates="skill"
    )


class CandidateSkill(Base):
    __tablename__ = "candidate_skills"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("candidates.id"),
        nullable=False
    )

    skill_id = Column(
        Integer,
        ForeignKey("skills.id"),
        nullable=False
    )

    proficiency_level = Column(String(50))

    years_experience = Column(Integer, default=0)

    candidate = relationship(
        "Candidate",
        back_populates="skills"
    )

    skill = relationship(
        "Skill",
        back_populates="candidate_skills"
    )


class JobSkill(Base):
    __tablename__ = "job_skills"

    id = Column(Integer, primary_key=True, index=True)

    job_id = Column(
        Integer,
        ForeignKey("jobs.id"),
        nullable=False
    )

    skill_id = Column(
        Integer,
        ForeignKey("skills.id"),
        nullable=False
    )

    is_required = Column(Integer, default=1)

    minimum_years = Column(Integer, default=0)

    job = relationship(
        "Job",
        back_populates="skills"
    )

    skill = relationship(
        "Skill",
        back_populates="job_skills"
    )