"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  api,
  errorMessage,
  type CandidateSummary,
  type ChatTurn,
  type InterviewEvaluation,
  type InterviewQuestion,
  type Job,
  type JobInput,
} from "@/lib/api";
import { Icon } from "@/components/icons";
import { ErrorBanner, Spinner, clampPct, cx } from "@/components/ui";

import {
  ConfirmDeleteCard,
  DecisionCard,
  EvaluationCard,
  JobFormCard,
  JobsCard,
  LibraryFrame,
  MatchCard,
  QuestionBubble,
  RankingCard,
  UploadCard,
} from "./Cards";
import { CandidateList, JobList } from "./Library";
import Sidebar from "./Sidebar";
import { detectIntent, extractScore } from "./intent";
import type { Msg, NewMsg, PendingAction, UploadInfo } from "./types";

// ------------------------------------------------------------ constants

const KEY_CANDIDATE = "intellihire_active_candidate";
const KEY_JOB = "intellihire_active_job";
const MAX_UPLOAD_MB = 15;

type InterviewState = {
  questions: InterviewQuestion[];
  answers: string[];
  index: number;
};

type Ctx = {
  candidateId: number | null;
  jobId: number | null;
  evaluation: InterviewEvaluation | null;
  interview: InterviewState | null;
};

// ------------------------------------------------------------ component

export default function Workspace() {
  // ---- server data
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");

  // ---- conversation
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reindexingId, setReindexingId] = useState<number | null>(null);

  // ---- context (mirrored in `ctx` ref so async flows never read stale state)
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [interview, setInterview] = useState<InterviewState | null>(null);

  // ---- ui
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const candidatesRef = useRef<CandidateSummary[]>([]);
  const jobsRef = useRef<Job[]>([]);
  const ctx = useRef<Ctx>({
    candidateId: null,
    jobId: null,
    evaluation: null,
    interview: null,
  });
  const pending = useRef<PendingAction | null>(null);
  // Question/answer turns about the active CV, sent along so follow-ups work.
  const chatHistory = useRef<ChatTurn[]>([]);
  const nextId = useRef(1);
  const busyRef = useRef(false);
  const dragDepth = useRef(0);

  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const candidate = candidates.find((c) => c.candidate_id === candidateId) ?? null;
  const job = jobs.find((j) => j.job_id === jobId) ?? null;

  // ------------------------------------------------------- state helpers

  const patchCtx = (patch: Partial<Ctx>) => {
    ctx.current = { ...ctx.current, ...patch };
    if ("candidateId" in patch) {
      setCandidateId(patch.candidateId ?? null);
      chatHistory.current = [];
    }
    if ("jobId" in patch) setJobId(patch.jobId ?? null);
    if ("interview" in patch) setInterview(patch.interview ?? null);
  };

  const push = (message: NewMsg): number => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { ...message, id } as Msg]);
    return id;
  };

  const replace = (id: number, message: NewMsg) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? ({ ...message, id } as Msg) : m))
    );

  const say = (text: string) => push({ role: "assistant", kind: "text", text });

  const sayError = (text: string) =>
    push({ role: "assistant", kind: "text", text, isError: true });

  const loadingMsg = (text: string) =>
    push({ role: "assistant", kind: "loading", text });

  const errorReplace = (id: number, text: string) =>
    replace(id, { role: "assistant", kind: "text", text, isError: true });

  const withBusy = async (fn: () => Promise<void>) => {
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const getCandidate = () =>
    candidatesRef.current.find((c) => c.candidate_id === ctx.current.candidateId) ??
    null;

  const getJob = () =>
    jobsRef.current.find((j) => j.job_id === ctx.current.jobId) ?? null;

  // ------------------------------------------------------------ data

  const refreshCandidates = useCallback(async () => {
    const data = await api.listCandidates();
    candidatesRef.current = data.candidates;
    setCandidates(data.candidates);
    return data.candidates;
  }, []);

  const refreshJobs = useCallback(async () => {
    const data = await api.listJobs();
    jobsRef.current = data.jobs;
    setJobs(data.jobs);
    return data.jobs;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [c, j] = await Promise.allSettled([
        api.listCandidates(),
        api.listJobs(),
      ]);
      if (cancelled) return;

      if (c.status === "fulfilled") {
        candidatesRef.current = c.value.candidates;
        setCandidates(c.value.candidates);
      } else {
        setLoadError(errorMessage(c.reason, "Could not reach the backend."));
      }

      if (j.status === "fulfilled") {
        jobsRef.current = j.value.jobs;
        setJobs(j.value.jobs);
      }

      // Restore the last active CV / job.
      try {
        const savedCandidate = Number(localStorage.getItem(KEY_CANDIDATE));
        const savedJob = Number(localStorage.getItem(KEY_JOB));
        const patch: Partial<Ctx> = {};

        if (
          savedCandidate &&
          candidatesRef.current.some((x) => x.candidate_id === savedCandidate)
        ) {
          patch.candidateId = savedCandidate;
        }
        if (savedJob && jobsRef.current.some((x) => x.job_id === savedJob)) {
          patch.jobId = savedJob;
        }
        if (Object.keys(patch).length) patchCtx(patch);
      } catch {
        /* storage unavailable */
      }

      setLoadingData(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Remember the active CV / job across refreshes.
  useEffect(() => {
    if (loadingData) return;
    try {
      if (candidateId) localStorage.setItem(KEY_CANDIDATE, String(candidateId));
      else localStorage.removeItem(KEY_CANDIDATE);
      if (jobId) localStorage.setItem(KEY_JOB, String(jobId));
      else localStorage.removeItem(KEY_JOB);
    } catch {
      /* ignore */
    }
  }, [candidateId, jobId, loadingData]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ----------------------------------------------------- selecting things

  const selectCandidate = (c: CandidateSummary, announce = true) => {
    if (ctx.current.candidateId !== c.candidate_id) {
      patchCtx({ candidateId: c.candidate_id, interview: null });
      ctx.current.evaluation = null;
    }
    if (announce) {
      say(
        `Now working with **${c.name}**. Ask me anything about this CV, or say "match", "skill gap", "interview" or "decision".`
      );
    }
  };

  const runPending = async () => {
    const action = pending.current;
    if (!action) return;
    pending.current = null;
    await runAction(action);
  };

  const selectJob = (j: Job, announce = true) => {
    if (ctx.current.jobId !== j.job_id) {
      patchCtx({ jobId: j.job_id, interview: null });
      ctx.current.evaluation = null;
    }
    if (announce) say(`Job set to **${j.title}**.`);
    if (pending.current && !busyRef.current) void withBusy(runPending);
  };

  const ensureCandidate = (): CandidateSummary | null => {
    const c = getCandidate();
    if (c) return c;

    if (candidatesRef.current.length) {
      say("Which CV should I use? Pick one below, or attach a new PDF.");
      push({ role: "assistant", kind: "library" });
    } else {
      say("I need a CV first - drop a PDF into this chat or tap the paperclip.");
    }
    return null;
  };

  const ensureJob = (action: PendingAction): Job | null => {
    const j = getJob();
    if (j) return j;

    pending.current = action;

    if (jobsRef.current.length) {
      push({
        role: "assistant",
        kind: "jobs",
        note: "Which job should I use for this?",
      });
    } else {
      say("There are no jobs yet - let's create one first.");
      push({ role: "assistant", kind: "jobForm" });
    }
    return null;
  };

  // ------------------------------------------------------------ upload

  const handleUpload = async (file: File) => {
    if (busyRef.current) {
      say("I'm still working on your last request - try again in a moment.");
      return;
    }
    if (ctx.current.interview) {
      say(
        "You're in the middle of an interview. Finish it (type \"finish\") or cancel it (type \"cancel\") before adding another CV."
      );
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      sayError("Only PDF files are supported. Please attach your CV as a PDF.");
      return;
    }
    if (file.size === 0) {
      sayError("That file is empty.");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      sayError(`That file is larger than ${MAX_UPLOAD_MB} MB. Please attach a smaller PDF.`);
      return;
    }

    push({ role: "user", kind: "file", fileName: file.name });
    const id = loadingMsg(
      "Reading the CV, extracting skills and building search indexes. A local AI model does this, so it can take a minute…"
    );

    setUploading(true);
    await withBusy(async () => {
      try {
        const result = await api.uploadCV(file);
        const list = await refreshCandidates();
        const created = list.find((c) => c.candidate_id === result.candidate_id);

        patchCtx({ candidateId: result.candidate_id, interview: null });
        ctx.current.evaluation = null;

        const info: UploadInfo = {
          candidateId: result.candidate_id,
          resumeId: result.resume_id,
          fileName: result.filename,
          name: created?.name ?? result.parsed_cv.name ?? "Candidate",
          email: result.parsed_cv.email,
          phone: result.parsed_cv.phone,
          years: result.years_of_experience,
          skills: result.skills_saved,
          searchIndexed: Boolean(result.faiss?.success),
          chatIndexed: Boolean(result.rag?.indexed),
          chunks: result.rag?.chunks ?? 0,
          error: result.faiss?.error,
        };

        replace(id, { role: "assistant", kind: "upload", info });

        say(
          jobsRef.current.length
            ? `I've loaded **${info.name}**. Ask me anything about this CV, or say "match" to score it against a job.`
            : `I've loaded **${info.name}**. Ask me anything about this CV. To match it, say "create a new job" first.`
        );
      } catch (err) {
        errorReplace(id, errorMessage(err, "The CV upload failed."));
      } finally {
        setUploading(false);
      }
    });
  };

  // --------------------------------------------------- delete / reindex

  const performDelete = async (
    c: CandidateSummary,
    quiet = false
  ): Promise<boolean> => {
    try {
      await api.deleteCandidate(c.candidate_id);
      await refreshCandidates().catch(() => undefined);

      if (ctx.current.candidateId === c.candidate_id) {
        patchCtx({ candidateId: null, interview: null });
        ctx.current.evaluation = null;
      }

      if (!quiet) {
        say(
          `Deleted **${c.name}**'s CV${
            c.resume_file ? ` (${c.resume_file})` : ""
          } - the PDF, parsed data and search index were removed from the server.`
        );
      }
      return true;
    } catch (err) {
      sayError(errorMessage(err, "Could not delete the CV."));
      return false;
    }
  };

  const performDeleteJob = async (
    j: Job,
    quiet = false
  ): Promise<boolean> => {
    try {
      await api.deleteJob(j.job_id);
      await refreshJobs().catch(() => undefined);

      if (ctx.current.jobId === j.job_id) {
        patchCtx({ jobId: null, interview: null });
        ctx.current.evaluation = null;
        pending.current = null;
      }

      if (!quiet) say(`Deleted the job **${j.title}**.`);
      return true;
    } catch (err) {
      sayError(errorMessage(err, "Could not delete the job."));
      return false;
    }
  };

  const reindex = async (c: CandidateSummary) => {
    setReindexingId(c.candidate_id);
    try {
      const result = await api.reindexCandidate(c.candidate_id);
      await refreshCandidates().catch(() => undefined);

      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" &&
          m.kind === "upload" &&
          m.info.candidateId === c.candidate_id
            ? {
                ...m,
                info: {
                  ...m.info,
                  searchIndexed: true,
                  chatIndexed: true,
                  chunks: result.rag_chunks,
                  error: undefined,
                },
              }
            : m
        )
      );
      say(`**${c.name}**'s CV was re-indexed - it's ready for matching and chat.`);
    } catch (err) {
      sayError(errorMessage(err, "Re-indexing failed."));
    } finally {
      setReindexingId(null);
    }
  };

  // ------------------------------------------------------------- jobs

  const createJob = async (input: JobInput, messageId: number) => {
    // Errors bubble to the form card, which shows them.
    const created = await api.createJob(input);
    const list = await refreshJobs();
    const newJob = list.find((j) => j.job_id === created.job_id);

    replace(messageId, {
      role: "assistant",
      kind: "text",
      text: `Created the job **${created.title}** with ${created.skills.length} required skill${
        created.skills.length === 1 ? "" : "s"
      } and selected it.`,
    });

    if (newJob) selectJob(newJob, false);
  };

  // ---------------------------------------------------------- features

  const runMatch = async () => {
    const c = ensureCandidate();
    if (!c) return;
    const j = ensureJob("match");
    if (!j) return;

    const id = loadingMsg(`Scoring ${c.name} against ${j.title}…`);
    try {
      const data = await api.getCandidateMatch(j.job_id, c.candidate_id);
      replace(id, {
        role: "assistant",
        kind: "match",
        match: data.match,
        total: data.total_candidates,
        candidateName: c.name,
        jobTitle: j.title,
      });
      void refreshCandidates().catch(() => undefined);
      say('Want to see how they handle an interview? Say "start interview".');
    } catch (err) {
      errorReplace(id, errorMessage(err, "Match analysis failed."));
    }
  };

  const runRank = async () => {
    const j = ensureJob("rank");
    if (!j) return;

    const id = loadingMsg(`Ranking every CV for ${j.title}…`);
    try {
      const data = await api.getMatches(j.job_id, 50);
      replace(id, {
        role: "assistant",
        kind: "ranking",
        matches: data.matches,
        jobTitle: j.title,
      });
      void refreshCandidates().catch(() => undefined);
    } catch (err) {
      errorReplace(id, errorMessage(err, "Ranking failed."));
    }
  };

  const pushQuestion = (state: InterviewState, index: number) =>
    push({
      role: "assistant",
      kind: "question",
      index,
      total: state.questions.length,
      question: state.questions[index],
    });

  const runInterview = async () => {
    const c = ensureCandidate();
    if (!c) return;
    const j = ensureJob("interview");
    if (!j) return;

    const id = loadingMsg(
      `Writing interview questions for ${c.name} (${j.title}). A local model is doing this, so it can take a minute…`
    );
    try {
      const data = await api.generateInterview(c.candidate_id, j.job_id);
      if (!data.questions?.length) {
        throw new Error("The AI did not return any questions. Please try again.");
      }
      const state: InterviewState = {
        questions: data.questions,
        answers: [],
        index: 0,
      };
      patchCtx({ interview: state });
      ctx.current.evaluation = null;

      replace(id, {
        role: "assistant",
        kind: "text",
        text: `Interview started - **${data.questions.length} questions**. Answer each one here in the chat, as you would out loud. Type "skip" to pass, "finish" to submit early, or "cancel" to stop.`,
      });
      pushQuestion(state, 0);
    } catch (err) {
      errorReplace(id, errorMessage(err, "Interview generation failed."));
    }
  };

  const decide = async (score: number) => {
    const c = getCandidate();
    const j = getJob();
    if (!c || !j) return;

    const id = loadingMsg("Combining match, interview and skill coverage…");
    try {
      const decision = await api.finalDecision(
        c.candidate_id,
        j.job_id,
        clampPct(score)
      );
      replace(id, { role: "assistant", kind: "decision", decision });
    } catch (err) {
      errorReplace(id, errorMessage(err, "Could not calculate the decision."));
    }
  };

  const runDecision = async (manualScore?: number) => {
    const c = ensureCandidate();
    if (!c) return;
    const j = ensureJob("decision");
    if (!j) return;

    const score = manualScore ?? ctx.current.evaluation?.overall_score;

    if (score === undefined) {
      say(
        'A hiring decision combines the job match, the interview score and skill coverage, and I don\'t have an interview score yet. Say "start interview" to take it now, or give me a score, e.g. "decision with interview score 75".'
      );
      return;
    }

    await decide(score);
  };

  const finishInterview = async (state: InterviewState) => {
    const c = getCandidate();
    const j = getJob();
    if (!c || !j) return;

    const payload = state.questions
      .map((q, i) => ({
        question: q.question,
        answer: (state.answers[i] ?? "").trim(),
      }))
      .filter((item) => item.answer);

    if (!payload.length) {
      say('I need at least one answer to score. Answer the current question, or type "cancel" to stop.');
      return;
    }

    await withBusy(async () => {
      const id = loadingMsg(
        "Scoring your answers. With a local model this can take a minute or two - keep this tab open…"
      );
      try {
        const evaluation = await api.evaluateInterview(
          c.candidate_id,
          j.job_id,
          payload
        );
        patchCtx({ interview: null });
        ctx.current.evaluation = evaluation;
        replace(id, { role: "assistant", kind: "evaluation", evaluation });
        await decide(evaluation.overall_score);
      } catch (err) {
        errorReplace(
          id,
          `${errorMessage(err, "Interview evaluation failed.")} Your answers are kept - type "finish" to try again.`
        );
      }
    });
  };

  const submitAnswer = async (text: string) => {
    const state = ctx.current.interview;
    if (!state) return;

    const command = text.trim().toLowerCase();

    if (/^(stop|cancel|quit|exit|abort)$/.test(command)) {
      patchCtx({ interview: null });
      say("Interview cancelled - nothing was scored.");
      return;
    }

    if (/^(finish|submit|done|evaluate|end)$/.test(command)) {
      await finishInterview(state);
      return;
    }

    const answers = [...state.answers];
    answers[state.index] = command === "skip" ? "" : text.trim();

    const updated: InterviewState = {
      ...state,
      answers,
      index: state.index + 1,
    };
    patchCtx({ interview: updated });

    if (updated.index < updated.questions.length) {
      pushQuestion(updated, updated.index);
    } else {
      await finishInterview(updated);
    }
  };

  const askCv = async (question: string) => {
    const c = ensureCandidate();
    if (!c) return;

    if (!c.resume_id) {
      sayError(`${c.name} has no uploaded resume, so there is nothing to ask about.`);
      return;
    }

    const id = loadingMsg(`Reading ${c.name}'s CV…`);
    try {
      const data = await api.ask(
        c.resume_id,
        question,
        5,
        chatHistory.current.slice(-6)
      );
      const answer =
        data.answer || "I couldn't generate an answer. Please try again.";

      chatHistory.current = [
        ...chatHistory.current,
        { role: "user" as const, content: question },
        { role: "assistant" as const, content: answer },
      ].slice(-12);

      replace(id, {
        role: "assistant",
        kind: "text",
        text: answer,
        sources: data.sources,
      });
    } catch (err) {
      errorReplace(id, errorMessage(err, "I couldn't reach the AI service."));
    }
  };

  const runAction = async (action: PendingAction) => {
    if (action === "match") return runMatch();
    if (action === "rank") return runRank();
    if (action === "interview") return runInterview();
    return runDecision();
  };

  // --------------------------------------------------------- routing

  const route = async (text: string) => {
    switch (detectIntent(text)) {
      case "delete": {
        const c = ensureCandidate();
        if (c) {
          push({
            role: "assistant",
            kind: "confirmDelete",
            target: "cv",
            targetId: c.candidate_id,
            name: c.name,
            state: "ask",
          });
        }
        return;
      }
      case "deleteJob": {
        const j = getJob();
        if (j) {
          push({
            role: "assistant",
            kind: "confirmDelete",
            target: "job",
            targetId: j.job_id,
            name: j.title,
            state: "ask",
          });
        } else if (jobsRef.current.length) {
          say("Which job should I delete? Use the bin icon next to it.");
          push({ role: "assistant", kind: "jobs" });
        } else {
          say("There are no jobs to delete.");
        }
        return;
      }
      case "newJob":
        push({ role: "assistant", kind: "jobForm" });
        return;
      case "library":
        if (candidatesRef.current.length) {
          push({ role: "assistant", kind: "library" });
        } else {
          say("There are no CVs on the server yet. Attach a PDF to add one.");
        }
        return;
      case "jobs":
        if (jobsRef.current.length) {
          push({ role: "assistant", kind: "jobs" });
        } else {
          say("There are no jobs yet - let's create one.");
          push({ role: "assistant", kind: "jobForm" });
        }
        return;
      case "rank":
        return runRank();
      case "interview":
        return runInterview();
      case "decision":
        return runDecision(extractScore(text));
      case "match":
        return runMatch();
      default:
        return askCv(text);
    }
  };

  const submit = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current) return;

    setInput("");
    push({ role: "user", kind: "text", text });

    if (ctx.current.interview) {
      await submitAnswer(text);
    } else {
      await withBusy(() => route(text));
    }

    textareaRef.current?.focus();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  // ------------------------------------------------------ drag & drop

  const onDragEnter = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  };

  // ------------------------------------------------------------ view

  const quickActions = candidate
    ? [
        "Summarize this CV",
        "What are the strongest skills?",
        "Match to the selected job",
        "Show the skill gap",
        "Start the interview",
        "Hiring decision",
        "Rank all candidates",
        "Create a new job",
        "Show my CVs",
      ]
    : ["Show my CVs", "Create a new job", "Show jobs"];

  const placeholder = interview
    ? "Type your answer…"
    : candidate
    ? `Ask about ${candidate.name}, or say "match", "interview"…`
    : "Attach a CV, or ask me to create a job…";

  const renderMessage = (m: Msg): ReactNode => {
    if (m.role === "user") {
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-3 text-sm leading-7 text-white">
            {m.kind === "file" ? (
              <span className="flex items-center gap-2">
                <Icon name="file" size={16} />
                <span className="break-all">{m.fileName}</span>
              </span>
            ) : (
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
            )}
          </div>
        </div>
      );
    }

    switch (m.kind) {
      case "text":
        return (
          <AssistantRow>
            <div
              className={cx(
                "max-w-full rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-7",
                m.isError
                  ? "border border-red-500/25 bg-red-500/10 text-red-200"
                  : "border border-white/10 bg-[#111522] text-slate-200"
              )}
            >
              <RichText text={m.text} />
              {m.sources && m.sources.length > 0 && (
                <Sources sources={m.sources} />
              )}
            </div>
          </AssistantRow>
        );

      case "loading":
        return (
          <AssistantRow>
            <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-white/10 bg-[#111522] px-4 py-3 text-sm text-slate-400">
              <Spinner size={16} />
              <span>{m.text}</span>
            </div>
          </AssistantRow>
        );

      case "upload":
        return (
          <AssistantCard>
            <UploadCard
              info={m.info}
              reindexing={reindexingId === m.info.candidateId}
              onReindex={() => {
                const c = candidatesRef.current.find(
                  (x) => x.candidate_id === m.info.candidateId
                );
                if (c) void reindex(c);
              }}
            />
          </AssistantCard>
        );

      case "library":
        return (
          <AssistantCard>
            <LibraryFrame>
              <CandidateList
                candidates={candidates}
                activeId={candidateId}
                reindexingId={reindexingId}
                onSelect={(c) => selectCandidate(c)}
                onDelete={async (c) => {
                  await performDelete(c);
                }}
                onReindex={(c) => void reindex(c)}
                compact
              />
            </LibraryFrame>
          </AssistantCard>
        );

      case "jobs":
        return (
          <AssistantCard>
            <JobsCard
              note={m.note}
              onNew={() => push({ role: "assistant", kind: "jobForm" })}
            >
              <JobList
                jobs={jobs}
                activeId={jobId}
                onSelect={(j) => selectJob(j)}
                onDelete={async (j) => {
                  await performDeleteJob(j);
                }}
              />
            </JobsCard>
          </AssistantCard>
        );

      case "jobForm":
        return (
          <AssistantCard>
            <JobFormCard
              onCreate={(input) => createJob(input, m.id)}
              onCancel={() => {
                pending.current = null;
                replace(m.id, {
                  role: "assistant",
                  kind: "text",
                  text: "No problem - job creation cancelled.",
                });
              }}
            />
          </AssistantCard>
        );

      case "confirmDelete":
        return (
          <AssistantCard>
            <ConfirmDeleteCard
              kind={m.target}
              name={m.name}
              state={m.state}
              onCancel={() => replace(m.id, { ...m, state: "cancelled" })}
              onConfirm={async () => {
                let ok = true;
                if (m.target === "cv") {
                  const target = candidatesRef.current.find(
                    (c) => c.candidate_id === m.targetId
                  );
                  if (target) ok = await performDelete(target, true);
                } else {
                  const target = jobsRef.current.find(
                    (j) => j.job_id === m.targetId
                  );
                  if (target) ok = await performDeleteJob(target, true);
                }
                replace(m.id, { ...m, state: ok ? "deleted" : "ask" });
              }}
            />
          </AssistantCard>
        );

      case "question":
        return (
          <AssistantCard>
            <QuestionBubble
              index={m.index}
              total={m.total}
              question={m.question}
            />
          </AssistantCard>
        );

      case "match":
        return (
          <AssistantCard>
            <MatchCard
              match={m.match}
              total={m.total}
              candidateName={m.candidateName}
              jobTitle={m.jobTitle}
            />
          </AssistantCard>
        );

      case "ranking":
        return (
          <AssistantCard>
            <RankingCard
              matches={m.matches}
              jobTitle={m.jobTitle}
              activeCandidateId={candidateId}
              onSelect={(id) => {
                const c = candidatesRef.current.find((x) => x.candidate_id === id);
                if (c) selectCandidate(c);
              }}
            />
          </AssistantCard>
        );

      case "evaluation":
        return (
          <AssistantCard>
            <EvaluationCard evaluation={m.evaluation} />
          </AssistantCard>
        );

      case "decision":
        return (
          <AssistantCard>
            <DecisionCard decision={m.decision} />
          </AssistantCard>
        );
    }
  };

  const sidebar = (onClose?: () => void) => (
    <Sidebar
      candidates={candidates}
      jobs={jobs}
      loading={loadingData}
      activeCandidateId={candidateId}
      activeJobId={jobId}
      reindexingId={reindexingId}
      uploading={uploading}
      onUpload={(file) => void handleUpload(file)}
      onSelectCandidate={(c) => selectCandidate(c)}
      onDeleteCandidate={async (c) => {
        await performDelete(c);
      }}
      onReindex={(c) => void reindex(c)}
      onSelectJob={(j) => selectJob(j)}
      onDeleteJob={async (j) => {
        await performDeleteJob(j);
      }}
      onNewJob={() => push({ role: "assistant", kind: "jobForm" })}
      onClose={onClose}
    />
  );

  return (
    <div
      className="flex h-dvh overflow-hidden"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* Desktop sidebar */}
      <aside className="hidden w-80 shrink-0 border-r border-white/10 bg-[#0a0e18] md:block">
        {sidebar()}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[85%] max-w-sm border-r border-white/10 bg-[#0a0e18]">
            {sidebar(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open CV library"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white md:hidden"
          >
            <Icon name="menu" size={20} />
          </button>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <ContextChip
              icon="file"
              label="CV"
              value={candidate?.name}
              empty="No CV selected"
              warn={candidate?.indexed === false}
              onClick={() => {
                if (candidatesRef.current.length) {
                  push({ role: "assistant", kind: "library" });
                } else {
                  fileRef.current?.click();
                }
              }}
            />
            <ContextChip
              icon="briefcase"
              label="Job"
              value={job?.title}
              empty="No job selected"
              onClick={() => {
                if (jobsRef.current.length) {
                  push({ role: "assistant", kind: "jobs" });
                } else {
                  push({ role: "assistant", kind: "jobForm" });
                }
              }}
            />
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                chatHistory.current = [];
                pending.current = null;
                patchCtx({ interview: null });
              }}
              className="shrink-0 text-xs text-slate-500 transition hover:text-white"
            >
              Clear chat
            </button>
          )}
        </header>

        {/* Conversation */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-5">
            <ErrorBanner message={loadError} onDismiss={() => setLoadError("")} />

            {messages.length === 0 && !loadingData && (
              <Welcome
                hasCandidates={candidates.length > 0}
                onPick={() => fileRef.current?.click()}
                onSuggest={(text) => void submit(text)}
              />
            )}

            {messages.map((m) => (
              <div key={m.id} className="fade-up">
                {renderMessage(m)}
              </div>
            ))}

            <div ref={endRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-white/10 px-4 pb-4 pt-3 sm:px-6">
          <div className="mx-auto max-w-3xl">
            {interview ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-4 py-2.5">
                <p className="text-sm text-violet-100">
                  Interview in progress ·{" "}
                  {interview.answers.filter((a) => a).length} answered
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void finishInterview(ctx.current.interview!)}
                    disabled={busy}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
                  >
                    Finish &amp; evaluate
                  </button>
                  <button
                    onClick={() => {
                      patchCtx({ interview: null });
                      say("Interview cancelled - nothing was scored.");
                    }}
                    disabled={busy}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {quickActions.map((label) => (
                  <button
                    key={label}
                    onClick={() => void submit(label)}
                    disabled={busy}
                    className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-violet-500/30 hover:bg-violet-500/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={onSubmit}>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUpload(file);
                  e.target.value = "";
                }}
              />
              <div className="flex items-end gap-1 rounded-2xl border border-white/10 bg-[#0d111d] p-2 focus-within:border-violet-500/40">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy || Boolean(interview)}
                  aria-label="Attach a CV (PDF)"
                  title="Attach a CV (PDF)"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="paperclip" size={18} />
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={placeholder}
                  className="max-h-36 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-slate-600"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || busy}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? <Spinner size={16} /> : <Icon name="send" size={17} />}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Drop overlay */}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#070a12]/85 backdrop-blur-sm">
            <div className="rounded-3xl border-2 border-dashed border-violet-400/60 bg-violet-500/[0.08] px-12 py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-200">
                <Icon name="upload" size={26} />
              </div>
              <p className="text-lg font-semibold">Drop the CV to analyse it</p>
              <p className="mt-1 text-sm text-slate-400">PDF files only</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ------------------------------------------------------------- pieces

function AssistantAvatar() {
  return (
    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
      <Icon name="sparkle" size={15} className="text-white" />
    </div>
  );
}

function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <AssistantAvatar />
      <div className="min-w-0 max-w-[88%]">{children}</div>
    </div>
  );
}

/** Rich cards sit under the avatar column, full width. */
function AssistantCard({ children }: { children: ReactNode }) {
  return <div className="sm:pl-11">{children}</div>;
}

/** **bold** inside one line of text. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;

/**
 * Small markdown subset used by the assistant: paragraphs, "- " / "1." lists,
 * "#" headings and **bold**. Anything else is shown as plain text.
 */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={blocks.length} className="whitespace-pre-wrap break-words">
          <Inline text={paragraph.join("\n")} />
        </p>
      );
      paragraph = [];
    }
  };

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={blocks.length}
        className={cx(
          "space-y-1.5 pl-5 break-words",
          list.ordered ? "list-decimal" : "list-disc marker:text-violet-400"
        )}
      >
        {list.items.map((item, i) => (
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </Tag>
    );
    list = null;
  };

  for (const line of text.split("\n")) {
    const bullet = line.match(BULLET);
    const heading = line.match(/^#{1,4}\s+(.*)$/);

    if (bullet) {
      flushParagraph();
      const ordered = /^\s*\d/.test(line);
      if (list && list.ordered !== ordered) flushList();
      list = list ?? { ordered, items: [] };
      list.items.push(bullet[1]);
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <p key={blocks.length} className="font-semibold text-white">
          <Inline text={heading[1]} />
        </p>
      );
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();

  return <div className="space-y-2.5">{blocks}</div>;
}

function Sources({ sources }: { sources: { score: number; text: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-slate-500 hover:text-slate-300"
      >
        {open ? "Hide" : "Show"} {sources.length} CV excerpt
        {sources.length === 1 ? "" : "s"} used
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <blockquote
              key={i}
              className="rounded-lg border-l-2 border-violet-500/40 bg-white/[0.02] px-3 py-2 text-xs leading-5 text-slate-400"
            >
              {s.text}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

function ContextChip({
  icon,
  label,
  value,
  empty,
  warn,
  onClick,
}: {
  icon: "file" | "briefcase";
  label: string;
  value?: string;
  empty: string;
  warn?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={value ? `${label}: ${value}` : empty}
      className={cx(
        "inline-flex max-w-[48%] items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition sm:max-w-xs",
        value
          ? "border-violet-500/25 bg-violet-500/10 text-violet-100 hover:bg-violet-500/15"
          : "border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300"
      )}
    >
      <Icon name={icon} size={13} className="shrink-0" />
      <span className="truncate">{value ?? empty}</span>
      {warn && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300"
          title="Not searchable yet"
        />
      )}
    </button>
  );
}

function Welcome({
  hasCandidates,
  onPick,
  onSuggest,
}: {
  hasCandidates: boolean;
  onPick: () => void;
  onSuggest: (text: string) => void;
}) {
  const suggestions = [
    "Create a new job",
    "Show my CVs",
    "Show jobs",
    "Rank all candidates",
  ];

  return (
    <div className="flex flex-col items-center py-10 text-center sm:py-16">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/30">
        <Icon name="sparkle" size={30} className="text-white" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Send me a CV to get started
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
        Drop a PDF anywhere on this page. Then just talk to me: ask about the
        CV, match it to a job, see the skill gap, run an AI interview and get
        a final hiring decision - all in this one conversation.
      </p>

      <button
        onClick={onPick}
        className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-violet-900/20 transition hover:from-violet-500 hover:to-indigo-500"
      >
        <Icon name="upload" size={16} />
        Choose a CV (PDF)
      </button>

      {hasCandidates && (
        <p className="mt-4 text-xs text-slate-500">
          Or pick one of your saved CVs from the library.
        </p>
      )}

      <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm text-slate-300 transition hover:border-violet-500/30 hover:bg-violet-500/[0.06] hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
