from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("candidates.id"),
        nullable=False
    )

    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500))
    extracted_text = Column(Text)

    # AI-parsed CV data stored as JSON text
    parsed_data = Column(Text, nullable=True)

    uploaded_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    candidate = relationship(
        "Candidate",
        back_populates="resumes"
    )