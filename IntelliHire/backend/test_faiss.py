from app.services.embedding_service import (
    create_embedding
)

from app.services.faiss_service import (
    add_candidate,
    search_candidates,
    get_index_info
)


# ==========================================
# SAMPLE CANDIDATE TEXT
# ==========================================

candidate_text = """
Candidate: HAGER ESSAM

Summary:
Motivated customer-focused Sales professional
with 1 year of retail sales experience.

Skills:
Customer Service,
Sales & Upselling,
Communication Skills,
Product Presentation,
Customer Relationship Management,
Teamwork,
Problem Solving,
Achieving Sales Targets,
Time Management.

Experience:
Senior Sales at Le Voil for 1 year.
Sales Representative at Skada Scarf for 1 month.

Languages:
Arabic - Native
English - Good
"""


# ==========================================
# CREATE CANDIDATE EMBEDDING
# ==========================================

candidate_embedding = create_embedding(
    candidate_text
)

print("\n========== CANDIDATE EMBEDDING ==========")

print(
    "Dimensions:",
    len(candidate_embedding)
)


# ==========================================
# ADD CANDIDATE TO FAISS
# ==========================================

result = add_candidate(
    candidate_id=1003,
    embedding=candidate_embedding
)

print("\n========== ADD RESULT ==========")

print(result)


# ==========================================
# INDEX INFORMATION
# ==========================================

info = get_index_info()

print("\n========== FAISS INFO ==========")

print(info)


# ==========================================
# SAMPLE DATA ANALYST JOB
# ==========================================

job_text = """
Job Title:
Data Analyst

Description:
Analyze business data.
Create interactive dashboards.
Prepare reports for management.
Extract insights from large datasets.

Required Education:
Bachelor's degree in Computer Science,
Information Systems, Business or Statistics.

Minimum Experience:
1 year.

Required Skills:
SQL,
Python,
Power BI,
Advanced Excel,
Analytical skills,
Communication skills.
"""


# ==========================================
# CREATE JOB EMBEDDING
# ==========================================

job_embedding = create_embedding(
    job_text
)


print("\n========== JOB EMBEDDING ==========")

print(
    "Dimensions:",
    len(job_embedding)
)


# ==========================================
# SEARCH
# ==========================================

results = search_candidates(
    query_embedding=job_embedding,
    top_k=5
)


print("\n========== SEARCH RESULTS ==========")

for result in results:

    print(
        f"Candidate {result['candidate_id']} "
        f"→ similarity = "
        f"{result['similarity_score']}"
    )