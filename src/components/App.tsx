"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  FlaskConical,
  Settings,
  Send,
  Loader2,
  Image as ImageIcon,
  X,
  ChevronDown,
} from "lucide-react";
import { cn, nid } from "@/lib/utils";

type Tab = "chat" | "labs" | "settings";
type ReasoningLevel = "off" | "low" | "medium" | "high";

interface Msg {
  id: string;
  role: "user" | "assistant" | "thought";
  content: string;
}

const MODELS: { id: string; label: string; free?: boolean }[] = [
  { id: "stealth/union-alpha", label: "Union Alpha (stealth)", free: true },
  { id: "inclusionai/ling-3.0-flash-vl:free", label: "Ling 3.0 Flash VL", free: true },
  { id: "inclusionai/ling-3.0-flash-sante:free", label: "Ling 3.0 Flash Sante", free: true },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", free: true },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra", free: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super", free: true },
  { id: "z-ai/glm-5.2:free", label: "GLM 5.2", free: true },
  { id: "nex-agi/nex-n2.5-pro:free", label: "Nex N2.5 Pro", free: true },
  { id: "nex-agi/nex-n2.5-mini:free", label: "Nex N2.5 Mini", free: true },
  { id: "moonshotai/kimi-k2:free", label: "Kimi K2", free: true },
  { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B", free: true },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", free: true },
  { id: "thinkingmachines/inkling:free", label: "Inkling", free: true },
  { id: "thinkingmachines/inkling-small:free", label: "Inkling Small", free: true },
  { id: "poolside/laguna-s-2.1:free", label: "Laguna S 2.1", free: true },
  { id: "openrouter/free", label: "OpenRouter free router", free: true },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (OR)" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 (OR)" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (OR)" },
  { id: "x-ai/grok-4.5", label: "Grok 4.5 (OR)" },
];

const REASONING: { id: ReasoningLevel; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

const LS = {
  key: "umbra.pro.openrouter",
  model: "umbra.pro.model",
  reasoning: "umbra.pro.reasoning",
  bg: "umbra.pro.bg",
  bgOpacity: "umbra.pro.bgOpacity",
};

function ActiveLogo({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div
        className={cn(
          "relative flex size-7 items-center justify-center rounded-full border border-white/15 bg-black",
          active && "border-white/40",
        )}
      >
        <span
          className={cn(
            "font-mono text-[9px] font-semibold tracking-widest text-white/70",
            active && "text-white",
          )}
        >
          UP
        </span>
        {active && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          </>
        )}
      </div>
      {active && (
        <span className="flex items-center gap-1.5 text-[11px] text-white/50">
          <Loader2 className="size-3 animate-spin" />
          thinking
        </span>
      )}
    </div>
  );
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("stealth/union-alpha");
  const [reasoning, setReasoning] = useState<ReasoningLevel>("medium");
  const [bg, setBg] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(0.35);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setKey(localStorage.getItem(LS.key) || "");
      setModel(localStorage.getItem(LS.model) || "stealth/union-alpha");
      setReasoning((localStorage.getItem(LS.reasoning) as ReasoningLevel) || "medium");
      setBg(localStorage.getItem(LS.bg));
      const op = localStorage.getItem(LS.bgOpacity);
      if (op) setBgOpacity(Number(op));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS.key, key);
      localStorage.setItem(LS.model, model);
      localStorage.setItem(LS.reasoning, reasoning);
      localStorage.setItem(LS.bgOpacity, String(bgOpacity));
      if (bg) localStorage.setItem(LS.bg, bg);
      else localStorage.removeItem(LS.bg);
    } catch {
      /* quota */
    }
  }, [key, model, reasoning, bg, bgOpacity, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const onBgFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick an image file");
      return;
    }
    if (file.size > 4_500_000) {
      setError("Image too large (max ~4.5MB for localStorage)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBg(String(reader.result || ""));
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!key.trim()) {
      setError("Add your OpenRouter key in Settings");
      setTab("settings");
      return;
    }
    setError(null);
    setInput("");
    const userMsg: Msg = { id: nid("m"), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "openrouter",
          model,
          apiKey: key,
          reasoningLevel: reasoning,
          messages: [...messages, userMsg].map((m) => ({
            role: m.role === "thought" ? "assistant" : m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessages((prev) => [
          ...prev,
          { id: nid("m"), role: "assistant", content: `Error: ${data.error || res.statusText}` },
        ]);
      } else {
        const next: Msg[] = [];
        if (data.reasoning && reasoning !== "off") {
          next.push({ id: nid("m"), role: "thought", content: String(data.reasoning) });
        }
        next.push({ id: nid("m"), role: "assistant", content: data.text || "(empty reply)" });
        setMessages((prev) => [...prev, ...next]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: nid("m"), role: "assistant", content: `Network error: ${String(e)}` },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black text-white/40">
        <ActiveLogo active />
      </div>
    );
  }

  const modelLabel = MODELS.find((m) => m.id === model)?.label || model;

  return (
    <div className="relative flex min-h-[100dvh] bg-black text-white">
      {bg ? (
        <div
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bg})`, opacity: bgOpacity }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 z-0 bg-black" />
      )}
      <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />

      <aside className="relative z-20 flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-black/80 py-3 backdrop-blur-md sm:w-16">
        <ActiveLogo active={busy} />
        <div className="mt-3 flex flex-col gap-1">
          {(
            [
              ["chat", MessageSquare],
              ["labs", FlaskConical],
              ["settings", Settings],
            ] as const
          ).map(([id, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex size-11 items-center justify-center rounded-xl transition-colors sm:size-12",
                tab === id ? "bg-white/10 text-white" : "text-white/40 active:bg-white/5",
              )}
              aria-label={id}
            >
              <Icon className="size-5" />
            </button>
          ))}
        </div>
      </aside>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/50 px-3 py-2.5 backdrop-blur-md sm:px-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] tracking-[0.2em] text-white/50">UMBRA PRO</div>
            <div className="truncate text-xs text-white/70">{modelLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/40 sm:inline">
              reason: {reasoning}
            </span>
            {busy && <Loader2 className="size-4 animate-spin text-white/60" />}
          </div>
        </header>

        {error && (
          <div className="mx-3 mt-2 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-xs text-red-200 sm:mx-4">
            {error}
            <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
              dismiss
            </button>
          </div>
        )}

        {tab === "settings" && (
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <h1 className="mb-4 text-base font-medium text-white">Settings</h1>

            <section className="mb-6 space-y-2">
              <label className="block text-[11px] uppercase tracking-wider text-white/40">
                OpenRouter API key
              </label>
              <input
                type="password"
                autoComplete="off"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 font-mono text-sm text-white outline-none focus:border-white/25"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-or-v1-…"
              />
              <p className="text-[11px] text-white/35">Stored only in this browser.</p>
            </section>

            <section className="mb-6 space-y-2">
              <label className="block text-[11px] uppercase tracking-wider text-white/40">Model</label>
              <div className="relative">
                <select
                  className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-3 py-3 pr-10 text-sm text-white outline-none focus:border-white/25"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <optgroup label="Free">
                    {MODELS.filter((m) => m.free).map((m) => (
                      <option key={m.id} value={m.id} className="bg-black text-white">
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="OpenRouter (paid routes)">
                    {MODELS.filter((m) => !m.free).map((m) => (
                      <option key={m.id} value={m.id} className="bg-black text-white">
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              </div>
            </section>

            <section className="mb-6 space-y-2">
              <label className="block text-[11px] uppercase tracking-wider text-white/40">
                Reasoning level
              </label>
              <div className="grid grid-cols-4 gap-2">
                {REASONING.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReasoning(r.id)}
                    className={cn(
                      "rounded-xl border py-2.5 text-xs transition-colors",
                      reasoning === r.id
                        ? "border-white/30 bg-white/15 text-white"
                        : "border-white/10 bg-white/5 text-white/50 active:bg-white/10",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-white/35">
                Higher levels ask the model to think step-by-step. Shown as a dim thought bubble when available.
              </p>
            </section>

            <section className="mb-6 space-y-3">
              <label className="block text-[11px] uppercase tracking-wider text-white/40">
                Background image
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/80 active:bg-white/10"
                >
                  <ImageIcon className="size-4" />
                  Upload
                </button>
                {bg && (
                  <button
                    type="button"
                    onClick={() => setBg(null)}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/60"
                  >
                    <X className="size-4" />
                    Clear
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onBgFile(e.target.files?.[0] || null)}
              />
              {bg && (
                <div className="space-y-2">
                  <label className="block text-[11px] text-white/40">
                    Opacity: {Math.round(bgOpacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.05}
                    max={0.85}
                    step={0.05}
                    value={bgOpacity}
                    onChange={(e) => setBgOpacity(Number(e.target.value))}
                    className="w-full accent-white"
                  />
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "labs" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <FlaskConical className="size-10 text-white/30" />
            <h2 className="text-base font-medium text-white/80">Labs</h2>
            <p className="max-w-sm text-sm text-white/40">
              Recon + JB red-team lab is next. Chat, models, reasoning, and background are live now.
            </p>
          </div>
        )}

        {tab === "chat" && (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
              {messages.length === 0 && !busy && (
                <div className="mx-auto mt-16 max-w-sm text-center">
                  <div className="flex justify-center">
                    <ActiveLogo active={false} />
                  </div>
                  <p className="mt-4 text-sm text-white/40">Minimal black workspace. Keys stay local.</p>
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "mx-auto max-w-2xl",
                    m.role === "user" && "flex justify-end",
                    m.role === "thought" && "opacity-60",
                  )}
                >
                  {m.role === "thought" && (
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">reasoning</div>
                  )}
                  <div
                    className={cn(
                      "inline-block max-w-[92%] rounded-2xl px-3.5 py-2.5 text-left text-[15px] leading-relaxed sm:max-w-[85%]",
                      m.role === "user"
                        ? "bg-white text-black"
                        : m.role === "thought"
                          ? "border border-white/10 bg-white/5 text-white/70"
                          : "border border-white/10 bg-white/[0.08] text-white",
                    )}
                  >
                    <pre className="whitespace-pre-wrap break-words font-sans">{m.content}</pre>
                  </div>
                </div>
              ))}
              {busy && (
                <div className="mx-auto max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5">
                    <ActiveLogo active />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-white/10 bg-black/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md sm:px-4">
              <div className="mx-auto flex max-w-2xl items-end gap-2">
                <input
                  ref={inputRef}
                  className="min-h-[48px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[15px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                  placeholder="Message UMBRA…"
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !input.trim()}
                  onClick={() => void send()}
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-black disabled:opacity-30"
                  aria-label="Send"
                >
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
