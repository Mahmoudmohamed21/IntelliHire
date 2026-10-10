"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";

import {
  api,
  errorMessage,
  type CVUploadResponse,
  type CandidateSummary,
} from "@/lib/api";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  SectionTitle,
  SkillChips,
  cx,
} from "@/components/ui";

const STAGES = [
  "Extracting text from the PDF",
  "Parsing the CV with the local AI model",
  "Saving skills and experience",
  "Creating embeddings and indexing for chat",
];

export default function UploadPage() {
  const router = useRouter();
  const session = useSession();

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CVUploadResponse | null>(null);

  const [existing, setExisting] = useState<CandidateSummary[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api
      .listCandidates()
      .then((data) => setExisting(data.candidates))
      .catch(() => setExisting([]));
  }, []);

  // Cosmetic progress: the backend does the work in one request.
  useEffect(() => {
    if (!uploading) return;
    setStage(0);
    const timer = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      9000
    );
    return () => clearInterval(timer);
  }, [uploading]);

  const pick = (selected: File | undefined) => {
    if (!selected) return;
    setError("");
    setResult(null);

    const isPdf =
      selected.type === "application/pdf" ||
      selected.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      setFile(null);
      setError("Please choose a PDF file.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("That file is larger than 10 MB. Please choose a smaller PDF.");
      return;
    }
    setFile(selected);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      const data = await api.uploadCV(file);
      setResult(data);

      session.selectCandidate({
        candidateId: data.candidate_id,
        resumeId: data.resume_id,
        name: data.parsed_cv?.name || "Candidate",
        email: data.parsed_cv?.email,
        years: data.years_of_experience,
        skills: data.skills_saved,
        fileName: data.filename,
      });

      api
        .listCandidates()
        .then((d) => setExisting(d.candidates))
        .catch(() => undefined);
    } catch (err) {
      setError(errorMessage(err, "CV upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const chooseExisting = (c: CandidateSummary) => {
    session.selectCandidate({
      candidateId: c.candidate_id,
      resumeId: c.resume_id,
      name: c.name,
      email: c.email,
      years: c.years_of_experience,
      skills: c.skills,
      fileName: c.resume_file,
    });
    router.push("/jobs");
  };

  const cv = result?.parsed_cv;
  const indexingWarning =
    result && (result.faiss?.success === false || !result.rag?.indexed);

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Step 1"
        title="Upload a CV"
        description="Upload a PDF resume. The backend extracts the text, parses it with AI, stores the skills, and prepares it for matching and chat."
      />

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {!result ? (
        <Card>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !uploading && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !uploading) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cx(
              "flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition",
              dragging
                ? "border-violet-400 bg-violet-500/10"
                : "border-white/10 bg-[#080b14] hover:border-violet-500/40"
            )}
          >
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
              <Icon name="upload" size={30} />
            </div>
            <h2 className="text-lg font-semibold">Drop your CV here</h2>
            <p className="mt-1 text-sm text-slate-500">
              or click to browse · PDF only · up to 10 MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              hidden
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          {file && (
            <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#080b14] p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-xs font-bold text-red-300">
                  PDF
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>
              {!uploading && (
                <button
                  onClick={() => setFile(null)}
                  className="text-sm text-slate-500 hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </div>
          )}

          <Button
            onClick={upload}
            disabled={!file}
            loading={uploading}
            className="mt-5 w-full py-4"
          >
            {uploading ? "Analyzing CV…" : "Upload & analyze"}
          </Button>

          {uploading && (
            <div className="mt-6 space-y-2">
              {STAGES.map((label, i) => (
                <div
                  key={label}
                  className={cx(
                    "flex items-center gap-3 text-sm transition",
                    i < stage && "text-emerald-300",
                    i === stage && "text-white",
                    i > stage && "text-slate-600"
                  )}
                >
                  <span className="flex h-5 w-5 items-center justify-center">
                    {i < stage ? (
                      <Icon name="check" size={14} />
                    ) : i === stage ? (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                    )}
                  </span>
                  {label}
                </div>
              ))}
              <p className="pt-2 text-xs text-slate-600">
                A local model is doing the parsing, so this can take up to a
                minute or two.
              </p>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="border-emerald-500/25">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <Icon name="check" size={24} />
                </span>
                <div>
                  <h2 className="text-xl font-semibold">
                    {cv?.name || "CV"} processed
                  </h2>
                  <p className="text-sm text-slate-500">
                    {result.filename} · {result.years_of_experience} yrs
                    experience · {result.skills_saved.length} skills
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setResult(null)}>
                  Upload another
                </Button>
                <Button onClick={() => router.push("/jobs")}>
                  Next: choose a job
                  <Icon name="arrow" size={16} />
                </Button>
              </div>
            </div>
            {indexingWarning && (
              <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-200">
                The CV was saved, but{" "}
                {result.faiss?.success === false
                  ? "candidate embedding failed (matching may not include this CV)"
                  : "chat indexing did not complete"}
                {result.faiss?.error ? `: ${result.faiss.error}` : "."}
              </p>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionTitle>Profile</SectionTitle>
              <dl className="mt-4 space-y-3 text-sm">
                <Row label="Name" value={cv?.name} />
                <Row label="Email" value={cv?.email} />
                <Row label="Phone" value={cv?.phone} />
              </dl>
              {cv?.summary && (
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  {cv.summary}
                </p>
              )}
            </Card>

            <Card>
              <SectionTitle>Skills detected</SectionTitle>
              <div className="mt-4">
                <SkillChips
                  skills={result.skills_saved}
                  tone="violet"
                  empty="No skills were detected in this CV."
                />
              </div>
            </Card>

            <Card>
              <SectionTitle>Experience</SectionTitle>
              <ul className="mt-4 space-y-4">
                {cv?.experience?.length ? (
                  cv.experience.map((e, i) => (
                    <li key={i} className="text-sm">
                      <p className="font-medium">
                        {e.job_title || "Role"}
                        {e.company ? ` · ${e.company}` : ""}
                      </p>
                      {e.duration && (
                        <p className="text-xs text-slate-500">{e.duration}</p>
                      )}
                    </li>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">None detected.</p>
                )}
              </ul>
            </Card>

            <Card>
              <SectionTitle>Education</SectionTitle>
              <ul className="mt-4 space-y-4">
                {cv?.education?.length ? (
                  cv.education.map((e, i) => (
                    <li key={i} className="text-sm">
                      <p className="font-medium">
                        {[e.degree, e.field].filter(Boolean).join(" in ") ||
                          "Education"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[e.institution, e.graduation_year]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">None detected.</p>
                )}
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* Existing candidates */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Or use an existing candidate</h2>
        {existing === null ? (
          <p className="text-sm text-slate-500">Loading candidates…</p>
        ) : existing.length === 0 ? (
          <EmptyState
            icon="users"
            title="No candidates yet"
            description="Candidates you upload will appear here so you can reuse them without uploading again."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {existing.map((c) => {
              const active = session.candidate?.candidateId === c.candidate_id;
              return (
                <div
                  key={c.candidate_id}
                  className={cx(
                    "flex items-center justify-between gap-4 rounded-xl border p-4",
                    active
                      ? "border-violet-500/40 bg-violet-500/[0.06]"
                      : "border-white/10 bg-[#0d111d]/90"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {c.years_of_experience} yrs · {c.skills.length} skills
                      {c.resume_file ? ` · ${c.resume_file}` : ""}
                    </p>
                  </div>
                  {active ? (
                    <Badge tone="violet">Selected</Badge>
                  ) : (
                    <Button variant="secondary" onClick={() => chooseExisting(c)}>
                      Use
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right text-slate-200">{value || "—"}</dd>
    </div>
  );
}
