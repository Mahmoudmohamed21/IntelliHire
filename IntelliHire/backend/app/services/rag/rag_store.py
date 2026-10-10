import json
import threading
from pathlib import Path
from typing import List, Dict

import faiss
import numpy as np

from app.services.embedding_service import create_embedding


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[3]

RAG_DIR = BASE_DIR / "data" / "rag"

RAG_DIR.mkdir(
    parents=True,
    exist_ok=True
)

INDEX_PATH = RAG_DIR / "documents.index"

METADATA_PATH = (
    RAG_DIR / "documents_metadata.json"
)

EMBEDDING_DIMENSION = 384

# Serialises read-modify-write cycles (FastAPI runs sync endpoints in threads).
_LOCK = threading.RLock()


# ============================================================
# CREATE INDEX
# ============================================================

def create_empty_index():

    return faiss.IndexFlatIP(
        EMBEDDING_DIMENSION
    )


# ============================================================
# LOAD INDEX
# ============================================================

def load_index():

    if INDEX_PATH.exists():

        return faiss.read_index(
            str(INDEX_PATH)
        )

    return create_empty_index()


# ============================================================
# LOAD METADATA
# ============================================================

def load_metadata() -> List[Dict]:

    if not METADATA_PATH.exists():

        return []

    with open(
        METADATA_PATH,
        "r",
        encoding="utf-8"
    ) as file:

        return json.load(file)


# ============================================================
# SAVE INDEX
# ============================================================

def save_index(index):

    faiss.write_index(
        index,
        str(INDEX_PATH)
    )


# ============================================================
# SAVE METADATA
# ============================================================

def save_metadata(metadata):

    with open(
        METADATA_PATH,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            metadata,
            file,
            ensure_ascii=False,
            indent=2
        )


# ============================================================
# ADD DOCUMENT
# ============================================================

def add_document_chunks(
    document_id: int,
    chunks: List[str]
):
    with _LOCK:
        return _add_document_chunks(document_id, chunks)


def _add_document_chunks(
    document_id: int,
    chunks: List[str]
):

    index = load_index()

    metadata = load_metadata()

    embeddings = []

    for chunk in chunks:

        if not chunk.strip():
            continue

        embedding = create_embedding(
            chunk
        )

        embeddings.append(
            embedding
        )

    if not embeddings:

        return {
            "document_id": document_id,
            "chunks_added": 0,
            "total_vectors": index.ntotal
        }

    vectors = np.array(
        embeddings,
        dtype="float32"
    )

    # ========================================================
    # ADD VECTORS
    # ========================================================

    index.add(vectors)

    # ========================================================
    # ADD METADATA
    # ========================================================

    valid_chunks = [
        chunk
        for chunk in chunks
        if chunk.strip()
    ]

    for chunk in valid_chunks:

        metadata.append(
            {
                "document_id": document_id,
                "text": chunk
            }
        )

    save_index(index)

    save_metadata(metadata)

    return {

        "document_id": document_id,

        "chunks_added": len(
            valid_chunks
        ),

        "total_vectors": index.ntotal
    }


# ============================================================
# SEARCH DOCUMENT
# ============================================================

def search_documents(
    query: str,
    document_id: int,
    top_k: int = 5
):

    index = load_index()

    metadata = load_metadata()

    if index.ntotal == 0:

        return []

    query_embedding = create_embedding(
        query
    )

    query_vector = np.array(
        [query_embedding],
        dtype="float32"
    )

    # Search the complete index first
    scores, positions = index.search(
        query_vector,
        index.ntotal
    )

    results = []

    for score, position in zip(
        scores[0],
        positions[0]
    ):

        if position < 0:
            continue

        if position >= len(metadata):
            continue

        item = metadata[position]

        # IMPORTANT:
        # Only use chunks from the requested document.
        if item["document_id"] != document_id:
            continue

        results.append(
            {
                "document_id": (
                    item["document_id"]
                ),

                "text": item["text"],

                "score": float(score)
            }
        )

        if len(results) >= top_k:

            break

    return results


# ============================================================
# REMOVE DOCUMENT
# ============================================================

def remove_document(document_id: int) -> int:
    """
    Delete every chunk that belongs to ``document_id``.
    Returns how many chunks were removed.
    """

    with _LOCK:

        index = load_index()
        metadata = load_metadata()

        if index.ntotal != len(metadata):
            # Out of sync - nothing reliable to edit.
            return 0

        keep = [
            i
            for i, item in enumerate(metadata)
            if item.get("document_id") != document_id
        ]

        removed = len(metadata) - len(keep)

        if removed == 0:
            return 0

        new_index = create_empty_index()

        if keep:
            vectors = index.reconstruct_n(0, index.ntotal)
            new_index.add(vectors[keep])

        save_index(new_index)
        save_metadata([metadata[i] for i in keep])

        return removed
