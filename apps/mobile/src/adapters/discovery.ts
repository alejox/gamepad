import type { DiscoveryInfo } from "@gamepad/shared";
import { discoveryUrl } from "../domain/address.js";
import { parseDiscoveryInfo } from "../domain/discovery.js";

export interface DiscoveredHost {
  host: string;
  info: DiscoveryInfo;
}

export interface DiscoveryOptions {
  /** Aborting it stops the scan; the result is then null. */
  signal?: AbortSignal;
  /** Per-host timeout; absent LAN hosts usually hang rather than refuse. */
  timeoutMs?: number;
  /** Maximum probes in flight. */
  concurrency?: number;
  fetch?: typeof fetch;
}

export type Discover = (hosts: readonly string[], port: number, signal: AbortSignal) => Promise<DiscoveredHost | null>;

async function probe(
  fetchFn: typeof fetch,
  host: string,
  port: number,
  timeoutMs: number,
  stop: AbortSignal,
): Promise<DiscoveryInfo | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  stop.addEventListener("abort", abort, { once: true });
  try {
    // A plain GET without custom headers needs no CORS preflight.
    const response = await fetchFn(discoveryUrl(host, port), { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return null;
    return parseDiscoveryInfo(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    stop.removeEventListener("abort", abort);
  }
}

/**
 * Probes `http://<host>:<port>/discover` for each host with bounded
 * concurrency. The first valid gamepad answer wins and cancels the rest.
 */
export async function discoverHost(
  hosts: readonly string[],
  port: number,
  options: DiscoveryOptions = {},
): Promise<DiscoveredHost | null> {
  const { signal, timeoutMs = 500, concurrency = 24 } = options;
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  if (signal?.aborted) return null;

  const stop = new AbortController();
  const onCancel = () => stop.abort();
  signal?.addEventListener("abort", onCancel, { once: true });
  let next = 0;
  let found: DiscoveredHost | null = null;

  async function worker(): Promise<void> {
    while (!stop.signal.aborted && next < hosts.length) {
      const host = hosts[next++] as string;
      const info = await probe(fetchFn, host, port, timeoutMs, stop.signal);
      if (info && !stop.signal.aborted) {
        found = { host, info };
        stop.abort();
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  } finally {
    signal?.removeEventListener("abort", onCancel);
  }
  return signal?.aborted ? null : found;
}

/** Default scan used by the connection store. */
export const browserDiscover: Discover = (hosts, port, signal) => discoverHost(hosts, port, { signal });
