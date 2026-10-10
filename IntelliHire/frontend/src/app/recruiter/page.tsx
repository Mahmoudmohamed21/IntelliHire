"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  api,
  errorMessage,
  type CandidateSummary,
  type Job,
  type Match,
} from "@/lib/api";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  SectionTitle,
  SkillChips,
  cx,
  fmt,
  inputClass,
  scoreTone,
} from "@/components/ui";

export default function RecruiterPage() {
  const router = useRouter();
  const session = useSession();

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const [topK, setTopK] = useState(25);

  const [matches, setMatches] = useState<Match[] | null>(null);
  const [rankedJob, setRankedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [j, c] = await Promise.allSettled([api.listJobs(), api.listCandidates()]);
      if (j.status === "fulfilled") setJobs(j.value.jobs);
      else {
        setJobs([]);
        setError(errorMessage(j.reason, "Could not load jobs."));
      }
      if (c.status === "fulfilled") setCandidates(c.value.candidates);
    })();
  }, []);

  // Default to the job chosen elsewhere in the app.
  useEffect(() => {
    if (jobId === null && session.ready && session.job) setJobId(session.job.jobId);
  }, [jobId, session.ready, session.job]);

  const byId = useMemo(
    () => new Map(candidates.map((c) => [c.candidate_id, c])),
    [candidates]
  );

  const rank = async () => {
    if (!jobId) return;
    setLoading(true);
    setError("");
    setExpanded(null);

    try {
      const data = await api.getMatches(jobId, topK);
      setMatches(data.matches);
      setRankedJob(jobs?.find((j) => j.job_id === jobId) ?? null);
    } catch (err) {
      setMatches(null);
      setError(errorMessage(err, "Ranking failed."));
    } finally {
      setLoading(false);
    }
  };

  const interview = (match: Match) => {
    if (!rankedJob) return;
    const c = byId.get(match.candidate_id);

    session.selectJob({ jobId: rankedJob.job_id, title: rankedJob.title });
    session.selectCandidate({
      candidateId: match.candidate_id,
      resumeId: c?.resume_id ?? null,
      name: match.candidate_name ?? c?.name ?? `Candidate #${match.candidate_id}`,
      email: c?.email,
      years: match.candidate_experience,
      skills: c?.skills ?? [],
      fileName: c?.resume_file,
    });
    session.setMatch(match, matches?.length ?? 0);
    router.push("/interview");
  };

  const average =
    matches && matches.length
      ? matches.reduce((sum, m) => sum + m.final_match_score, 0) / matches.length
      : 0;

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Recruiter"
        title="Candidate ranking"
        description="Rank every candidate in the system against a job, then open any candidate to run the interview and decision steps."
      />

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">Job</span>
            <select
              value={jobId ?? ""}
              onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
              disabled={!jobs?.length}
            >
              <option value="">
                {jobs === null ? "Loading jobs…" : jobs.length ? "Select a job…" : "No jobs available"}
              </option>
              {jobs?.map((job) => (
                <option key={job.job_id} value={job.job_id}>
                  {job.title} ({job.skills.length} skills)
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-300">Show top</span>
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className={inputClass}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <Button onClick={rank} loading={loading} disabled={!jobId}>
            Rank candidates
          </Button>
        </div>
      </Card>

      {loading && (
        <LoadingBlock
          title="Ranking candidates…"
          description="Scoring semantic fit, skills and experience for each candidate."
        />
      )}

      {!loading && matches === null && (
        <EmptyState
          icon="users"
          title="Pick a job to see the ranking"
          description="Candidates are scored on semantic fit, required skills and experience, then ordered best-first."
        />
      )}

      {!loading && matches !== null && matches.length === 0 && (
        <EmptyState
          icon="users"
          title="No candidates found"
          description="Upload and process at least one CV so it can be ranked for this job."
        />
      )}

      {!loading && matches && matches.length > 0 && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Summary label="Candidates ranked" value={String(matches.length)} />
            <Summary label="Average match" value={`${fmt(average)}%`} />
            <Summary
              label="Top candidate"
              value={matches[0].candidate_name ?? `#${matches[0].candidate_id}`}
            />
          </div>

          <Card className="overflow-hidden p-0 sm:p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-medium">#</th>
                    <th className="px-3 py-4 font-medium">Candidate</th>
                    <th className="w-48 px-3 py-4 font-medium">Match</th>
                    <th className="px-3 py-4 font-medium">Skills</th>
                    <th className="px-3 py-4 font-medium">Experience</th>
                    <th className="px-5 py-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const open = expanded === m.candidate_id;
                    return (
                      <Fragment key={m.candidate_id}>
                        <tr className="border-b border-white/5 transition hover:bg-white/[0.02]">
                          <td className="px-5 py-4 text-slate-500 tabular-nums">
                            {m.rank}
                          </td>
                          <td className="px-3 py-4">
                            <p className="font-medium">
                              {m.candidate_name ?? `Candidate #${m.candidate_id}`}
                            </p>
                            <p className="text-xs text-slate-500">ID {m.candidate_id}</p>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-3">
                              <span className="w-12 font-semibold tabular-nums">
                                {fmt(m.final_match_score)}%
                              </span>
                              <ProgressBar value={m.final_match_score} className="flex-1" />
                            </div>
                          </td>
                          <td className="px-3 py-4 tabular-nums text-slate-300">
                            {m.matched_skill_count}/{m.total_required_skills}
                          </td>
                          <td className="px-3 py-4">
                            <Badge tone={m.experience_match ? "green" : "amber"}>
                              {m.candidate_experience}/{m.required_experience} yrs
                            </Badge>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setExpanded(open ? null : m.candidate_id)}
                                className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
                                aria-label={open ? "Hide details" : "Show details"}
                                aria-expanded={open}
                              >
                                <Icon
                                  name="chevron"
                                  size={16}
                                  className={cx("transition", open && "rotate-180")}
                                />
                              </button>
                              <Button variant="secondary" onClick={() => interview(m)}>
                                Interview
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-white/5 bg-white/[0.015]">
                            <td colSpan={6} className="px-5 py-5">
                              <div className="grid gap-6 md:grid-cols-3">
                                <div>
                                  <SectionTitle>Matched skills</SectionTitle>
                                  <div className="mt-3">
                                    <SkillChips skills={m.matched_skills} tone="green" empty="None" />
                                  </div>
                                </div>
                                <div>
                                  <SectionTitle>Missing skills</SectionTitle>
                                  <div className="mt-3">
                                    <SkillChips skills={m.missing_skills} tone="amber" empty="None" />
                                  </div>
                                </div>
                                <div className="space-y-2 text-sm">
                                  <SectionTitle>Score parts</SectionTitle>
                                  <Part label="Semantic" value={m.semantic_score} />
                                  <Part label="Skills" value={m.skill_score} />
                                  <Part label="Experience" value={m.experience_score} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d111d]/90 p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Part({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-400">{label}</span>
      <span className={cx("font-medium tabular-nums", scoreTone(value) === "red" && "text-red-300")}>
        {fmt(value)}%
      </span>
    </div>
  );
}
