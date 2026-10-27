/** Brackets IPv6 literals so the host can sit in a URL authority. */
function urlHost(host: string): string {
  const trimmed = host.trim();
  return trimmed.includes(":") && !trimmed.startsWith("[") ? `[${trimmed}]` : trimmed;
}

/** Builds the server WebSocket URL; IPv6 literals are bracketed. */
export function serverUrl(host: string, port: number): string {
  return `ws://${urlHost(host)}:${port}`;
}

/** Builds the host's public discovery URL (`GET /discover`). */
export function discoveryUrl(host: string, port: number): string {
  return `http://${urlHost(host)}:${port}/discover`;
}
