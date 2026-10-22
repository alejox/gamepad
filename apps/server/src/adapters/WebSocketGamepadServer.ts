import { timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import {
  type ClientMessage,
  DEFAULT_MAPPING,
  type ErrorCode,
  PROTOCOL_VERSION,
  type ServerMessage,
  encodeMessage,
  parseClientMessage,
} from "@gamepad/shared";
import { type WebSocket, WebSocketServer } from "ws";
import { dispatchKeyActions } from "../application/dispatchKeyActions.js";
import { ControllerState, type KeyAction } from "../domain/ControllerState.js";
import { MouseMotion, type MouseMotionOptions } from "../domain/MouseMotion.js";
import type { InputDriver } from "../ports/InputDriver.js";
import type { Logger } from "../ports/Logger.js";

export interface GamepadServerOptions {
  port: number;
  host?: string;
  pin: string;
  driver: InputDriver;
  logger: Logger;
  /** Left stick deadzone (vector magnitude). */
  deadzone: number;
  mouse: MouseMotionOptions;
  helloTimeoutMs?: number;
  /** Mouse tick period; ~8 ms is about 120 Hz. */
  tickIntervalMs?: number;
  now?: () => number;
}

/** Policy-violation close code; the reason carries our error code. */
const CLOSE_POLICY = 1008;
const MAX_PAYLOAD_BYTES = 16 * 1024;

interface Session {
  socket: WebSocket;
  state: ControllerState;
  motion: MouseMotion;
  ticker: NodeJS.Timeout | undefined;
  lastTick: number;
  /** Last right-stick vector, re-applied when sensitivity changes. */
  right: { x: number; y: number };
}

/**
 * WebSocket transport: PIN pairing, a single active controller, and
 * translation of protocol messages into InputDriver calls.
 */
export class WebSocketGamepadServer {
  private wss: WebSocketServer | undefined;
  private active: Session | undefined;
  private readonly helloTimeoutMs: number;
  private readonly tickIntervalMs: number;
  private readonly now: () => number;

  constructor(private readonly options: GamepadServerOptions) {
    this.helloTimeoutMs = options.helloTimeoutMs ?? 5000;
    this.tickIntervalMs = options.tickIntervalMs ?? 8;
    this.now = options.now ?? (() => performance.now());
  }

  /** Starts listening and resolves with the bound port. */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        port: this.options.port,
        host: this.options.host ?? "0.0.0.0",
        maxPayload: MAX_PAYLOAD_BYTES,
      });
      wss.once("error", reject);
      wss.once("listening", () => {
        wss.off("error", reject);
        wss.on("error", (error) => this.options.logger.warn(`Server error: ${error.message}`));
        resolve((wss.address() as AddressInfo).port);
      });
      wss.on("connection", (socket, request) => this.handleConnection(socket, request.socket.remoteAddress));
      this.wss = wss;
    });
  }

  /** Releases all held input and closes every connection. */
  async stop(): Promise<void> {
    if (this.active) this.endSession(this.active);
    const wss = this.wss;
    this.wss = undefined;
    if (!wss) return;
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }

  private handleConnection(socket: WebSocket, remote = "unknown"): void {
    const { logger } = this.options;
    if (this.active) {
      this.reject(socket, "busy");
      return;
    }

    let session: Session | undefined;
    const helloTimer = setTimeout(() => this.reject(socket, "timeout"), this.helloTimeoutMs);

    socket.on("message", (data, isBinary) => {
      const message = isBinary ? null : parseClientMessage(String(data));
      if (session) {
        this.handleMessage(session, message);
        return;
      }
      clearTimeout(helloTimer);
      session = this.pair(socket, message);
      if (session) logger.info(`Controller connected from ${remote}`);
    });

    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (session) {
        this.endSession(session);
        logger.info(`Controller disconnected (${remote}); all keys released`);
      }
    });

    socket.on("error", (error) => logger.warn(`Connection error (${remote}): ${error.message}`));
  }

  private pair(socket: WebSocket, message: ClientMessage | null): Session | undefined {
    if (message?.t !== "hello") return this.reject(socket, "not_paired");
    if (message.v !== PROTOCOL_VERSION) return this.reject(socket, "version");
    if (!pinMatches(message.pin, this.options.pin)) return this.reject(socket, "bad_pin");
    if (this.active) return this.reject(socket, "busy");

    const session: Session = {
      socket,
      state: new ControllerState(message.mapping ?? DEFAULT_MAPPING, { deadzone: this.options.deadzone }),
      motion: new MouseMotion({
        ...this.options.mouse,
        sensitivity: message.mouseSensitivity ?? this.options.mouse.sensitivity,
      }),
      ticker: undefined,
      lastTick: 0,
      right: { x: 0, y: 0 },
    };
    this.active = session;
    send(socket, { t: "welcome" });
    return session;
  }

  private handleMessage(session: Session, message: ClientMessage | null): void {
    switch (message?.t) {
      case "btn":
        this.apply(session.state.setButton(message.id, message.down));
        return;
      case "stick":
        if (message.id === "L") this.apply(session.state.setLeftStick(message.x, message.y));
        else this.setRightStick(session, message.x, message.y);
        return;
      case "mapping":
        this.apply(session.state.setMapping(message.mapping));
        if (message.mouseSensitivity !== undefined) {
          session.motion.setSensitivity(message.mouseSensitivity);
          this.setRightStick(session, session.right.x, session.right.y);
        }
        return;
      case "ping":
        send(session.socket, { t: "pong", ts: message.ts });
        return;
      case "hello":
        return; // Already paired; a repeated hello is harmless.
      default:
        send(session.socket, { t: "error", code: "bad_message" });
    }
  }

  private setRightStick(session: Session, x: number, y: number): void {
    session.right = { x, y };
    session.motion.setVector(x, y);
    if (session.motion.active && !session.ticker) {
      session.lastTick = this.now();
      session.ticker = setInterval(() => this.tick(session), this.tickIntervalMs);
    } else if (!session.motion.active) {
      this.stopTicker(session);
    }
  }

  private tick(session: Session): void {
    const now = this.now();
    const { dx, dy } = session.motion.tick(now - session.lastTick);
    session.lastTick = now;
    if (dx === 0 && dy === 0) return;
    try {
      this.options.driver.moveMouseBy(dx, dy);
    } catch (error) {
      this.options.logger.warn(`Mouse move failed: ${errorMessage(error)}`);
    }
  }

  private stopTicker(session: Session): void {
    if (session.ticker) clearInterval(session.ticker);
    session.ticker = undefined;
  }

  private endSession(session: Session): void {
    this.stopTicker(session);
    session.motion.setVector(0, 0);
    this.apply(session.state.releaseAll());
    if (this.active === session) this.active = undefined;
  }

  private apply(actions: readonly KeyAction[]): void {
    if (actions.length === 0) return;
    try {
      dispatchKeyActions(this.options.driver, actions);
    } catch (error) {
      this.options.logger.warn(`Input driver failed: ${errorMessage(error)}`);
    }
  }

  private reject(socket: WebSocket, code: ErrorCode): undefined {
    send(socket, { t: "error", code });
    socket.close(CLOSE_POLICY, code);
    return undefined;
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(encodeMessage(message));
}

function pinMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
