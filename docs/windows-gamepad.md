# Windows host and virtual Xbox 360 pad (ViGEmBus)

On Windows the host can plug in a virtual **Xbox 360 controller** through the
ViGEmBus kernel driver. Games see a real XInput pad and use their built-in
Xbox mapping. Without ViGEmBus, `auto` mode falls back to keyboard/mouse and
prints the reason in the console; the host page shows the selected driver.

## Install or run the packaged host

Download the installer from
[GitHub Releases](https://github.com/alejox/gamepad/releases). It includes the
Node runtime, server bundle, robotjs and koffi native addons, and
`ViGEmClient.dll`; no development tools or separate DLL downloads are needed.

1. Run `AlejoxGamepad-Setup-<version>.exe` as administrator.
2. Keep **Install ViGEmBus 1.22.0** selected if it is not already installed.
   Reboot if the driver installer requests it.
3. Launch AlejoxGamepad from the Start menu or desktop. The default browser
   opens `http://localhost:7531/` and shows the active driver, addresses and PIN.

The installer places files under Program Files, creates a private-network
firewall rule for TCP port 7531, and registers an uninstaller. Uninstalling
removes the application and firewall rule; it does not remove ViGEmBus, which
may be shared by other applications. Packages are unsigned, so a SmartScreen
warning is expected.

For the portable zip, extract all files and run `AlejoxGamepad.exe`. The
redistributable ViGEmBus installer is included under `redistributables/` if the
driver is needed. Pass `--no-open` to either packaged executable to suppress
the browser launch.

ViGEmBus is retired and its repository is archived, but existing installations
continue to work. Windows 11 still needs final validation on the user's PC.

## Verify the pad

- Press `Win+R`, run `joy.cpl` (**Set up USB game controllers**): a
  **Controller (XBOX 360 For Windows)** entry appears while the host runs.
  Open **Properties** and press buttons on the phone.
- Steam → Settings → Controller lists an Xbox 360 controller.
- If no virtual pad appears, check that the host page says
  **Virtual Xbox 360 (ViGEmBus)** rather than **Keyboard / mouse**.

## Run from source (development)

The development flow is unchanged:

```sh
npm run start -w @gamepad/server
npm run start -w @gamepad/server -- --driver=gamepad
```

`--driver=gamepad` exits with the reason if the pad cannot be created;
`auto` (default) falls back to keyboard/mouse and prints the reason instead.
Development does not open a browser automatically.

For source builds, CI compiles `ViGEmClient.dll` from the archived ViGEmClient
source (pinned commit, `Release_DLL x64`, static CRT) and uploads the standalone
`ViGEmClient-win32-x64` artifact. Place it in
`apps/server/native/win32-x64/` or set `GAMEPAD_VIGEM_DLL` to its full path.
Packaged builds ship the DLL beside `node.exe`, where the same resolver finds
it both in the portable directory and under Program Files.

## Package and CI

`npm run build:bundle -w @gamepad/server` creates the esbuild bundle locally.
On `windows-latest`, `apps/server/scripts/package-windows.ps1` compiles the
small native launcher, stages the portable runtime and native files, verifies
their presence, downloads ViGEmBus 1.22.0 with SHA-256 verification, builds the
Inno Setup installer, and creates the portable zip.

The workflow starts the actual executable with `--no-open`, checks `/status`
and the HTML page, and sends a console break to verify clean shutdown. It runs
this smoke against both the portable directory and a silent Program Files
installation, then runs the uninstaller. Tags matching `v*` publish both
packages to a GitHub Release.

## Notes

- **Firewall:** installed hosts allow TCP 7531 on **Private** networks only.
  For portable use, allow the included `node.exe` on private networks when
  Windows asks. The Wi-Fi profile must be Private for the phone to connect.
- **Anti-cheat:** some anti-cheat systems block or flag virtual controllers.
  Use it only where that is acceptable.
- Rumble (force feedback) is not forwarded to the phone.

## Mapping

| Phone | XInput |
|-------|--------|
| A / B / X / Y | A / B / X / Y |
| L1 / R1 | LB / RB |
| L2 / R2 | Left / right trigger (0 or 255) |
| Select / Start | Back / Start |
| L3 / R3 | Left / right thumb |
| Left / right stick | `sThumbLX/LY` / `sThumbRX/RY` (−32768..32767, up is positive) |
| D-pad | D-pad buttons |

The Guide button is never sent.
