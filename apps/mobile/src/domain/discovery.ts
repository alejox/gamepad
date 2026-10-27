import { DISCOVERY_SERVICE, type DiscoveryInfo } from "@gamepad/shared";

/** Subnets swept when nothing better is known (most common home routers). */
const FALLBACK_SUBNETS = ["192.168.0", "192.168.1", "10.0.0"] as const;
const HOST_NAME_MAX_LENGTH = 64;
// C0/C1 control characters.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Octets(host: string): number[] | null {
  const match = IPV4.exec(host.trim());
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

/** True for RFC 1918 addresses (10/8, 172.16/12, 192.168/16). */
export function isPrivateIPv4(host: string): boolean {
  const octets = ipv4Octets(host);
  if (!octets) return false;
  const [a, b] = octets as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function subnetOf(ip: string): string {
  return ip.trim().split(".").slice(0, 3).join(".");
}

export interface CandidateHints {
  /** Last successfully used server host (may be a hostname). */
  lastHost: string;
  /** Hostname the app page was served from (the PC in the browser dev loop). */
  pageHost: string;
}

/**
 * Ordered, de-duplicated hosts to probe: the last host, the page host (when a
 * private IPv4), full /24 sweeps of their subnets, then common fallback /24s.
 * The WebView cannot read its own IP, so the phone's subnet is guessed.
 */
export function discoveryCandidates({ lastHost, pageHost }: CandidateHints): string[] {
  const hosts = new Set<string>();
  const subnets: string[] = [];
  const last = lastHost.trim();
  // IPv6 literals and anything with spaces are skipped; hostnames are kept.
  if (last !== "" && !last.includes(":") && !/\s/.test(last)) {
    hosts.add(last);
    if (isPrivateIPv4(last)) subnets.push(subnetOf(last));
  }
  if (isPrivateIPv4(pageHost)) {
    hosts.add(pageHost.trim());
    subnets.push(subnetOf(pageHost));
  }
  for (const subnet of new Set([...subnets, ...FALLBACK_SUBNETS])) {
    for (let i = 1; i <= 254; i++) hosts.add(`${subnet}.${i}`);
  }
  return [...hosts];
}

/** Validates a `GET /discover` answer; null unless it is this app's service. */
export function parseDiscoveryInfo(value: unknown): DiscoveryInfo | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const { protocol, port } = record;
  if (record.service !== DISCOVERY_SERVICE) return null;
  if (typeof protocol !== "number" || !Number.isInteger(protocol)) return null;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const rawName = typeof record.name === "string" ? record.name : "";
  const name = rawName.replace(CONTROL_CHARS, "").trim().slice(0, HOST_NAME_MAX_LENGTH);
  return { service: DISCOVERY_SERVICE, protocol, name: name || "your PC", port };
}
