"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, FlaskConical, Settings, Send, PanelLeft, Plus, Square, Trash2 } from "lucide-react";
import { cn, nid } from "@/lib/utils";
import { PERSONAS, personaById } from "@/lib/personas";
import ConnectorsSettings from "@/components/ConnectorsSettings";

type Tab = "chat" | "labs" | "settings";
type ReasoningLevel = "off" | "low" | "medium" | "high";
interface Msg { id: string; role: "user" | "assistant" | "thought"; content: string; }
interface Session {
  id: string; title: string; model: string; persona: string;
  reasoning: ReasoningLevel; contextTokens: number; messages: Msg[];
  createdAt: number; updatedAt: number;
}

const MODELS: { id: string; label: string; free?: boolean; ctx: number }[] = [
  { id: "stealth/union-alpha", label: "Union Alpha", free: true, ctx: 262144 },
  { id: "z-ai/glm-5.2:free", label: "GLM 5.2", free: true, ctx: 131072 },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", free: true, ctx: 1000000 },
  { id: "inclusionai/ling-3.0-flash-vl:free", label: "Ling 3.0 Flash VL", free: true, ctx: 262144 },
  { id: "nex-agi/nex-n2.5-mini:free", label: "Nex N2.5 Mini", free: true, ctx: 262144 },
  { id: "moonshotai/kimi-k2:free", label: "Kimi K2", free: true, ctx: 262144 },
  { id: "openrouter/free", label: "OR free router", free: true, ctx: 200000 },
  { id: "x-ai/grok-4.5", label: "Grok 4.5", ctx: 256000 },
];
const REASONING: { id: ReasoningLevel; label: string }[] = [
  { id: "off", label: "Off" }, { id: "low", label: "Low" }, { id: "medium", label: "Med" }, { id: "high", label: "High" },
];
const LS = {
  key: "umbra.pro.openrouter", defaults: "umbra.pro.defaults", sessions: "umbra.pro.sessions",
  active: "umbra.pro.activeSession", sidebar: "umbra.pro.sidebar",
};
function meta(id: string) { return MODELS.find((m) => m.id === id) || MODELS[0]; }
function fmtCtx(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [key, setKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("stealth/union-alpha");
  const [defaultReasoning, setDefaultReasoning] = useState<ReasoningLevel>("medium");
  const [defaultPersona, setDefaultPersona] = useState("off");
  const [defaultCtx, setDefaultCtx] = useState(32000);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelMenu, setModelMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const active = sessions.find((s) => s.id === activeId) || null;

  useEffect(() => {
    try {
      setKey(localStorage.getItem(LS.key) || "");
      const d = localStorage.getItem(LS.defaults);
      if (d) {
        const j = JSON.parse(d);
        if (j.model) setDefaultModel(j.model);
        if (j.reasoning) setDefaultReasoning(j.reasoning);
        if (j.ctx) setDefaultCtx(j.ctx);
        if (j.persona) setDefaultPersona(j.persona);
      }
      if (localStorage.getItem(LS.sidebar) === "0") setSidebarOpen(false);
      const raw = localStorage.getItem(LS.sessions);
      if (raw) {
        const list = (JSON.parse(raw) as Session[]).map((s) => ({ ...s, persona: s.persona || "off" }));
        setSessions(list);
        const aid = localStorage.getItem(LS.active);
        if (aid && list.some((s) => s.id === aid)) setActiveId(aid);
        else if (list[0]) setActiveId(list[0].id);
      }
    } catch { /* */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS.key, key);
      localStorage.setItem(LS.defaults, JSON.stringify({ model: defaultModel, reasoning: defaultReasoning, ctx: defaultCtx, persona: defaultPersona }));
      localStorage.setItem(LS.sidebar, sidebarOpen ? "1" : "0");
      localStorage.setItem(LS.sessions, JSON.stringify(sessions));
      if (activeId) localStorage.setItem(LS.active, activeId);
    } catch { /* */ }
  }, [key, defaultModel, defaultReasoning, defaultCtx, defaultPersona, sessions, activeId, sidebarOpen, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages, busy]);

  function patchActive(patch: Partial<Session>) {
    if (!activeId) return;
    setSessions((prev) => prev.map((s) => (s.id === activeId ? { ...s, ...patch, updatedAt: Date.now() } : s)));
  }
  function newSession() {
    const m = meta(defaultModel);
    const s: Session = {
      id: nid("s"), title: "New chat", model: defaultModel, persona: defaultPersona,
      reasoning: defaultReasoning, contextTokens: Math.min(defaultCtx, m.ctx), messages: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setTab("chat");
    setModelMenu(false);
  }
  function deleteSession(id: string) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeId === id) setActiveId(next[0]?.id || null);
      return next;
    });
  }
  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!key.trim()) { setError("Add OpenRouter key in Settings"); setTab("settings"); return; }
    let sid = activeId;
    let sess = active;
    if (!sess) {
      const m = meta(defaultModel);
      const s: Session = {
        id: nid("s"), title: text.slice(0, 40), model: defaultModel, persona: defaultPersona,
        reasoning: defaultReasoning, contextTokens: Math.min(defaultCtx, m.ctx), messages: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      setSessions((prev) => [s, ...prev]);
      setActiveId(s.id);
      sid = s.id;
      sess = s;
    }
    setError(null);
    setInput("");
    const userMsg: Msg = { id: nid("m"), role: "user", content: text };
    const baseMsgs = [...(sess.messages || []), userMsg];
    setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, messages: baseMsgs, title: s.title === "New chat" ? text.slice(0, 40) : s.title, updatedAt: Date.now() } : s)));
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          provider: "openrouter",
          model: sess.model,
          apiKey: key,
          reasoningLevel: sess.reasoning,
          enableTools: true,
          githubToken: (typeof localStorage !== "undefined" && localStorage.getItem("umbra.pro.gh")) || "",
          vercelToken: (typeof localStorage !== "undefined" && localStorage.getItem("umbra.pro.vercel")) || "",
          personaSystem: personaById(sess.persona || defaultPersona).system || undefined,
          max_tokens: Math.min(4096, Math.floor(sess.contextTokens / 4)),
          messages: baseMsgs.map((m) => ({ role: m.role === "thought" ? "assistant" : m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const next: Msg[] = [];
      if (!data.ok) next.push({ id: nid("m"), role: "assistant", content: `Error: ${data.error || res.statusText}` });
      else {
        if (data.reasoning && sess.reasoning !== "off") next.push({ id: nid("m"), role: "thought", content: String(data.reasoning) });
        if (data.toolTrace?.length)
          next.push({
            id: nid("m"),
            role: "thought",
            content: "tools:\n" + data.toolTrace.map((x: { name: string; args: string; result: string }) => `${x.name}(${x.args}) → ${String(x.result).slice(0, 400)}`).join("\n"),
          });
        next.push({ id: nid("m"), role: "assistant", content: data.text || "(empty)" });
      }
      setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, messages: [...baseMsgs, ...next], updatedAt: Date.now() } : s)));
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "⏹ Stopped" : `Network: ${String(e)}`;
      setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, messages: [...baseMsgs, { id: nid("m"), role: "assistant", content: msg }], updatedAt: Date.now() } : s)));
    } finally {
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  if (!hydrated) return <div className="flex min-h-[100dvh] items-center justify-center bg-black text-white/50">Loading…</div>;

  return (
    <div className="flex min-h-[100dvh] bg-black text-white">
      {sidebarOpen && (
        <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-black/90">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-xs font-medium tracking-wide">UMBRA</span>
            <button type="button" onClick={newSession} className="rounded p-1 hover:bg-white/10" title="New chat"><Plus className="size-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {sessions.map((s) => (
              <div key={s.id} className={cn("group mb-1 flex items-center rounded-lg px-2 py-1.5 text-xs", s.id === activeId ? "bg-white/10" : "hover:bg-white/5")}>
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { setActiveId(s.id); setTab("chat"); }}>{s.title}</button>
                <button type="button" className="hidden p-0.5 group-hover:block" onClick={() => deleteSession(s.id)}><Trash2 className="size-3 text-white/40" /></button>
              </div>
            ))}
          </div>
        </aside>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-white/10 bg-black/95 px-2 py-2 backdrop-blur">
          <button type="button" onClick={() => setSidebarOpen((o) => !o)} className="rounded p-1.5 hover:bg-white/10"><PanelLeft className="size-4" /></button>
          <button type="button" onClick={() => setTab("chat")} className={cn("rounded-full px-2 py-1 text-[11px]", tab === "chat" ? "bg-white/15" : "text-white/50")}><MessageSquare className="mr-1 inline size-3" />Chat</button>
          <button type="button" onClick={() => setTab("labs")} className={cn("rounded-full px-2 py-1 text-[11px]", tab === "labs" ? "bg-white/15" : "text-white/50")}><FlaskConical className="mr-1 inline size-3" />Labs</button>
          <button type="button" onClick={() => setTab("settings")} className={cn("rounded-full px-2 py-1 text-[11px]", tab === "settings" ? "bg-white/15" : "text-white/50")}><Settings className="mr-1 inline size-3" />Settings</button>
          {tab === "chat" && active && (
            <>
              <div className="relative">
                <button type="button" onClick={() => setModelMenu((m) => !m)} className="rounded-full border border-white/15 px-2 py-1 text-[11px]">{meta(active.model).label}</button>
                {modelMenu && (
                  <div className="absolute left-0 top-full z-30 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-white/15 bg-black p-1 shadow-xl">
                    {MODELS.map((m) => (
                      <button key={m.id} type="button" className="block w-full rounded px-2 py-1.5 text-left text-[11px] hover:bg-white/10" onClick={() => { patchActive({ model: m.id, contextTokens: Math.min(active.contextTokens, m.ctx) }); setModelMenu(false); }}>{m.label} · {fmtCtx(m.ctx)}</button>
                    ))}
                  </div>
                )}
              </div>
              {REASONING.map((r) => (
                <button key={r.id} type="button" onClick={() => patchActive({ reasoning: r.id })} className={cn("rounded-full px-2 py-0.5 text-[10px]", active.reasoning === r.id ? "bg-white/20" : "text-white/40")}>{r.label}</button>
              ))}
              <select className="rounded-full border border-white/15 bg-black px-2 py-1 text-[11px]" value={active.persona} onChange={(e) => patchActive({ persona: e.target.value })}>
                {PERSONAS.map((p) => <option key={p.id} value={p.id} className="bg-black">{p.label}</option>)}
              </select>
            </>
          )}
        </header>
        {error && <div className="bg-red-500/20 px-3 py-1 text-xs text-red-200">{error}</div>}
        {tab === "settings" && (
          <div className="flex-1 overflow-y-auto px-3 py-4 text-sm">
            <h1 className="mb-3 text-sm font-medium">Defaults & keys</h1>
            <label className="mb-1 block text-[10px] uppercase text-white/40">OpenRouter key</label>
            <input type="password" className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-or-v1-…" />
            <ConnectorsSettings />
            <label className="mb-1 block text-[10px] uppercase text-white/40">Default model</label>
            <select className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2.5 text-xs" value={defaultModel} onChange={(e) => { setDefaultModel(e.target.value); setDefaultCtx((c) => Math.min(c, meta(e.target.value).ctx)); }}>
              {MODELS.map((m) => <option key={m.id} value={m.id} className="bg-black">{m.label}</option>)}
            </select>
            <label className="mb-1 block text-[10px] uppercase text-white/40">Default persona</label>
            <select className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2.5 text-xs" value={defaultPersona} onChange={(e) => setDefaultPersona(e.target.value)}>
              {PERSONAS.map((p) => <option key={p.id} value={p.id} className="bg-black">{p.label} — {p.tagline}</option>)}
            </select>
          </div>
        )}
        {tab === "labs" && (
          <div className="flex-1 overflow-y-auto p-4 text-sm text-white/60">
            <p className="mb-2 font-medium text-white/80">Labs</p>
            <p className="text-xs">Labs moved to a separate project. Chat + Connectors are here.</p>
          </div>
        )}
        {tab === "chat" && (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
              {!active?.messages?.length && <p className="text-center text-xs text-white/40">Start a message…</p>}
              {active?.messages?.map((m) => (
                <div key={m.id} className={cn("max-w-[92%] rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-white text-black" : m.role === "thought" ? "border border-white/10 bg-white/5 text-white/50 text-xs" : "bg-white/10 text-white")}>
                  {m.content}
                </div>
              ))}
              {busy && <div className="text-xs text-white/40">Thinking…</div>}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-white/10 p-2">
              <div className="flex items-center gap-2">
                <input ref={inputRef} className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-white/30" placeholder="Message…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
                {busy ? (
                  <button type="button" onClick={stop} className="rounded-full bg-white/10 p-2.5"><Square className="size-4" /></button>
                ) : (
                  <button type="button" onClick={() => void send()} className="rounded-full bg-white p-2.5 text-black"><Send className="size-4" /></button>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
