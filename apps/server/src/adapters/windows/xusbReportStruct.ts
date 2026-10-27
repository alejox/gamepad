import koffi from "koffi";

/**
 * koffi declaration of XUSB_REPORT, used to pass the report BY VALUE to
 * vigem_target_x360_update. Declaring it loads no DLL, so its layout is
 * checked against `encodeXusbReport` on any OS.
 */
export const XUSB_REPORT_STRUCT = koffi.struct("XUSB_REPORT", {
  wButtons: "uint16_t",
  bLeftTrigger: "uint8_t",
  bRightTrigger: "uint8_t",
  sThumbLX: "int16_t",
  sThumbLY: "int16_t",
  sThumbRX: "int16_t",
  sThumbRY: "int16_t",
});
