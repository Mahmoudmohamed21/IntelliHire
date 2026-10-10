from app.services.job_parser import parse_job
from app.services.embedding_service import (
    job_to_text,
    create_embedding
)


job_text = """
Data Analyst

We are looking for a Data Analyst to join our team in Cairo.

Responsibilities:
- Analyze business data.
- Create interactive dashboards.
- Prepare reports for management.
- Extract insights from large datasets.

Requirements:
- Bachelor's degree in Computer Science, Information Systems,
  Business, Statistics or related field.
- At least 1 year of experience.
- Strong SQL skills.
- Python experience.
- Power BI experience.
- Advanced Excel skills.
- Strong analytical and communication skills.

Employment Type:
Full-time

Location:
Cairo, Egypt
"""


# ==========================================
# PARSE JOB
# ==========================================

job_data = parse_job(job_text)


# ==========================================
# CONVERT JOB TO TEXT
# ==========================================

searchable_text = job_to_text(job_data)

print("\n========== SEARCHABLE JOB TEXT ==========")
print(searchable_text)


# ==========================================
# CREATE EMBEDDING
# ==========================================

embedding = create_embedding(
    searchable_text
)


print("\n========== EMBEDDING INFO ==========")

print(
    "Embedding type:",
    type(embedding)
)

print(
    "Embedding dimensions:",
    len(embedding)
)

print(
    "First 10 values:",
    embedding[:10]
)