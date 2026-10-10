"use client";

import { useState, type ReactNode } from "react";

import {
  errorMessage,
  type Decision,
  type InterviewEvaluation,
  type InterviewQuestion,
  type JobInput,
  type Match,
} from "@/lib/api";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  ErrorBanner,
  Field,
  MetricRow,
  ProgressBar,
  ScoreRing,
  SkillChips,
  Spinner,
  TagInput,
  clampPct,
  cx,
  fmt,
  inputClass,
  recommendationTone,
  scoreTone,
} from "@/components/ui";
import type { UploadInfo } from "./types";

// ------------------------------------------------------------- frame

function CardFrame({
  title,
  right,
  children,
  className,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "w-full rounded-2xl border border-white/10 bg-[#0d111d] p-4 sm:p-5",
        className
      )}
    >
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {title}
            </h3>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge tone={ok ? "green" : "red"}>
      <Icon name={ok ? "check" : "alert"} size={12} />
      {label}
    </Badge>
  );
}

// ------------------------------------------------------------ upload

export function UploadCard({
  info,
  reindexing,
  onReindex,
}: {
  info: UploadInfo;
  reindexing: boolean;
  onReindex: () => void;
}) {
  const shown = info.skills.slice(0, 16);
  const extra = info.skills.length - shown.length;
  const allGood = info.searchIndexed && info.chatIndexed;

  return (
    <CardFrame
      title="CV analysed"
      right={
        <span className="truncate text-xs text-slate-500">{info.fileName}</span>
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{info.name}</p>
          <p className="truncate text-sm text-slate-500">
            {[info.email, info.phone].filter(Boolean).join(" · ") ||
              "No contact details found"}
          </p>
        </div>
        <Badge tone="violet">
          {info.years} yr{info.years === 1 ? "" : "s"} experience
        </Badge>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs text-slate-500">
          {info.skills.length} skill{info.skills.length === 1 ? "" : "s"} found
        </p>
        <div className="flex flex-wrap gap-2">
          {shown.map((s) => (
            <Badge key={s} tone="slate">
              {s}
            </Badge>
          ))}
          {extra > 0 && <Badge tone="slate">+{extra} more</Badge>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        <StatusPill ok={info.searchIndexed} label="Job matching ready" />
        <StatusPill
          ok={info.chatIndexed}
          label={
            info.chatIndexed
              ? `Chat ready · ${info.chunks} chunks`
              : "Chat not indexed"
          }
        />
        {!allGood && (
          <Button
            variant="secondary"
            onClick={onReindex}
            loading={reindexing}
            className="!px-3 !py-1.5 text-xs"
          >
            <Icon name="refresh" size={13} />
            Re-index
          </Button>
        )}
      </div>

      {info.error && !allGood && (
        <p className="mt-3 break-words text-xs leading-5 text-red-300/90">
          {info.error}
        </p>
      )}
    </CardFrame>
  );
}

// -------------------------------------------------------- job picker

export function JobsCard({
  note,
  children,
  onNew,
}: {
  note?: string;
  children: ReactNode;
  onNew: () => void;
}) {
  return (
    <CardFrame
      title="Choose a job"
      right={
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-violet-300 transition hover:bg-violet-500/10"
        >
          <Icon name="plus" size={13} />
          New job
        </button>
      }
    >
      {note && <p className="mb-3 text-sm text-slate-400">{note}</p>}
      <div className="max-h-72 overflow-y-auto pr-1">{children}</div>
    </CardFrame>
  );
}

export function LibraryFrame({ children }: { children: ReactNode }) {
  return (
    <CardFrame title="Your CVs">
      <div className="max-h-80 overflow-y-auto pr-1">{children}</div>
    </CardFrame>
  );
}

// ---------------------------------------------------------- job form

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Remote"];

export function JobFormCard({
  onCreate,
  onCancel,
}: {
  onCreate: (input: JobInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [education, setEducation] = useState("");
  const [years, setYears] = useState("0");
  const [skills, setSkills] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!title.trim()) return setError("Please enter a job title.");
    if (!skills.length) {
      return setError(
        "Add at least one required skill - matching and the skill-gap analysis depend on it."
      );
    }
    const min = Number.parseInt(years, 10);
    if (Number.isNaN(min) || min < 0) {
      return setError("Minimum experience must be 0 or more years.");
    }

    setSaving(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        employment_type: type || undefined,
        required_education: education.trim() || undefined,
        minimum_experience: min,
        skills,
      });
    } catch (err) {
      setError(errorMessage(err, "Could not create the job."));
      setSaving(false);
    }
  };

  return (
    <CardFrame title="New job">
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      <div className="space-y-4">
        <Field label="Job title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Backend Engineer"
          />
        </Field>

        <Field label="Required skills" hint="Enter or comma to add">
          <TagInput
            value={skills}
            onChange={setSkills}
            placeholder="Python, SQL, Docker…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum experience (years)">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          </Field>
          <Field label="Employment type">
            <select
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Not specified</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <input
              className={inputClass}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Cairo, Egypt"
            />
          </Field>
          <Field label="Required education">
            <input
              className={inputClass}
              value={education}
              onChange={(e) => setEducation(e.target.value)}
              placeholder="Bachelor's in CS"
            />
          </Field>
        </div>

        <Field label="Description" hint="Optional - improves semantic matching">
          <textarea
            rows={3}
            className={cx(inputClass, "resize-y")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will this person do?"
          />
        </Field>

        <div className="flex gap-3">
          <Button onClick={() => void submit()} loading={saving}>
            Create job
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </CardFrame>
  );
}

// ---------------------------------------------------- delete confirm

export function ConfirmDeleteCard({
  kind = "cv",
  name,
  state,
  onConfirm,
  onCancel,
}: {
  kind?: "cv" | "job";
  name: string;
  state: "ask" | "deleted" | "cancelled";
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (state !== "ask") {
    return (
      <CardFrame>
        <p className="text-sm text-slate-400">
          {state === "deleted"
            ? kind === "job"
              ? `Deleted the job ${name}.`
              : `Deleted ${name}'s CV from the server.`
            : "Deletion cancelled - nothing was removed."}
        </p>
      </CardFrame>
    );
  }

  return (
    <CardFrame className="border-red-500/25">
      <p className="text-sm leading-6 text-slate-200">
        {kind === "job" ? (
          <>
            Delete the job{" "}
            <span className="font-semibold text-white">{name}</span>? Its
            required skills are removed too. Candidates and CVs are not
            affected. It can&apos;t be undone.
          </>
        ) : (
          <>
            Delete <span className="font-semibold text-white">{name}</span>
            &apos;s CV? This removes the uploaded PDF, the parsed data, the
            job-search embedding and the chat index. It can&apos;t be undone.
          </>
        )}
      </p>
      <div className="mt-4 flex gap-3">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {busy && <Spinner size={14} />}
          Yes, delete
        </button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Keep it
        </Button>
      </div>
    </CardFrame>
  );
}

// ------------------------------------------------- interview question

export function QuestionBubble({
  index,
  total,
  question,
}: {
  index: number;
  total: number;
  question: InterviewQuestion;
}) {
  return (
    <CardFrame>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="violet">
          Question {index + 1} of {total}
        </Badge>
        {question.type && <Badge tone="slate">{question.type}</Badge>}
        {question.difficulty && <Badge tone="amber">{question.difficulty}</Badge>}
        {question.skill && <Badge tone="slate">{question.skill}</Badge>}
      </div>
      <p className="text-[15px] leading-7 text-white">{question.question}</p>
      <p className="mt-3 text-xs text-slate-600">
        Type your answer below · &ldquo;skip&rdquo; to pass · &ldquo;finish&rdquo;
        to submit early
      </p>
    </CardFrame>
  );
}

// ------------------------------------------------------------- match

export function MatchCard({
  match,
  total,
  candidateName,
  jobTitle,
}: {
  match: Match;
  total: number;
  candidateName: string;
  jobTitle: string;
}) {
  const verdict =
    match.final_match_score >= 70
      ? "Strong fit"
      : match.final_match_score >= 50
      ? "Partial fit"
      : "Weak fit";

  return (
    <CardFrame
      title="Job match & skill gap"
      right={
        <span className="truncate text-xs text-slate-500">
          {candidateName} → {jobTitle}
        </span>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <div className="flex flex-col items-center justify-center text-center">
          <ScoreRing value={match.final_match_score} size={140} label="Match" />
          <Badge tone={scoreTone(match.final_match_score)} className="mt-4">
            {verdict}
          </Badge>
          {total > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Ranked #{match.rank} of {total}
            </p>
          )}
        </div>
        <div className="space-y-4">
          <MetricRow label="Semantic similarity" note="40%" value={match.semantic_score} />
          <MetricRow label="Required skills" note="40%" value={match.skill_score} />
          <MetricRow label="Experience" note="20%" value={match.experience_score} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 border-t border-white/10 pt-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>Matched skills</span>
            <span className="tabular-nums">
              {match.matched_skill_count}/{match.total_required_skills}
            </span>
          </p>
          <SkillChips
            skills={match.matched_skills}
            tone="green"
            empty="No required skills matched."
          />
        </div>
        <div>
          <p className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>Skill gap</span>
            <span className="tabular-nums">
              {fmt(match.skill_gap_percentage)}%
            </span>
          </p>
          <SkillChips
            skills={match.missing_skills}
            tone="amber"
            empty="No missing skills - full coverage."
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-sm">
        <span className="text-slate-500">
          Candidate{" "}
          <span className="text-white">{match.candidate_experience} yrs</span>
        </span>
        <span className="text-slate-500">
          Required{" "}
          <span className="text-white">{match.required_experience} yrs</span>
        </span>
        <Badge tone={match.experience_match ? "green" : "amber"}>
          {match.experience_match ? "Meets requirement" : "Below requirement"}
        </Badge>
      </div>
    </CardFrame>
  );
}

// ----------------------------------------------------------- ranking

export function RankingCard({
  matches,
  jobTitle,
  activeCandidateId,
  onSelect,
}: {
  matches: Match[];
  jobTitle: string;
  activeCandidateId: number | null;
  onSelect: (candidateId: number) => void;
}) {
  return (
    <CardFrame
      title={`Candidate ranking · ${jobTitle}`}
      right={
        <span className="text-xs text-slate-500">
          {matches.length} candidate{matches.length === 1 ? "" : "s"}
        </span>
      }
    >
      {matches.length === 0 ? (
        <p className="text-sm text-slate-500">
          No candidates to rank yet. Attach a CV first.
        </p>
      ) : (
        <ol className="space-y-2">
          {matches.map((m) => (
            <li key={m.candidate_id}>
              <button
                onClick={() => onSelect(m.candidate_id)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                  m.candidate_id === activeCandidateId
                    ? "border-violet-500/40 bg-violet-500/[0.08]"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                )}
              >
                <span
                  className={cx(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    m.rank === 1
                      ? "bg-amber-400/15 text-amber-200"
                      : "bg-white/[0.06] text-slate-400"
                  )}
                >
                  {m.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-white">
                      {m.candidate_name ?? `Candidate #${m.candidate_id}`}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {fmt(m.final_match_score)}%
                    </span>
                  </span>
                  <ProgressBar value={m.final_match_score} className="mt-2" />
                  <span className="mt-1.5 block truncate text-xs text-slate-500">
                    {m.matched_skill_count}/{m.total_required_skills} required
                    skills · {m.candidate_experience} yrs
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </CardFrame>
  );
}

// -------------------------------------------------------- evaluation

export function EvaluationCard({
  evaluation,
}: {
  evaluation: InterviewEvaluation;
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <CardFrame
      title="Interview evaluation"
      right={
        <Badge tone={recommendationTone(evaluation.recommendation)}>
          {evaluation.recommendation}
        </Badge>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <div className="flex justify-center">
          <ScoreRing value={evaluation.overall_score} size={140} label="Overall" />
        </div>
        <div className="space-y-4">
          <MetricRow label="Technical accuracy" value={evaluation.technical_score} />
          <MetricRow label="Communication" value={evaluation.communication_score} />
          <MetricRow label="Relevance" value={evaluation.relevance_score} />
        </div>
      </div>

      {evaluation.summary && (
        <p className="mt-5 text-sm leading-6 text-slate-300">
          {evaluation.summary}
        </p>
      )}

      <div className="mt-5 grid gap-5 border-t border-white/10 pt-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs text-slate-500">Strengths</p>
          <ul className="space-y-1.5 text-sm text-slate-300">
            {evaluation.strengths.length ? (
              evaluation.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-emerald-400">•</span>
                  {s}
                </li>
              ))
            ) : (
              <li className="text-slate-600">None noted</li>
            )}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs text-slate-500">To improve</p>
          <ul className="space-y-1.5 text-sm text-slate-300">
            {evaluation.weaknesses.length ? (
              evaluation.weaknesses.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-300">•</span>
                  {s}
                </li>
              ))
            ) : (
              <li className="text-slate-600">None noted</li>
            )}
          </ul>
        </div>
      </div>

      {evaluation.evaluations.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs text-slate-500">Answer by answer</p>
          <ul className="space-y-2">
            {evaluation.evaluations.map((e, i) => (
              <li
                key={i}
                className="rounded-xl border border-white/10 bg-white/[0.02]"
              >
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <span className="truncate text-sm text-slate-300">
                    {i + 1}. {e.question}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={scoreTone(e.score)}>{fmt(e.score, 0)}</Badge>
                    <Icon
                      name="chevron"
                      size={15}
                      className={cx(
                        "text-slate-500 transition",
                        open === i && "rotate-180"
                      )}
                    />
                  </span>
                </button>
                {open === i && (
                  <div className="space-y-2 border-t border-white/10 px-3 py-3 text-sm leading-6">
                    <p className="text-slate-500">
                      Your answer:{" "}
                      <span className="text-slate-300">{e.answer}</span>
                    </p>
                    <p className="text-slate-300">{e.feedback}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardFrame>
  );
}

// ---------------------------------------------------------- decision

export function DecisionCard({ decision }: { decision: Decision }) {
  const parts = [
    { label: "Job match", weight: "50%", score: decision.match_score },
    { label: "Interview", weight: "30%", score: decision.interview_score },
    { label: "Required skills", weight: "20%", score: decision.skill_match_score },
  ];

  return (
    <CardFrame
      title="Final hiring decision"
      right={
        <span className="truncate text-xs text-slate-500">
          {decision.candidate_name ?? `Candidate #${decision.candidate_id}`} →{" "}
          {decision.job_title}
        </span>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <div className="flex flex-col items-center text-center">
          <ScoreRing value={clampPct(decision.final_score)} size={140} label="Final" />
          <Badge
            tone={recommendationTone(decision.recommendation)}
            className="mt-4 !px-4 !py-1.5 !text-sm"
          >
            {decision.recommendation}
          </Badge>
        </div>
        <div className="space-y-4">
          {parts.map((p) => (
            <MetricRow
              key={p.label}
              label={p.label}
              note={`weight ${p.weight}`}
              value={p.score}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 border-t border-white/10 pt-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs text-slate-500">Matched skills</p>
          <SkillChips skills={decision.matched_skills} tone="green" empty="None" />
        </div>
        <div>
          <p className="mb-2 text-xs text-slate-500">
            Missing skills · {fmt(decision.skill_gap_percentage)}% gap
          </p>
          <SkillChips skills={decision.missing_skills} tone="amber" empty="None" />
        </div>
      </div>
    </CardFrame>
  );
}
