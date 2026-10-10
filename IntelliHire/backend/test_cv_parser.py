
from app.services.cv_parser import parse_cv


cv_text = """
Ahmed Mohamed Samir

Email: ahmedmohamedsamir553@gmail.com
Phone: 01280067615

Mechanical Engineering graduate with experience in mechanical design,
embedded systems, and control systems.

SKILLS
Mechanical Design
Embedded Systems
Control Systems
AutoCAD
SolidWorks
Python
MATLAB

EDUCATION
Bachelor of Mechanical Engineering
Ain Shams University
Mechanical Engineering
2025

CERTIFICATIONS
AutoCAD Professional Certificate

LANGUAGES
Arabic - Native
English - Very Good

PROJECTS
Smart Control System
Designed and implemented a smart control system using embedded systems
and microcontrollers.

Mechanical Design Project
Designed mechanical components using SolidWorks and AutoCAD.
"""


try:
    result = parse_cv(cv_text)

    print("\n========== CV DATA ==========")
    print(result.model_dump_json(indent=4))
    print("=============================\n")

except Exception as e:
    print("\n========== ERROR ==========")
    print(type(e).__name__)
    print(str(e))
    print("===========================\n")