import { DEVICE_NAME_MAX_LENGTH, DISCOVERY_SERVICE } from "@gamepad/shared";
import { describe, expect, it } from "vitest";
import { discoveryUrl } from "../src/domain/address.js";
import { deviceName } from "../src/domain/device.js";
import { discoveryCandidates, isPrivateIPv4, parseDiscoveryInfo } from "../src/domain/discovery.js";

describe("isPrivateIPv4", () => {
  it("accepts RFC 1918 addresses", () => {
    expect(isPrivateIPv4("10.0.0.7")).toBe(true);
    expect(isPrivateIPv4("172.16.4.2")).toBe(true);
    expect(isPrivateIPv4("172.31.255.1")).toBe(true);
    expect(isPrivateIPv4("192.168.1.20")).toBe(true);
  });

  it("rejects public, loopback, hostnames and malformed values", () => {
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("127.0.0.1")).toBe(false);
    expect(isPrivateIPv4("localhost")).toBe(false);
    expect(isPrivateIPv4("192.168.1.256")).toBe(false);
    expect(isPrivateIPv4("192.168.1")).toBe(false);
    expect(isPrivateIPv4("")).toBe(false);
  });
});

describe("discoveryCandidates", () => {
  it("tries the last host, then the page host, then their subnets, then fallbacks", () => {
    const hosts = discoveryCandidates({ lastHost: "192.168.50.20", pageHost: "10.1.2.3" });
    expect(hosts.slice(0, 2)).toEqual(["192.168.50.20", "10.1.2.3"]);
    expect(hosts[2]).toBe("192.168.50.1");
    expect(hosts.indexOf("192.168.50.254")).toBeLessThan(hosts.indexOf("10.1.2.1"));
    expect(hosts.indexOf("10.1.2.254")).toBeLessThan(hosts.indexOf("192.168.0.1"));
    expect(hosts.indexOf("192.168.0.254")).toBeLessThan(hosts.indexOf("192.168.1.1"));
    expect(hosts.indexOf("192.168.1.254")).toBeLessThan(hosts.indexOf("10.0.0.1"));
    expect(hosts.at(-1)).toBe("10.0.0.254");
  });

  it("never lists a host twice", () => {
    const hosts = discoveryCandidates({ lastHost: "192.168.1.20", pageHost: "192.168.1.20" });
    expect(new Set(hosts).size).toBe(hosts.length);
    expect(hosts[0]).toBe("192.168.1.20");
    // 192.168.1.x (own subnet) + 192.168.0.x + 10.0.0.x
    expect(hosts).toHaveLength(254 * 3);
  });

  it("ignores a non-private page host and an IPv6 last host", () => {
    const hosts = discoveryCandidates({ lastHost: "fe80::1", pageHost: "localhost" });
    expect(hosts[0]).toBe("192.168.0.1");
    expect(hosts).toHaveLength(254 * 3);
  });

  it("keeps a hostname last host without sweeping a subnet for it", () => {
    const hosts = discoveryCandidates({ lastHost: " my-pc.local ", pageHost: "" });
    expect(hosts[0]).toBe("my-pc.local");
    expect(hosts).toHaveLength(1 + 254 * 3);
  });
});

describe("parseDiscoveryInfo", () => {
  const valid = { service: DISCOVERY_SERVICE, protocol: 1, name: "Desk PC", port: 7531 };

  it("accepts a valid answer", () => {
    expect(parseDiscoveryInfo(valid)).toEqual(valid);
  });

  it("rejects other services and malformed answers", () => {
    expect(parseDiscoveryInfo({ ...valid, service: "something-else" })).toBeNull();
    expect(parseDiscoveryInfo({ ...valid, port: 0 })).toBeNull();
    expect(parseDiscoveryInfo({ ...valid, protocol: "1" })).toBeNull();
    expect(parseDiscoveryInfo(null)).toBeNull();
    expect(parseDiscoveryInfo("alejox-gamepad")).toBeNull();
  });

  it("sanitizes the host name", () => {
    expect(parseDiscoveryInfo({ ...valid, name: " Desk\nPC " })?.name).toBe("DeskPC");
    expect(parseDiscoveryInfo({ ...valid, name: 42 })?.name).toBe("your PC");
  });
});

describe("discoveryUrl", () => {
  it("builds an http URL and brackets IPv6 literals", () => {
    expect(discoveryUrl("192.168.1.20", 7531)).toBe("http://192.168.1.20:7531/discover");
    expect(discoveryUrl("fe80::1", 7531)).toBe("http://[fe80::1]:7531/discover");
  });
});

describe("deviceName", () => {
  it("uses the Android model when the user agent has one", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    expect(deviceName(ua)).toBe("Pixel 7");
    expect(deviceName("Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36")).toBe("SM-S918B");
  });

  it("falls back to a generic Android name for reduced user agents", () => {
    expect(deviceName("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120 Mobile")).toBe("Android phone");
  });

  it("recognises iPhone and iPad", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceName("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("iPad");
  });

  it("falls back to Phone and clamps long or unsafe names", () => {
    expect(deviceName("")).toBe("Phone");
    expect(deviceName("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Phone");
    const long = `Mozilla/5.0 (Linux; Android 14; ${"X".repeat(80)}) AppleWebKit`;
    expect(deviceName(long)).toHaveLength(DEVICE_NAME_MAX_LENGTH);
    expect(deviceName("Mozilla/5.0 (Linux; Android 14; Bad\u0007Model)")).toBe("BadModel");
  });
});
