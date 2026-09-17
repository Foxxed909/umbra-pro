"use client";
import { useEffect, useState } from "react";

const LS_GH = "umbra.pro.gh";
const LS_V = "umbra.pro.vercel";

export default function ConnectorsSettings() {
  const [ghToken, setGhToken] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      setGhToken(localStorage.getItem(LS_GH) || "");
      setVercelToken(localStorage.getItem(LS_V) || "");
    } catch { /* */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_GH, ghToken);
      localStorage.setItem(LS_V, vercelToken);
    } catch { /* */ }
  }, [ghToken, vercelToken]);

  async function test(kind: "github" | "vercel") {
    setMsg("Testing…");
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "status",
          service: kind,
          token: kind === "github" ? ghToken : vercelToken,
        }),
      });
      const data = await res.json();
      setMsg(
        data.ok
          ? `✓ ${kind}: ${data.user || data.email || data.message || "connected"}`
          : `✗ ${kind}: ${data.error || "failed"}`,
      );
    } catch (e) {
      setMsg(`✗ ${kind}: ${String(e)}`);
    }
  }

  return (
    <div className="mb-4">
      <h2 className="mb-2 text-xs font-medium text-white/80">Connectors</h2>
      <p className="mb-2 text-[10px] text-white/40">
        Paste tokens to test GitHub & Vercel. Stored only in this device&apos;s localStorage.
      </p>
      <label className="mb-1 block text-[10px] uppercase text-white/40">GitHub PAT</label>
      <input
        type="password"
        className="mb-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs"
        value={ghToken}
        onChange={(e) => setGhToken(e.target.value)}
        placeholder="ghp_… or github_pat_…"
      />
      <button
        type="button"
        onClick={() => void test("github")}
        className="mb-3 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5"
      >
        Test GitHub
      </button>
      <label className="mb-1 block text-[10px] uppercase text-white/40">Vercel token</label>
      <input
        type="password"
        className="mb-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs"
        value={vercelToken}
        onChange={(e) => setVercelToken(e.target.value)}
        placeholder="vercel_…"
      />
      <button
        type="button"
        onClick={() => void test("vercel")}
        className="mb-2 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5"
      >
        Test Vercel
      </button>
      {msg && <p className="mb-2 text-[11px] text-white/70">{msg}</p>}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[10px] text-white/45">
        <p className="mb-1 font-medium text-white/60">More (coming)</p>
        <p>Gmail · Google Drive · Supabase — OAuth next. GitHub/Vercel work with PATs above.</p>
      </div>
    </div>
  );
}
