import { DEPTHS, type DepthId, type Finding, type ProbeResult, type ReconPack, type Severity } from "./types";
import { assertSafeUrl } from "./ssrf";
import { nid, redactSecret } from "./utils";

const UA = "UMBRA-Recon/1.0 (authorized-assessment)";
const MAX_BODY = 80_000;
const PER_TIMEOUT_MS = 8_000;

const PATH_POOL = [
  "/robots.txt", "/sitemap.xml", "/.well-known/security.txt", "/security.txt",
  "/favicon.ico", "/humans.txt", "/.git/HEAD", "/.git/config", "/.env", "/.env.local",
  "/.env.production", "/config.json", "/package.json", "/wp-login.php", "/wp-json/",
  "/admin", "/admin/", "/login", "/signin", "/api", "/api/", "/api/v1", "/api/health",
  "/health", "/status", "/graphql", "/swagger", "/swagger.json", "/openapi.json",
  "/docs", "/debug", "/phpinfo.php", "/server-status", "/backup.zip", "/dump.sql",
  "/actuator/health", "/actuator/env", "/.htaccess", "/manifest.json", "/api/config",
  "/api/keys", "/.well-known/openid-configuration", "/wp-content/debug.log",
  "/storage/logs/laravel.log", "/uploads/", "/backup/", "/old/", "/test/",
];

const SECRET_RULES: { kind: string; re: RegExp }[] = [
  { kind: "AWS access key", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "GitHub token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  { kind: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "OpenAI key", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { kind: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/g },
  { kind: "OpenRouter key", re: /\bsk-or-[A-Za-z0-9\-_]{20,}\b/g },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{20,}\b/g },
  { kind: "Stripe key", re: /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{16,}\b/g },
  { kind: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

function depthOf(id: DepthId) {
  return DEPTHS.find((d) => d.id === id) ?? DEPTHS[0];
}

function headerMap(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

async function fetchProbe(url: string, method: "GET" | "OPTIONS", extra?: HeadersInit): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const safe = await assertSafeUrl(url);
    const res = await fetch(safe.toString(), {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(PER_TIMEOUT_MS),
      headers: {
        "user-agent": UA,
        accept: "text/html,application/json,text/plain,application/javascript,*/*;q=0.8",
        ...extra,
      },
    });
    const headers = headerMap(res.headers);
    let redirectedTo: string | undefined;
    if (res.status >= 300 && res.status < 400 && headers.location) {
      try {
        redirectedTo = new URL(headers.location, safe).toString();
      } catch {
        redirectedTo = headers.location;
      }
    }
    let bodySnippet = "";
    if (method === "GET") {
      const buf = new Uint8Array(await res.arrayBuffer());
      const slice = buf.byteLength > MAX_BODY ? buf.slice(0, MAX_BODY) : buf;
      bodySnippet = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    }
    return {
      url: safe.toString(),
      method,
      status: res.status,
      ms: Date.now() - started,
      headers,
      bodySnippet,
      contentType: headers["content-type"] ?? "",
      redirectedTo,
    };
  } catch (err) {
    return {
      url,
      method,
      status: null,
      ms: Date.now() - started,
      headers: {},
      bodySnippet: "",
      contentType: "",
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

function scanSecrets(text: string, location: string) {
  const hits: { kind: string; redacted: string; location: string }[] = [];
  const seen = new Set<string>();
  for (const rule of SECRET_RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      const key = `${rule.kind}:${m[0].slice(0, 12)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ kind: rule.kind, redacted: redactSecret(m[0]), location });
      if (hits.length >= 40) return hits;
    }
  }
  return hits;
}

function analyzeHeaders(p: ProbeResult) {
  if (!p.status || p.status >= 400) return [] as { title: string; detail: string; severity: Severity; location: string }[];
  const h = p.headers;
  const issues: { title: string; detail: string; severity: Severity; location: string }[] = [];
  const loc = p.url;
  if (!h["content-security-policy"]) {
    issues.push({ title: "Missing Content-Security-Policy", detail: "No CSP on origin response.", severity: "medium", location: loc });
  }
  if (!h["strict-transport-security"] && loc.startsWith("https://")) {
    issues.push({ title: "Missing Strict-Transport-Security", detail: "HSTS absent.", severity: "medium", location: loc });
  }
  if (!h["x-content-type-options"]) {
    issues.push({ title: "Missing X-Content-Type-Options", detail: "nosniff not set.", severity: "low", location: loc });
  }
  if (!h["x-frame-options"] && !/frame-ancestors/i.test(h["content-security-policy"] || "")) {
    issues.push({ title: "Clickjacking controls absent", detail: "No XFO or frame-ancestors.", severity: "low", location: loc });
  }
  if (!h["referrer-policy"]) {
    issues.push({ title: "Missing Referrer-Policy", detail: "Default referrer may leak URLs.", severity: "info", location: loc });
  }
  if (h.server) {
    issues.push({ title: "Server header discloses software", detail: `Server: ${h.server}`, severity: "info", location: loc });
  }
  if (h["x-powered-by"]) {
    issues.push({ title: "X-Powered-By header present", detail: h["x-powered-by"], severity: "info", location: loc });
  }
  if (h["access-control-allow-origin"] === "*") {
    issues.push({
      title: "CORS allows any origin",
      detail: "ACAO is *",
      severity: h["access-control-allow-credentials"] === "true" ? "high" : "low",
      location: loc,
    });
  }
  return issues;
}

export async function collectRecon(target: string, depth: DepthId): Promise<ReconPack> {
  const spec = depthOf(depth);
  const origin = await assertSafeUrl(target);
  const originUrl = origin.toString();
  const probes: ProbeResult[] = [];
  const home = await fetchProbe(originUrl, "GET");
  probes.push(home);
  const cors = await fetchProbe(originUrl, "OPTIONS", {
    origin: "https://umbra.invalid",
    "access-control-request-method": "GET",
  });
  probes.push(cors);

  let baseUrl = home.redirectedTo ?? originUrl;
  try {
    baseUrl = new URL(baseUrl).toString();
  } catch {
    baseUrl = originUrl;
  }

  const paths = PATH_POOL.slice(0, Math.max(0, spec.probes - 2));
  const concurrency = 6;
  for (let i = 0; i < paths.length; i += concurrency) {
    const chunk = paths.slice(i, i + concurrency).map((p) => new URL(p, baseUrl).toString());
    probes.push(...(await Promise.all(chunk.map((u) => fetchProbe(u, "GET")))));
  }

  const scriptUrls: string[] = [];
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(home.bodySnippet))) {
    try {
      scriptUrls.push(new URL(m[1], baseUrl).toString());
    } catch {
      /* skip */
    }
  }
  const uniqueScripts = [...new Set(scriptUrls)];
  for (let i = 0; i < uniqueScripts.slice(0, spec.js).length; i += concurrency) {
    const chunk = uniqueScripts.slice(i, i + concurrency);
    probes.push(...(await Promise.all(chunk.map((u) => fetchProbe(u, "GET")))));
  }

  const formActions: string[] = [];
  const fre = /<form[^>]+action=["']([^"']*)["']/gi;
  while ((m = fre.exec(home.bodySnippet))) {
    try {
      formActions.push(new URL(m[1] || ".", baseUrl).toString());
    } catch {
      /* skip */
    }
  }

  const secrets = probes.flatMap((p) => scanSecrets(p.bodySnippet, p.url));
  const headerIssues = analyzeHeaders(home);
  const acao = cors.headers["access-control-allow-origin"];
  if (acao === "https://umbra.invalid" || acao === "*") {
    headerIssues.push({
      title: "CORS reflects arbitrary Origin",
      detail: `OPTIONS with Origin https://umbra.invalid got ACAO: ${acao}`,
      severity: cors.headers["access-control-allow-credentials"] === "true" ? "high" : "medium",
      location: originUrl,
    });
  }

  const bodyAll = probes.map((p) => p.bodySnippet).join("\n");
  const captchaSignals: string[] = [];
  if (/recaptcha|hcaptcha|turnstile|captcha/i.test(bodyAll)) captchaSignals.push("CAPTCHA library or markup detected in responses");
  if (/g-recaptcha|h-captcha|cf-turnstile/i.test(bodyAll)) captchaSignals.push("Specific CAPTCHA widget class present");

  const planHints: string[] = [];
  if (/isPremium|isPro|plan["']?\s*[:=]|featureFlag|entitlement/i.test(bodyAll)) {
    planHints.push("Client-side plan/feature flag strings observed in body/JS");
  }
  if (/role["']?\s*[:=]\s*["']admin|isAdmin\s*[:=]\s*true/i.test(bodyAll)) {
    planHints.push("Client-side admin/role indicators observed");
  }

  const notes: string[] = [];
  const robots = probes.find((p) => p.url.endsWith("/robots.txt") && p.status === 200);
  if (robots?.bodySnippet) notes.push("robots.txt present");
  const git = probes.find((p) => p.url.includes("/.git/HEAD") && p.status === 200 && /ref:/.test(p.bodySnippet));
  if (git) notes.push(".git/HEAD publicly readable");
  notes.push(`${probes.length} probes, ${secrets.length} secret hits, ${captchaSignals.length} captcha signals`);

  return {
    target: originUrl,
    finalUrl: home.redirectedTo ?? originUrl,
    depth,
    fetchedAt: new Date().toISOString(),
    probes: probes.map((p) => ({ ...p, bodySnippet: p.bodySnippet.slice(0, 4000) })),
    secrets,
    headerIssues,
    notes,
    formActions: formActions.slice(0, 20),
    scriptUrls: uniqueScripts.slice(0, 30),
    captchaSignals,
    planHints,
  };
}

export function instrumentFindings(pack: ReconPack): Finding[] {
  const out: Finding[] = [];
  for (const s of pack.secrets) {
    out.push({
      id: nid(),
      title: `Possible ${s.kind} in response body`,
      severity: "critical",
      category: "secrets",
      evidence: `${s.kind} matched, redacted ${s.redacted}`,
      location: s.location,
      reproduction: `GET ${s.location} and search for the ${s.kind} pattern.`,
      impact: "Leaked credentials can be replayed against the issuing service.",
      recommendation: "Rotate the credential and remove it from client-side assets.",
      source: "instrument",
      reportable: true,
    });
  }
  for (const h of pack.headerIssues) {
    out.push({
      id: nid(),
      title: h.title,
      severity: h.severity,
      category: h.title.toLowerCase().includes("cors") ? "cors" : "headers",
      evidence: h.detail,
      location: h.location,
      reproduction: `Inspect response headers on ${h.location}.`,
      impact: h.detail,
      recommendation: "Set the missing or tightened control on the origin.",
      source: "instrument",
      reportable: true,
    });
  }
  for (const c of pack.captchaSignals) {
    out.push({
      id: nid(),
      title: "CAPTCHA / bot-control signal present",
      severity: "info",
      category: "captcha",
      evidence: c,
      location: pack.target,
      reproduction: "Load the origin HTML/JS and search for CAPTCHA library markers.",
      impact: "Bot controls exist; residual risk depends on rate limits and server-side enforcement.",
      recommendation: "Confirm server-side validation and rate limiting accompany the widget.",
      source: "instrument",
      reportable: true,
      bypassNotes: "Residual risk only — do not treat as an operational bypass recipe.",
    });
  }
  for (const p of pack.planHints) {
    out.push({
      id: nid(),
      title: "Client-side plan / feature gate indicator",
      severity: "medium",
      category: "plan-bypass",
      evidence: p,
      location: pack.target,
      reproduction: "Search JS/HTML for plan, premium, or feature-flag strings observed in the pack.",
      impact: "If authorization is decided only in the browser, features may be unlockable by client changes.",
      recommendation: "Enforce entitlements server-side; treat client flags as UX only.",
      source: "instrument",
      reportable: true,
      bypassNotes: "Client-side gate only — confirm with authenticated API checks.",
    });
  }
  return out;
}

export function packToPrompt(pack: ReconPack): string {
  const slim = pack.probes
    .filter((p) => p.status && p.status !== 404)
    .slice(0, 40)
    .map((p) => {
      const keys = ["server", "x-powered-by", "content-type", "set-cookie", "content-security-policy", "strict-transport-security", "access-control-allow-origin", "location"];
      const headers = keys.filter((k) => p.headers[k]).map((k) => `${k}: ${p.headers[k]}`).join("\n");
      return `### ${p.method} ${p.url} → ${p.status} (${p.ms}ms)\n${headers}\n${p.bodySnippet.slice(0, 1500)}`;
    })
    .join("\n\n");
  return [
    `TARGET: ${pack.target}`,
    `FINAL: ${pack.finalUrl}`,
    `DEPTH: ${pack.depth}`,
    `NOTES:\n${pack.notes.map((n) => "- " + n).join("\n")}`,
    `SECRETS:\n${pack.secrets.map((s) => `- ${s.kind} ${s.redacted} @ ${s.location}`).join("\n") || "- none"}`,
    `HEADER ISSUES:\n${pack.headerIssues.map((h) => `- [${h.severity}] ${h.title}: ${h.detail}`).join("\n") || "- none"}`,
    `CAPTCHA SIGNALS:\n${pack.captchaSignals.map((c) => "- " + c).join("\n") || "- none"}`,
    `PLAN HINTS:\n${pack.planHints.map((c) => "- " + c).join("\n") || "- none"}`,
    `PROBES:\n${slim}`,
  ].join("\n\n");
}
