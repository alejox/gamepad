import { timingSafeEqual } from "node:crypto";
import { type IncomingMessage, type Server, STATUS_CODES, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type ClientMessage,
  DEFAULT_MAPPING,
  type ErrorCode,
  type KeyMapping,
  PROTOCOL_VERSION,
  type RequestMessage,
  type ServerMessage,
  encodeMessage,
  parseClientMessage,
} from "@gamepad/shared";
import { type WebSocket, WebSocketServer } from "ws";
import { dispatchKeyActions } from "../application/dispatchKeyActions.js";
import { ControllerState, type KeyAction } from "../domain/ControllerState.js";
import { MouseMotion, type MouseMotionOptions } from "../domain/MouseMotion.js";
import type { ControllerStatus, ControllerStatusListener, PendingRequest } from "../ports/ControllerStatus.js";
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
  /** How long an approval request waits for the host user (default 30 s). */
  approvalTimeoutMs?: number;
  /** Mouse tick period; ~8 ms is about 120 Hz. */
  tickIntervalMs?: number;
  now?: () => number;
  /** Plain HTTP requests on the same port; without it they get 426. */
  http?: HttpRequestHandler;
  /** Called whenever a controller pairs or disconnects, or the pending request changes. */
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

interface PendingApproval {
  socket: WebSocket;
  remote: string;
  device: string;
  timer: NodeJS.Timeout;
  /** Promotes the waiting connection to the active session. */
  activate(): void;
}

/**
 * WebSocket transport: PIN pairing, a single active controller, and
 * translation of protocol messages into InputDriver calls.
 */
export class WebSocketGamepadServer {
  private wss: WebSocketServer | undefined;
  private httpServer: Server | undefined;
  private active: Session | undefined;
  private pending: PendingApproval | undefined;
  private readonly helloTimeoutMs: number;
  private readonly approvalTimeoutMs: number;
  private readonly tickIntervalMs: number;
  private readonly now: () => number;

  constructor(private readonly options: GamepadServerOptions) {
    this.helloTimeoutMs = options.helloTimeoutMs ?? 5000;
    this.approvalTimeoutMs = options.approvalTimeoutMs ?? 30_000;
    this.tickIntervalMs = options.tickIntervalMs ?? 8;
    this.now = options.now ?? (() => performance.now());
  }

  /** Current pairing state, for status displays. */
  controllerStatus(): ControllerStatus {
    return this.active
      ? { connected: true, remoteAddress: this.active.remote }
      : { connected: false, remoteAddress: null };
  }

  /** The phone waiting for approval, if any. */
  pendingRequest(): PendingRequest | null {
    return this.pending ? { remoteAddress: this.pending.remote, device: this.pending.device } : null;
  }

  /** Accepts the pending request as the active controller. False when nothing is pending. */
  approvePending(): boolean {
    const pending = this.takePending();
    if (!pending) return false;
    if (this.active) {
      // A PIN pairing won the race while the request was waiting.
      this.reject(pending.socket, "busy");
    } else {
      pending.activate();
      this.options.logger.info(`Controller approved: ${pending.device} (${pending.remote})`);
    }
    this.emitStatus();
    return true;
  }

  /** Rejects the pending request. False when nothing is pending. */
  denyPending(): boolean {
    const pending = this.takePending();
    if (!pending) return false;
    send(pending.socket, { t: "denied" });
    pending.socket.close(CLOSE_POLICY, "denied");
    this.options.logger.info(`Controller request denied: ${pending.device} (${pending.remote})`);
    this.emitStatus();
    return true;
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
    if (this.takePending()) this.emitStatus();
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
    let awaitingApproval = false;
    const helloTimer = setTimeout(() => this.reject(socket, "timeout"), this.helloTimeoutMs);

    socket.on("message", (data, isBinary) => {
      const message = isBinary ? null : parseClientMessage(String(data));
      if (session) {
        this.handleMessage(session, message);
        return;
      }
      if (awaitingApproval) {
        // Only keep-alive pings are answered until the host user decides.
        if (message?.t === "ping") send(socket, { t: "pong", ts: message.ts });
        return;
      }
      clearTimeout(helloTimer);
      if (message?.t === "request") {
        awaitingApproval = this.requestApproval(socket, message, remote, () => {
          awaitingApproval = false;
          session = this.activate(socket, message, remote);
        });
        return;
      }
      session = this.pair(socket, message, remote);
      if (session) {
        logger.info(`Controller connected from ${remote}`);
        this.emitStatus();
      }
    });

    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (this.pending?.socket === socket) {
        this.takePending();
        logger.info(`Controller request withdrawn (${remote})`);
        this.emitStatus();
      }
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
    return this.activate(socket, message, remote);
  }

  /** Registers the single pending request. False (and the socket is closed) when rejected. */
  private requestApproval(
    socket: WebSocket,
    message: RequestMessage,
    remote: string,
    activate: () => void,
  ): boolean {
    if (message.v !== PROTOCOL_VERSION) return this.reject(socket, "version") ?? false;
    if (this.active || this.pending) return this.reject(socket, "busy") ?? false;

    const pending: PendingApproval = {
      socket,
      remote,
      device: message.device,
      activate,
      timer: setTimeout(() => {
        if (this.pending !== pending) return;
        this.takePending();
        this.reject(socket, "timeout");
        this.options.logger.info(`Controller request timed out: ${pending.device} (${remote})`);
        this.emitStatus();
      }, this.approvalTimeoutMs),
    };
    this.pending = pending;
    send(socket, { t: "pending" });
    this.options.logger.info(`Controller request from ${message.device} (${remote}); approve it on the host page`);
    this.emitStatus();
    return true;
  }

  /** Clears the pending request and its timer; returns it when there was one. */
  private takePending(): PendingApproval | undefined {
    const pending = this.pending;
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    this.pending = undefined;
    return pending;
  }

  /** Makes the connection the active controller and welcomes it. */
  private activate(
    socket: WebSocket,
    settings: { mapping?: KeyMapping; mouseSensitivity?: number },
    remote: string,
  ): Session {
    const session: Session = {
      socket,
      state: new ControllerState(settings.mapping ?? DEFAULT_MAPPING, { deadzone: this.options.deadzone }),
      motion: new MouseMotion({
        ...this.options.mouse,
        sensitivity: settings.mouseSensitivity ?? this.options.mouse.sensitivity,
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
      case "request":
        return; // Already paired; a repeated handshake is harmless.
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
