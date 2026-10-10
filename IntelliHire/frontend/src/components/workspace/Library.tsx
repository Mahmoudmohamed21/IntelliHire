"use client";

import { useState } from "react";

import type { CandidateSummary, Job } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Spinner, cx } from "@/components/ui";

// ------------------------------------------------------------------ CVs

export function CandidateList({
  candidates,
  activeId,
  reindexingId,
  onSelect,
  onDelete,
  onReindex,
  compact,
}: {
  candidates: CandidateSummary[];
  activeId: number | null;
  reindexingId: number | null;
  onSelect: (candidate: CandidateSummary) => void;
  onDelete: (candidate: CandidateSummary) => Promise<void> | void;
  onReindex: (candidate: CandidateSummary) => void;
  compact?: boolean;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  if (!candidates.length) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
        No CVs yet. Attach a PDF in the chat to add one.
      </p>
    );
  }

  const confirmDelete = async (candidate: CandidateSummary) => {
    setDeleting(candidate.candidate_id);
    try {
      await onDelete(candidate);
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  };

  return (
    <ul className="space-y-2">
      {candidates.map((c) => {
        const active = c.candidate_id === activeId;
        const asking = confirming === c.candidate_id;
        const busyDeleting = deleting === c.candidate_id;
        const reindexing = reindexingId === c.candidate_id;
        const notIndexed = c.indexed === false;

        return (
          <li
            key={c.candidate_id}
            className={cx(
              "rounded-xl border p-3 transition",
              active
                ? "border-violet-500/40 bg-violet-500/[0.08]"
                : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
            )}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => onSelect(c)}
                className="min-w-0 flex-1 text-left"
                title="Work with this CV"
              >
                <p className="flex items-center gap-2 truncate text-sm font-medium text-white">
                  <span className="truncate">{c.name}</span>
                  {active && (
                    <span className="shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200">
                      Active
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {c.resume_file ?? "No file"}
                </p>
                {!compact && (
                  <p className="mt-1 text-xs text-slate-500">
                    {c.years_of_experience} yr
                    {c.years_of_experience === 1 ? "" : "s"} · {c.skills.length}{" "}
                    skill{c.skills.length === 1 ? "" : "s"}
                  </p>
                )}
              </button>

              {!asking && (
                <div className="flex shrink-0 items-center gap-1">
                  {(notIndexed || reindexing) && (
                    <button
                      onClick={() => onReindex(c)}
                      disabled={reindexing}
                      title="Not searchable yet - click to re-index"
                      aria-label={`Re-index ${c.name}`}
                      className="rounded-lg p-1.5 text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-60"
                    >
                      {reindexing ? (
                        <Spinner size={15} />
                      ) : (
                        <Icon name="refresh" size={15} />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setConfirming(c.candidate_id)}
                    title="Delete CV"
                    aria-label={`Delete ${c.name}`}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              )}
            </div>

            {notIndexed && !asking && (
              <p className="mt-2 text-[11px] leading-4 text-amber-300/90">
                Not searchable yet - matching will embed it automatically, or
                re-index now.
              </p>
            )}

            {asking && (
              <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] p-3">
                <p className="text-xs leading-5 text-red-200">
                  Permanently delete this CV, its file on the server, and its
                  search data?
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => void confirmDelete(c)}
                    disabled={busyDeleting}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
                  >
                    {busyDeleting && <Spinner size={12} />}
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    disabled={busyDeleting}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.05]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------------- jobs

export function JobList({
  jobs,
  activeId,
  onSelect,
  onDelete,
}: {
  jobs: Job[];
  activeId: number | null;
  onSelect: (job: Job) => void;
  onDelete: (job: Job) => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  if (!jobs.length) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
        No jobs yet. Say &ldquo;create a new job&rdquo; to add one.
      </p>
    );
  }

  const confirmDelete = async (job: Job) => {
    setDeleting(job.job_id);
    try {
      await onDelete(job);
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  };

  return (
    <ul className="space-y-2">
      {jobs.map((job) => {
        const active = job.job_id === activeId;
        const asking = confirming === job.job_id;
        const busyDeleting = deleting === job.job_id;

        return (
          <li
            key={job.job_id}
            className={cx(
              "rounded-xl border p-3 transition",
              active
                ? "border-violet-500/40 bg-violet-500/[0.08]"
                : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
            )}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => onSelect(job)}
                className="min-w-0 flex-1 text-left"
                title="Use this job"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <span className="truncate">{job.title}</span>
                  {active && (
                    <span className="shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200">
                      Active
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {[
                    job.location,
                    job.employment_type,
                    `${job.minimum_experience}+ yrs`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {job.skills.length > 0 && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">
                    {job.skills.join(", ")}
                  </p>
                )}
              </button>

              {!asking && (
                <button
                  onClick={() => setConfirming(job.job_id)}
                  title="Delete job"
                  aria-label={`Delete job ${job.title}`}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                >
                  <Icon name="trash" size={15} />
                </button>
              )}
            </div>

            {asking && (
              <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] p-3">
                <p className="text-xs leading-5 text-red-200">
                  Delete this job and its required skills? Candidates and CVs
                  are not affected.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => void confirmDelete(job)}
                    disabled={busyDeleting}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
                  >
                    {busyDeleting && <Spinner size={12} />}
                    Delete job
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    disabled={busyDeleting}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.05]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
