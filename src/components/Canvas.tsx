"use client";
import { X, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Markdown } from "./Markdown";

export type CanvasDoc = {
  id: string;
  title: string;
  content: string;
  kind?: "markdown" | "code" | "table";
};

export function Canvas({
  doc,
  onClose,
}: {
  doc: CanvasDoc | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!doc) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(doc!.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* */
    }
  }

  return (
    <aside className="flex w-full max-w-md shrink-0 flex-col border-l border-white/10 bg-black/95">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/80">{doc.title}</span>
        <button type="button" onClick={() => void copy()} className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Copy">
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
        </button>
        <button type="button" onClick={onClose} className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Close">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <Markdown text={doc.content} />
      </div>
    </aside>
  );
}

export function extractCanvasCandidates(text: string): CanvasDoc[] {
  const docs: CanvasDoc[] = [];
  const tableRe = /((?:^\|.+\|[ \t]*\n)+)/gm;
  let m: RegExpExecArray | null;
  let ti = 0;
  while ((m = tableRe.exec(text))) {
    const block = m[1].trim();
    if (block.split("\n").length >= 2) {
      docs.push({ id: `table-${ti++}`, title: `Table ${ti}`, content: block, kind: "table" });
    }
  }
  const codeRe = /```(\w*)\n([\s\S]*?)```/g;
  let ci = 0;
  while ((m = codeRe.exec(text))) {
    const code = m[2].trim();
    if (code.length > 80) {
      docs.push({
        id: `code-${ci++}`,
        title: m[1] ? `${m[1]} snippet` : `Code ${ci}`,
        content: "```" + m[1] + "\n" + code + "\n```",
        kind: "code",
      });
    }
  }
  return docs;
}
