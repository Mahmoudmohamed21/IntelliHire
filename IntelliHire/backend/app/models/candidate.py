from sqlalchemy import Column, Integer, String, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database.database import Base


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    phone = Column(String(50))

    location = Column(String(150))

    summary = Column(Text)

    years_of_experience = Column(Integer, default=0)

    user = relationship("User")

    resumes = relationship(
        "Resume",
        back_populates="candidate"
    )

    applications = relationship(
        "Application",
        back_populates="candidate"
    )

    skills = relationship(
        "CandidateSkill",
        back_populates="candidate"
    )