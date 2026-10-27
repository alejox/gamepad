import type { ViGEmBinding, ViGEmClientHandle, ViGEmTargetHandle } from "../src/adapters/windows/ViGEmBinding.js";
import { VIGEM_ERROR } from "../src/adapters/windows/ViGEmBinding.js";
import type { XusbReport } from "../src/adapters/windows/xusbEncoding.js";

export type ViGEmCall =
  | { op: "alloc" }
  | { op: "free"; client: ViGEmClientHandle }
  | { op: "connect"; client: ViGEmClientHandle }
  | { op: "disconnect"; client: ViGEmClientHandle }
  | { op: "targetX360Alloc" }
  | { op: "targetFree"; target: ViGEmTargetHandle }
  | { op: "targetAdd"; client: ViGEmClientHandle; target: ViGEmTargetHandle }
  | { op: "targetRemove"; client: ViGEmClientHandle; target: ViGEmTargetHandle }
  | { op: "targetX360Update"; client: ViGEmClientHandle; target: ViGEmTargetHandle; report: XusbReport };

export type ViGEmOp = ViGEmCall["op"];

/**
 * Records ViGEmClient calls. `errors` sets the VIGEM_ERROR an op returns;
 * `nullHandles` makes alloc / targetX360Alloc return NULL.
 */
export class FakeViGEmBinding implements ViGEmBinding {
  readonly calls: ViGEmCall[] = [];
  readonly client = { fake: "client" } as unknown as ViGEmClientHandle;
  readonly target = { fake: "target" } as unknown as ViGEmTargetHandle;
  readonly errors = new Map<ViGEmOp, number>();
  readonly nullHandles = new Set<"alloc" | "targetX360Alloc">();

  alloc(): ViGEmClientHandle | null {
    this.calls.push({ op: "alloc" });
    return this.nullHandles.has("alloc") ? null : this.client;
  }

  free(client: ViGEmClientHandle): void {
    this.calls.push({ op: "free", client });
  }

  connect(client: ViGEmClientHandle): number {
    this.calls.push({ op: "connect", client });
    return this.result("connect");
  }

  disconnect(client: ViGEmClientHandle): void {
    this.calls.push({ op: "disconnect", client });
  }

  targetX360Alloc(): ViGEmTargetHandle | null {
    this.calls.push({ op: "targetX360Alloc" });
    return this.nullHandles.has("targetX360Alloc") ? null : this.target;
  }

  targetFree(target: ViGEmTargetHandle): void {
    this.calls.push({ op: "targetFree", target });
  }

  targetAdd(client: ViGEmClientHandle, target: ViGEmTargetHandle): number {
    this.calls.push({ op: "targetAdd", client, target });
    return this.result("targetAdd");
  }

  targetRemove(client: ViGEmClientHandle, target: ViGEmTargetHandle): number {
    this.calls.push({ op: "targetRemove", client, target });
    return this.result("targetRemove");
  }

  targetX360Update(client: ViGEmClientHandle, target: ViGEmTargetHandle, report: XusbReport): number {
    this.calls.push({ op: "targetX360Update", client, target, report: { ...report } });
    return this.result("targetX360Update");
  }

  ops(): ViGEmOp[] {
    return this.calls.map((c) => c.op);
  }

  reports(): XusbReport[] {
    return this.calls.flatMap((c) => (c.op === "targetX360Update" ? [c.report] : []));
  }

  private result(op: ViGEmOp): number {
    return this.errors.get(op) ?? VIGEM_ERROR.NONE;
  }
}
