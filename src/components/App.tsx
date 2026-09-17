"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, FlaskConical, Settings, Send, Image as ImageIcon, ChevronDown, PanelLeft, Plus, Square, Trash2, Target } from "lucide-react";
import { cn, nid } from "@/lib/utils";
import { PERSONAS, personaById } from "@/lib/personas";

type Tab = "chat" | "labs" | "settings";
type ReasoningLevel = "off" | "low" | "medium" | "high";
interface Msg { id: string; role: "user" | "assistant" | "thought"; content: string; }
interface Session { id: string; title: string; model: string; persona: string; reasoning: ReasoningLevel; contextTokens: number; messages: Msg[]; createdAt: number; updatedAt: number; }
interface JbRow { probeId: string; technique: string; score: string; response: string; prompt?: string; }

const MODELS: { id: string; label: string; free?: boolean; ctx: number }[] = [
  { id: "stealth/union-alpha", label: "Union Alpha", free: true, ctx: 262144 },
  { id: "inclusionai/ling-3.0-flash-vl:free", label: "Ling 3.0 Flash VL", free: true, ctx: 262144 },
  { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning", free: true, ctx: 1000000 },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra", free: true, ctx: 1000000 },
  { id: "z-ai/glm-5.2:free", label: "GLM 5.2", free: true, ctx: 131072 },
  { id: "nex-agi/nex-n2.5-pro:free", label: "Nex N2.5 Pro", free: true, ctx: 262144 },
  { id: "nex-agi/nex-n2.5-mini:free", label: "Nex N2.5 Mini", free: true, ctx: 262144 },
  { id: "moonshotai/kimi-k2:free", label: "Kimi K2", free: true, ctx: 262144 },
  { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B", free: true, ctx: 262144 },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", free: true, ctx: 262144 },
  { id: "thinkingmachines/inkling:free", label: "Inkling", free: true, ctx: 1000000 },
  { id: "openrouter/free", label: "OR free router", free: true, ctx: 200000 },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", ctx: 128000 },
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
function JbChart({ results }: { results: { score: string }[] }) {
  const counts = { refused: 0, partial: 0, jailbroken: 0, error: 0 };
  for (const r of results) {
    if (r.score in counts) counts[r.score as keyof typeof counts]++;
  }
  const max = Math.max(1, ...Object.values(counts));
  const colors: Record<string, string> = { refused: "#34d399", partial: "#fbbf24", jailbroken: "#f87171", error: "#6b7280" };
  return (
    <div className="flex h-28 items-end gap-2 px-2 py-3">
      {Object.entries(counts).map(([k, v]) => (
        <div key={k} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] text-white/50">{v}</span>
          <div className="w-full rounded-t" style={{ height: `${(v / max) * 72}px`, background: colors[k], minHeight: v ? 4 : 0 }} />
          <span className="text-[9px] uppercase text-white/40">{k.slice(0, 4)}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [key, setKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("stealth/union-alpha");
  const [defaultReasoning, setDefaultReasoning] = useState<ReasoningLevel>("medium");
  const [defaultPersona, setDefaultPersona] = useState("off");
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
  const [labMode, setLabMode] = useState<"recon" | "jb">("recon");
  const [jbModel, setJbModel] = useState("stealth/union-alpha");
  const [jbResults, setJbResults] = useState<JbRow[]>([]);
  const [jbScore, setJbScore] = useState<number | null>(null);
  const [jbSuite, setJbSuite] = useState<"standard" | "academic" | "orchestrated">("standard");
  const [orchMins, setOrchMins] = useState(15);
  const [attackerModel, setAttackerModel] = useState("z-ai/glm-5.2:free");
  const [groupAgents, setGroupAgents] = useState(true);
  const [orchThread, setOrchThread] = useState<{role:string;content:string;level?:string}[]>([]);
  const [orchLevel, setOrchLevel] = useState("simple");
  const orchAbort = useRef(false);
  const [expandedProbe, setExpandedProbe] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const active = sessions.find((s) => s.id === activeId) || null;

  useEffect(() => {
    try {
      setKey(localStorage.getItem(LS.key) || "");
      const d = localStorage.getItem(LS.defaults);
      if (d) { const j = JSON.parse(d); if (j.model) setDefaultModel(j.model); if (j.reasoning) setDefaultReasoning(j.reasoning); if (j.ctx) setDefaultCtx(j.ctx); if (j.persona) setDefaultPersona(j.persona); }
      setBg(localStorage.getItem(LS.bg));
      const op = localStorage.getItem(LS.bgOpacity); if (op) setBgOpacity(Number(op));
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
      localStorage.setItem(LS.bgOpacity, String(bgOpacity));
      localStorage.setItem(LS.sidebar, sidebarOpen ? "1" : "0");
      if (bg) localStorage.setItem(LS.bg, bg); else localStorage.removeItem(LS.bg);
      localStorage.setItem(LS.sessions, JSON.stringify(sessions));
      if (activeId) localStorage.setItem(LS.active, activeId);
    } catch { /* */ }
  }, [key, defaultModel, defaultReasoning, defaultCtx, defaultPersona, bg, bgOpacity, sessions, activeId, sidebarOpen, hydrated]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.messages, busy]);

  function patchActive(patch: Partial<Session>) {
    if (!activeId) return;
    setSessions((prev) => prev.map((s) => (s.id === activeId ? { ...s, ...patch, updatedAt: Date.now() } : s)));
  }
  function newSession() {
    const m = meta(defaultModel);
    const s: Session = { id: nid("s"), title: "New chat", model: defaultModel, persona: defaultPersona, reasoning: defaultReasoning, contextTokens: Math.min(defaultCtx, m.ctx), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setSessions((prev) => [s, ...prev]); setActiveId(s.id); setTab("chat"); setModelMenu(false);
  }
  function deleteSession(id: string) {
    setSessions((prev) => { const next = prev.filter((s) => s.id !== id); if (activeId === id) setActiveId(next[0]?.id || null); return next; });
  }
  async function titleSession(sessionId: string, firstUser: string, apiKey: string) {
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openrouter", model: "z-ai/glm-5.2:free", apiKey, reasoningLevel: "off", enableTools: false, messages: [{ role: "user", content: `3-6 word title only, no quotes:\n${firstUser.slice(0, 400)}` }] }) });
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
    let sid = activeId; let sess = active;
    if (!sess) {
      const m = meta(defaultModel);
      const s: Session = { id: nid("s"), title: "New chat", model: defaultModel, persona: defaultPersona, reasoning: defaultReasoning, contextTokens: Math.min(defaultCtx, m.ctx), messages: [], createdAt: Date.now(), updatedAt: Date.now() };
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
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal, body: JSON.stringify({ provider: "openrouter", model: sess.model, apiKey: key, reasoningLevel: sess.reasoning, enableTools: true, personaSystem: personaById(sess.persona || defaultPersona).system || undefined, max_tokens: Math.min(4096, Math.floor(sess.contextTokens / 4)), messages: baseMsgs.map((m) => ({ role: m.role === "thought" ? "assistant" : m.role, content: m.content })) }) });
      const data = await res.json();
      const next: Msg[] = [];
      if (!data.ok) next.push({ id: nid("m"), role: "assistant", content: `Error: ${data.error || res.statusText}` });
      else {
        if (data.reasoning && sess.reasoning !== "off") next.push({ id: nid("m"), role: "thought", content: String(data.reasoning) });
        if (data.toolTrace?.length) next.push({ id: nid("m"), role: "thought", content: "web_search:\n" + data.toolTrace.map((t: { args: string; result: string }) => t.args + " → " + t.result.slice(0, 300)).join("\n") });
        next.push({ id: nid("m"), role: "assistant", content: data.text || "(empty)" });
      }
      setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, messages: [...baseMsgs, ...next], updatedAt: Date.now() } : s)));
      if (isFirst && key) void titleSession(sid!, text, key);
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "⏹ Stopped" : `Network: ${String(e)}`;
      setSessions((prev) => prev.map((s) => (s.id === sid ? { ...s, messages: [...baseMsgs, { id: nid("m"), role: "assistant", content: msg }], updatedAt: Date.now() } : s)));
    } finally { setBusy(false); abortRef.current = null; inputRef.current?.focus(); }
  }

  async function runJB() {
    if (!key.trim()) { setError("Add OpenRouter key in Settings"); setTab("settings"); return; }
    if (jbSuite === "orchestrated") { await runOrchestrated(); return; }
    setLabBusy(true); setJbResults([]); setJbScore(null); setLabLog("Running JB probes…\n");
    try {
      const res = await fetch("/api/lab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: key, model: jbModel, suite: jbSuite }) });
      const data = await res.json();
      if (!data.ok) setLabLog("Error: " + (data.error || "failed"));
      else {
        setJbResults(data.results || []);
        setJbScore(typeof data.score === "number" ? data.score : null);
        const c = data.counts || {};
        setLabLog(`Model: ${data.model || jbModel}\nSuite: ${jbSuite}\nScore: ${data.score}/100\nRefused: ${c.refused} · Partial: ${c.partial} · Jailbroken: ${c.jailbroken} · Error: ${c.error}\n`);
      }
    } catch (e) { setLabLog(String(e)); }
    finally { setLabBusy(false); }
  }

  async function runOrchestrated() {
    orchAbort.current = false;
    setLabBusy(true);
    setOrchThread([]);
    setJbResults([]);
    setJbScore(null);
    const levels = ["simple", "hard", "difficult", "extreme"] as const;
    const deadline = Date.now() + orchMins * 60 * 1000;
    const history: { role: string; content: string }[] = [];
    let levelIdx = 0;
    let rounds = 0;
    setLabLog(`Orchestrated JB · attacker=${attackerModel} · target=${jbModel} · group=${groupAgents} · ${orchMins}m\n`);
    while (!orchAbort.current && Date.now() < deadline && rounds < 24) {
      const level = levels[Math.min(levelIdx, levels.length - 1)];
      setOrchLevel(level);
      setLabLog((p) => p + `\n→ Round ${rounds + 1} · level=${level}\n`);
      const atkRes = await fetch("/api/lab/orchestrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "attack", apiKey: key, attackerModel, targetModel: jbModel, level, history, groupAgents }) });
      const atk = await atkRes.json();
      if (!atk.ok || orchAbort.current) { setLabLog((p) => p + `Attacker error: ${atk.error || "stopped"}\n`); break; }
      const attackPrompt = String(atk.prompt || "");
      history.push({ role: "attacker", content: attackPrompt });
      setOrchThread((prev) => [...prev, { role: "attacker", content: attackPrompt, level }]);
      if (atk.proposals?.length) setOrchThread((prev) => [...prev, { role: "system", content: "Specialists: " + atk.proposals.map((x: { name: string }) => x.name).join(", ") }]);
      const tgtRes = await fetch("/api/lab/orchestrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "target", apiKey: key, targetModel: jbModel, prompt: attackPrompt }) });
      const tgt = await tgtRes.json();
      if (!tgt.ok || orchAbort.current) { setLabLog((p) => p + `Target error: ${tgt.error || "stopped"}\n`); break; }
      const targetText = String(tgt.response || "");
      history.push({ role: "target", content: targetText });
      setOrchThread((prev) => [...prev, { role: "target", content: targetText, level }]);
      rounds++;
      if (rounds % 2 === 0 && levelIdx < levels.length - 1) levelIdx++;
    }
    if (history.length && !orchAbort.current) {
      const sumRes = await fetch("/api/lab/orchestrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "summarize", apiKey: key, attackerModel, history }) });
      const sum = await sumRes.json();
      if (sum.ok) {
        setOrchThread((prev) => [...prev, { role: "summary", content: sum.summary }]);
        setLabLog((p) => p + "\n--- SUMMARY ---\n" + sum.summary + "\n");
      }
    }
    setLabLog((p) => p + (orchAbort.current ? "\n⏹ Stopped by user\n" : "\n✓ Run finished\n"));
    setLabBusy(false);
  }
  function stopOrch() { orchAbort.current = true; setLabBusy(false); }

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
          <header className="sticky top-0 z-20 border-b border-white/10 bg-black/90 px-2 py-1.5 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setModelMenu((v) => !v)} className="flex max-w-[40%] items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs">
                <span className="truncate">{active ? meta(active.model).label : meta(defaultModel).label}</span>
                <ChevronDown className="size-3 shrink-0 opacity-50" />
              </button>
              <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
                {REASONING.map((r) => (
                  <button key={r.id} type="button" onClick={() => active && patchActive({ reasoning: r.id })} className={cn("rounded-md px-1.5 py-1 text-[10px]", (active?.reasoning || defaultReasoning) === r.id ? "bg-white/15" : "text-white/40")}>{r.label}</button>
                ))}
              </div>
              <select className="max-w-[30%] rounded-lg border border-white/10 bg-white/5 px-1.5 py-1.5 text-[10px]" value={active?.persona || defaultPersona} onChange={(e) => { if (active) patchActive({ persona: e.target.value }); else setDefaultPersona(e.target.value); }} title="Persona">
                {PERSONAS.map((p) => (<option key={p.id} value={p.id} className="bg-black">{p.label}</option>))}
              </select>
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
            <label className="mb-1 block text-[10px] uppercase text-white/40">Default model</label>
            <select className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2.5 text-xs" value={defaultModel} onChange={(e) => { setDefaultModel(e.target.value); setDefaultCtx((c) => Math.min(c, meta(e.target.value).ctx)); }}>
              {MODELS.map((m) => <option key={m.id} value={m.id} className="bg-black">{m.label} ({fmtCtx(m.ctx)})</option>)}
            </select>
            <label className="mb-1 block text-[10px] uppercase text-white/40">Default persona</label>
            <select className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2.5 text-xs" value={defaultPersona} onChange={(e) => setDefaultPersona(e.target.value)}>
              {PERSONAS.map((p) => <option key={p.id} value={p.id} className="bg-black">{p.label} — {p.tagline}</option>)}
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
                <div className="text-[10px] uppercase text-white/40">Session context · {fmtCtx(active.contextTokens)} / {fmtCtx(maxCtx)}</div>
                <input type="range" min={2048} max={maxCtx} step={1024} value={Math.min(active.contextTokens, maxCtx)} onChange={(e) => patchActive({ contextTokens: Number(e.target.value) })} className="mt-1 w-full accent-white" />
              </div>
            )}
            <label className="mb-1 block text-[10px] uppercase text-white/40">Background</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs"><ImageIcon className="size-3.5" />Upload</button>
              {bg && <button type="button" onClick={() => setBg(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Clear</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onBgFile(e.target.files?.[0] || null)} />
            {bg && <input type="range" min={0.05} max={0.7} step={0.05} value={bgOpacity} onChange={(e) => setBgOpacity(Number(e.target.value))} className="mt-2 w-full accent-white" />}
          </div>
        )}
        {tab === "labs" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex gap-1 border-b border-white/10 p-2">
              <button type="button" onClick={() => setLabMode("recon")} className={cn("flex-1 rounded-lg py-2 text-xs", labMode === "recon" ? "bg-white/15" : "text-white/40")}>Recon</button>
              <button type="button" onClick={() => setLabMode("jb")} className={cn("flex-1 rounded-lg py-2 text-xs", labMode === "jb" ? "bg-white/15" : "text-white/40")}>AI JB</button>
            </div>
            {labMode === "recon" && (
              <>
                <div className="space-y-2 border-b border-white/10 p-3">
                  <div className="flex items-center gap-2 text-xs text-white/70"><Target className="size-4" />Authorized recon</div>
                  <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs" value={labTarget} onChange={(e) => setLabTarget(e.target.value)} placeholder="https://target.example" />
                  <div className="flex flex-wrap gap-1">
                    {DEPTHS.map((d) => <button key={d} type="button" onClick={() => setLabDepth(d)} className={cn("rounded-md border px-2 py-1 text-[10px]", labDepth === d ? "border-white/30 bg-white/15" : "border-white/10 text-white/40")}>{d}</button>)}
                  </div>
                  <button type="button" disabled={labBusy} onClick={() => void runLabs()} className="w-full rounded-lg bg-white py-2.5 text-xs font-medium text-black disabled:opacity-40">{labBusy ? "Running…" : "Run recon"}</button>
                </div>
                <pre className="flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] text-white/70">{labLog || "Only scan targets you are authorized to test."}</pre>
              </>
            )}
            {labMode === "jb" && (
              <>
                <div className="space-y-2 border-b border-white/10 p-3">
                  <div className="text-xs text-white/70">Model red-team</div>
                  <div className="flex gap-1">
                    {(["standard", "academic", "orchestrated"] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setJbSuite(s)} className={cn("flex-1 rounded-md border py-1.5 text-[10px] capitalize", jbSuite === s ? "border-white/30 bg-white/15" : "border-white/10 text-white/40")}>{s}</button>
                    ))}
                  </div>
                  {jbSuite === "orchestrated" && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">{[15, 30, 45, 120].map((m) => (<button key={m} type="button" onClick={() => setOrchMins(m)} className={cn("rounded-md border px-2 py-1 text-[10px]", orchMins === m ? "border-white/30 bg-white/15" : "border-white/10 text-white/40")}>{m}m</button>))}</div>
                      <label className="block text-[10px] uppercase text-white/40">Attacker</label>
                      <select className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs" value={attackerModel} onChange={(e) => setAttackerModel(e.target.value)}>{MODELS.map((m) => <option key={m.id} value={m.id} className="bg-black">{m.label}</option>)}</select>
                      <button type="button" onClick={() => setGroupAgents((v) => !v)} className={cn("w-full rounded-md border py-1.5 text-[10px]", groupAgents ? "border-white/30 bg-white/15" : "border-white/10 text-white/40")}>{groupAgents ? "Group agents: ON" : "Group agents: OFF"}</button>
                    </div>
                  )}
                  <select className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-2.5 text-xs" value={jbModel} onChange={(e) => setJbModel(e.target.value)}>{MODELS.map((m) => <option key={m.id} value={m.id} className="bg-black">{m.label}</option>)}</select>
                  {labBusy && jbSuite === "orchestrated" ? (
                    <button type="button" onClick={stopOrch} className="w-full rounded-lg border border-red-500/40 bg-red-950/50 py-2.5 text-xs text-red-200">Stop</button>
                  ) : (
                    <button type="button" disabled={labBusy} onClick={() => void runJB()} className="w-full rounded-lg bg-white py-2.5 text-xs font-medium text-black disabled:opacity-40">{labBusy ? "Probing…" : jbSuite === "orchestrated" ? "Start orchestrated" : "Run JB suite"}</button>
                  )}
                  {jbScore !== null && <div className="text-center text-sm text-white/80">Score: <span className="font-mono">{jbScore}</span>/100</div>}
                  {jbResults.length > 0 && <JbChart results={jbResults} />}
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {orchThread.length > 0 && (
                    <div className="mb-3 space-y-2">
                      <div className="text-[10px] uppercase text-white/40">Live · {orchLevel}</div>
                      {orchThread.map((m, i) => (
                        <div key={i} className={cn("rounded-lg border p-2", m.role === "attacker" ? "border-amber-500/30 bg-amber-950/20" : m.role === "target" ? "border-white/10 bg-white/5" : m.role === "summary" ? "border-emerald-500/30 bg-emerald-950/20" : "border-white/5")}>
                          <div className="mb-1 text-[9px] uppercase text-white/40">{m.role}{m.level ? ` · ${m.level}` : ""}</div>
                          <pre className="max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-white/70">{m.content.slice(0, 1500)}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                  {jbResults.length === 0 && !labBusy && orchThread.length === 0 && <p className="p-3 text-[11px] text-white/40">Standard / academic / orchestrated.</p>}
                  {jbResults.map((r) => (
                    <button key={r.probeId} type="button" onClick={() => setExpandedProbe(expandedProbe === r.probeId ? null : r.probeId)} className="w-full rounded-lg border border-white/10 bg-white/5 p-2 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white/80">{r.technique}</span>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase", r.score === "refused" ? "bg-emerald-900/50 text-emerald-300" : r.score === "jailbroken" ? "bg-red-900/50 text-red-300" : "bg-amber-900/40 text-amber-200")}>{r.score}</span>
                      </div>
                      {expandedProbe === r.probeId && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-white/60">{(r.response || "").slice(0, 1200)}</pre>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {tab === "chat" && (
          <>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 py-3" onClick={() => setModelMenu(false)}>
              {(!active || active.messages.length === 0) && !busy && (
                <div className="mt-12 text-center text-xs text-white/35"><div className="flex justify-center"><Logo active={false} /></div><p className="mt-3">Persona · web_search · sessions</p></div>
              )}
              {active?.messages.map((m) => (
                <div key={m.id} className={cn("mx-auto max-w-2xl", m.role === "user" && "flex justify-end", m.role === "thought" && "opacity-55")}>
                  {m.role === "thought" && <div className="mb-0.5 text-[9px] uppercase tracking-wider text-white/30">reasoning / tools</div>}
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
