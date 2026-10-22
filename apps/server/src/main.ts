#!/usr/bin/env node
import { WebSocketGamepadServer } from "./adapters/WebSocketGamepadServer.js";
import { LoggingInputDriver } from "./adapters/LoggingInputDriver.js";
import { lanIPv4Addresses } from "./adapters/networkAddresses.js";
import { RobotInputDriver } from "./adapters/RobotInputDriver.js";
import { type ServerConfig, parseConfig } from "./config.js";
import type { InputDriver } from "./ports/InputDriver.js";
import type { Logger } from "./ports/Logger.js";

const logger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};

function printBanner(config: ServerConfig, port: number): void {
  const addresses = lanIPv4Addresses();
  const lines = [
    "",
    "  Gamepad server ready",
    "  --------------------",
    ...(addresses.length > 0
      ? addresses.map((address) => `  Address : ${address}:${port}`)
      : [`  Address : (no LAN IPv4 found) port ${port}`]),
    `  PIN     : ${config.pin}`,
    `  Mode    : ${config.dryRun ? "dry run (input is only logged)" : "keyboard/mouse emulation"}`,
    "",
  ];
  console.log(lines.join("\n"));
  if (process.platform === "darwin" && !config.dryRun) {
    console.log(
      "  macOS: grant Accessibility permission to this terminal (System Settings > Privacy & Security > Accessibility).\n",
    );
  }
}

async function createDriver(dryRun: boolean): Promise<InputDriver> {
  return dryRun ? new LoggingInputDriver() : RobotInputDriver.create();
}

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2), process.env);
  const server = new WebSocketGamepadServer({
    port: config.port,
    pin: config.pin,
    driver: await createDriver(config.dryRun),
    logger,
    deadzone: 0.3,
    mouse: { deadzone: 0.15, sensitivity: config.sensitivity, exponent: 2 },
  });
  const port = await server.start();
  printBanner(config, port);

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info(`\nReceived ${signal}; releasing input and shutting down.`);
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
