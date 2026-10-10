"""Turns a parsed CV (JSON) into compact, readable text for the LLM."""

from typing import Any, Dict, List, Optional


def _clip(text: Optional[str], limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def build_cv_profile(
    cv: Dict[str, Any],
    years_of_experience: Optional[int] = None
) -> str:
    """Structured summary of a parsed CV. Empty string if there is nothing."""

    if not cv:
        return ""

    lines: List[str] = []

    if cv.get("name"):
        lines.append(f"Name: {cv['name']}")

    contact = [cv.get("email"), cv.get("phone")]
    contact = [c for c in contact if c]
    if contact:
        lines.append("Contact: " + ", ".join(contact))

    if years_of_experience is not None:
        lines.append(f"Calculated years of experience: {years_of_experience}")

    if cv.get("summary"):
        lines.append(f"Summary: {_clip(cv['summary'], 600)}")

    if cv.get("skills"):
        lines.append("Skills: " + ", ".join(cv["skills"]))

    education = []
    for e in cv.get("education") or []:
        parts = [e.get("degree"), e.get("field"), e.get("institution"), e.get("graduation_year")]
        parts = [str(p) for p in parts if p]
        if parts:
            education.append("- " + ", ".join(parts))
    if education:
        lines.append("Education:\n" + "\n".join(education))

    experience = []
    for x in cv.get("experience") or []:
        head = " at ".join([p for p in [x.get("job_title"), x.get("company")] if p])
        if x.get("duration"):
            head += f" ({x['duration']})"
        detail = _clip(x.get("description"), 350)
        if head or detail:
            experience.append(f"- {head}" + (f": {detail}" if detail else ""))
    if experience:
        lines.append("Experience:\n" + "\n".join(experience))

    if cv.get("certifications"):
        lines.append("Certifications: " + "; ".join(cv["certifications"]))

    langs = []
    for l in cv.get("languages") or []:
        text = " - ".join([p for p in [l.get("language"), l.get("proficiency")] if p])
        if text:
            langs.append(text)
    if langs:
        lines.append("Languages: " + ", ".join(langs))

    projects = []
    for p in cv.get("projects") or []:
        title, desc = p.get("title"), _clip(p.get("description"), 250)
        if title or desc:
            projects.append(f"- {title or 'Project'}" + (f": {desc}" if desc else ""))
    if projects:
        lines.append("Projects:\n" + "\n".join(projects))

    return "\n".join(lines)
