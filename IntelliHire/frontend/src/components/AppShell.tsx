"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  done?: boolean;
};

function useBackendStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">(
    "checking"
  );

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await api.health();
        if (!cancelled) setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };

    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return status;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const backend = useBackendStatus();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  const workflow: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "grid" },
    { href: "/upload", label: "Upload CV", icon: "upload", done: !!session.candidate },
    { href: "/jobs", label: "Job", icon: "briefcase", done: !!session.job },
    { href: "/match", label: "Match & Skill Gap", icon: "target", done: !!session.match },
    { href: "/interview", label: "Interview", icon: "mic", done: !!session.evaluation },
    { href: "/decision", label: "Final Decision", icon: "award", done: !!session.decision },
  ];

  const tools: NavItem[] = [
    { href: "/recruiter", label: "Recruiter Ranking", icon: "users" },
    { href: "/assistant", label: "AI Assistant", icon: "chat" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const renderItem = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={isActive(item.href) ? "page" : undefined}
      className={cx(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
        isActive(item.href)
          ? "bg-violet-500/12 text-white ring-1 ring-violet-500/25"
          : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
      )}
    >
      <Icon
        name={item.icon}
        size={18}
        className={isActive(item.href) ? "text-violet-300" : "text-slate-500"}
      />
      <span className="flex-1">{item.label}</span>
      {item.done && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <Icon name="check" size={12} />
        </span>
      )}
    </Link>
  );

  const sidebar = (
    <div className="flex h-full flex-col p-5">
      <Link href="/" className="mb-8 flex items-center gap-3 px-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
          <Icon name="sparkle" size={20} className="text-white" />
        </div>
        <div>
          <p className="text-base font-semibold leading-tight">IntelliHire</p>
          <p className="text-[11px] text-slate-500">AI Recruitment Platform</p>
        </div>
      </Link>

      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Hiring workflow
      </p>
      <nav className="space-y-1">{workflow.map(renderItem)}</nav>

      <p className="mb-2 mt-7 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Tools
      </p>
      <nav className="space-y-1">{tools.map(renderItem)}</nav>

      <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Current selection
        </p>
        <p className="mt-2 truncate text-sm text-slate-200">
          {session.candidate?.name ?? "No candidate"}
        </p>
        <p className="truncate text-xs text-slate-500">
          {session.job?.title ?? "No job selected"}
        </p>
        {(session.candidate || session.job) && (
          <button
            onClick={session.resetAll}
            className="mt-3 text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          >
            Clear selection
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[#070a12] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[480px] w-[480px] rounded-full bg-indigo-600/10 blur-[120px]" />
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 bg-[#090c15]/95 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/10 bg-[#090c15]">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="relative z-10 flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-[#080b14]/85 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Open menu"
            >
              <Icon name="menu" size={22} />
            </button>
            <p className="text-sm font-medium text-slate-300 lg:hidden">
              IntelliHire
            </p>
          </div>

          <div className="flex items-center gap-3">
            {session.candidate && (
              <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-sm text-slate-300 sm:flex">
                <Icon name="file" size={14} className="text-violet-300" />
                <span className="max-w-[180px] truncate">
                  {session.candidate.name}
                </span>
              </div>
            )}
            <div
              className={cx(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                backend === "online" &&
                  "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
                backend === "offline" &&
                  "border-red-500/25 bg-red-500/10 text-red-300",
                backend === "checking" &&
                  "border-white/10 bg-white/[0.03] text-slate-400"
              )}
              title="Status of the FastAPI backend"
            >
              <span
                className={cx(
                  "h-2 w-2 rounded-full",
                  backend === "online" && "bg-emerald-400",
                  backend === "offline" && "bg-red-400",
                  backend === "checking" && "animate-pulse bg-slate-500"
                )}
              />
              {backend === "online"
                ? "Backend online"
                : backend === "offline"
                ? "Backend offline"
                : "Connecting…"}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
