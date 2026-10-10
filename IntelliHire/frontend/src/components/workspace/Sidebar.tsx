"use client";

import { useRef, useState } from "react";

import type { CandidateSummary, Job } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Spinner, cx } from "@/components/ui";
import { CandidateList, JobList } from "./Library";

export default function Sidebar({
  candidates,
  jobs,
  loading,
  activeCandidateId,
  activeJobId,
  reindexingId,
  uploading,
  onUpload,
  onSelectCandidate,
  onDeleteCandidate,
  onReindex,
  onSelectJob,
  onDeleteJob,
  onNewJob,
  onClose,
}: {
  candidates: CandidateSummary[];
  jobs: Job[];
  loading: boolean;
  activeCandidateId: number | null;
  activeJobId: number | null;
  reindexingId: number | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onSelectCandidate: (candidate: CandidateSummary) => void;
  onDeleteCandidate: (candidate: CandidateSummary) => Promise<void> | void;
  onReindex: (candidate: CandidateSummary) => void;
  onSelectJob: (job: Job) => void;
  onDeleteJob: (job: Job) => Promise<void> | void;
  onNewJob: () => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"cvs" | "jobs">("cvs");
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
            <Icon name="sparkle" size={18} className="text-white" />
          </div>
          <div>
            <p className="text-base font-semibold leading-none">IntelliHire</p>
            <p className="mt-1 text-[11px] text-slate-500">AI recruitment workspace</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white md:hidden"
          >
            <Icon name="x" size={18} />
          </button>
        )}
      </div>

      <div className="px-4">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-violet-900/20 transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <Spinner size={16} /> : <Icon name="upload" size={16} />}
          {uploading ? "Analysing CV…" : "Upload CV (PDF)"}
        </button>
      </div>

      <div className="mt-5 flex gap-1 border-b border-white/10 px-4">
        {(
          [
            ["cvs", `CVs (${candidates.length})`],
            ["jobs", `Jobs (${jobs.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              "-mb-px border-b-2 px-3 pb-3 text-sm font-medium transition",
              tab === key
                ? "border-violet-400 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : tab === "cvs" ? (
          <CandidateList
            candidates={candidates}
            activeId={activeCandidateId}
            reindexingId={reindexingId}
            onSelect={(c) => {
              onSelectCandidate(c);
              onClose?.();
            }}
            onDelete={onDeleteCandidate}
            onReindex={onReindex}
          />
        ) : (
          <>
            <button
              onClick={() => {
                onNewJob();
                onClose?.();
              }}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-2.5 text-sm text-slate-300 transition hover:border-violet-500/40 hover:bg-violet-500/[0.05] hover:text-white"
            >
              <Icon name="plus" size={15} />
              New job
            </button>
            <JobList
              jobs={jobs}
              activeId={activeJobId}
              onSelect={(j) => {
                onSelectJob(j);
                onClose?.();
              }}
              onDelete={onDeleteJob}
            />
          </>
        )}
      </div>
    </div>
  );
}
