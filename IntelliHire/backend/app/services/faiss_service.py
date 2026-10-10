"""
Candidate vector index (FAISS).

The index holds one normalized embedding per candidate; ``metadata`` maps
each vector position to a candidate id.  Both files must always have the
same length - if they ever disagree (crash mid-write, manual edits) the
index is reset and rebuilt from the database by
``candidate_index_service.sync_candidate_index``.
"""

import json
import os
import threading
from typing import Dict, List, Union

import faiss
import numpy as np


# ==========================================
# CONFIGURATION
# ==========================================

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    )
)

FAISS_DIR = os.path.join(BASE_DIR, "data", "faiss")

INDEX_FILE = os.path.join(FAISS_DIR, "candidates.index")

METADATA_FILE = os.path.join(FAISS_DIR, "candidates_metadata.json")

EMBEDDING_DIMENSION = 384

# FastAPI runs sync endpoints in a thread pool, so two uploads can reach
# this module at once. Every read-modify-write below holds this lock.
_LOCK = threading.RLock()


# ==========================================
# LOW-LEVEL HELPERS
# ==========================================

def ensure_faiss_directory():
    os.makedirs(FAISS_DIR, exist_ok=True)


def create_empty_index():
    ensure_faiss_directory()
    return faiss.IndexFlatIP(EMBEDDING_DIMENSION)


def load_index():
    ensure_faiss_directory()

    if os.path.exists(INDEX_FILE):
        return faiss.read_index(INDEX_FILE)

    return create_empty_index()


def load_metadata() -> List[Dict]:
    ensure_faiss_directory()

    if not os.path.exists(METADATA_FILE):
        return []

    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, ValueError):
        return []

    return data if isinstance(data, list) else []


def save_index(index):
    ensure_faiss_directory()

    # Write to a temp file first so a crash never leaves a half-written index.
    temp_path = INDEX_FILE + ".tmp"
    faiss.write_index(index, temp_path)
    os.replace(temp_path, INDEX_FILE)


def save_metadata(metadata):
    ensure_faiss_directory()

    temp_path = METADATA_FILE + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as file:
        json.dump(metadata, file, indent=2, ensure_ascii=False)
    os.replace(temp_path, METADATA_FILE)


def _load_consistent():
    """
    Load (index, metadata). If they are out of sync the vectors cannot be
    trusted, so start empty; the next sync re-embeds from the database.
    """

    index = load_index()
    metadata = load_metadata()

    if index.ntotal != len(metadata):
        print(
            f"[faiss] index has {index.ntotal} vectors but metadata has "
            f"{len(metadata)} entries - resetting the candidate index."
        )
        index = create_empty_index()
        metadata = []
        save_index(index)
        save_metadata(metadata)

    return index, metadata


def _all_vectors(index) -> np.ndarray:
    if index.ntotal == 0:
        return np.zeros((0, EMBEDDING_DIMENSION), dtype="float32")

    return index.reconstruct_n(0, index.ntotal)


def _to_vector(embedding: Union[List[float], Dict]) -> np.ndarray:
    # Accept the whole result of create_cv_embedding() as well as a bare
    # vector, so a caller can't silently break indexing again.
    if isinstance(embedding, dict):
        embedding = embedding.get("embedding")

    if embedding is None:
        raise ValueError("No embedding supplied.")

    vector = np.array([embedding], dtype="float32")

    if vector.ndim != 2 or vector.shape[1] != EMBEDDING_DIMENSION:
        raise ValueError(
            f"Expected embedding dimension {EMBEDDING_DIMENSION}, "
            f"got {vector.shape[-1]}"
        )

    return vector


# ==========================================
# ADD / UPDATE CANDIDATE
# ==========================================

def add_candidate(
    candidate_id: int,
    embedding: Union[List[float], Dict]
):
    vector = _to_vector(embedding)

    with _LOCK:

        index, metadata = _load_consistent()

        position = next(
            (
                i
                for i, item in enumerate(metadata)
                if item["candidate_id"] == candidate_id
            ),
            None
        )

        # ---- update an existing candidate -----------------------
        if position is not None:

            vectors = _all_vectors(index)
            vectors[position] = vector[0]

            new_index = create_empty_index()
            new_index.add(vectors)
            save_index(new_index)

            return {
                "success": True,
                "candidate_id": candidate_id,
                "added": False,
                "updated": True,
                "index_position": position,
                "message": "Candidate embedding updated successfully"
            }

        # ---- add a new candidate --------------------------------
        index.add(vector)
        metadata.append({"candidate_id": candidate_id})

        save_index(index)
        save_metadata(metadata)

        return {
            "success": True,
            "candidate_id": candidate_id,
            "added": True,
            "updated": False,
            "index_position": len(metadata) - 1,
            "message": "Candidate added successfully"
        }


# ==========================================
# REMOVE CANDIDATE
# ==========================================

def remove_candidate(candidate_id: int) -> bool:
    """Delete a candidate's vector. Returns True if it was indexed."""

    with _LOCK:

        index, metadata = _load_consistent()

        keep = [
            i
            for i, item in enumerate(metadata)
            if item["candidate_id"] != candidate_id
        ]

        if len(keep) == len(metadata):
            return False

        vectors = _all_vectors(index)

        new_index = create_empty_index()
        if keep:
            new_index.add(vectors[keep])

        save_index(new_index)
        save_metadata([metadata[i] for i in keep])

        return True


# ==========================================
# SEARCH CANDIDATES
# ==========================================

def search_candidates(
    query_embedding: List[float],
    top_k: int = 5
):

    with _LOCK:
        index, metadata = _load_consistent()

    if index.ntotal == 0:
        return []

    vector = np.array([query_embedding], dtype="float32")

    if vector.shape[1] != EMBEDDING_DIMENSION:
        raise ValueError(
            f"Expected embedding dimension {EMBEDDING_DIMENSION}, "
            f"got {vector.shape[1]}"
        )

    top_k = max(1, min(top_k, index.ntotal))

    scores, positions = index.search(vector, top_k)

    results = []

    for score, position in zip(scores[0], positions[0]):

        if position < 0 or position >= len(metadata):
            continue

        results.append(
            {
                "candidate_id": metadata[position]["candidate_id"],
                "similarity_score": round(float(score), 4)
            }
        )

    return results


# ==========================================
# INDEX INFORMATION
# ==========================================

def get_indexed_ids() -> List[int]:
    with _LOCK:
        return [item["candidate_id"] for item in load_metadata()]


def get_index_info():

    with _LOCK:
        index = load_index()
        metadata = load_metadata()

    return {
        "total_vectors": index.ntotal,
        "dimension": index.d,
        "metadata_count": len(metadata)
    }
