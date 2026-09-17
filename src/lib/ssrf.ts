import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.com",
  "instance-data",
]);

export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (v === "127.0.0.1" || v === "0.0.0.0" || v === "::1" || v === "::") return true;
  const m4 = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const a = Number(m4[1]);
    const b = Number(m4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (v.includes(":")) {
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
  }
  return false;
}

export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That URL is not valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https targets are allowed.");
  }
  if (url.username || url.password) throw new Error("URLs with credentials are blocked.");
  const host = url.hostname.replace(/\.+$/, "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("That host is blocked.");
  }
  const ip = isIP(host) ? host : (await lookup(host)).address;
  if (isPrivateIp(ip)) throw new Error("Private, loopback, and link-local targets are blocked.");
  return url;
}
