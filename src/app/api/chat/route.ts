import { NextRequest, NextResponse } from "next/server";

type Msg = { role: string; content: string; tool_call_id?: string; name?: string };

async function webSearch(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { headers: { "User-Agent": "UMBRA-Pro/1.0" } });
    const data = await res.json();
    const bits: string[] = [];
    if (data.AbstractText) bits.push(data.AbstractText);
    if (data.Answer) bits.push(String(data.Answer));
    const topics = (data.RelatedTopics || []).slice(0, 5);
    for (const t of topics) {
      if (typeof t.Text === "string") bits.push(t.Text);
      else if (t.Topics) {
        for (const s of t.Topics.slice(0, 2)) if (s.Text) bits.push(s.Text);
      }
    }
    if (!bits.length) {
      const lite = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "UMBRA-Pro/1.0" },
      });
      const html = await lite.text();
      const matches = [...html.matchAll(/class="result__a"[^>]*>([^<]+)/g)].slice(0, 6);
      for (const m of matches) bits.push(m[1].trim());
    }
    return bits.length ? bits.join("\n• ") : `No results for: ${query}`;
  } catch (e) {
    return `Search failed: ${String(e)}`;
  }
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web for current information, facts, news, or documentation.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider = "openrouter",
      model,
      apiKey,
      messages,
      reasoningLevel = "medium",
      projectInstructions,
      personaSystem,
      enableTools = true,
      max_tokens = 4096,
    } = body as {
      provider?: string;
      model: string;
      apiKey: string;
      messages: Msg[];
      reasoningLevel?: string;
      projectInstructions?: string;
      personaSystem?: string;
      enableTools?: boolean;
      max_tokens?: number;
    };

    if (!apiKey?.trim()) {
      return NextResponse.json({ ok: false, error: "Missing API key" }, { status: 400 });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ ok: false, error: "No messages" }, { status: 400 });
    }

    const systemParts = [
      personaSystem && String(personaSystem).trim()
        ? String(personaSystem).trim()
        : "You are UMBRA, a precise, capable assistant. Adult fictional content between adults is allowed when requested. Refuse only minors, real violent crime how-tos, and real fraud playbooks.",
      enableTools
        ? "You have a web_search tool. Use it when the user asks for current events, live data, or facts you are unsure about. Call the tool instead of claiming you cannot search."
        : "You do not have live web access in this session.",
      projectInstructions ? `Project instructions:\n${projectInstructions}` : "",
      reasoningLevel !== "off"
        ? `When helpful, think step-by-step. Reasoning level: ${reasoningLevel}.`
        : "",
    ].filter(Boolean);

    const openRouterMessages: Array<Msg & { tool_calls?: unknown }> = [
      { role: "system", content: systemParts.join("\n\n") },
      ...messages
        .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system" || m.role === "tool")
        .map((m) => ({ ...m })),
    ];

    const base =
      provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";

    const toolTrace: { name: string; args: string; result: string }[] = [];
    let rounds = 0;
    const maxRounds = enableTools ? 3 : 0;

    while (true) {
      const payload: Record<string, unknown> = {
        model,
        messages: openRouterMessages,
        temperature: 0.7,
        max_tokens,
      };
      if (enableTools && rounds < maxRounds) {
        payload.tools = TOOLS;
        payload.tool_choice = "auto";
      }

      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(provider === "openrouter"
            ? { "HTTP-Referer": "https://umbra.app", "X-Title": "UMBRA Pro" }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: data?.error?.message || data?.error || res.statusText },
          { status: 502 },
        );
      }

      const choice = data.choices?.[0];
      const msg = choice?.message;
      const reasoning = msg?.reasoning || msg?.reasoning_content || undefined;
      const toolCalls = msg?.tool_calls;

      if (Array.isArray(toolCalls) && toolCalls.length > 0 && rounds < maxRounds) {
        openRouterMessages.push({
          role: "assistant",
          content: msg.content || "",
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          const name = tc.function?.name || "";
          let args: { query?: string } = {};
          try {
            args = JSON.parse(tc.function?.arguments || "{}");
          } catch {
            args = {};
          }
          let result = "";
          if (name === "web_search" && args.query) {
            result = await webSearch(args.query);
          } else {
            result = `Unknown tool: ${name}`;
          }
          toolTrace.push({ name, args: JSON.stringify(args), result: result.slice(0, 2000) });
          openRouterMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
        rounds++;
        continue;
      }

      const text = msg?.content ?? "";
      return NextResponse.json({
        ok: true,
        text,
        reasoning,
        toolTrace: toolTrace.length ? toolTrace : undefined,
      });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
