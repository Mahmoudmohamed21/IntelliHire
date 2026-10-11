# IntelliHire — AI Recruitment Workspace

> Upload a CV, then just talk. IntelliHire parses the CV, indexes it for semantic search, and walks you through matching, skill-gap analysis, a mock interview and a final hiring decision — all in one chat window.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1 — Database](#1--database)
  - [2 — Backend](#2--backend)
  - [3 — Ollama (local LLM)](#3--ollama-local-llm)
  - [4 — Frontend](#4--frontend)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [How the Scoring Works](#how-the-scoring-works)
- [Running the Tests](#running-the-tests)
- [Known Limitations](#known-limitations)

---

## Overview

IntelliHire is a full-stack AI recruitment tool built with **FastAPI** (backend) and **Next.js** (frontend). It runs entirely on your own infrastructure — no third-party AI API keys needed. The LLM runs locally via [Ollama](https://ollama.com).

```
Recruiter uploads PDF → CV is parsed by LLM → text is embedded and indexed
→ recruiter chats: ask questions, run matching, interview, get a hiring decision
```

---

## Features

| Feature | What happens |
|---|---|
| **CV upload** | PDF extracted, parsed by local LLM into structured fields, embedded with `all-MiniLM-L6-v2`, indexed in FAISS (semantic search) and a RAG store (chat Q&A) |
| **CV library** | List, switch between, re-index or permanently delete CVs (removes the PDF, database rows, FAISS vector and chat chunks) |
| **Job management** | Create and delete jobs with required skills, min experience, location, employment type |
| **Job matching** | Semantic similarity + skill coverage + experience → weighted score, rank among all candidates |
| **Skill-gap analysis** | Which required skills the candidate has, which are missing, gap % |
| **Mock interview** | LLM writes questions tailored to the candidate and job; recruiter answers in chat |
| **Interview evaluation** | Answers scored on technical accuracy, communication and relevance; strengths and weaknesses |
| **Hiring decision** | Combines match score (50 %), interview score (30 %) and skill coverage (20 %) into a final recommendation |
| **CV chat** | Ask anything about a CV; context window includes the structured profile + relevant chunks; follow-up questions work |
| **Self-healing index** | Before every match the backend embeds any CV whose vector is missing (e.g. from a previous failed upload) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js Frontend                     │
│  Single-page workspace  ·  Tailwind CSS  ·  TypeScript   │
└──────────────────────────┬──────────────────────────────┘
                           │ REST / JSON
┌──────────────────────────▼──────────────────────────────┐
│                     FastAPI Backend                       │
│                                                           │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │  CV pipeline │  │ Matching /    │  │  Interview / │  │
│  │  upload      │  │ ranking       │  │  evaluation  │  │
│  │  parse       │  │ skill gap     │  │  decision    │  │
│  │  embed       │  │               │  │              │  │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘  │
│         │                  │                  │           │
│  ┌──────▼──────────────────▼──────────────────▼───────┐  │
│  │              Service layer                          │  │
│  │  faiss_service  ·  rag_store  ·  recruitment_engine│  │
│  │  embedding_service  ·  decision_service            │  │
│  └──────┬─────────────────────────────┬───────────────┘  │
│         │                             │                   │
│  ┌──────▼──────────┐         ┌────────▼───────────┐      │
│  │  SQL Server      │         │  Local vector DBs  │      │
│  │  (SQLAlchemy)    │         │  FAISS  ·  RAG     │      │
│  │  candidates      │         │  (data/faiss/      │      │
│  │  jobs            │         │   data/rag/)        │      │
│  │  resumes         │         └────────────────────┘      │
│  │  skills          │                                      │
│  └──────────────────┘                                      │
│                                                            │
│  Ollama (qwen3:4b)  ·  sentence-transformers              │
│  all-MiniLM-L6-v2 for embeddings                          │
└────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Web framework | FastAPI + Uvicorn |
| ORM / database | SQLAlchemy + PyODBC → SQL Server |
| Vector search | FAISS (`faiss-cpu`) |
| Embeddings | `sentence-transformers` · `all-MiniLM-L6-v2` (384-d) |
| Local LLM | Ollama · `qwen3:4b` |
| LLM framework | LangChain (`langchain-core`, `langchain-ollama`) |
| PDF extraction | `pypdf` |
| Validation | Pydantic v2 |

### Frontend
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI | Custom component library (`src/components/ui.tsx`) |
| State | React hooks (no external state library) |

---

## Project Structure

```
intellihire/
├── backend/
│   ├── main.py                        # FastAPI app, routers, CORS
│   ├── .env                           # DATABASE_URL, HUGGINGFACEHUB_API_TOKEN
│   ├── requirements.txt
│   ├── uploads/                       # Uploaded PDFs (auto-created)
│   ├── data/
│   │   ├── faiss/                     # FAISS index + metadata JSON
│   │   └── rag/                       # RAG vector store + metadata JSON
│   ├── app/
│   │   ├── api/
│   │   │   ├── cv.py                  # POST /cv/upload
│   │   │   ├── candidates.py          # GET/DELETE /candidates, reindex, sync
│   │   │   ├── jobs.py                # CRUD /jobs
│   │   │   ├── matching.py            # GET /matching/job/{id}[/candidate/{id}]
│   │   │   ├── interview.py           # POST /interview/generate
│   │   │   ├── interview_evaluation.py# POST /interview/evaluate
│   │   │   ├── decision.py            # POST /decision/final
│   │   │   └── chat.py                # POST /chat/ask
│   │   ├── models/                    # SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── candidate.py
│   │   │   ├── recruiter.py
│   │   │   ├── resume.py
│   │   │   ├── skill.py
│   │   │   ├── job.py
│   │   │   └── application.py
│   │   └── services/
│   │       ├── cv_parser.py           # LLM-based CV → structured JSON
│   │       ├── embedding_service.py   # all-MiniLM-L6-v2 embeddings
│   │       ├── faiss_service.py       # Thread-safe FAISS add/update/remove/search
│   │       ├── recruitment_engine.py  # Candidate ranking, self-healing sync
│   │       ├── decision_service.py    # Final hiring decision
│   │       ├── interview_service.py   # Question generation
│   │       ├── interview_evaluation_service.py  # Answer scoring + JSON repair
│   │       ├── candidate_index_service.py       # Sync, reindex, full delete
│   │       └── rag/
│   │           ├── rag_store.py       # FAISS-backed RAG (add/remove/search chunks)
│   │           ├── rag_service.py     # LLM Q&A with reasoning-leak detection
│   │           ├── document_service.py# Sentence-aware text chunker
│   │           └── profile_service.py # CV dict → readable profile text
│   └── tests/
│       ├── test_index_sync_and_delete.py
│       ├── test_ai_answers_and_job_delete.py
│       └── test_interview_evaluation_robustness.py
│
└── frontend/
    ├── package.json
    ├── next.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx               # Mounts <Workspace />
        │   └── globals.css
        ├── components/
        │   ├── icons.tsx              # Inline SVG icon set
        │   ├── ui.tsx                 # Design system (Badge, Button, ScoreRing…)
        │   └── workspace/
        │       ├── Workspace.tsx      # Main chat + routing logic
        │       ├── Sidebar.tsx        # CV library + job list
        │       ├── Cards.tsx          # All chat cards (upload, match, evaluation…)
        │       ├── Library.tsx        # CandidateList and JobList components
        │       ├── intent.ts          # Natural language → feature router
        │       └── types.ts           # Shared TypeScript types
        └── lib/
            └── api.ts                 # Typed API client
```

---

## Getting Started

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11+ | |
| Node.js | 18+ | |
| SQL Server | Any | ODBC Driver 17 or 18 must be installed |
| Ollama | Latest | [ollama.com](https://ollama.com) |
| `qwen3:4b` model | — | `ollama pull qwen3:4b` |

> **Tip:** The FAISS indexes are stored as local files under `backend/data/`. No separate vector database service is required.

---

### 1 — Database

Create a SQL Server database and note the connection string.

```
DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=intellihire;UID=sa;PWD=YourPassword
```

The ORM creates all tables automatically on first start.

---

### 2 — Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy the example env file and fill in your values
cp .env.example .env              # edit DATABASE_URL inside

# Start the API server
uvicorn main:app --reload --port 8000
```

The interactive API docs are available at `http://localhost:8000/docs`.

---

### 3 — Ollama (local LLM)

```bash
# Pull the model (one-time, ~2.5 GB)
ollama pull qwen3:4b

# Ollama starts automatically on most systems.
# If not, run:
ollama serve
```

The backend connects to Ollama at `http://localhost:11434` (its default address). No API key is needed.

> **Hardware note:** `qwen3:4b` runs on CPU but is much faster with a GPU. Expect 10–60 seconds per LLM call on CPU depending on your hardware.

---

### 4 — Frontend

```bash
cd frontend

npm install

# Start the development server
npm run dev
```

Open `http://localhost:3000`. The page talks to the backend at `http://localhost:8000`.

To change the backend URL set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLAlchemy connection string, e.g. `mssql+pyodbc://sa:pw@localhost/intellihire?driver=ODBC+Driver+17+for+SQL+Server` |
| `HUGGINGFACEHUB_API_TOKEN` | Optional | Only needed if you use gated Hugging Face models |
| `CORS_ORIGINS` | Optional | Comma-separated list of allowed origins. Defaults to `http://localhost:3000,http://127.0.0.1:3000` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Optional | Backend URL. Defaults to `http://localhost:8000` |

---

## API Reference

All endpoints accept and return JSON. The base URL is `http://localhost:8000`. Full interactive docs are at `/docs`.

### CV

| Method | Path | Description |
|---|---|---|
| `POST` | `/cv/upload` | Upload a PDF CV. Returns parsed data, FAISS and RAG index status. |

### Candidates

| Method | Path | Description |
|---|---|---|
| `GET` | `/candidates/` | List all candidates with `indexed` flag |
| `GET` | `/candidates/{id}` | One candidate with full detail |
| `DELETE` | `/candidates/{id}` | Delete candidate, CV file, FAISS vector and RAG chunks |
| `POST` | `/candidates/{id}/reindex` | Rebuild the search embedding and chat index |
| `POST` | `/candidates/sync-index` | Embed every CV missing from the index; prune stale vectors |

### Jobs

| Method | Path | Description |
|---|---|---|
| `GET` | `/jobs/` | List all jobs |
| `POST` | `/jobs/create` | Create a job with required skills |
| `GET` | `/jobs/{id}` | Job detail |
| `DELETE` | `/jobs/{id}` | Delete job, required skills and applications |

### Matching

| Method | Path | Description |
|---|---|---|
| `GET` | `/matching/job/{job_id}?top_k=N` | Rank up to N candidates for a job |
| `GET` | `/matching/job/{job_id}/candidate/{candidate_id}` | One candidate's match + rank (never dropped by a top-k cutoff) |

### Interview

| Method | Path | Description |
|---|---|---|
| `POST` | `/interview/generate` | Generate tailored interview questions |
| `POST` | `/interview/evaluate` | Score answers; auto-repairs malformed LLM JSON |

### Decision

| Method | Path | Description |
|---|---|---|
| `POST` | `/decision/final` | Final hiring recommendation from match + interview + skill scores |

### Chat

| Method | Path | Description |
|---|---|---|
| `POST` | `/chat/ask` | Answer a question about a CV. Accepts `job_id` for skill-gap questions and `history` for follow-ups. |

---

## How the Scoring Works

### Job Match Score

| Component | Weight | How it is calculated |
|---|---|---|
| Semantic similarity | **40 %** | Cosine similarity between job and CV embeddings (FAISS inner product on normalised vectors) |
| Skill coverage | **40 %** | `matched_required_skills / total_required_skills × 100` |
| Experience | **20 %** | 100 if candidate meets the minimum, scaled down otherwise |

### Final Hiring Decision

| Component | Weight |
|---|---|
| Job match score | **50 %** |
| Interview score | **30 %** |
| Skill coverage | **20 %** |

**Recommendation bands**

| Score | Label |
|---|---|
| ≥ 85 | Strong Hire |
| ≥ 70 | Hire |
| ≥ 55 | Consider |
| < 55 | Reject |

---

## Running the Tests

The test scripts run against real FAISS and the real SQLAlchemy models (in-memory SQLite). Only the local LLM and the embedding model are stubbed, so no Ollama or SQL Server is needed.

```bash
cd backend

# Core: embedding bug fix, self-healing index, CV delete, job delete
python test_index_sync_and_delete.py

# AI answers: reasoning-leak cleaning, job context, retry logic
python test_ai_answers_and_job_delete.py

# Interview evaluation: malformed LLM JSON repair, retry, validation
python test_interview_evaluation_robustness.py
```

---

## Known Limitations

- **Single recruiter per run.** The database has a `recruiters` table but there is no authentication layer. All jobs and decisions belong to recruiter id 1 by default. Adding proper auth (JWT, OAuth) is the natural next step.

- **LLM speed on CPU.** CV parsing, interview generation and evaluation each make one or more calls to `qwen3:4b`. On CPU this takes 15–90 seconds. A GPU reduces this to a few seconds.

- **Duplicate CV detection.** Uploading the same PDF twice creates two separate candidate records. The file is stored under a unique name so nothing breaks, but the library will show duplicates.

- **SQL Server only (out of the box).** The ORM is database-agnostic but `requirements.txt` includes `pyodbc`. To use PostgreSQL, replace `pyodbc` with `psycopg2-binary` and update `DATABASE_URL`.

- **No streaming.** LLM responses are returned in full after the model finishes. Adding streaming (Server-Sent Events) would make the wait feel shorter.

- **FAISS is single-node and file-backed.** For a large candidate pool (tens of thousands) you would replace `faiss-cpu` with a managed vector database such as Pinecone, Qdrant or Weaviate.
