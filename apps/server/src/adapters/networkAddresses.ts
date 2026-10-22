import { networkInterfaces } from "node:os";

/** Non-internal IPv4 addresses the phone can use to reach this machine. */
export function lanIPv4Addresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}
