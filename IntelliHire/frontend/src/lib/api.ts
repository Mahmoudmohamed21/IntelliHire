/**
 * Typed client for the IntelliHire FastAPI backend.
 * Every endpoint the GUI uses lives here, so pages never build URLs by hand.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// ---------------------------------------------------------------- types

export type ParsedCV = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  summary?: string | null;
  skills: string[];
  education: {
    degree?: string | null;
    institution?: string | null;
    field?: string | null;
    graduation_year?: string | null;
  }[];
  experience: {
    job_title?: string | null;
    company?: string | null;
    duration?: string | null;
    description?: string | null;
  }[];
  certifications: string[];
  languages: { language?: string | null; proficiency?: string | null }[];
  projects: { title?: string | null; description?: string | null }[];
};

export type CVUploadResponse = {
  message: string;
  candidate_id: number;
  resume_id: number;
  filename: string;
  years_of_experience: number;
  skills_saved: string[];
  parsed_cv: ParsedCV;
  faiss?: { success?: boolean; error?: string } | null;
  rag: { indexed: boolean; document_id: number; chunks: number };
};

export type CandidateSummary = {
  candidate_id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  summary?: string | null;
  years_of_experience: number;
  skills: string[];
  resume_id: number | null;
  resume_file: string | null;
  uploaded_at: string | null;
  /** true when the CV has a search vector (needed for matching) */
  indexed?: boolean | null;
};

export type Job = {
  job_id: number;
  title: string;
  description: string | null;
  location: string | null;
  employment_type: string | null;
  required_education: string | null;
  minimum_experience: number;
  status: string | null;
  created_at: string | null;
  skills: string[];
};

export type JobInput = {
  title: string;
  description?: string;
  location?: string;
  employment_type?: string;
  required_education?: string;
  minimum_experience: number;
  skills: string[];
};

export type Match = {
  candidate_id: number;
  candidate_name?: string;
  rank: number;
  final_match_score: number;
  semantic_score: number;
  skill_score: number;
  experience_score: number;
  matched_skills: string[];
  missing_skills: string[];
  skill_match_percentage: number;
  skill_gap_percentage: number;
  total_required_skills: number;
  matched_skill_count: number;
  missing_skill_count: number;
  candidate_experience: number;
  required_experience: number;
  experience_match: boolean;
};

export type MatchResponse = {
  job_id: number;
  total_candidates: number;
  matches: Match[];
};

export type SingleMatchResponse = {
  job_id: number;
  total_candidates: number;
  match: Match;
};

export type DeleteResponse = {
  message: string;
  candidate_id: number;
  file_name: string | null;
  vector_removed: boolean;
  rag_chunks_removed: number;
  files_removed: number;
};

export type DeleteJobResponse = {
  message: string;
  job_id: number;
  title: string;
  applications_removed: number;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ReindexResponse = {
  message: string;
  candidate_id: number;
  rag_chunks: number;
};

export type InterviewQuestion = {
  question: string;
  type: string;
  skill?: string | null;
  difficulty: string;
};

export type AnswerEvaluation = {
  question: string;
  answer: string;
  score: number;
  technical_accuracy: number;
  communication: number;
  relevance: number;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
};

export type InterviewEvaluation = {
  candidate_id: number;
  job_id: number;
  overall_score: number;
  technical_score: number;
  communication_score: number;
  relevance_score: number;
  recommendation: string;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  evaluations: AnswerEvaluation[];
};

export type Decision = {
  candidate_id: number;
  job_id: number;
  candidate_name?: string | null;
  job_title: string;
  match_score: number;
  interview_score: number;
  skill_match_score: number;
  final_score: number;
  recommendation: string;
  matched_skills: string[];
  missing_skills: string[];
  skill_gap_percentage: number;
  candidate_experience: number;
  required_experience: number;
  experience_match: boolean;
};

export type ChatResponse = {
  document_id: number;
  question: string;
  answer: string;
  sources: { score: number; text: string }[];
};

// -------------------------------------------------------------- request

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function describeDetail(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail) return detail;

  // FastAPI validation errors: [{ loc, msg, type }, ...]
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : ""
      )
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }

  return `Request failed (HTTP ${status}).`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(
      `Cannot reach the IntelliHire backend at ${API_URL}. Make sure it is running (uvicorn main:app --reload).`
    );
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? (data as { detail: unknown }).detail
        : null;
    throw new ApiError(describeDetail(detail, response.status), response.status);
  }

  return data as T;
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ------------------------------------------------------------ endpoints

export const api = {
  health: () => request<{ status: string }>("/health"),

  uploadCV: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<CVUploadResponse>("/cv/upload", {
      method: "POST",
      body: form,
    });
  },

  listCandidates: () =>
    request<{ total: number; candidates: CandidateSummary[] }>("/candidates/"),

  listJobs: () => request<{ total: number; jobs: Job[] }>("/jobs/"),

  createJob: (input: JobInput) =>
    request<{ job_id: number; title: string; skills: string[] }>(
      "/jobs/create",
      json(input)
    ),

  /** Ranking of the best `topK` candidates for a job. */
  getMatches: (jobId: number, topK = 50) =>
    request<MatchResponse>(`/matching/job/${jobId}?top_k=${topK}`),

  /** One candidate's match + rank. Self-heals a missing embedding. */
  getCandidateMatch: (jobId: number, candidateId: number) =>
    request<SingleMatchResponse>(
      `/matching/job/${jobId}/candidate/${candidateId}`
    ),

  deleteCandidate: (candidateId: number) =>
    request<DeleteResponse>(`/candidates/${candidateId}`, {
      method: "DELETE",
    }),

  reindexCandidate: (candidateId: number) =>
    request<ReindexResponse>(`/candidates/${candidateId}/reindex`, {
      method: "POST",
    }),

  generateInterview: (candidateId: number, jobId: number) =>
    request<{ questions: InterviewQuestion[] }>(
      `/interview/generate?candidate_id=${candidateId}&job_id=${jobId}`,
      { method: "POST" }
    ),

  evaluateInterview: (
    candidateId: number,
    jobId: number,
    answers: { question: string; answer: string }[]
  ) =>
    request<InterviewEvaluation>(
      "/interview/evaluate",
      json({ candidate_id: candidateId, job_id: jobId, answers })
    ),

  finalDecision: (candidateId: number, jobId: number, interviewScore: number) =>
    request<Decision>(
      "/decision/final",
      json({
        candidate_id: candidateId,
        job_id: jobId,
        interview_score: interviewScore,
      })
    ),

  ask: (
    resumeId: number,
    question: string,
    topK = 5,
    history: ChatTurn[] = []
  ) =>
    request<ChatResponse>(
      "/chat/ask",
      json({ document_id: resumeId, question, top_k: topK, history })
    ),

  deleteJob: (jobId: number) =>
    request<DeleteJobResponse>(`/jobs/${jobId}`, { method: "DELETE" }),
};

export function errorMessage(err: unknown, fallback = "Something went wrong.") {
  return err instanceof Error && err.message ? err.message : fallback;
}
