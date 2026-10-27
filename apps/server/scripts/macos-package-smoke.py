import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen

PORT = int(os.environ.get("GAMEPAD_PORT", "7531"))
HOST = f"http://localhost:{PORT}"


def get(url: str) -> str:
    with urlopen(url, timeout=2) as response:
        if response.status != 200:
            raise AssertionError(f"{url} returned HTTP {response.status}")
        return response.read().decode("utf-8")


def main() -> None:
    app = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/macos/AlejoxGamepad.app").resolve()
    executable = app / "Contents/MacOS/AlejoxGamepad"
    if not executable.is_file():
        raise AssertionError(f"Packaged executable not found: {executable}")

    env = os.environ.copy()
    env["GAMEPAD_PIN"] = "012345"
    env["PATH"] = "/usr/bin:/bin"
    with tempfile.TemporaryDirectory() as unrelated_directory:
        process = subprocess.Popen(
            [str(executable), "--no-open"],
            cwd=unrelated_directory,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )
        output = ""
        try:
            deadline = time.monotonic() + 30
            while True:
                if process.poll() is not None:
                    output = process.communicate(timeout=2)[0]
                    raise AssertionError(f"Host exited before serving status (exit {process.returncode})\n{output}")
                try:
                    status = json.loads(get(f"{HOST}/status"))
                    break
                except (OSError, ValueError):
                    if time.monotonic() >= deadline:
                        raise AssertionError("Timed out waiting for the packaged host")
                    time.sleep(0.25)

            assert status["port"] == PORT, status
            assert status["pin"] == "012345", status
            assert status["mode"] == "emulation", status
            assert status["driver"] == {"kind": "keyboard", "name": "Keyboard / mouse"}, status
            page = get(f"{HOST}/")
            assert "<title>Gamepad Host</title>" in page
            assert "Keyboard / mouse" in page
        finally:
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
                try:
                    output = process.communicate(timeout=15)[0]
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.communicate()
                    raise AssertionError("Packaged host did not shut down cleanly")

        print(output)
        if process.returncode != 0:
            raise AssertionError(f"Packaged host returned exit code {process.returncode}")
        if "Received SIGTERM" not in output:
            raise AssertionError("The host did not run its graceful SIGTERM shutdown")
        try:
            get(f"{HOST}/status")
            raise AssertionError("The bundled Node process remained alive after launcher shutdown")
        except URLError:
            pass

    print("PASS: real .app loaded robotjs, served status/HTML with keyboard/mouse, and exited cleanly")
    print("No Accessibility permission was granted and no keyboard or mouse input was emitted.")


if __name__ == "__main__":
    main()
