import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from urllib.request import urlopen

HOST = "http://localhost:7531"


def get(url: str) -> str:
    with urlopen(url, timeout=2) as response:
        if response.status != 200:
            raise AssertionError(f"{url} returned HTTP {response.status}")
        return response.read().decode("utf-8")


def main() -> None:
    package = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/windows/AlejoxGamepad").resolve()
    executable = package / "AlejoxGamepad.exe"
    if not executable.is_file():
        raise AssertionError(f"Packaged executable not found: {executable}")

    env = os.environ.copy()
    env["GAMEPAD_PIN"] = "012345"
    process = subprocess.Popen(
        [str(executable), "--no-open"],
        cwd=package,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    output = ""
    try:
        deadline = time.monotonic() + 30
        while True:
            if process.poll() is not None:
                output = process.communicate(timeout=2)[0]
                raise AssertionError(f"Host exited before serving status (exit {process.returncode})")
            try:
                status = json.loads(get(f"{HOST}/status"))
                break
            except (OSError, ValueError):
                if time.monotonic() >= deadline:
                    raise AssertionError("Timed out waiting for the packaged host")
                time.sleep(0.25)

        assert status["port"] == 7531, status
        assert status["pin"] == "012345", status
        assert status["mode"] == "emulation", status
        assert status["driver"] == {"kind": "keyboard", "name": "Keyboard / mouse"}, status
        page = get(f"{HOST}/")
        assert "<title>Gamepad Host</title>" in page
        assert "Keyboard / mouse" in page
    finally:
        if process.poll() is None:
            process.send_signal(signal.CTRL_BREAK_EVENT)
            try:
                output = process.communicate(timeout=15)[0]
            except subprocess.TimeoutExpired:
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], check=False)
                process.communicate()
                raise AssertionError("Packaged host did not shut down cleanly")

    print(output)
    if process.returncode != 0:
        raise AssertionError(f"Packaged host returned exit code {process.returncode}")
    print("PASS: packaged host served status and driver selection, then exited cleanly")


if __name__ == "__main__":
    main()
