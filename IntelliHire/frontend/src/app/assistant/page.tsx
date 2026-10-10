"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Icon } from "@/components/icons";
import { PageHeader, RequireSetup, cx } from "@/components/ui";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: { score: number; text: string }[];
  isError?: boolean;
};

const SUGGESTIONS = [
  "What are my strongest skills?",
  "Summarize my professional experience.",
  "What skills should I improve?",
  "What type of jobs fit my experience?",
];

export default function AssistantPage() {
  return (
    <div className="fade-up">
      <PageHeader
        eyebrow="Tools"
        title="AI assistant"
        description="Ask questions about the selected candidate's CV. Answers are generated from the CV text using retrieval-augmented generation."
      />
      <RequireSetup job={false}>
        <Chat />
      </RequireSetup>
    </div>
  );
}

function Chat() {
  const { candidate } = useSession();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [openSources, setOpenSources] = useState<number | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // A different candidate means a different conversation.
  useEffect(() => {
    setMessages([]);
    setOpenSources(null);
  }, [candidate?.resumeId]);

  if (!candidate) return null;

  if (!candidate.resumeId) {
    return (
      <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
        This candidate has no uploaded resume, so there is nothing to chat about.
        Upload a CV for them first.
      </p>
    );
  }

  const resumeId = candidate.resumeId;

  const push = (message: Omit<Message, "id">) =>
    setMessages((prev) => [...prev, { ...message, id: nextId.current++ }]);

  const send = async (question?: string) => {
    const text = (question ?? input).trim();
    if (!text || loading) return;

    push({ role: "user", content: text });
    setInput("");
    setLoading(true);

    try {
      const data = await api.ask(resumeId, text, 5);
      push({
        role: "assistant",
        content: data.answer || "I couldn't generate an answer. Please try again.",
        sources: data.sources,
      });
    } catch (err) {
      push({
        role: "assistant",
        content: errorMessage(err, "I couldn't reach the AI service."),
        isError: true,
      });
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-[calc(100vh-17rem)] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d111d]/90">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <p className="truncate text-sm text-slate-400">
          Chatting about <span className="text-white">{candidate.name}</span>
          {candidate.fileName ? ` · ${candidate.fileName}` : ""}
        </p>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              setOpenSources(null);
            }}
            className="text-xs text-slate-500 hover:text-white"
          >
            New conversation
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
              <Icon name="sparkle" size={26} />
            </div>
            <h2 className="text-xl font-semibold">Ask anything about this CV</h2>
            <div className="mt-6 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm text-slate-300 transition hover:border-violet-500/30 hover:bg-violet-500/[0.06] hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                {m.role === "assistant" && (
                  <div className="mr-3 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                    <Icon name="sparkle" size={15} className="text-white" />
                  </div>
                )}
                <div className="max-w-[85%]">
                  <div
                    className={cx(
                      "rounded-2xl px-4 py-3 text-sm leading-7",
                      m.role === "user"
                        ? "rounded-br-md bg-violet-600 text-white"
                        : m.isError
                        ? "rounded-bl-md border border-red-500/25 bg-red-500/10 text-red-200"
                        : "rounded-bl-md border border-white/10 bg-[#111522] text-slate-200"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>

                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setOpenSources(openSources === m.id ? null : m.id)}
                        className="text-xs text-slate-500 hover:text-slate-300"
                      >
                        {openSources === m.id ? "Hide" : "Show"} {m.sources.length} CV excerpt
                        {m.sources.length === 1 ? "" : "s"} used
                      </button>
                      {openSources === m.id && (
                        <div className="mt-2 space-y-2">
                          {m.sources.map((s, i) => (
                            <blockquote
                              key={i}
                              className="rounded-lg border-l-2 border-violet-500/40 bg-white/[0.02] px-3 py-2 text-xs leading-5 text-slate-400"
                            >
                              {s.text}
                            </blockquote>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="mr-3 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                  <Icon name="sparkle" size={15} className="text-white" />
                </div>
                <div className="rounded-2xl rounded-bl-md border border-white/10 bg-[#111522] px-5 py-4">
                  <div className="flex items-center gap-1.5" aria-label="Thinking">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-white/10 p-4">
        <div className="mx-auto flex max-w-3xl items-end rounded-2xl border border-white/10 bg-[#080b14] p-2 focus-within:border-violet-500/40">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            rows={1}
            placeholder="Ask about this CV…"
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-slate-600 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="send" size={17} />
          </button>
        </div>
      </form>
    </div>
  );
}
