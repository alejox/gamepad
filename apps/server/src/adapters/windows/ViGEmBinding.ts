import type { XusbReport } from "./xusbEncoding.js";

/** Opaque PVIGEM_CLIENT / PVIGEM_TARGET pointers; only the binding looks inside. */
export type ViGEmClientHandle = { readonly __brand: "PVIGEM_CLIENT" };
export type ViGEmTargetHandle = { readonly __brand: "PVIGEM_TARGET" };

/**
 * The ViGEmClient C API calls the Xbox 360 driver needs (include/ViGEm/Client.h).
 * The real implementation is koffi over ViGEmClient.dll; tests use a fake.
 * Calls returning VIGEM_ERROR return the raw unsigned code; allocators return
 * null for NULL.
 */
export interface ViGEmBinding {
  alloc(): ViGEmClientHandle | null;
  free(client: ViGEmClientHandle): void;
  connect(client: ViGEmClientHandle): number;
  disconnect(client: ViGEmClientHandle): void;
  targetX360Alloc(): ViGEmTargetHandle | null;
  targetFree(target: ViGEmTargetHandle): void;
  targetAdd(client: ViGEmClientHandle, target: ViGEmTargetHandle): number;
  targetRemove(client: ViGEmClientHandle, target: ViGEmTargetHandle): number;
  targetX360Update(client: ViGEmClientHandle, target: ViGEmTargetHandle, report: XusbReport): number;
}

/** VIGEM_ERROR codes from ViGEmClient include/ViGEm/Client.h (nefarius/ViGEmClient@b66d02d). */
export const VIGEM_ERROR = {
  NONE: 0x20000000,
  BUS_NOT_FOUND: 0xe0000001,
  NO_FREE_SLOT: 0xe0000002,
  INVALID_TARGET: 0xe0000003,
  REMOVAL_FAILED: 0xe0000004,
  ALREADY_CONNECTED: 0xe0000005,
  TARGET_UNINITIALIZED: 0xe0000006,
  TARGET_NOT_PLUGGED_IN: 0xe0000007,
  BUS_VERSION_MISMATCH: 0xe0000008,
  BUS_ACCESS_FAILED: 0xe0000009,
  CALLBACK_ALREADY_REGISTERED: 0xe0000010,
  CALLBACK_NOT_FOUND: 0xe0000011,
  BUS_ALREADY_CONNECTED: 0xe0000012,
  BUS_INVALID_HANDLE: 0xe0000013,
  XUSB_USERINDEX_OUT_OF_RANGE: 0xe0000014,
  INVALID_PARAMETER: 0xe0000015,
  NOT_SUPPORTED: 0xe0000016,
  WINAPI: 0xe0000017,
  TIMED_OUT: 0xe0000018,
  IS_DISPOSING: 0xe0000019,
} as const;

const MESSAGES: ReadonlyMap<number, string> = new Map([
  [VIGEM_ERROR.NONE, "success"],
  [VIGEM_ERROR.BUS_NOT_FOUND, "ViGEmBus bus not found"],
  [VIGEM_ERROR.NO_FREE_SLOT, "no free slot on the bus"],
  [VIGEM_ERROR.INVALID_TARGET, "invalid target"],
  [VIGEM_ERROR.REMOVAL_FAILED, "target removal failed"],
  [VIGEM_ERROR.ALREADY_CONNECTED, "target already connected"],
  [VIGEM_ERROR.TARGET_UNINITIALIZED, "target not initialized"],
  [VIGEM_ERROR.TARGET_NOT_PLUGGED_IN, "target not plugged in"],
  [VIGEM_ERROR.BUS_VERSION_MISMATCH, "ViGEmBus version mismatch (update ViGEmBus)"],
  [VIGEM_ERROR.BUS_ACCESS_FAILED, "cannot open the ViGEmBus device"],
  [VIGEM_ERROR.CALLBACK_ALREADY_REGISTERED, "callback already registered"],
  [VIGEM_ERROR.CALLBACK_NOT_FOUND, "callback not found"],
  [VIGEM_ERROR.BUS_ALREADY_CONNECTED, "client already connected to the bus"],
  [VIGEM_ERROR.BUS_INVALID_HANDLE, "invalid bus handle"],
  [VIGEM_ERROR.XUSB_USERINDEX_OUT_OF_RANGE, "XInput user index out of range"],
  [VIGEM_ERROR.INVALID_PARAMETER, "invalid parameter"],
  [VIGEM_ERROR.NOT_SUPPORTED, "not supported by this ViGEmBus version"],
  [VIGEM_ERROR.WINAPI, "Windows API call failed"],
  [VIGEM_ERROR.TIMED_OUT, "timed out"],
  [VIGEM_ERROR.IS_DISPOSING, "client is shutting down"],
]);

const hex = (code: number): string => `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;

/** "ViGEmBus bus not found (0xE0000001)"; unknown codes keep the hex value. */
export function describeViGEmError(code: number): string {
  return `${MESSAGES.get(code >>> 0) ?? "unknown ViGEm error"} (${hex(code)})`;
}

/** A ViGEmClient call that returned something other than VIGEM_ERROR_NONE. */
export class ViGEmError extends Error {
  readonly code: number;

  constructor(
    readonly call: string,
    code: number,
  ) {
    super(describeViGEmError(code));
    this.name = "ViGEmError";
    this.code = code >>> 0;
  }
}
