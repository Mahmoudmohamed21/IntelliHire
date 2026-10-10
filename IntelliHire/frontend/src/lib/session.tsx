"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  Decision,
  InterviewEvaluation,
  InterviewQuestion,
  Match,
} from "./api";

/**
 * Workflow state shared by every page:
 * CV -> Job -> Match -> Interview -> Decision.
 * Persisted in localStorage so a refresh never loses progress.
 */

export type ActiveCandidate = {
  candidateId: number;
  resumeId: number | null;
  name: string;
  email?: string | null;
  years: number;
  skills: string[];
  fileName?: string | null;
};

export type ActiveJob = {
  jobId: number;
  title: string;
};

type SessionData = {
  candidate: ActiveCandidate | null;
  job: ActiveJob | null;
  match: Match | null;
  matchTotal: number;
  questions: InterviewQuestion[];
  answers: string[];
  evaluation: InterviewEvaluation | null;
  decision: Decision | null;
};

const EMPTY: SessionData = {
  candidate: null,
  job: null,
  match: null,
  matchTotal: 0,
  questions: [],
  answers: [],
  evaluation: null,
  decision: null,
};

const STORAGE_KEY = "intellihire_session_v2";

type SessionContextValue = SessionData & {
  ready: boolean;
  selectCandidate: (candidate: ActiveCandidate) => void;
  selectJob: (job: ActiveJob) => void;
  setMatch: (match: Match, total: number) => void;
  setQuestions: (questions: InterviewQuestion[]) => void;
  setAnswer: (index: number, text: string) => void;
  setEvaluation: (evaluation: InterviewEvaluation | null) => void;
  setDecision: (decision: Decision | null) => void;
  resetInterview: () => void;
  resetAll: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function load(): SessionData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<SessionData>) };

    // One-time import from the first version of the app.
    const resumeId = localStorage.getItem("intellihire_resume_id");
    const candidateId = localStorage.getItem("intellihire_candidate_id");
    const jobId = localStorage.getItem("intellihire_job_id");

    return {
      ...EMPTY,
      candidate:
        resumeId && candidateId
          ? {
              candidateId: Number(candidateId),
              resumeId: Number(resumeId),
              name:
                localStorage.getItem("intellihire_candidate_name") ||
                "Candidate",
              years: 0,
              skills: [],
            }
          : null,
      job: jobId
        ? {
            jobId: Number(jobId),
            title: localStorage.getItem("intellihire_job_title") || "Job",
          }
        : null,
    };
  } catch {
    return EMPTY;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SessionData>(EMPTY);
  const [ready, setReady] = useState(false);

  // Read storage after mount so server and client render the same HTML.
  useEffect(() => {
    setData(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or unavailable - keep working in memory */
    }
  }, [data, ready]);

  const selectCandidate = useCallback((candidate: ActiveCandidate) => {
    setData((prev) =>
      prev.candidate?.candidateId === candidate.candidateId
        ? { ...prev, candidate }
        : {
            ...EMPTY,
            job: prev.job,
            candidate,
          }
    );
  }, []);

  const selectJob = useCallback((job: ActiveJob) => {
    setData((prev) =>
      prev.job?.jobId === job.jobId
        ? { ...prev, job }
        : { ...EMPTY, candidate: prev.candidate, job }
    );
  }, []);

  const setMatch = useCallback((match: Match, total: number) => {
    setData((prev) => ({ ...prev, match, matchTotal: total, decision: null }));
  }, []);

  const setQuestions = useCallback((questions: InterviewQuestion[]) => {
    setData((prev) => ({
      ...prev,
      questions,
      answers: Array(questions.length).fill(""),
      evaluation: null,
      decision: null,
    }));
  }, []);

  const setAnswer = useCallback((index: number, text: string) => {
    setData((prev) => {
      const answers = [...prev.answers];
      answers[index] = text;
      return { ...prev, answers };
    });
  }, []);

  const setEvaluation = useCallback(
    (evaluation: InterviewEvaluation | null) => {
      setData((prev) => ({ ...prev, evaluation, decision: null }));
    },
    []
  );

  const setDecision = useCallback((decision: Decision | null) => {
    setData((prev) => ({ ...prev, decision }));
  }, []);

  const resetInterview = useCallback(() => {
    setData((prev) => ({
      ...prev,
      questions: [],
      answers: [],
      evaluation: null,
      decision: null,
    }));
  }, []);

  const resetAll = useCallback(() => setData(EMPTY), []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...data,
      ready,
      selectCandidate,
      selectJob,
      setMatch,
      setQuestions,
      setAnswer,
      setEvaluation,
      setDecision,
      resetInterview,
      resetAll,
    }),
    [
      data,
      ready,
      selectCandidate,
      selectJob,
      setMatch,
      setQuestions,
      setAnswer,
      setEvaluation,
      setDecision,
      resetInterview,
      resetAll,
    ]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return context;
}
