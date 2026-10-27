/**
 * The four libc calls the uinput driver needs. The real implementation is
 * koffi over libc.so.6; tests use a fake. Every method throws a
 * `UinputSyscallError` instead of returning -1.
 */
export interface UinputBinding {
  /** Opens `path` write-only and non-blocking; returns the fd. */
  open(path: string): number;
  /** `arg` is an int (SET_*BIT) or a struct buffer passed by pointer. */
  ioctl(fd: number, request: number, arg: number | Buffer): number;
  /** Returns the number of bytes written. */
  write(fd: number, data: Buffer): number;
  close(fd: number): void;
}

/** A failed libc call: `code` is the errno name (EACCES, ENOENT, ...). */
export class UinputSyscallError extends Error {
  constructor(
    readonly syscall: string,
    readonly code: string,
    readonly detail: string,
  ) {
    super(`${detail} (${code})`);
    this.name = "UinputSyscallError";
  }
}

