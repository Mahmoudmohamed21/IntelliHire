from app.services.skill_normalization_service import (
    normalize_skill
)


test_skills = [
    "PowerBI",
    "Power BI",
    "Microsoft Power BI",
    "SQL Server",
    "T-SQL",
    "Python",
    "Data Analytics",
    "Analytical Skills",
    "Communication Skills",
    "ML",
    "NLP",
    "ReactJS",
]


print(
    "\n========== SKILL NORMALIZATION =========="
)


for skill in test_skills:

    normalized = normalize_skill(
        skill
    )

    print(
        f"{skill:30} -> {normalized}"
    )