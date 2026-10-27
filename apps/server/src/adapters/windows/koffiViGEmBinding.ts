import koffi from "koffi";
import type { ViGEmBinding, ViGEmClientHandle, ViGEmTargetHandle } from "./ViGEmBinding.js";
import { XUSB_REPORT_SIZE } from "./xusbEncoding.js";
import { XUSB_REPORT_STRUCT } from "./xusbReportStruct.js";

// Named koffi types are global; declare them once per process.
const PVIGEM_CLIENT = koffi.pointer("PVIGEM_CLIENT", koffi.opaque("VIGEM_CLIENT"));
const PVIGEM_TARGET = koffi.pointer("PVIGEM_TARGET", koffi.opaque("VIGEM_TARGET"));

/**
 * ViGEmClient.dll via koffi. Thin on purpose: pointers stay opaque koffi
 * handles and VIGEM_ERROR codes are returned raw. Windows only; exercised by
 * the windows-vigem CI smoke test. Signatures: include/ViGEm/Client.h.
 */
export function createKoffiViGEmBinding(dllPath: string): ViGEmBinding {
  if (koffi.sizeof(XUSB_REPORT_STRUCT) !== XUSB_REPORT_SIZE) {
    throw new Error(`XUSB_REPORT is ${koffi.sizeof(XUSB_REPORT_STRUCT)} bytes, expected ${XUSB_REPORT_SIZE}`);
  }
  const lib = koffi.load(dllPath);

  // VIGEM_ERROR is a 32-bit enum with values above INT32_MAX: read it unsigned.
  const alloc = lib.func("PVIGEM_CLIENT vigem_alloc(void)");
  const free = lib.func("void vigem_free(PVIGEM_CLIENT vigem)");
  const connect = lib.func("uint32_t vigem_connect(PVIGEM_CLIENT vigem)");
  const disconnect = lib.func("void vigem_disconnect(PVIGEM_CLIENT vigem)");
  const targetX360Alloc = lib.func("PVIGEM_TARGET vigem_target_x360_alloc(void)");
  const targetFree = lib.func("void vigem_target_free(PVIGEM_TARGET target)");
  const targetAdd = lib.func("uint32_t vigem_target_add(PVIGEM_CLIENT vigem, PVIGEM_TARGET target)");
  const targetRemove = lib.func("uint32_t vigem_target_remove(PVIGEM_CLIENT vigem, PVIGEM_TARGET target)");
  // XUSB_REPORT is passed by value.
  const targetX360Update = lib.func("vigem_target_x360_update", "uint32_t", [PVIGEM_CLIENT, PVIGEM_TARGET, XUSB_REPORT_STRUCT]);

  return {
    alloc: () => (alloc() as ViGEmClientHandle | null) ?? null,
    free: (c) => free(c),
    connect: (c) => Number(connect(c)),
    disconnect: (c) => disconnect(c),
    targetX360Alloc: () => (targetX360Alloc() as ViGEmTargetHandle | null) ?? null,
    targetFree: (t) => targetFree(t),
    targetAdd: (c, t) => Number(targetAdd(c, t)),
    targetRemove: (c, t) => Number(targetRemove(c, t)),
    targetX360Update: (c, t, report) => Number(targetX360Update(c, t, report)),
  };
}
