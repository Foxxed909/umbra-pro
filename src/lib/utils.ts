import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nid(prefix = ""): string {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${id}` : id;
}

export function redactSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "…" + value.slice(-4);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function clampText(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export function formatAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
