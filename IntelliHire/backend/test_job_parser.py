from app.services.job_parser import parse_job


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


try:

    result = parse_job(job_text)

    print("\n========== PARSED JOB ==========")

    print(
        result.model_dump_json(
            indent=2
        )
    )

except Exception as e:

    print("\n========== ERROR ==========")
    print(str(e))