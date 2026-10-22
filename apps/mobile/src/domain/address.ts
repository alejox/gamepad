/** Builds the server WebSocket URL; IPv6 literals are bracketed. */
export function serverUrl(host: string, port: number): string {
  const trimmed = host.trim();
  const literal = trimmed.includes(":") && !trimmed.startsWith("[") ? `[${trimmed}]` : trimmed;
  return `ws://${literal}:${port}`;
}
