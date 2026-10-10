from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from app.database.database import Base


class Recruiter(Base):
    __tablename__ = "recruiters"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    company_name = Column(String(150))

    company_email = Column(String(150))

    user = relationship("User")

    jobs = relationship(
        "Job",
        back_populates="recruiter"
    )