"use client";

import { useState } from "react";
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
  ScoreRing,
  SectionTitle,
  clampPct,
  cx,
  fmt,
  inputClass,
  recommendationTone,
  scoreTone,
} from "@/components/ui";

export default function InterviewPage() {
  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Step 4"
        title="AI interview"
        description="Answer questions generated from the job's requirements and the candidate's profile. Your answers are scored by AI for technical accuracy, communication and relevance."
      />
      <RequireSetup>
        <InterviewView />
      </RequireSetup>
    </div>
  );
}

function InterviewView() {
  const router = useRouter();
  const {
    candidate,
    job,
    questions,
    answers,
    evaluation,
    setQuestions,
    setAnswer,
    setEvaluation,
    resetInterview,
  } = useSession();

  const [current, setCurrent] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");

  if (!candidate || !job) return null;

  const answered = answers.filter((a) => a.trim()).length;

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const data = await api.generateInterview(candidate.candidateId, job.jobId);
      if (!data.questions?.length) {
        throw new Error("The AI did not return any interview questions. Please try again.");
      }
      setQuestions(data.questions);
      setCurrent(0);
    } catch (err) {
      setError(errorMessage(err, "Interview generation failed."));
    } finally {
      setGenerating(false);
    }
  };

  const submit = async () => {
    const payload = questions
      .map((q, i) => ({ question: q.question, answer: (answers[i] ?? "").trim() }))
      .filter((item) => item.answer);

    if (!payload.length) {
      setError("Answer at least one question before submitting.");
      return;
    }

    setEvaluating(true);
    setError("");
    try {
      const result = await api.evaluateInterview(
        candidate.candidateId,
        job.jobId,
        payload
      );
      setEvaluation(result);
    } catch (err) {
      setError(errorMessage(err, "Interview evaluation failed."));
    } finally {
      setEvaluating(false);
    }
  };

  // ------------------------------------------------------------ states

  if (generating) {
    return (
      <LoadingBlock
        title="Generating interview questions…"
        description="The local AI model is writing questions tailored to this job and candidate. This can take a minute."
      />
    );
  }

  if (evaluating) {
    return (
      <LoadingBlock
        title="Evaluating your answers…"
        description="The AI is scoring each answer. This can take a minute or two with a local model - please keep this tab open."
      />
    );
  }

  if (evaluation) {
    return (
      <>
        <ErrorBanner message={error} onDismiss={() => setError("")} />
        <Results
          onEdit={() => setEvaluation(null)}
          onRestart={() => {
            resetInterview();
            setCurrent(0);
          }}
          onNext={() => router.push("/decision")}
        />
      </>
    );
  }

  if (!questions.length) {
    return (
      <>
        <ErrorBanner message={error} onDismiss={() => setError("")} />
        <Card className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
            <Icon name="mic" size={28} />
          </div>
          <h2 className="text-xl font-semibold">Ready to start?</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            Questions are generated for{" "}
            <span className="text-slate-300">{candidate.name}</span> applying to{" "}
            <span className="text-slate-300">{job.title}</span>, with extra
            focus on any skills the candidate is missing.
          </p>
          <Button onClick={generate} className="mt-6">
            Generate interview questions
          </Button>
        </Card>
      </>
    );
  }

  // Answering
  const index = Math.min(current, questions.length - 1);
  const q = questions[index];

  return (
    <>
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit p-4 sm:p-4">
          <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Questions · {answered}/{questions.length} answered
          </p>
          <ol className="space-y-1">
            {questions.map((item, i) => {
              const done = Boolean(answers[i]?.trim());
              return (
                <li key={i}>
                  <button
                    onClick={() => setCurrent(i)}
                    className={cx(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                      i === index
                        ? "bg-violet-500/12 text-white ring-1 ring-violet-500/25"
                        : "text-slate-400 hover:bg-white/[0.04]"
                    )}
                  >
                    <span
                      className={cx(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                        done
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-white/[0.06] text-slate-500"
                      )}
                    >
                      {done ? <Icon name="check" size={11} /> : i + 1}
                    </span>
                    <span className="line-clamp-2">{item.question}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Question {index + 1} of {questions.length}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge tone="violet" className="capitalize">
                {q.type}
              </Badge>
              <Badge className="capitalize">{q.difficulty}</Badge>
              {q.skill && <Badge>{q.skill}</Badge>}
            </div>
          </div>

          <p className="mt-5 text-lg leading-8">{q.question}</p>

          <textarea
            value={answers[index] ?? ""}
            onChange={(e) => setAnswer(index, e.target.value)}
            rows={9}
            placeholder="Write your answer here…"
            className={cx(inputClass, "mt-5 resize-y leading-7")}
          />
          <p className="mt-2 text-right text-xs text-slate-600">
            {(answers[index] ?? "").trim().split(/\s+/).filter(Boolean).length} words
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setCurrent(Math.max(0, index - 1))}
                disabled={index === 0}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => setCurrent(Math.min(questions.length - 1, index + 1))}
                disabled={index === questions.length - 1}
              >
                Next
              </Button>
            </div>

            <Button onClick={submit} disabled={answered === 0}>
              Submit for evaluation
              <Icon name="arrow" size={16} />
            </Button>
          </div>

          {answered > 0 && answered < questions.length && (
            <p className="mt-4 text-xs text-amber-200/80">
              {questions.length - answered} unanswered question
              {questions.length - answered === 1 ? "" : "s"} will be skipped.
            </p>
          )}

          <button
            onClick={generate}
            className="mt-6 text-xs text-slate-600 underline-offset-2 hover:text-slate-400 hover:underline"
          >
            Generate a different set of questions
          </button>
        </Card>
      </div>
    </>
  );
}

function Results({
  onEdit,
  onRestart,
  onNext,
}: {
  onEdit: () => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  const { evaluation } = useSession();
  const [open, setOpen] = useState<number | null>(0);

  if (!evaluation) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center text-center">
          <ScoreRing value={evaluation.overall_score} size={170} label="Interview" />
          <Badge
            tone={recommendationTone(evaluation.recommendation)}
            className="mt-5"
          >
            {evaluation.recommendation}
          </Badge>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>Performance</SectionTitle>
          <div className="mt-5 space-y-5">
            <MetricRow label="Technical" value={evaluation.technical_score} />
            <MetricRow label="Communication" value={evaluation.communication_score} />
            <MetricRow label="Relevance" value={evaluation.relevance_score} />
          </div>
          {evaluation.summary && (
            <p className="mt-6 border-t border-white/10 pt-5 text-sm leading-7 text-slate-300">
              {evaluation.summary}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <SectionTitle>Strengths</SectionTitle>
          <PointList items={evaluation.strengths} tone="green" empty="None noted." />
        </Card>
        <Card>
          <SectionTitle>Areas to improve</SectionTitle>
          <PointList items={evaluation.weaknesses} tone="amber" empty="None noted." />
        </Card>
      </div>

      <Card>
        <SectionTitle>Answer-by-answer feedback</SectionTitle>
        <div className="mt-4 divide-y divide-white/10">
          {evaluation.evaluations.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={i} className="py-1">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 py-4 text-left"
                >
                  <Badge tone={scoreTone(clampPct(item.score))} className="tabular-nums">
                    {fmt(item.score, 0)}
                  </Badge>
                  <span className="flex-1 text-sm leading-6">{item.question}</span>
                  <Icon
                    name="chevron"
                    size={16}
                    className={cx("shrink-0 text-slate-500 transition", isOpen && "rotate-180")}
                  />
                </button>

                {isOpen && (
                  <div className="space-y-5 pb-5 pl-0 sm:pl-14">
                    <div className="rounded-xl border border-white/10 bg-[#080b14] p-4">
                      <p className="text-xs uppercase tracking-wider text-slate-600">
                        Your answer
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                        {item.answer}
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <MetricRow label="Technical" value={item.technical_accuracy} />
                      <MetricRow label="Communication" value={item.communication} />
                      <MetricRow label="Relevance" value={item.relevance} />
                    </div>

                    {item.feedback && (
                      <p className="text-sm leading-7 text-slate-300">{item.feedback}</p>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <PointList items={item.strengths} tone="green" empty="" />
                      <PointList items={item.weaknesses} tone="amber" empty="" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onEdit}>
            Edit answers
          </Button>
          <Button variant="ghost" onClick={onRestart}>
            Practice with new questions
          </Button>
        </div>
        <Button onClick={onNext}>
          Next: final decision
          <Icon name="arrow" size={16} />
        </Button>
      </div>
    </div>
  );
}

function PointList({
  items,
  tone,
  empty,
}: {
  items: string[];
  tone: "green" | "amber";
  empty: string;
}) {
  if (!items?.length) {
    return empty ? <p className="mt-4 text-sm text-slate-600">{empty}</p> : null;
  }
  return (
    <ul className="mt-4 space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-6 text-slate-300">
          <span
            className={cx(
              "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
              tone === "green"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-200"
            )}
          >
            <Icon name={tone === "green" ? "check" : "alert"} size={10} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}
