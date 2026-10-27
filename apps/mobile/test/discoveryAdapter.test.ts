import { DISCOVERY_SERVICE } from "@gamepad/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverHost } from "../src/adapters/discovery.js";

type Responder = (host: string) => unknown | "hang" | "fail";

/** Fake fetch: answers per host, or hangs until aborted like an absent LAN host. */
function fakeFetch(respond: Responder) {
  const requested: string[] = [];
  const fetchFn = vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    requested.push(url.hostname);
    const answer = respond(url.hostname);
    return new Promise((resolve, reject) => {
      const signal = init?.signal;
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (answer === "hang") return;
      if (answer === "fail") return reject(new TypeError("Failed to fetch"));
      resolve(new Response(JSON.stringify(answer), { status: 200 }));
    });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, requested };
}

const info = (name: string) => ({ service: DISCOVERY_SERVICE, protocol: 1, name, port: 7531 });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("discoverHost", () => {
  it("returns the first host answering with the gamepad service", async () => {
    const { fetchFn, requested } = fakeFetch((host) => (host === "10.0.0.3" ? info("Desk") : "fail"));
    const result = await discoverHost(["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"], 7531, {
      fetch: fetchFn,
      concurrency: 1,
    });
    expect(result).toEqual({ host: "10.0.0.3", info: info("Desk") });
    // Stops probing once found.
    expect(requested).toEqual(["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
  });

  it("probes the discover URL on the given port", async () => {
    const { fetchFn } = fakeFetch(() => info("Desk"));
    await discoverHost(["192.168.1.9"], 9000, { fetch: fetchFn });
    expect(vi.mocked(fetchFn).mock.calls[0]?.[0]).toBe("http://192.168.1.9:9000/discover");
  });

  it("ignores hosts answering with another service", async () => {
    const { fetchFn } = fakeFetch((host) =>
      host === "10.0.0.1" ? { service: "printer", protocol: 1, name: "x", port: 80 } : info("Real"),
    );
    const result = await discoverHost(["10.0.0.1", "10.0.0.2"], 7531, { fetch: fetchFn, concurrency: 1 });
    expect(result?.host).toBe("10.0.0.2");
  });

  it("times out silent hosts and keeps scanning", async () => {
    const { fetchFn } = fakeFetch((host) => (host === "10.0.0.2" ? info("Late") : "hang"));
    const pending = discoverHost(["10.0.0.1", "10.0.0.2"], 7531, { fetch: fetchFn, concurrency: 1, timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(499);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ host: "10.0.0.2", info: info("Late") });
  });

  it("returns null when nothing answers", async () => {
    const { fetchFn } = fakeFetch(() => "hang");
    const pending = discoverHost(["10.0.0.1", "10.0.0.2", "10.0.0.3"], 7531, { fetch: fetchFn, concurrency: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
  });

  it("limits concurrent probes", async () => {
    const { fetchFn, requested } = fakeFetch(() => "hang");
    const hosts = Array.from({ length: 10 }, (_, i) => `10.0.0.${i + 1}`);
    const pending = discoverHost(hosts, 7531, { fetch: fetchFn, concurrency: 3, timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(0);
    expect(requested).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(500);
    expect(requested).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBeNull();
  });

  it("stops and returns null when cancelled", async () => {
    const { fetchFn, requested } = fakeFetch(() => "hang");
    const controller = new AbortController();
    const hosts = Array.from({ length: 50 }, (_, i) => `10.0.0.${i + 1}`);
    const pending = discoverHost(hosts, 7531, { fetch: fetchFn, concurrency: 2, signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await pending).toBeNull();
    expect(requested).toHaveLength(2);
  });
});
