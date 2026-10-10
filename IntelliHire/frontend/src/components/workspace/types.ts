import type {
  Decision,
  InterviewEvaluation,
  InterviewQuestion,
  Match,
} from "@/lib/api";

/** What the chat shows about a freshly uploaded CV. */
export type UploadInfo = {
  candidateId: number;
  resumeId: number;
  fileName: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  years: number;
  skills: string[];
  /** CV has a search vector -> can be matched to jobs */
  searchIndexed: boolean;
  /** CV text is indexed for question answering */
  chatIndexed: boolean;
  chunks: number;
  error?: string;
};

type MessageBody =
  | { role: "user"; kind: "text"; text: string }
  | { role: "user"; kind: "file"; fileName: string }
  | {
      role: "assistant";
      kind: "text";
      text: string;
      isError?: boolean;
      sources?: { score: number; text: string }[];
    }
  | { role: "assistant"; kind: "loading"; text: string }
  | { role: "assistant"; kind: "upload"; info: UploadInfo }
  | { role: "assistant"; kind: "library" }
  | { role: "assistant"; kind: "jobs"; note?: string }
  | { role: "assistant"; kind: "jobForm" }
  | {
      role: "assistant";
      kind: "confirmDelete";
      target: "cv" | "job";
      targetId: number;
      name: string;
      state: "ask" | "deleted" | "cancelled";
    }
  | {
      role: "assistant";
      kind: "question";
      index: number;
      total: number;
      question: InterviewQuestion;
    }
  | {
      role: "assistant";
      kind: "match";
      match: Match;
      total: number;
      candidateName: string;
      jobTitle: string;
    }
  | { role: "assistant"; kind: "ranking"; matches: Match[]; jobTitle: string }
  | { role: "assistant"; kind: "evaluation"; evaluation: InterviewEvaluation }
  | { role: "assistant"; kind: "decision"; decision: Decision };

export type Msg = MessageBody & { id: number };

export type NewMsg = MessageBody;

export type Intent =
  | "delete"
  | "deleteJob"
  | "newJob"
  | "library"
  | "jobs"
  | "rank"
  | "interview"
  | "decision"
  | "match"
  | "ask";

export type PendingAction = "match" | "interview" | "decision" | "rank";
