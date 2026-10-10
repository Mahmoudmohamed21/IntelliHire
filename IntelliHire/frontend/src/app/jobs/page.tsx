"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { api, errorMessage, type Job } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  SkillChips,
  TagInput,
  cx,
  inputClass,
} from "@/components/ui";

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Remote"];

export default function JobsPage() {
  const router = useRouter();
  const session = useSession();

  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [education, setEducation] = useState("");
  const [minExperience, setMinExperience] = useState("0");
  const [skills, setSkills] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listJobs();
      setJobs(data.jobs);
    } catch (err) {
      setJobs([]);
      setError(errorMessage(err, "Could not load jobs."));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choose = (job: Job, goNext = false) => {
    session.selectJob({ jobId: job.job_id, title: job.title });
    if (goNext) router.push("/match");
  };

  const create = async () => {
    setError("");

    if (!title.trim()) return setError("Please enter a job title.");
    if (!skills.length) {
      return setError(
        "Add at least one required skill - skill matching and the skill-gap analysis depend on it."
      );
    }

    const years = Number.parseInt(minExperience, 10);
    if (Number.isNaN(years) || years < 0) {
      return setError("Minimum experience must be 0 or more years.");
    }

    setSaving(true);
    try {
      const created = await api.createJob({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        employment_type: employmentType || undefined,
        required_education: education.trim() || undefined,
        minimum_experience: years,
        skills,
      });

      session.selectJob({ jobId: created.job_id, title: created.title });

      setTitle("");
      setDescription("");
      setLocation("");
      setEmploymentType("");
      setEducation("");
      setMinExperience("0");
      setSkills([]);

      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Could not create the job."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Step 2"
        title="Choose or create a job"
        description="The job's required skills and minimum experience drive the match score, skill-gap analysis and interview questions."
        actions={
          session.job && (
            <Button onClick={() => router.push("/match")}>
              Next: analyze match
              <Icon name="arrow" size={16} />
            </Button>
          )
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Create form */}
        <Card className="lg:col-span-3">
          <h2 className="text-lg font-semibold">New job</h2>

          <div className="mt-5 space-y-5">
            <Field label="Job title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Data Analyst"
                className={inputClass}
              />
            </Field>

            <Field label="Required skills" hint="Press Enter or comma to add">
              <TagInput
                value={skills}
                onChange={setSkills}
                placeholder="Python, SQL, Power BI…"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="Responsibilities, requirements, team context…"
                className={cx(inputClass, "resize-y leading-6")}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Minimum experience (years)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={minExperience}
                  onChange={(e) => setMinExperience(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Employment type">
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className={inputClass}
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
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Cairo, Egypt"
                  className={inputClass}
                />
              </Field>
              <Field label="Required education">
                <input
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  placeholder="e.g. BSc Computer Science"
                  className={inputClass}
                />
              </Field>
            </div>

            <Button onClick={create} loading={saving} className="w-full">
              {saving ? "Saving job…" : "Create job & select it"}
            </Button>
          </div>
        </Card>

        {/* Existing jobs */}
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-lg font-semibold">Existing jobs</h2>

          {jobs === null ? (
            <p className="text-sm text-slate-500">Loading jobs…</p>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon="briefcase"
              title="No jobs yet"
              description="Create your first job using the form."
            />
          ) : (
            jobs.map((job) => {
              const active = session.job?.jobId === job.job_id;
              return (
                <div
                  key={job.job_id}
                  className={cx(
                    "rounded-2xl border p-5 transition",
                    active
                      ? "border-violet-500/40 bg-violet-500/[0.06]"
                      : "border-white/10 bg-[#0d111d]/90"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{job.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {[
                          job.location,
                          job.employment_type,
                          `${job.minimum_experience}+ yrs`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {active && <Badge tone="violet">Selected</Badge>}
                  </div>

                  <div className="mt-4">
                    <SkillChips
                      skills={job.skills}
                      tone="slate"
                      empty="No required skills saved for this job."
                    />
                  </div>

                  <div className="mt-4 flex gap-2">
                    {!active && (
                      <Button variant="secondary" onClick={() => choose(job)}>
                        Select
                      </Button>
                    )}
                    <Button
                      variant={active ? "primary" : "ghost"}
                      onClick={() => choose(job, true)}
                    >
                      Analyze match
                      <Icon name="arrow" size={14} />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
