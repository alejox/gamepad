export interface SocketHandlers {
  onOpen(): void;
  onMessage(data: string): void;
  onClose(): void;
}

/** Minimal socket surface the connection store depends on. */
export interface GamepadSocket {
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string, handlers: SocketHandlers) => GamepadSocket;

/** Browser/WebView WebSocket adapter. Throws on a malformed URL. */
export const browserSocketFactory: SocketFactory = (url, handlers) => {
  const ws = new WebSocket(url);
  ws.onopen = () => handlers.onOpen();
  ws.onmessage = (event: MessageEvent) => {
    if (typeof event.data === "string") handlers.onMessage(event.data);
  };
  // "error" is always followed by "close"; handle the outcome once there.
  ws.onclose = () => handlers.onClose();
  return {
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close: () => ws.close(),
  };
};
