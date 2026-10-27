import type { ErrorCode } from "@gamepad/shared";

const MESSAGES: Record<ErrorCode, string> = {
  bad_pin: "Wrong PIN. Check the 6-digit code shown by the PC server.",
  version: "App and server versions do not match. Update both.",
  busy: "Another controller is already connected to this PC.",
  timeout: "The server timed out waiting for pairing. Try again.",
  bad_message: "The server rejected a message from this app.",
  not_paired: "Pairing failed. Try again.",
};

export function describeError(code: ErrorCode): string {
  return MESSAGES[code];
}

export function unreachableMessage(host: string, port: number): string {
  return `Could not reach ${host}:${port}. Check the IP, that the server is running and that both devices are on the same Wi-Fi.`;
}

/** Errors for the approval (no-PIN) flow, where some codes mean something else. */
const REQUEST_MESSAGES: Partial<Record<ErrorCode, string>> = {
  busy: "This PC already has a controller connected or another request waiting.",
  timeout: "Nobody answered the request on the PC in time. Try again.",
};

export function describeRequestError(code: ErrorCode): string {
  return REQUEST_MESSAGES[code] ?? MESSAGES[code];
}

export function deniedMessage(hostName: string): string {
  return `The connection was denied on ${hostName}.`;
}

export function notFoundMessage(port: number): string {
  return `No PC found on this Wi-Fi (port ${port}). Make sure the server is running, or enter the address and PIN below.`;
}
