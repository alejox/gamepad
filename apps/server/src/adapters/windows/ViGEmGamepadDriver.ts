import type { PadState } from "../../domain/PadState.js";
import type { GamepadDriver } from "../../ports/GamepadDriver.js";
import { VIGEM_ERROR, ViGEmError, type ViGEmBinding, type ViGEmClientHandle, type ViGEmTargetHandle } from "./ViGEmBinding.js";
import { NEUTRAL_XUSB_REPORT, padToXusb, xusbReportsEqual, type XusbReport } from "./xusbEncoding.js";

export const VIGEM_DRIVER_NAME = "Virtual Xbox 360 (ViGEmBus)";

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Throws a ViGEmError unless `code` is VIGEM_ERROR_NONE. */
function check(call: string, code: number): void {
  if (code >>> 0 !== VIGEM_ERROR.NONE) throw new ViGEmError(call, code);
}

function setupError(call: string, error: unknown): Error {
  return Object.assign(new Error(`ViGEm setup failed at ${call}: ${reason(error)}`), { cause: error });
}

/**
 * A virtual Xbox 360 pad on ViGEmBus. The target is plugged in by the
 * constructor; `update` sends a report only when it differs from the last one.
 */
export class ViGEmGamepadDriver implements GamepadDriver {
  readonly name = VIGEM_DRIVER_NAME;
  private readonly client: ViGEmClientHandle;
  private readonly target: ViGEmTargetHandle;
  private last: XusbReport = NEUTRAL_XUSB_REPORT;
  private closed = false;

  constructor(private readonly binding: ViGEmBinding) {
    const client = binding.alloc();
    if (!client) throw new Error("ViGEm setup failed at vigem_alloc: out of memory");
    try {
      check("vigem_connect", binding.connect(client));
    } catch (error) {
      binding.free(client);
      throw setupError("vigem_connect", error);
    }
    const target = binding.targetX360Alloc();
    if (!target) {
      binding.disconnect(client);
      binding.free(client);
      throw new Error("ViGEm setup failed at vigem_target_x360_alloc: out of memory");
    }
    try {
      check("vigem_target_add", binding.targetAdd(client, target));
    } catch (error) {
      binding.targetFree(target);
      binding.disconnect(client);
      binding.free(client);
      throw setupError("vigem_target_add", error);
    }
    this.client = client;
    this.target = target;
  }

  update(state: PadState): void {
    if (this.closed) return;
    this.send(padToXusb(state));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const { binding, client, target } = this;
    try {
      // Release first so nothing stays held; unplug even if that fails.
      try {
        this.send(NEUTRAL_XUSB_REPORT);
      } catch {
        // The target is being removed anyway; removal releases everything.
      }
      check("vigem_target_remove", binding.targetRemove(client, target));
    } catch (error) {
      throw Object.assign(new Error(`vigem_target_remove failed: ${reason(error)}`), { cause: error });
    } finally {
      binding.targetFree(target);
      binding.disconnect(client);
      binding.free(client);
    }
  }

  private send(report: XusbReport): void {
    if (xusbReportsEqual(report, this.last)) return;
    try {
      check("vigem_target_x360_update", this.binding.targetX360Update(this.client, this.target, report));
    } catch (error) {
      throw Object.assign(new Error(`vigem_target_x360_update failed: ${reason(error)}`), { cause: error });
    }
    this.last = report;
  }
}
