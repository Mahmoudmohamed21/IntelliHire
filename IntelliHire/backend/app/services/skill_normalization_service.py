import re


# =========================================================
# Skill aliases
# =========================================================

SKILL_ALIASES = {

    # -------------------------
    # Power BI
    # -------------------------

    "power bi": "Power BI",
    "powerbi": "Power BI",
    "microsoft power bi": "Power BI",
    "ms power bi": "Power BI",

    # -------------------------
    # Python
    # -------------------------

    "python": "Python",
    "python programming": "Python",

    # -------------------------
    # SQL
    # -------------------------

    "sql": "SQL",
    "sql server": "SQL",
    "microsoft sql server": "SQL",
    "t-sql": "SQL",
    "tsql": "SQL",

    # -------------------------
    # Excel
    # -------------------------

    "excel": "Excel",
    "microsoft excel": "Excel",
    "ms excel": "Excel",
    "advanced excel": "Advanced Excel",

    # -------------------------
    # Data Analysis
    # -------------------------

    "data analysis": "Data Analysis",
    "data analytics": "Data Analysis",
    "data analyst": "Data Analysis",
    "analytical skills": "Data Analysis",
    "analytical skill": "Data Analysis",
    "data analytical skills": "Data Analysis",

    # -------------------------
    # Communication
    # -------------------------

    "communication": "Communication Skills",
    "communication skill": "Communication Skills",
    "communication skills": "Communication Skills",
    "strong communication skills":
        "Communication Skills",

    # -------------------------
    # Machine Learning
    # -------------------------

    "machine learning":
        "Machine Learning",

    "ml":
        "Machine Learning",

    # -------------------------
    # Deep Learning
    # -------------------------

    "deep learning":
        "Deep Learning",

    "dl":
        "Deep Learning",

    # -------------------------
    # Natural Language Processing
    # -------------------------

    "natural language processing":
        "NLP",

    "nlp":
        "NLP",

    # -------------------------
    # LangChain
    # -------------------------

    "langchain":
        "LangChain",

    "lang chain":
        "LangChain",

    # -------------------------
    # Git
    # -------------------------

    "git":
        "Git",

    "github":
        "GitHub",

    # -------------------------
    # Java
    # -------------------------

    "java":
        "Java",

    "java programming":
        "Java",

    # -------------------------
    # JavaScript
    # -------------------------

    "javascript":
        "JavaScript",

    "js":
        "JavaScript",

    # -------------------------
    # React
    # -------------------------

    "react":
        "React",

    "reactjs":
        "React",

    "react.js":
        "React",
}


def clean_skill_name(
    skill_name: str
) -> str:

    if not skill_name:
        return ""

    skill = skill_name.strip().lower()

    # Remove duplicate spaces
    skill = re.sub(
        r"\s+",
        " ",
        skill
    )

    return skill


def normalize_skill(
    skill_name: str
) -> str:

    cleaned = clean_skill_name(
        skill_name
    )

    if not cleaned:
        return ""

    # Exact alias match
    if cleaned in SKILL_ALIASES:

        return SKILL_ALIASES[
            cleaned
        ]

    # Default formatting
    return skill_name.strip()


def normalize_skill_set(
    skills
) -> set:

    normalized = set()

    for skill in skills:

        value = normalize_skill(
            skill
        )

        if value:
            normalized.add(
                value.lower()
            )

    return normalized