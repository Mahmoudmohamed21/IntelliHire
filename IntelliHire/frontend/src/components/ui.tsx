"use client";

import {
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Icon } from "./icons";

// ------------------------------------------------------------- helpers

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

export type Tone = "violet" | "green" | "amber" | "red" | "slate";

const TONES: Record<Tone, string> = {
  violet: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  red: "border-red-500/25 bg-red-500/10 text-red-300",
  slate: "border-white/10 bg-white/[0.04] text-slate-300",
};

export function scoreTone(value: number): "green" | "amber" | "red" {
  if (value >= 70) return "green";
  if (value >= 50) return "amber";
  return "red";
}

export function recommendationTone(recommendation: string): Tone {
  const r = recommendation.toLowerCase();
  if (r.includes("strong")) return "green";
  if (r.includes("reject")) return "red";
  if (r.includes("consider")) return "amber";
  if (r.includes("hire")) return "green";
  return "slate";
}

const TONE_HEX: Record<Tone, string> = {
  violet: "#8b5cf6",
  green: "#34d399",
  amber: "#fbbf24",
  red: "#f87171",
  slate: "#94a3b8",
};

export const clampPct = (n: number) =>
  Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;

export const fmt = (n: number, digits = 1) =>
  Number.isFinite(n) ? Number(n.toFixed(digits)).toString() : "0";

// --------------------------------------------------------------- layout

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-white/10 bg-[#0d111d]/90 p-5 sm:p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </h2>
  );
}

// ------------------------------------------------------------ controls

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-40";

const BUTTON_VARIANTS = {
  primary:
    "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/20 hover:from-violet-500 hover:to-indigo-500",
  secondary:
    "border border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]",
  ghost: "text-slate-400 hover:bg-white/[0.05] hover:text-white",
};

export function Button({
  variant = "primary",
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#080b14] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/10";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between text-sm font-medium text-slate-300">
        {label}
        {hint && <span className="text-xs font-normal text-slate-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** Tag input: Enter or comma adds a tag, Backspace removes the last one. */
export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const tags = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .filter(
        (t) => !value.some((existing) => existing.toLowerCase() === t.toLowerCase())
      );
    if (tags.length) onChange([...value, ...tags]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#080b14] p-2 focus-within:border-violet-500/50">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/10 py-1 pl-3 pr-2 text-xs text-violet-200"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded p-0.5 text-violet-300 hover:bg-white/10"
            aria-label={`Remove ${tag}`}
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? "Add another…" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-slate-600"
      />
    </div>
  );
}

// ------------------------------------------------------------- display

export function Badge({
  tone = "slate",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className="inline-block animate-spin rounded-full border-2 border-white/20 border-t-violet-400"
    />
  );
}

export function ProgressBar({
  value,
  tone,
  className,
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = clampPct(value);
  return (
    <div
      className={cx("h-2 overflow-hidden rounded-full bg-white/10", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          background: TONE_HEX[tone ?? scoreTone(pct)],
        }}
      />
    </div>
  );
}

export function ScoreRing({
  value,
  size = 140,
  label,
  tone,
}: {
  value: number;
  size?: number;
  label?: string;
  tone?: Tone;
}) {
  const pct = clampPct(value);
  const stroke = Math.max(8, size / 14);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ?? "Score"}: ${fmt(pct)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONE_HEX[tone ?? scoreTone(pct)]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-semibold tabular-nums"
          style={{ fontSize: size / 3.6 }}
        >
          {fmt(pct, 0)}
          <span className="text-slate-500" style={{ fontSize: size / 7 }}>
            %
          </span>
        </span>
        {label && (
          <span className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export function MetricRow({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-slate-300">
          {label}
          {note && <span className="ml-2 text-xs text-slate-600">{note}</span>}
        </span>
        <span className="font-medium tabular-nums">{fmt(value)}%</span>
      </div>
      <ProgressBar value={value} />
    </div>
  );
}

export function SkillChips({
  skills,
  tone,
  empty,
}: {
  skills: string[];
  tone: Tone;
  empty?: string;
}) {
  if (!skills.length) {
    return <p className="text-sm text-slate-600">{empty ?? "None"}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <Badge key={skill} tone={tone}>
          {tone === "green" && <Icon name="check" size={12} />}
          {skill}
        </Badge>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- states

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200"
    >
      <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-red-300" />
      <p className="flex-1 leading-6">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-red-300 hover:bg-white/10"
          aria-label="Dismiss"
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function LoadingBlock({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-[#0d111d]/90 px-6 py-14 text-center">
      <Spinner size={34} />
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}
