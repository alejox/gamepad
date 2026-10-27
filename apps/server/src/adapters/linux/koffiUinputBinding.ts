import koffi from "koffi";
import { UinputSyscallError, type UinputBinding } from "./UinputBinding.js";

// fcntl.h (Linux, x86_64 and aarch64)
const O_WRONLY = 0o1;
const O_NONBLOCK = 0o4000;

/**
 * libc.so.6 via koffi. Thin on purpose: it only turns -1 + errno into
 * `UinputSyscallError`. Runs on Linux only; exercised by the CI smoke test.
 */
export function createKoffiUinputBinding(): UinputBinding {
  const libc = koffi.load("libc.so.6");
  const open = libc.func("int open(const char *path, int flags)");
  // ioctl is variadic in glibc; koffi passes each extra argument with an explicit type.
  const ioctl = libc.func("int ioctl(int fd, unsigned long request, ...)");
  const write = libc.func("long write(int fd, const void *buf, unsigned long count)");
  const close = libc.func("int close(int fd)");
  const strerror = libc.func("const char *strerror(int errnum)");

  const errnoNames = new Map(Object.entries(koffi.os.errno).map(([name, value]) => [value, name]));
  const check = (syscall: string, result: number): number => {
    if (result >= 0) return result;
    const errno = koffi.errno();
    throw new UinputSyscallError(syscall, errnoNames.get(errno) ?? `errno ${errno}`, String(strerror(errno)));
  };

  return {
    open: (path) => check("open", open(path, O_WRONLY | O_NONBLOCK)),
    ioctl: (fd, request, arg) =>
      check("ioctl", typeof arg === "number" ? ioctl(fd, request, "int", arg) : ioctl(fd, request, "void *", arg)),
    write: (fd, data) => check("write", Number(write(fd, data, data.length))),
    close: (fd) => {
      check("close", close(fd));
    },
  };
}
