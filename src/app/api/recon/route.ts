import { NextRequest, NextResponse } from "next/server";
import { runRecon } from "@/lib/recon";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { target, depth, authorized } = body as {
      target?: string;
      depth?: string;
      authorized?: boolean;
    };
    if (!authorized) {
      return NextResponse.json({ ok: false, error: "Authorization required" }, { status: 403 });
    }
    if (!target || typeof target !== "string") {
      return NextResponse.json({ ok: false, error: "Missing target" }, { status: 400 });
    }
    const result = await runRecon({
      target,
      depth: (depth as "pulse") || "pulse",
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
