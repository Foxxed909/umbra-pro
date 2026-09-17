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

async function ghFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "UMBRA-Pro",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: data.message || res.statusText, status: res.status };
  return { ok: true as const, data };
}

async function runGithubTool(token: string, name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "github_whoami") {
    const r = await ghFetch(token, "/user");
    if (!r.ok) return `GitHub error: ${r.error}`;
    const u = r.data;
    return JSON.stringify({
      login: u.login,
      name: u.name,
      public_repos: u.public_repos,
      total_private_repos: u.total_private_repos,
      followers: u.followers,
      html_url: u.html_url,
    });
  }
  if (name === "github_list_repos") {
    const username = String(args.username || "").trim();
    const type = String(args.type || "all");
    const path = username
      ? `/users/${encodeURIComponent(username)}/repos?per_page=30&sort=updated`
      : `/user/repos?per_page=30&sort=updated&type=${encodeURIComponent(type)}`;
    const r = await ghFetch(token, path);
    if (!r.ok) return `GitHub error: ${r.error}`;
    const list = (r.data as Array<Record<string, unknown>>).map((repo) => ({
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      updated_at: repo.updated_at,
      html_url: repo.html_url,
    }));
    return JSON.stringify(list, null, 2);
  }
  if (name === "github_get_repo") {
    const full = String(args.full_name || args.repo || "").trim();
    if (!full.includes("/")) return "Provide full_name like owner/repo";
    const r = await ghFetch(token, `/repos/${full}`);
    if (!r.ok) return `GitHub error: ${r.error}`;
    const repo = r.data;
    return JSON.stringify({
      full_name: repo.full_name,
      description: repo.description,
      private: repo.private,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      default_branch: repo.default_branch,
      html_url: repo.html_url,
      topics: repo.topics,
    });
  }
  if (name === "github_list_files") {
    const full = String(args.full_name || "").trim();
    const path = String(args.path || "").replace(/^\//, "");
    if (!full.includes("/")) return "Provide full_name like owner/repo";
    const apiPath = path ? `/repos/${full}/contents/${path}` : `/repos/${full}/contents`;
    const r = await ghFetch(token, apiPath);
    if (!r.ok) return `GitHub error: ${r.error}`;
    if (Array.isArray(r.data)) {
      return JSON.stringify(
        r.data.map((f: { name: string; type: string; path: string; size?: number }) => ({
          name: f.name,
          type: f.type,
          path: f.path,
          size: f.size,
        })),
        null,
        2,
      );
    }
    return JSON.stringify({ name: r.data.name, type: r.data.type, path: r.data.path, size: r.data.size });
  }
  if (name === "github_read_file") {
    const full = String(args.full_name || "").trim();
    const path = String(args.path || "").replace(/^\//, "");
    if (!full.includes("/") || !path) return "Need full_name and path";
    const r = await ghFetch(token, `/repos/${full}/contents/${path}`);
    if (!r.ok) return `GitHub error: ${r.error}`;
    if (r.data.encoding === "base64" && r.data.content) {
      const text = Buffer.from(r.data.content.replace(/\n/g, ""), "base64").toString("utf8");
      return text.slice(0, 12000);
    }
    return JSON.stringify(r.data).slice(0, 8000);
  }
  if (name === "github_search_code") {
    const q = String(args.query || "").trim();
    if (!q) return "Need query";
    const r = await ghFetch(token, `/search/code?q=${encodeURIComponent(q)}&per_page=10`);
    if (!r.ok) return `GitHub error: ${r.error}`;
    const items = (r.data.items || []).map(
      (it: { name: string; path: string; html_url: string; repository?: { full_name: string } }) => ({
        name: it.name,
        path: it.path,
        repo: it.repository?.full_name,
        url: it.html_url,
      }),
    );
    return JSON.stringify(items, null, 2);
  }
  return `Unknown GitHub tool: ${name}`;
}

function buildTools(hasGithub: boolean) {
  const tools: unknown[] = [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the live web for current information, facts, news, or documentation.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Search query" } },
          required: ["query"],
        },
      },
    },
  ];
  if (hasGithub) {
    tools.push(
      {
        type: "function",
        function: {
          name: "github_whoami",
          description: "Get the authenticated GitHub user for the connected PAT (login, name, repo counts).",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "github_list_repos",
          description:
            "List repositories. Omit username to list the authenticated user's repos (including private). Pass username for another user's public repos.",
          parameters: {
            type: "object",
            properties: {
              username: { type: "string", description: "Optional GitHub username. Omit for the connected account." },
              type: { type: "string", description: "For connected account: all | owner | member. Default all." },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "github_get_repo",
          description: "Get details for one repo by full_name (owner/repo).",
          parameters: {
            type: "object",
            properties: { full_name: { type: "string", description: "owner/repo" } },
            required: ["full_name"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "github_list_files",
          description: "List files/folders in a repo path (root if path empty).",
          parameters: {
            type: "object",
            properties: {
              full_name: { type: "string", description: "owner/repo" },
              path: { type: "string", description: "Directory path, empty for root" },
            },
            required: ["full_name"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "github_read_file",
          description: "Read a text file from a repository.",
          parameters: {
            type: "object",
            properties: {
              full_name: { type: "string", description: "owner/repo" },
              path: { type: "string", description: "File path in the repo" },
            },
            required: ["full_name", "path"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "github_search_code",
          description:
            "Search code on GitHub (uses the connected token; can include private repos you can access).",
          parameters: {
            type: "object",
            properties: { query: { type: "string", description: "GitHub code search query" } },
            required: ["query"],
          },
        },
      },
    );
  }
  return tools;
}

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
      githubToken,
      vercelToken,
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
      githubToken?: string;
      vercelToken?: string;
    };

    if (!apiKey?.trim()) {
      return NextResponse.json({ ok: false, error: "Missing API key" }, { status: 400 });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ ok: false, error: "No messages" }, { status: 400 });
    }

    const gh = String(githubToken || "").trim();
    const hasGithub = Boolean(gh);
    void vercelToken;

    const toolLines: string[] = [];
    if (enableTools) {
      toolLines.push(
        "You have tools. USE them when relevant instead of claiming you cannot.",
        "- web_search: live web search",
      );
      if (hasGithub) {
        toolLines.push(
          "- GitHub is CONNECTED for this user (PAT on the server for this request).",
          "- github_whoami, github_list_repos, github_get_repo, github_list_files, github_read_file, github_search_code",
          "- When the user asks about their repos, profile, or code, call these tools. Do NOT say you lack GitHub access.",
          "- For 'my repos' call github_list_repos without username (authenticated).",
        );
      } else {
        toolLines.push(
          "- GitHub is NOT connected. If they ask for private repos, tell them to paste a PAT under Settings → Connectors.",
        );
      }
    }

    const systemParts = [
      personaSystem && String(personaSystem).trim()
        ? String(personaSystem).trim()
        : "You are UMBRA, a precise, capable assistant. Adult fictional content between adults is allowed when requested. Refuse only minors, real violent crime how-tos, and real fraud playbooks.",
      toolLines.join("\n"),
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

    const base = provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";
    const tools = buildTools(hasGithub);
    const toolTrace: { name: string; args: string; result: string }[] = [];
    let rounds = 0;
    const maxRounds = enableTools ? 5 : 0;

    while (true) {
      const payload: Record<string, unknown> = {
        model,
        messages: openRouterMessages,
        temperature: 0.7,
        max_tokens,
      };
      if (enableTools && rounds < maxRounds) {
        payload.tools = tools;
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
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function?.arguments || "{}");
          } catch {
            args = {};
          }
          let result = "";
          if (name === "web_search" && typeof args.query === "string") {
            result = await webSearch(args.query);
          } else if (name.startsWith("github_")) {
            if (!hasGithub) result = "GitHub not connected. User must add PAT in Settings → Connectors.";
            else result = await runGithubTool(gh, name, args);
          } else {
            result = `Unknown tool: ${name}`;
          }
          toolTrace.push({ name, args: JSON.stringify(args), result: result.slice(0, 4000) });
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
        githubConnected: hasGithub,
      });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
