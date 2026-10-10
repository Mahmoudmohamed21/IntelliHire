from app.database.database import SessionLocal
from app.services.job_parser import parse_job
from app.services.job_service import save_job_to_database


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


db = SessionLocal()

try:

    # ==========================================
    # PARSE JOB
    # ==========================================

    job_data = parse_job(job_text)

    print("\n========== JOB DATA ==========")

    print(
        job_data.model_dump_json(
            indent=2
        )
    )

    # ==========================================
    # SAVE JOB
    # ==========================================

    # Use your recruiter ID here
    recruiter_id = 1

    result = save_job_to_database(
        db=db,
        job_data=job_data,
        recruiter_id=recruiter_id
    )

    print("\n========== DATABASE RESULT ==========")

    print(result)

except Exception as e:

    print("\n========== ERROR ==========")
    print(str(e))

finally:

    db.close()