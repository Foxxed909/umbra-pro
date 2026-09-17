import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const service = String(body.service || "");
    const action = String(body.action || "status");
    const token = String(body.token || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    if (service === "github") {
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "UMBRA-Pro",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (action === "status" || action === "user") {
        const res = await fetch("https://api.github.com/user", { headers });
        const data = await res.json();
        if (!res.ok) return NextResponse.json({ ok: false, error: data.message || res.statusText }, { status: 502 });
        return NextResponse.json({
          ok: true,
          service: "github",
          user: data.login,
          name: data.name,
          avatar: data.avatar_url,
        });
      }
      if (action === "repos") {
        const res = await fetch("https://api.github.com/user/repos?per_page=20&sort=updated", { headers });
        const data = await res.json();
        if (!res.ok) return NextResponse.json({ ok: false, error: data.message || res.statusText }, { status: 502 });
        return NextResponse.json({
          ok: true,
          repos: (Array.isArray(data) ? data : []).map((r: { full_name: string; private: boolean; html_url: string; description: string }) => ({
            full_name: r.full_name,
            private: r.private,
            url: r.html_url,
            description: r.description,
          })),
        });
      }
      return NextResponse.json({ ok: false, error: "Unknown github action" }, { status: 400 });
    }

    if (service === "vercel") {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      if (action === "status" || action === "user") {
        const res = await fetch("https://api.vercel.com/v2/user", { headers });
        const data = await res.json();
        if (!res.ok) return NextResponse.json({ ok: false, error: data.error?.message || res.statusText }, { status: 502 });
        return NextResponse.json({
          ok: true,
          service: "vercel",
          user: data.user?.username || data.user?.email,
          name: data.user?.name,
        });
      }
      if (action === "projects") {
        const res = await fetch("https://api.vercel.com/v9/projects?limit=20", { headers });
        const data = await res.json();
        if (!res.ok) return NextResponse.json({ ok: false, error: data.error?.message || res.statusText }, { status: 502 });
        return NextResponse.json({
          ok: true,
          projects: (data.projects || []).map((p: { id: string; name: string; framework: string }) => ({
            id: p.id,
            name: p.name,
            framework: p.framework,
          })),
        });
      }
      if (action === "deployments") {
        const projectId = body.projectId ? `?projectId=${encodeURIComponent(body.projectId)}&` : "?";
        const res = await fetch(`https://api.vercel.com/v6/deployments${projectId}limit=10`, { headers });
        const data = await res.json();
        if (!res.ok) return NextResponse.json({ ok: false, error: data.error?.message || res.statusText }, { status: 502 });
        return NextResponse.json({
          ok: true,
          deployments: (data.deployments || []).map((d: { uid: string; url: string; state: string; created: number }) => ({
            uid: d.uid,
            url: d.url,
            state: d.state,
            created: d.created,
          })),
        });
      }
      return NextResponse.json({ ok: false, error: "Unknown vercel action" }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: "Unknown service" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
