import koffi from "koffi";
import { describe, expect, it } from "vitest";
import { XUSB_REPORT_STRUCT } from "../src/adapters/windows/xusbReportStruct.js";
import { XUSB_REPORT_SIZE, encodeXusbReport, type XusbReport } from "../src/adapters/windows/xusbEncoding.js";

// The koffi struct passed by value must have the exact C layout the pure encoder documents.
describe("XUSB_REPORT koffi struct", () => {
  it("is 12 bytes with 2-byte alignment", () => {
    expect(koffi.sizeof(XUSB_REPORT_STRUCT)).toBe(XUSB_REPORT_SIZE);
    expect(koffi.alignof(XUSB_REPORT_STRUCT)).toBe(2);
  });

  it("encodes field by field like encodeXusbReport", () => {
    const report: XusbReport = {
      wButtons: 0xf00f,
      bLeftTrigger: 1,
      bRightTrigger: 254,
      sThumbLX: -32768,
      sThumbLY: 32767,
      sThumbRX: -1,
      sThumbRY: 300,
    };
    const buf = Buffer.alloc(XUSB_REPORT_SIZE);
    koffi.encode(buf, XUSB_REPORT_STRUCT, report);
    expect(buf).toEqual(encodeXusbReport(report));
  });
});
