from app.database.database import SessionLocal

from app.services.candidate_index_service import (
    index_all_candidates
)

from app.services.faiss_service import (
    get_index_info
)


db = SessionLocal()

try:

    print(
        "\n========== INDEXING ALL CANDIDATES =========="
    )

    results = index_all_candidates(
        db
    )

    for result in results:

        print(result)

    print(
        "\n========== FAISS INFO =========="
    )

    print(
        get_index_info()
    )

finally:

    db.close()