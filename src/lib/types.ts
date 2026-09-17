export const PROVIDERS = [
  "openrouter",
  "openai",
  "anthropic",
  "gemini",
  "xai",
  "mistral",
  "deepseek",
  "groq",
  "together",
  "fireworks",
] as const;

export type ProviderId = (typeof PROVIDERS)[number];

export type AppMode = "chat" | "code" | "solo-agent" | "group-agent" | "labs";

export type ReasoningLevel = "off" | "low" | "medium" | "high";

export type MixMode = "unified" | "pack" | "custom";

export interface ProviderKeys {
  openrouter: string;
  openai: string;
  anthropic: string;
  gemini: string;
  xai: string;
  mistral: string;
  deepseek: string;
  groq: string;
  together: string;
  fireworks: string;
}

export const EMPTY_KEYS: ProviderKeys = {
  openrouter: "",
  openai: "",
  anthropic: "",
  gemini: "",
  xai: "",
  mistral: "",
  deepseek: "",
  groq: "",
  together: "",
  fireworks: "",
};

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant" | "thought";
  content: string;
  ts: number;
  model?: string;
  reasoning?: string;
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  mode: AppMode;
  model: string;
  provider: ProviderId;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  conversationIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ThemeSettings {
  preset: "steel" | "obsidian" | "aurora" | "custom";
  backgroundImage?: string;
  backgroundOpacity: number;
  glassIntensity: number;
}

export interface AppSettings {
  keys: ProviderKeys;
  keyPool: Partial<Record<ProviderId, string[]>>;
  defaultProvider: ProviderId;
  defaultModel: string;
  reasoningLevel: ReasoningLevel;
  contextTokens: number | "auto";
  agentCount: number;
  find1: boolean;
  mixMode: MixMode;
  packId: string;
  waveSize: number;
  theme: ThemeSettings;
  operatorBrief: string;
}

export interface AgentSlot {
  id: string;
  model: string;
  provider: ProviderId;
  count: number;
}

export interface GroupComposition {
  slots: AgentSlot[];
}

export const DEPTHS = [
  { id: "pulse", label: "Pulse", band: "Light", index: 0, probes: 4, js: 0, description: "Origin + headers." },
  { id: "surface", label: "Surface", band: "Light+", index: 1, probes: 12, js: 1, description: "Well-known files." },
  { id: "probe", label: "Probe", band: "Mapped", index: 2, probes: 22, js: 3, description: "Sensitive paths + scripts." },
  { id: "depth", label: "Depth", band: "Deep", index: 3, probes: 36, js: 6, description: "Cookie/CORS + broader enum." },
  { id: "shadow", label: "Shadow", band: "Deep+", index: 4, probes: 48, js: 9, description: "API inference + JS harvest." },
  { id: "abyss", label: "Abyss", band: "Deep++", index: 5, probes: 62, js: 12, description: "Aggressive path enum." },
  { id: "rift", label: "Rift", band: "Deep+++", index: 6, probes: 76, js: 16, description: "Backups, debug, admin." },
  { id: "core", label: "Core", band: "Deeper", index: 7, probes: 90, js: 20, description: "Maximum harvest." },
] as const;

export type DepthId = (typeof DEPTHS)[number]["id"];
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingCategory =
  | "secrets"
  | "headers"
  | "misconfig"
  | "auth"
  | "cors"
  | "disclosure"
  | "logic"
  | "plan-bypass"
  | "captcha"
  | "other";

export type AgentStatus = "queued" | "running" | "retrying" | "done" | "failed" | "skipped";
export type RunKind = "recon" | "lab";
export type RunStatus = "queued" | "recon" | "agents" | "done" | "failed";

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category: FindingCategory;
  evidence: string;
  location: string;
  reproduction: string;
  impact: string;
  recommendation: string;
  source: "instrument" | "agent";
  agentId?: string;
  reportable: boolean;
  bypassNotes?: string;
}

export interface ThreadMessage {
  id: string;
  role: "system" | "user" | "assistant" | "thought" | "group";
  content: string;
  ts: number;
}

export interface AgentRun {
  id: string;
  codename: string;
  role: string;
  brief: string;
  provider: ProviderId;
  model: string;
  status: AgentStatus;
  messages: ThreadMessage[];
  findings: Finding[];
  summary: string;
  thinking: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface GroupMessage {
  id: string;
  agentId: string;
  codename: string;
  content: string;
  ts: number;
}

export interface ProbeResult {
  url: string;
  method: string;
  status: number | null;
  ms: number;
  headers: Record<string, string>;
  bodySnippet: string;
  contentType: string;
  error?: string;
  redirectedTo?: string;
}

export interface ReconPack {
  target: string;
  finalUrl: string;
  depth: DepthId;
  fetchedAt: string;
  probes: ProbeResult[];
  secrets: { kind: string; redacted: string; location: string }[];
  headerIssues: { title: string; detail: string; severity: Severity; location: string }[];
  notes: string[];
  formActions: string[];
  scriptUrls: string[];
  captchaSignals: string[];
  planHints: string[];
}

export interface LabProbeResult {
  probeId: string;
  technique: string;
  prompt: string;
  response: string;
  score: "refused" | "partial" | "jailbroken" | "error";
  rationale: string;
}

export interface RunSummary {
  score: number;
  grade: string;
  strongest: string[];
  weakest: string[];
  findingCount: number;
  criticalCount: number;
  highCount: number;
  reportableCount: number;
  agentDone: number;
  agentFailed: number;
  notes: string;
}

export interface Engagement {
  id: string;
  kind: RunKind;
  title: string;
  target: string;
  depth?: DepthId;
  status: RunStatus;
  find1: boolean;
  agentCount: number;
  mixMode: MixMode;
  packId?: string;
  provider: ProviderId;
  model: string;
  operatorBrief: string;
  agents: AgentRun[];
  groupChat: GroupMessage[];
  recon?: ReconPack;
  instrumentFindings: Finding[];
  labResults?: LabProbeResult[];
  summary?: RunSummary;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
