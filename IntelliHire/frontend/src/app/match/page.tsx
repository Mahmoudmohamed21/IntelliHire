"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  LoadingBlock,
  MetricRow,
  PageHeader,
  RequireSetup,
  SectionTitle,
  SkillChips,
  fmt,
  scoreTone,
  ScoreRing,
} from "@/components/ui";

export default function MatchPage() {
  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Step 3"
        title="Job match & skill gap"
        description="Combines semantic similarity (40%), required-skill coverage (40%) and experience (20%) into one score."
      />
      <RequireSetup>
        <MatchView />
      </RequireSetup>
    </div>
  );
}

function MatchView() {
  const router = useRouter();
  const { candidate, job, match, matchTotal, setMatch } = useSession();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const autoRan = useRef<string | null>(null);

  const run = useCallback(async () => {
    if (!candidate || !job) return;

    setLoading(true);
    setError("");

    try {
      let data = await api.getMatches(job.jobId, 100);
      let found = data.matches.find(
        (m) => Number(m.candidate_id) === Number(candidate.candidateId)
      );

      // A candidate can exist in the database while its FAISS vector is
      // missing (for example, if indexing failed during upload). Repair the
      // selected CV once, then repeat the search before showing an error.
      if (!found && candidate.resumeId) {
        await api.reindexCV(candidate.resumeId);
        data = await api.getMatches(job.jobId, 100);
        found = data.matches.find(
          (m) => Number(m.candidate_id) === Number(candidate.candidateId)
        );
      }

      if (!found) {
        throw new Error(
          candidate.resumeId
            ? "The CV was re-indexed, but this candidate still isn't in the top 100 results for this job. Check the backend logs and confirm the selected candidate and job IDs are correct."
            : "This candidate has no CV linked to the current session. Select the CV again from the CV library, then rerun matching."
        );
      }
      setMatch(found, data.total_candidates);
    } catch (err) {
      setError(errorMessage(err, "Match analysis failed."));
    } finally {
      setLoading(false);
    }
  }, [candidate, job, setMatch]);

  // Run once automatically the first time this pair is opened.
  useEffect(() => {
    if (!candidate || !job || match) return;
    const key = `${candidate.candidateId}-${job.jobId}`;
    if (autoRan.current === key) return;
    autoRan.current = key;
    void run();
  }, [candidate, job, match, run]);

  if (!candidate || !job) return null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <p>
          <span className="text-white">{candidate.name}</span> for{" "}
          <span className="text-white">{job.title}</span>
        </p>
        <Button variant="secondary" onClick={run} loading={loading}>
          Re-run analysis
        </Button>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {loading && !match && (
        <LoadingBlock
          title="Analyzing match…"
          description="Creating a job embedding and comparing it with the candidate."
        />
      )}

      {match && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="flex flex-col items-center justify-center text-center">
              <ScoreRing value={match.final_match_score} size={170} label="Match" />
              <Badge tone={scoreTone(match.final_match_score)} className="mt-5">
                {match.final_match_score >= 70
                  ? "Strong fit"
                  : match.final_match_score >= 50
                  ? "Partial fit"
                  : "Weak fit"}
              </Badge>
              {matchTotal > 0 && (
                <p className="mt-3 text-sm text-slate-500">
                  Ranked #{match.rank} of {matchTotal} candidate
                  {matchTotal === 1 ? "" : "s"} for this job
                </p>
              )}
            </Card>

            <Card className="lg:col-span-2">
              <SectionTitle>Score breakdown</SectionTitle>
              <div className="mt-5 space-y-5">
                <MetricRow
                  label="Semantic similarity"
                  note="weight 40%"
                  value={match.semantic_score}
                />
                <MetricRow
                  label="Required skills"
                  note="weight 40%"
                  value={match.skill_score}
                />
                <MetricRow
                  label="Experience"
                  note="weight 20%"
                  value={match.experience_score}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between">
                <SectionTitle>Skills you match</SectionTitle>
                <span className="text-sm tabular-nums text-slate-500">
                  {match.matched_skill_count}/{match.total_required_skills}
                </span>
              </div>
              <div className="mt-4">
                <SkillChips
                  skills={match.matched_skills}
                  tone="green"
                  empty="No required skills matched."
                />
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <SectionTitle>Skill gap</SectionTitle>
                <Badge tone={match.skill_gap_percentage > 40 ? "red" : "amber"}>
                  {fmt(match.skill_gap_percentage)}% gap
                </Badge>
              </div>
              <div className="mt-4">
                <SkillChips
                  skills={match.missing_skills}
                  tone="amber"
                  empty="No missing required skills - great coverage."
                />
              </div>
              {match.missing_skills.length > 0 && (
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  Focus on these skills to raise the match score for this role.
                </p>
              )}
            </Card>
          </div>

          <Card>
            <SectionTitle>Experience</SectionTitle>
            <div className="mt-4 grid gap-6 sm:grid-cols-3">
              <Stat label="Candidate" value={`${match.candidate_experience} yrs`} />
              <Stat label="Required" value={`${match.required_experience} yrs`} />
              <div>
                <p className="text-xs text-slate-500">Requirement</p>
                <Badge
                  tone={match.experience_match ? "green" : "amber"}
                  className="mt-2"
                >
                  {match.experience_match ? "Meets requirement" : "Below requirement"}
                </Badge>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => router.push("/interview")}>
              Next: AI interview
              <Icon name="arrow" size={16} />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
