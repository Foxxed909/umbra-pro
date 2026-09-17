"use client";

/** Lightweight markdown → React (no deps). Handles code, tables, lists, bold, links. */
export function Markdown({ text }: { text: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className="markdown space-y-2 text-[13px] leading-relaxed">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

type Block =
  | { type: "code"; lang: string; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string };

function splitBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++;
      out.push({ type: "code", lang, code: body.join("\n") });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s-:|]+$/.test(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push({ type: "table", headers, rows });
      continue;
    }
    const hm = /^(#{1,3})\s+(.+)$/.exec(line);
    if (hm) {
      out.push({ type: "h", level: hm[1].length, text: hm[2] });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push({ type: "ol", items });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const parts: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("#") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      if (lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s-:|]+$/.test(lines[i + 1])) break;
      parts.push(lines[i]);
      i++;
    }
    if (parts.length) out.push({ type: "p", text: parts.join(" ") });
  }
  return out;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function Inline({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) nodes.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`"))
      nodes.push(
        <code key={k++} className="rounded bg-white/10 px-1 font-mono text-[12px]">
          {t.slice(1, -1)}
        </code>,
      );
    else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t);
      if (lm)
        nodes.push(
          <a key={k++} href={lm[2]} target="_blank" rel="noreferrer" className="underline text-white/80">
            {lm[1]}
          </a>,
        );
    }
    last = m.index + t.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

function Block({ block }: { block: Block }) {
  if (block.type === "code") {
    return (
      <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-[11px] text-white/85">
        {block.lang && <div className="mb-1 text-[10px] uppercase text-white/35">{block.lang}</div>}
        <code>{block.code}</code>
      </pre>
    );
  }
  if (block.type === "table") {
    return (
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[280px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              {block.headers.map((h, i) => (
                <th key={i} className="px-2 py-1.5 font-medium text-white/70">
                  <Inline text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-white/5">
                {row.map((c, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-white/85">
                    <Inline text={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "ul") {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.items.map((it, i) => (
          <li key={i}>
            <Inline text={it} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {block.items.map((it, i) => (
          <li key={i}>
            <Inline text={it} />
          </li>
        ))}
      </ol>
    );
  }
  if (block.type === "h") {
    const cls =
      block.level === 1
        ? "text-base font-semibold"
        : block.level === 2
          ? "text-sm font-semibold"
          : "text-sm font-medium text-white/90";
    return (
      <div className={cls}>
        <Inline text={block.text} />
      </div>
    );
  }
  return (
    <p>
      <Inline text={block.text} />
    </p>
  );
}
