import { timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type Server, STATUS_CODES, type ServerResponse, createServer } from "node:http";
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
import type { ControllerStatus, ControllerStatusListener } from "../ports/ControllerStatus.js";
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
  /** Plain HTTP requests on the same port; without it they get 426. */
  http?: HttpRequestHandler;
  /** Called whenever a controller pairs or disconnects. */
  onStatusChange?: ControllerStatusListener;
}

/** Handles non-upgrade HTTP requests that share the WebSocket port. */
export interface HttpRequestHandler {
  handle(req: IncomingMessage, res: ServerResponse): void;
  /** Ends long-lived responses (e.g. event streams) before the port closes. */
  close(): void;
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
  remote: string;
}

/**
 * WebSocket transport: PIN pairing, a single active controller, and
 * translation of protocol messages into InputDriver calls.
 */
export class WebSocketGamepadServer {
  private wss: WebSocketServer | undefined;
  private httpServer: Server | undefined;
  private active: Session | undefined;
  private readonly helloTimeoutMs: number;
  private readonly tickIntervalMs: number;
  private readonly now: () => number;

  constructor(private readonly options: GamepadServerOptions) {
    this.helloTimeoutMs = options.helloTimeoutMs ?? 5000;
    this.tickIntervalMs = options.tickIntervalMs ?? 8;
    this.now = options.now ?? (() => performance.now());
  }

  /** Current pairing state, for status displays. */
  controllerStatus(): ControllerStatus {
    return this.active
      ? { connected: true, remoteAddress: this.active.remote }
      : { connected: false, remoteAddress: null };
  }

  /**
   * Starts listening and resolves with the bound port. WebSocket upgrades and
   * plain HTTP requests share one port.
   */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const httpServer = createServer((req, res) => this.handleHttp(req, res));
      const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD_BYTES });
      httpServer.once("error", reject);
      httpServer.once("listening", () => {
        httpServer.off("error", reject);
        httpServer.on("error", (error) => this.options.logger.warn(`Server error: ${error.message}`));
        resolve((httpServer.address() as AddressInfo).port);
      });
      // Errors on the HTTP server are re-emitted by wss; logged above instead.
      wss.on("error", () => {});
      wss.on("connection", (socket, request) => this.handleConnection(socket, request.socket.remoteAddress));
      httpServer.listen(this.options.port, this.options.host ?? "0.0.0.0");
      this.wss = wss;
      this.httpServer = httpServer;
    });
  }

  /** Releases all held input and closes every connection. */
  async stop(): Promise<void> {
    if (this.active) this.endSession(this.active);
    const wss = this.wss;
    const httpServer = this.httpServer;
    this.wss = undefined;
    this.httpServer = undefined;
    this.options.http?.close();
    if (wss) {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
    if (httpServer?.listening) {
      const closed = new Promise<void>((resolve) => httpServer.close(() => resolve()));
      httpServer.closeAllConnections();
      await closed;
    }
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    if (this.options.http) {
      this.options.http.handle(req, res);
      return;
    }
    // Same answer `ws` gives to non-upgrade requests on a standalone server.
    const body = STATUS_CODES[426] ?? "Upgrade Required";
    res.writeHead(426, { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  }

  private handleConnection(socket: WebSocket, remoteAddress: string | undefined): void {
    const remote = displayAddress(remoteAddress);
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
      session = this.pair(socket, message, remote);
      if (session) {
        logger.info(`Controller connected from ${remote}`);
        this.emitStatus();
      }
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

  private pair(socket: WebSocket, message: ClientMessage | null, remote: string): Session | undefined {
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
      remote,
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
    if (this.active !== session) return;
    this.active = undefined;
    this.emitStatus();
  }

  private emitStatus(): void {
    const listener = this.options.onStatusChange;
    if (!listener) return;
    try {
      listener(this.controllerStatus());
    } catch (error) {
      this.options.logger.warn(`Status listener failed: ${errorMessage(error)}`);
    }
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

/** Strips the IPv4-mapped IPv6 prefix so the address reads like the phone's IP. */
function displayAddress(address: string | undefined): string {
  if (!address) return "unknown";
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
