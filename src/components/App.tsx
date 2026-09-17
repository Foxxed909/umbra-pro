"use client";

import { useEffect, useState } from "react";
import { MessageSquare, FlaskConical, Settings, Send } from "lucide-react";
import { cn, nid } from "@/lib/utils";

type Tab = "chat" | "labs" | "settings";

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("stealth/union-alpha");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ id: string; role: string; content: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("umbra.pro.keys");
      if (raw) setKey(JSON.parse(raw).openrouter || "");
      const m = localStorage.getItem("umbra.pro.model");
      if (m) setModel(m);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("umbra.pro.keys", JSON.stringify({ openrouter: key }));
    localStorage.setItem("umbra.pro.model", model);
  }, [key, model, hydrated]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!key.trim()) {
      alert("Add an OpenRouter key in Settings");
      setTab("settings");
      return;
    }
    setInput("");
    const userMsg = { id: nid("m"), role: "user", content: text };
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
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: nid("m"), role: "assistant", content: data.ok ? data.text : `Error: ${data.error}` },
      ]);
    } catch (e) {
      setMessages((prev) => [...prev, { id: nid("m"), role: "assistant", content: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading UMBRA Pro…
      </div>
    );
  }

  return (
    <div className="app-shell flex min-h-screen">
      <div className="app-bg" />
      <aside className="glass relative z-10 flex w-14 flex-col items-center gap-1 border-r border-border py-3">
        <span className="mb-2 font-mono text-[10px] tracking-widest text-steel">UP</span>
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
              "flex size-10 items-center justify-center rounded-lg",
              tab === id ? "bg-accent" : "text-muted-foreground hover:bg-glass",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </aside>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        {tab === "settings" && (
          <div className="mx-auto max-w-md space-y-4 p-6">
            <h1 className="text-lg font-medium">Settings</h1>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">OpenRouter API key (local only)</span>
              <input
                type="password"
                className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-or-…"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Model</span>
              <input
                className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
          </div>
        )}

        {tab === "labs" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <FlaskConical className="size-10 text-steel" />
            <h2 className="text-lg font-medium">Labs</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Recon + JB lab modules are on the repo path. Full Labs UI lands in the next commits (engine,
              LabsPanel, agent routes).
            </p>
          </div>
        )}

        {tab === "chat" && (
          <>
            <header className="border-b border-border px-4 py-2.5">
              <span className="font-mono text-xs tracking-widest text-steel">UMBRA PRO</span>
              <span className="ml-2 text-xs text-muted-foreground">{model}</span>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-6">
              {messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  Glassy steel workspace. Keys stay in your browser.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("mx-auto max-w-2xl", m.role === "user" ? "text-right" : "")}
                >
                  <div
                    className={cn(
                      "inline-block rounded-2xl px-4 py-2 text-left text-sm",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "glass",
                    )}
                  >
                    <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border p-3">
              <div className="mx-auto flex max-w-2xl gap-2">
                <input
                  className="glass flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
                  placeholder="Message UMBRA…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void send();
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !input.trim()}
                  onClick={() => void send()}
                  className="flex size-[42px] items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
