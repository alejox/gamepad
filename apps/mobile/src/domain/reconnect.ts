const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

/** Exponential backoff for reconnect attempt n (0-based), capped. */
export function reconnectDelay(attempt: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
}
