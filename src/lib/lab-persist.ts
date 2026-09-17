/** Helpers for turning lab runs into chat sessions */
export type LabLine = { role: string; content: string };

export function labLinesFromSteps(
  steps: { outbound: string; reply: string; phase?: string }[],
): LabLine[] {
  const out: LabLine[] = [];
  for (const s of steps) {
    out.push({ role: "attacker", content: s.outbound });
    out.push({ role: "target", content: s.reply });
  }
  return out;
}

export function formatReconText(
  pack: {
    target?: string;
    probes?: unknown[];
    secrets?: unknown[];
    headerIssues?: unknown[];
    notes?: string[];
  },
  labTarget: string,
  labDepth: string,
  findings: { severity?: string; title?: string }[],
) {
  return [
    `Target: ${pack.target || labTarget}`,
    `Depth: ${labDepth}`,
    `Probes: ${pack.probes?.length ?? "?"}`,
    `Secrets: ${pack.secrets?.length ?? 0}`,
    `Header issues: ${pack.headerIssues?.length ?? 0}`,
    `Findings: ${findings.length}`,
    "",
    ...findings.slice(0, 20).map((f) => `[${f.severity || "?"}] ${f.title || ""}`),
    "",
    ...(pack.notes || []),
  ].join("\n");
}
