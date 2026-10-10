"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  LinkButton,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  RequireSetup,
  ScoreRing,
  SectionTitle,
  SkillChips,
  clampPct,
  cx,
  fmt,
  inputClass,
  recommendationTone,
} from "@/components/ui";

// These mirror app/services/decision_service.py
const WEIGHTS = { match: 0.5, interview: 0.3, skills: 0.2 };

const BANDS = [
  { label: "Strong Hire", min: 85 },
  { label: "Hire", min: 70 },
  { label: "Consider", min: 55 },
  { label: "Reject", min: 0 },
];

export default function DecisionPage() {
  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Step 5"
        title="Final hiring decision"
        description="Combines job match (50%), interview performance (30%) and required-skill coverage (20%) into one recommendation."
      />
      <RequireSetup>
        <DecisionView />
      </RequireSetup>
    </div>
  );
}

function DecisionView() {
  const router = useRouter();
  const { candidate, job, evaluation, decision, setDecision } = useSession();

  const [manualScore, setManualScore] = useState("70");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const autoRan = useRef<string | null>(null);

  const hasInterview = Boolean(evaluation);

  const calculate = useCallback(
    async (score: number) => {
      if (!candidate || !job) return;
      setLoading(true);
      setError("");
      try {
        const result = await api.finalDecision(
          candidate.candidateId,
          job.jobId,
          clampPct(score)
        );
        setDecision(result);
      } catch (err) {
        setError(errorMessage(err, "Could not calculate the decision."));
      } finally {
        setLoading(false);
      }
    },
    [candidate, job, setDecision]
  );

  // With a finished interview, calculate immediately.
  useEffect(() => {
    if (!candidate || !job || !evaluation || decision) return;
    const key = `${candidate.candidateId}-${job.jobId}-${evaluation.overall_score}`;
    if (autoRan.current === key) return;
    autoRan.current = key;
    void calculate(evaluation.overall_score);
  }, [candidate, job, evaluation, decision, calculate]);

  if (!candidate || !job) return null;

  if (loading && !decision) {
    return (
      <LoadingBlock
        title="Calculating decision…"
        description="Re-running the match analysis and combining it with the interview score."
      />
    );
  }

  const parts = decision
    ? [
        {
          label: "Job match",
          weight: WEIGHTS.match,
          score: decision.match_score,
        },
        {
          label: "Interview",
          weight: WEIGHTS.interview,
          score: decision.interview_score,
        },
        {
          label: "Required skills",
          weight: WEIGHTS.skills,
          score: decision.skill_match_score,
        },
      ]
    : [];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <p>
          <span className="text-white">{candidate.name}</span> for{" "}
          <span className="text-white">{job.title}</span>
        </p>
        {decision && hasInterview && (
          <Button
            variant="secondary"
            loading={loading}
            onClick={() => evaluation && calculate(evaluation.overall_score)}
          >
            Recalculate
          </Button>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {!hasInterview && (
        <Card className="mb-6">
          <h2 className="text-lg font-semibold">Interview score</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            No interview has been evaluated for this candidate yet. Complete the
            AI interview for an automatic score, or enter one manually.
          </p>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="block w-40">
              <span className="mb-2 block text-sm text-slate-300">Score (0–100)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={manualScore}
                onChange={(e) => setManualScore(e.target.value)}
                className={inputClass}
              />
            </label>
            <Button
              loading={loading}
              disabled={manualScore.trim() === "" || Number.isNaN(Number(manualScore))}
              onClick={() => calculate(Number(manualScore))}
            >
              Calculate decision
            </Button>
            <LinkButton href="/interview" variant="secondary">
              Take the AI interview
            </LinkButton>
          </div>
        </Card>
      )}

      {decision && (
        <div className="space-y-6">
          <Card
            className={cx(
              "border-2",
              recommendationTone(decision.recommendation) === "green" &&
                "border-emerald-500/30",
              recommendationTone(decision.recommendation) === "amber" &&
                "border-amber-500/30",
              recommendationTone(decision.recommendation) === "red" &&
                "border-red-500/30"
            )}
          >
            <div className="flex flex-wrap items-center gap-8">
              <ScoreRing
                value={decision.final_score}
                size={170}
                label="Final"
                tone={recommendationTone(decision.recommendation)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Recommendation
                </p>
                <p className="mt-1 text-4xl font-semibold tracking-tight">
                  {decision.recommendation}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {candidate.name} scored {fmt(decision.final_score)}/100 for{" "}
                  {decision.job_title}.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {BANDS.map((band) => (
                    <Badge
                      key={band.label}
                      tone={
                        band.label === decision.recommendation
                          ? recommendationTone(band.label)
                          : "slate"
                      }
                      className={cx(band.label !== decision.recommendation && "opacity-50")}
                    >
                      {band.label} {band.min > 0 ? `≥ ${band.min}` : "< 55"}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>How the score was built</SectionTitle>
            <div className="mt-5 space-y-6">
              {parts.map((part) => (
                <div key={part.label}>
                  <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-slate-200">
                      {part.label}
                      <span className="ml-2 text-xs text-slate-600">
                        weight {Math.round(part.weight * 100)}%
                      </span>
                    </span>
                    <span className="tabular-nums text-slate-400">
                      {fmt(part.score)}% →{" "}
                      <span className="font-medium text-white">
                        +{fmt(part.score * part.weight)}
                      </span>
                    </span>
                  </div>
                  <ProgressBar value={part.score} />
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <SectionTitle>Matched skills</SectionTitle>
              <div className="mt-4">
                <SkillChips skills={decision.matched_skills} tone="green" empty="None matched." />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <SectionTitle>Missing skills</SectionTitle>
                <span className="text-sm text-slate-500">
                  {fmt(decision.skill_gap_percentage)}% gap
                </span>
              </div>
              <div className="mt-4">
                <SkillChips skills={decision.missing_skills} tone="amber" empty="No missing skills." />
              </div>
            </Card>
          </div>

          <Card>
            <SectionTitle>Experience</SectionTitle>
            <div className="mt-4 flex flex-wrap items-center gap-8 text-sm">
              <div>
                <p className="text-xs text-slate-500">Candidate</p>
                <p className="mt-1 text-2xl font-semibold">{decision.candidate_experience} yrs</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Required</p>
                <p className="mt-1 text-2xl font-semibold">{decision.required_experience} yrs</p>
              </div>
              <Badge tone={decision.experience_match ? "green" : "amber"}>
                {decision.experience_match ? "Meets requirement" : "Below requirement"}
              </Badge>
            </div>
          </Card>

          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="secondary" onClick={() => router.push("/recruiter")}>
              Back to ranking
            </Button>
            <Button variant="ghost" onClick={() => router.push("/")}>
              Dashboard
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
