"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, FlaskConical, Settings, Send, Image as ImageIcon, X, ChevronDown, PanelLeft, Plus, Square, Trash2, Target } from "lucide-react";
import { cn, nid } from "@/lib/utils";

type Tab = "chat" | "labs" | "settings";
type ReasoningLevel = "off" | "low" | "medium" | "high";
interface Msg { id: string; role: "user" | "assistant" | "thought"; content: string; }
interface Session { id: string; title: string; model: string; reasoning: ReasoningLevel; contextTokens: number; messages: Msg[]; createdAt: number; updatedAt: number; }

const MODELS: { id: string; label: string; free?: boolean; ctx: number }[] = [
  { id: "stealth/union-alpha", label: "Union Alpha", free: true, ctx: 262144 },
  { id: "inclusionai/ling-3.0-flash-vl:free", label: "Ling 3.0 Flash VL", free: true, ctx: 262144 },
  { id: "inclusionai/ling-3.0-flash-sante:free", label: "Ling 3.0 Flash Sante", free: true, ctx: 262144 },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", free: true, ctx: 1000000 },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra", free: true, ctx: 1000000 },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super", free: true, ctx: 262144 },
  { id: "z-ai/glm-5.2:free", label: "GLM 5.2", free: true, ctx: 131072 },
  { id: "nex-agi/nex-n2.5-pro:free", label: "Nex N2.5 Pro", free: true, ctx: 262144 },
  { id: "nex-agi/nex-n2.5-mini:free", label: "Nex N2.5 Mini", free: true, ctx: 262144 },
  { id: "moonshotai/kimi-k2:free", label: "Kimi K2", free: true, ctx: 262144 },
  { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B", free: true, ctx: 262144 },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", free: true, ctx: 262144 },
  { id: "thinkingmachines/inkling:free", label: "Inkling", free: true, ctx: 1000000 },
  { id: "thinkingmachines/inkling-small:free", label: "Inkling Small", free: true, ctx: 1000000 },
  { id: "poolside/laguna-s-2.1:free", label: "Laguna S 2.1", free: true, ctx: 262144 },
  { id: "openrouter/free", label: "OR free router", free: true, ctx: 200000 },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", ctx: 128000 },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", ctx: 200000 },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", ctx: 1000000 },
  { id: "x-ai/grok-4.5", label: "Grok 4.5", ctx: 256000 },
];
const REASONING: { id: ReasoningLevel; label: string }[] = [
  { id: "off", label: "Off" }, { id: "low", label: "Low" }, { id: "medium", label: "Med" }, { id: "high", label: "High" },
];
const DEPTHS = ["pulse","surface","probe","depth","shadow","abyss","rift","core"] as const;
const LS = { key: "umbra.pro.openrouter", defaults: "umbra.pro.defaults", sessions: "umbra.pro.sessions", active: "umbra.pro.activeSession", bg: "umbra.pro.bg", bgOpacity: "umbra.pro.bgOpacity", sidebar: "umbra.pro.sidebar" };

function meta(id: string) { return MODELS.find((m) => m.id === id) || MODELS[0]; }
function fmtCtx(n: number) { return n >= 1e6 ? `${(n/1e6).toFixed(n%1e6?1:0)}M` : n >= 1000 ? `${Math.round(n/1000)}K` : String(n); }

function Logo({ active }: { active: boolean }) {
  return (
    <div className="relative flex size-7 items-center justify-center rounded-full border border-white/15 bg-black">
      <span className={cn("font-mono text-[9px] font-semibold tracking-widest", active ? "text-white" : "text-white/70")}>UP</span>
      {active && <><span className="absolute inset-0 animate-ping rounded-full bg-white/20" /><span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400" /></>}
    </div>
  );
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [key, setKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("stealth/union-alpha");
  const [defaultReasoning, setDefaultReasoning] = useState<ReasoningLevel>("medium");
  const [defaultCtx, setDefaultCtx] = useState(32000);
  const [bg, setBg] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(0.3);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelMenu, setModelMenu] = useState(false);
  const [labTarget, setLabTarget] = useState("https://example.com");
  const [labDepth, setLabDepth] = useState("surface");
  const [labBusy, setLabBusy] = useState(false);
  const [labLog, setLabLog] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const active = sessions.find((s) => s.id === activeId) || null;

  useEffect(() => {
    try {
      setKey(localStorage.getItem(LS.key) || "");
      const d = localStorage.getItem(LS.defaults);
      if (d) { const j = JSON.parse(d); if (j.model) setDefaultModel(j.model); if (j.reasoning) setDefaultReasoning(j.reasoning); if (j.ctx) setDefaultCtx(j.ctx); }
      setBg(localStorage.getItem(LS.bg));
      const op = localStorage.getItem(LS.bgOpacity); if (op) setBgOpacity(Number(op));
      if (localStorage.getItem(LS.sidebar) === "0") setSidebarOpen(false);
      const raw = localStorage.getItem(LS.sessions);
      if (raw) {
        const list = JSON.parse(raw) as Session[];
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
      localStorage.setItem(LS.defaults, JSON.stringify({ model: defaultModel, reasoning: defaultReasoning, ctx: defaultCtx }));
      localStorage.setItem(LS.bgOpacity, String(bgOpacity));
      localStorage.setItem(LS.sidebar, sidebarOpen ? "1" : "0");
      if (bg) localStorage.setItem(LS.bg, bg); else localStorage.removeItem(LS.bg);
      localStorage.setItem(LS.sessions, JSON.stringify(sessions));
      if (activeId) localStorage.setItem(LS.active, activeId);
    } catch { /* quota */ }
  }, [key, defaultModel, defaultReasoning, defaultCtx, bg, bgOpacity, sessions, activeId, sidebarOpen, hydrated]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.messages, busy]);

  function patchActive(patch: Partial<Session>) {
    if (!activeId) return;
    setSessions((prev) => prev.map((s) => (s.id === activeId ? { ...s, ...patch, updatedAt: Date.now() } : s)));
  }

  function newSession() {
    const m = meta(defaultModel);
    const s: Session = { id: nid("s"), title: "New chat", model: defaultModel, reasoning: defaultReasoning, contextTokens: Math.min(defaultCtx, m.ctx), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
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

  async function titleSession(sessionId: string, firstUser: string, apiKey: string) {
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openrouter", model: "z-ai/glm-5.2:free", apiKey, reasoningLevel: "off", messages: [{ role: "user", content: `3-6 word title only, no quotes:\n${firstUser.slice(0, 400)}` }] }) });
      const data = await res.json();
      if (data.ok && data.text) {
        const title = String(data.text).replace(/^["']|["']$/g, "").trim().slice(0, 48);
        if (title) setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s)));
      }
    } catch { /* */ }
  }

  function stop() { abortRef.current?.abort(); abortRef.current = null; setBusy(false); }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!key.trim()) { setError("Add OpenRouter key in Settings"); setTab("settings"); return; }
    let sid = activeId;
    let sess = active;
    if (!sess) {
      const m = meta(defaultModel);
      const s: Session = { id: nid("s"), title: "New chat", model: defaultModel, reasoning: defaultReasoning, contextTokens: Math.min(defaultCtx, m.ctx), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      setSessions((prev) => [s, ...prev]); setActiveId(s.id); sid = s.id; sess = s;
    }
    setError(null); setInput("");
    const userMsg: Msg = { id: nid("m"), role: "user", content: text };
    const isFirst = (sess.messages?.length || 0) === 0;
    const baseMsgs = [...(sess.messages || []), userMsg];
    setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, messages: baseMsgs, updatedAt: Date.now() } : s)));
    setBusy(true);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal, body: JSON.stringify({ provider: "openrouter", model: sess.model, apiKey: key, reasoningLevel: sess.reasoning, max_tokens: Math.min(4096, Math.floor(sess.contextTokens / 4)), messages: baseMsgs.map((m) => ({ role: m.role === "thought" ? "assistant" : m.role, content: m.content })) }) });
      const data = await res.json();
      const next: Msg[] = [];
      if (!data.ok) next.push({ id: nid("m"), role: "assistant", content: `Error: ${data.error || res.statusText}` });
      else {
        if (data.reasoning && sess.reasoning !== "off") next.push({ id: nid("m"), role: "thought", content: String(data.reasoning) });
        next.push({ id: nid("m"), role: "assistant", content: data.text || "(empty)" });
      }
      setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, messages: [...baseMsgs, ...next], updatedAt: Date.now() } : s)));
      if (isFirst && key) void titleSession(sid!, text, key);
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "⏹ Stopped" : `Network: ${String(e)}`;
      setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, messages: [...baseMsgs, { id: nid("m"), role: "assistant", content: msg }], updatedAt: Date.now() } : s)));
    } finally { setBusy(false); abortRef.current = null; inputRef.current?.focus(); }
  }

  async function runLabs() {
    if (!labTarget.trim()) return;
    setLabBusy(true); setLabLog("Starting recon…\n");
    try {
      const res = await fetch("/api/recon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: labTarget.trim(), depth: labDepth, authorized: true }) });
      const data = await res.json();
      if (!data.ok) setLabLog((p) => p + `Error: ${data.error}\n`);
      else {
        const pack = data.pack || data; const findings = data.findings || [];
        setLabLog([`Target: ${pack.target || labTarget}`, `Depth: ${labDepth}`, `Probes: ${pack.probes?.length ?? "?"}`, `Secrets: ${pack.secrets?.length ?? 0}`, `Header issues: ${pack.headerIssues?.length ?? 0}`, `Findings: ${findings.length}`, "", ...findings.slice(0, 20).map((f: { severity?: string; title?: string }) => `[${f.severity || "?"}] ${f.title || ""}`), "", ...(pack.notes || [])].join("\n"));
      }
    } catch (e) { setLabLog((p) => p + String(e)); }
    finally { setLabBusy(false); }
  }

  const onBgFile = useCallback((file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 4e6) { setError("Image max ~4MB"); return; }
    const r = new FileReader(); r.onload = () => setBg(String(r.result || "")); r.readAsDataURL(file);
  }, []);

  if (!hydrated) return <div className="flex min-h-[100dvh] items-center justify-center bg-black"><Logo active /></div>;
  const maxCtx = active ? meta(active.model).ctx : meta(defaultModel).ctx;

  return (
    <div className="relative flex min-h-[100dvh] bg-black text-white">
      {bg && <div className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: `url(${bg})`, opacity: bgOpacity }} />}
      <div className="pointer-events-none fixed inset-0 z-0 bg-black/75" />
      <aside className="relative z-30 flex w-12 shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-black/90 py-2">
        <Logo active={busy || labBusy} />
        <button type="button" onClick={() => setSidebarOpen((v) => !v)} className={cn("mt-2 flex size-10 items-center justify-center rounded-lg", sidebarOpen ? "bg-white/10" : "text-white/40")}><PanelLeft className="size-4" /></button>
        {([["chat", MessageSquare], ["labs", FlaskConical], ["settings", Settings]] as const).map(([id, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={cn("flex size-10 items-center justify-center rounded-lg", tab === id ? "bg-white/10" : "text-white/40")}><Icon className="size-4" /></button>
        ))}
        <button type="button" onClick={newSession} className="mt-auto mb-2 flex size-10 items-center justify-center rounded-lg text-white/50"><Plus className="size-4" /></button>
      </aside>
      {sidebarOpen && tab === "chat" && (
        <div className="relative z-20 flex w-[min(42vw,180px)] shrink-0 flex-col border-r border-white/10 bg-black/85">
          <div className="flex items-center justify-between border-b border-white/10 px-2 py-2">
            <span className="text-[10px] uppercase tracking-wider text-white/40">Chats</span>
            <button type="button" onClick={newSession} className="p-1 text-white/50"><Plus className="size-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 && <p className="px-2 py-4 text-center text-[11px] text-white/30">No sessions</p>}
            {sessions.map((s) => (
              <div key={s.id} className={cn("flex items-center gap-1 border-b border-white/5 px-2 py-2", s.id === activeId ? "bg-white/10" : "")}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setActiveId(s.id); setTab("chat"); }}>
                  <div className="truncate text-xs">{s.title}</div>
                  <div className="truncate text-[10px] text-white/35">{meta(s.model).label}</div>
                </button>
                <button type="button" className="p-1 text-white/25" onClick={() => deleteSession(s.id)}><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        {tab === "chat" && (
          <header className="relative z-20 border-b border-white/10 bg-black/60 px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setModelMenu((v) => !v)} className="flex max-w-[50%] items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs">
                <span className="truncate">{active ? meta(active.model).label : meta(defaultModel).label}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </button>
              <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
                {REASONING.map((r) => (
                  <button key={r.id} type="button" onClick={() => active && patchActive({ reasoning: r.id })} className={cn("rounded-md px-1.5 py-1 text-[10px]", (active?.reasoning || defaultReasoning) === r.id ? "bg-white/15" : "text-white/40")}>{r.label}</button>
                ))}
              </div>
              {busy && <button type="button" onClick={stop} className="ml-auto flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-950/40 px-2 py-1.5 text-[11px] text-red-200"><Square className="size-3 fill-current" />Stop</button>}
            </div>
            {modelMenu && (
              <div className="absolute left-2 right-2 top-full z-40 mt-1 max-h-[45vh] overflow-y-auto rounded-xl border border-white/15 bg-black shadow-xl">
                {MODELS.map((m) => (
                  <button key={m.id} type="button" className={cn("flex w-full items-center justify-between px-3 py-2.5 text-left text-xs", active?.model === m.id && "bg-white/10")} onClick={() => { if (active) patchActive({ model: m.id, contextTokens: Math.min(active.contextTokens, m.ctx) }); setModelMenu(false); }}>
                    <span>{m.label}{m.free ? " · free" : ""}</span>
                    <span className="text-white/35">{fmtCtx(m.ctx)}</span>
                  </button>
                ))}
              </div>
            )}
          </header>
        )}
        {error && <div className="mx-2 mt-2 rounded-lg border border-red-500/30 bg-red-950/50 px-2 py-1.5 text-[11px] text-red-200">{error} <button type="button" className="underline" onClick={() => setError(null)}>ok</button></div>}
        {tab === "settings" && (
          <div className="flex-1 overflow-y-auto px-3 py-4 text-sm">
            <h1 className="mb-3 text-sm font-medium">Defaults & keys</h1>
            <label className="mb-1 block text-[10px] uppercase text-white/40">OpenRouter key</label>
            <input type="password" className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-or-v1-…" />
            <label className="mb-1 block text-[10px] uppercase text-white/40">Default model (new chats)</label>
            <select className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2.5 text-xs" value={defaultModel} onChange={(e) => { setDefaultModel(e.target.value); setDefaultCtx((c) => Math.min(c, meta(e.target.value).ctx)); }}>
              {MODELS.map((m) => <option key={m.id} value={m.id} className="bg-black">{m.label} ({fmtCtx(m.ctx)})</option>)}
            </select>
            <label className="mb-1 block text-[10px] uppercase text-white/40">Default context (max {fmtCtx(meta(defaultModel).ctx)})</label>
            <input type="range" min={2048} max={meta(defaultModel).ctx} step={1024} value={Math.min(defaultCtx, meta(defaultModel).ctx)} onChange={(e) => setDefaultCtx(Number(e.target.value))} className="mb-1 w-full accent-white" />
            <div className="mb-3 text-[11px] text-white/50">{fmtCtx(defaultCtx)}</div>
            <label className="mb-1 block text-[10px] uppercase text-white/40">Default reasoning</label>
            <div className="mb-3 grid grid-cols-4 gap-1">
              {REASONING.map((r) => <button key={r.id} type="button" onClick={() => setDefaultReasoning(r.id)} className={cn("rounded-lg border py-2 text-[11px]", defaultReasoning === r.id ? "border-white/30 bg-white/15" : "border-white/10 text-white/50")}>{r.label}</button>)}
            </div>
            {active && (
              <div className="mb-3 rounded-lg border border-white/10 p-2">
                <div className="text-[10px] uppercase text-white/40">This session context · {fmtCtx(active.contextTokens)} / {fmtCtx(maxCtx)}</div>
                <input type="range" min={2048} max={maxCtx} step={1024} value={Math.min(active.contextTokens, maxCtx)} onChange={(e) => patchActive({ contextTokens: Number(e.target.value) })} className="mt-1 w-full accent-white" />
              </div>
            )}
            <label className="mb-1 block text-[10px] uppercase text-white/40">Background</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs"><ImageIcon className="size-3.5" />Upload</button>
              {bg && <button type="button" onClick={() => setBg(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs"><X className="inline size-3.5" />Clear</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onBgFile(e.target.files?.[0] || null)} />
            {bg && <input type="range" min={0.05} max={0.7} step={0.05} value={bgOpacity} onChange={(e) => setBgOpacity(Number(e.target.value))} className="mt-2 w-full accent-white" />}
            <p className="mt-6 text-[10px] text-white/30">Fire HD ~800×1280 · sessions local · GLM-5.2 titles chats</p>
          </div>
        )}
        {tab === "labs" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="space-y-2 border-b border-white/10 p-3">
              <div className="flex items-center gap-2 text-xs text-white/70"><Target className="size-4" />Authorized recon</div>
              <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs" value={labTarget} onChange={(e) => setLabTarget(e.target.value)} placeholder="https://target.example" />
              <div className="flex flex-wrap gap-1">
                {DEPTHS.map((d) => <button key={d} type="button" onClick={() => setLabDepth(d)} className={cn("rounded-md border px-2 py-1 text-[10px]", labDepth === d ? "border-white/30 bg-white/15" : "border-white/10 text-white/40")}>{d}</button>)}
              </div>
              <button type="button" disabled={labBusy} onClick={() => void runLabs()} className="w-full rounded-lg bg-white py-2.5 text-xs font-medium text-black disabled:opacity-40">{labBusy ? "Running…" : "Run recon"}</button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] text-white/70">{labLog || "Only scan targets you are authorized to test."}</pre>
          </div>
        )}
        {tab === "chat" && (
          <>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 py-3" onClick={() => setModelMenu(false)}>
              {(!active || active.messages.length === 0) && !busy && (
                <div className="mt-12 text-center text-xs text-white/35"><div className="flex justify-center"><Logo active={false} /></div><p className="mt-3">New session · saved locally</p></div>
              )}
              {active?.messages.map((m) => (
                <div key={m.id} className={cn("mx-auto max-w-2xl", m.role === "user" && "flex justify-end", m.role === "thought" && "opacity-55")}>
                  {m.role === "thought" && <div className="mb-0.5 text-[9px] uppercase tracking-wider text-white/30">reasoning</div>}
                  <div className={cn("inline-block max-w-[94%] rounded-2xl px-3 py-2 text-left text-[14px] leading-snug", m.role === "user" ? "bg-white text-black" : m.role === "thought" ? "border border-white/10 bg-white/5 text-white/65" : "border border-white/10 bg-white/[0.07]")}>
                    <pre className="whitespace-pre-wrap break-words font-sans">{m.content}</pre>
                  </div>
                </div>
              ))}
              {busy && <div className="mx-auto max-w-2xl"><div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"><Logo active /><span className="text-[11px] text-white/45">thinking…</span></div></div>}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-white/10 bg-black/80 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
              <div className="mx-auto flex max-w-2xl items-end gap-1.5">
                <input ref={inputRef} className="min-h-[44px] flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-[14px] outline-none placeholder:text-white/25" placeholder="Message…" value={input} disabled={busy} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
                {busy ? (
                  <button type="button" onClick={stop} className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/40 bg-red-950/50 text-red-200"><Square className="size-4 fill-current" /></button>
                ) : (
                  <button type="button" disabled={!input.trim()} onClick={() => void send()} className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-black disabled:opacity-30"><Send className="size-4" /></button>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
