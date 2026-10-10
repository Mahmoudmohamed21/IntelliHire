from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)

    recruiter_id = Column(
        Integer,
        ForeignKey("recruiters.id"),
        nullable=False
    )

    title = Column(String(200), nullable=False)

    description = Column(Text)

    location = Column(String(150))

    employment_type = Column(String(50))

    required_education = Column(String(200))

    minimum_experience = Column(Integer, default=0)

    status = Column(String(50), default="open")

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    recruiter = relationship(
        "Recruiter",
        back_populates="jobs"
    )

    skills = relationship(
        "JobSkill",
        back_populates="job"
    )

    applications = relationship(
        "Application",
        back_populates="job"
    )