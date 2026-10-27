import { UinputSyscallError, type UinputBinding } from "../src/adapters/linux/UinputBinding.js";

export type UinputCall =
  | { op: "open"; path: string }
  | { op: "ioctl"; fd: number; request: number; arg: number | Buffer }
  | { op: "write"; fd: number; data: Buffer }
  | { op: "close"; fd: number };

/** Records syscalls; `failOn` makes the matching call throw like the real binding. */
export class FakeUinputBinding implements UinputBinding {
  readonly calls: UinputCall[] = [];
  readonly fd = 7;
  failOn: ((call: UinputCall) => UinputSyscallError | undefined) | undefined;
  /** Bytes reported as written; defaults to the full buffer. */
  shortWrite: number | undefined;

  open(path: string): number {
    this.record({ op: "open", path });
    return this.fd;
  }

  ioctl(fd: number, request: number, arg: number | Buffer): number {
    this.record({ op: "ioctl", fd, request, arg: Buffer.isBuffer(arg) ? Buffer.from(arg) : arg });
    return 0;
  }

  write(fd: number, data: Buffer): number {
    this.record({ op: "write", fd, data: Buffer.from(data) });
    return this.shortWrite ?? data.length;
  }

  close(fd: number): void {
    this.record({ op: "close", fd });
  }

  ioctls(): Array<{ request: number; arg: number | Buffer }> {
    return this.calls.flatMap((c) => (c.op === "ioctl" ? [{ request: c.request, arg: c.arg }] : []));
  }

  writes(): Buffer[] {
    return this.calls.flatMap((c) => (c.op === "write" ? [c.data] : []));
  }

  private record(call: UinputCall): void {
    this.calls.push(call);
    const error = this.failOn?.(call);
    if (error) throw error;
  }
}

export const syscallError = (syscall: string, code: string, message: string) =>
  new UinputSyscallError(syscall, code, message);
