import type { Logger } from "../ports/Logger.js";
import type { WebSocketGamepadServer } from "../adapters/WebSocketGamepadServer.js";

/** True when a bind failed because another process already owns the port. */
export function isAddrInUse(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EADDRINUSE"
  );
}

/**
 * Starts the server on `preferredPort`, falling back to an OS-assigned port
 * when that port is taken so the host never dies on a port collision.
 */
export async function startServerWithFallback(
  server: WebSocketGamepadServer,
  preferredPort: number,
  logger: Logger,
): Promise<number> {
  try {
    return await server.start(preferredPort);
  } catch (error) {
    if (!isAddrInUse(error)) throw error;
    logger.warn(`Port ${preferredPort} is in use; using an available port instead.`);
    return await server.start(0);
  }
}
