#!/usr/bin/env node
import { WebSocketGamepadServer } from "./adapters/WebSocketGamepadServer.js";
import { createBrowserOpener, shouldOpenBrowser } from "./adapters/browserOpener.js";
import { NATIVE_GAMEPAD_PROBES } from "./adapters/gamepadProbes.js";
import { type HostDriver, createHostStatusHttp } from "./adapters/hostStatusHttp.js";
import { LoggingGamepadDriver } from "./adapters/LoggingGamepadDriver.js";
import { LoggingInputDriver } from "./adapters/LoggingInputDriver.js";
import { lanIPv4Addresses } from "./adapters/networkAddresses.js";
import { RobotInputDriver } from "./adapters/RobotInputDriver.js";
import { selectDriver } from "./application/selectDriver.js";
import { startServerWithFallback } from "./application/startServer.js";
import { type ServerConfig, parseConfig } from "./config.js";
import type { GamepadDriver } from "./ports/GamepadDriver.js";
import type { InputDriver } from "./ports/InputDriver.js";
import type { Logger } from "./ports/Logger.js";

const logger: Logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
};

/** The chosen output: exactly one of a virtual pad or keyboard/mouse. */
type Output = { gamepad: GamepadDriver; driver?: undefined } | { driver: InputDriver; gamepad?: undefined };

function describeOutput(output: Output): HostDriver {
  return output.gamepad
    ? { kind: "gamepad", name: output.gamepad.name }
    : { kind: "keyboard", name: "Keyboard / mouse" };
}

function printBanner(config: ServerConfig, port: number, driver: HostDriver): void {
  const addresses = lanIPv4Addresses();
  const lines = [
    "",
    "  Gamepad server ready",
    "  --------------------",
    ...(addresses.length > 0
      ? addresses.map((address) => `  Address : ${address}:${port}`)
      : [`  Address : (no LAN IPv4 found) port ${port}`]),
    `  PIN     : ${config.pin}`,
    `  Mode    : ${config.dryRun ? "dry run (input is only logged)" : "live input emulation"}`,
    `  Driver  : ${driver.name}`,
    `  Host UI : http://localhost:${port}/`,
    "",
  ];
  console.log(lines.join("\n"));
  if (process.platform === "darwin" && !config.dryRun && driver.kind === "keyboard") {
    const permissionTarget = process.env.GAMEPAD_PACKAGED === "1" ? "AlejoxGamepad" : "this terminal";
    console.log(
      `  macOS: grant Accessibility permission to ${permissionTarget} (System Settings > Privacy & Security > Accessibility).\n`,
    );
  }
}

async function createOutput(config: ServerConfig): Promise<Output> {
  const selection = await selectDriver({
    platform: process.platform,
    requested: config.driver,
    dryRun: config.dryRun,
    probes: NATIVE_GAMEPAD_PROBES,
    dryRunGamepad: () => new LoggingGamepadDriver(),
  });
  if (selection.kind === "error") throw new Error(selection.message);
  if (selection.kind === "gamepad") return { gamepad: selection.driver };
  if (selection.notice) logger.warn(selection.notice);
  return { driver: config.dryRun ? new LoggingInputDriver() : await RobotInputDriver.create() };
}

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2), process.env);
  const output = await createOutput(config);
  const driverInfo = describeOutput(output);
  let port = config.port;
  const hostStatus = createHostStatusHttp({
    snapshot: () => ({
      addresses: lanIPv4Addresses().map((address) => `${address}:${port}`),
      port,
      pin: config.pin,
      mode: config.dryRun ? "dry-run" : "emulation",
      driver: driverInfo,
      controller: server.controllerStatus(),
      pending: server.pendingRequest(),
    }),
    approval: {
      approve: () => server.approvePending(),
      deny: () => server.denyPending(),
    },
    stop: () => void shutdown("quit"),
  });
  const server: WebSocketGamepadServer = new WebSocketGamepadServer({
    port: config.port,
    pin: config.pin,
    ...output,
    logger,
    deadzone: 0.3,
    mouse: { deadzone: 0.15, sensitivity: config.sensitivity, exponent: 2 },
    http: hostStatus,
    onStatusChange: () => hostStatus.notify(),
  });
  port = await startServerWithFallback(server, config.port, logger);
  printBanner(config, port, driverInfo);
  if (process.env.GAMEPAD_PACKAGED === "1") {
    // The macOS launcher parses this line to learn the (possibly fallback) port.
    console.log(`GAMEPAD_READY ${port}`);
  }
  if (shouldOpenBrowser({ packaged: process.env.GAMEPAD_PACKAGED === "1", open: config.open, platform: process.platform })) {
    createBrowserOpener()(`http://localhost:${port}/`);
  }

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info(`\nReceived ${signal}; releasing input and shutting down.`);
    await server.stop();
    await output.gamepad?.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  if (process.platform === "win32") process.on("SIGBREAK", () => void shutdown("SIGBREAK"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
