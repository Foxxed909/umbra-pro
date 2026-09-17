import { NextResponse } from "next/server";
import { collectRecon, instrumentFindings, packToPrompt } from "@/lib/recon";
import { DEPTHS } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.authorized) {
      return NextResponse.json({ ok: false, error: "Authorization was not confirmed." });
    }
    const depth = DEPTHS.find((d) => d.id === body.depth)?.id ?? "pulse";
    const pack = await collectRecon(String(body.target || ""), depth);
    const findings = instrumentFindings(pack);
    const prompt = packToPrompt(pack);
    return NextResponse.json({ ok: true, pack, findings, prompt });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Recon failed.",
    });
  }
}
