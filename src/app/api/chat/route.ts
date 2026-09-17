import { NextRequest, NextResponse } from "next/server";

type Msg = { role: string; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider,
      model,
      apiKey,
      messages,
      reasoningLevel = "medium",
      projectInstructions,
    } = body as {
      provider: string;
      model: string;
      apiKey: string;
      messages: Msg[];
      reasoningLevel?: string;
      projectInstructions?: string;
    };

    if (!apiKey?.trim()) {
      return NextResponse.json({ ok: false, error: "Missing API key" }, { status: 400 });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ ok: false, error: "No messages" }, { status: 400 });
    }

    const systemParts = [
      "You are UMBRA, a precise, capable assistant in a glassy steel workspace.",
      projectInstructions ? `Project instructions:\n${projectInstructions}` : "",
      reasoningLevel !== "off"
        ? `When helpful, think step-by-step. Reasoning level: ${reasoningLevel}.`
        : "",
    ].filter(Boolean);

    const sys = systemParts.join("\n\n");
    const openRouterMessages = [
      { role: "system", content: sys },
      ...messages
        .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    if (provider === "openrouter" || provider === "openai") {
      const base =
        provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(provider === "openrouter"
            ? { "HTTP-Referer": "https://umbra.app", "X-Title": "UMBRA Pro" }
            : {}),
        },
        body: JSON.stringify({
          model,
          messages: openRouterMessages,
          temperature: 0.6,
          max_tokens: 4096,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: data?.error?.message || data?.error || res.statusText },
          { status: 502 },
        );
      }
      const text = data.choices?.[0]?.message?.content ?? "";
      const reasoning =
        data.choices?.[0]?.message?.reasoning ||
        data.choices?.[0]?.message?.reasoning_content ||
        undefined;
      return NextResponse.json({ ok: true, text, reasoning });
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: sys,
          messages: openRouterMessages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: data?.error?.message || res.statusText },
          { status: 502 },
        );
      }
      const text = Array.isArray(data.content)
        ? data.content.map((c: { text?: string }) => c.text || "").join("")
        : "";
      return NextResponse.json({ ok: true, text });
    }

    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const contents = openRouterMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: data?.error?.message || res.statusText },
          { status: 502 },
        );
      }
      const text =
        data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ||
        "";
      return NextResponse.json({ ok: true, text });
    }

    if (provider === "xai") {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: openRouterMessages,
          temperature: 0.6,
          max_tokens: 4096,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: data?.error?.message || res.statusText },
          { status: 502 },
        );
      }
      const text = data.choices?.[0]?.message?.content ?? "";
      return NextResponse.json({ ok: true, text });
    }

    return NextResponse.json(
      {
        ok: false,
        error: `Provider ${provider} not wired yet — use OpenRouter, OpenAI, Anthropic, Gemini, or xAI.`,
      },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
