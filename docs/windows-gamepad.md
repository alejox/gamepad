# Windows: virtual Xbox 360 pad (ViGEmBus)

On Windows the server plugs in a virtual **Xbox 360 controller** through the
ViGEmBus kernel driver. Games see a real XInput pad and use their built-in
Xbox mapping.

It needs two things: the **ViGEmBus driver** installed once, and
**`ViGEmClient.dll`**, the user-mode library the server loads through koffi.
Admin rights are needed only to install the driver.

## 1. Install ViGEmBus 1.22.0

Download the installer (`.exe`) from
<https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0>, run it and reboot
if asked.

ViGEmBus is retired and its repository archived, but the maintainer's
end-of-life note says existing installs keep working. Windows 11 is not
verified by this project yet.

Without the driver the server reports
`ViGEmBus driver not installed (install ViGEmBus 1.22.0: …)`.

## 2. Get ViGEmClient.dll

We never commit binaries. The `windows-vigem` GitHub Actions workflow builds
the DLL from the archived ViGEmClient source (pinned commit, `Release_DLL x64`,
static CRT, so no Visual C++ runtime is needed) and uploads it as the
`ViGEmClient-win32-x64` artifact.

Download it from the latest successful run into the server package:

```sh
gh run download -R alejox/gamepad -n ViGEmClient-win32-x64 -D apps/server/native/win32-x64
```

Or from the browser: **Actions → windows-vigem → latest green run →
Artifacts → ViGEmClient-win32-x64**, and unzip `ViGEmClient.dll` into
`apps/server/native/win32-x64/`.

The server looks for the DLL in this order:

1. `GAMEPAD_VIGEM_DLL` (full path to the DLL; when set, nothing else is tried)
2. `apps/server/native/win32-<arch>/ViGEmClient.dll`
3. Next to the Node executable (for a future packaged `.exe`)

Without it the server reports `ViGEmClient.dll not found (looked in: …)`.

## 3. Start the server in pad mode

```sh
npm run start -w @gamepad/server -- --driver=gamepad
```

`--driver=gamepad` exits with the reason if the pad cannot be created;
`auto` (default) falls back to keyboard/mouse and prints the reason instead.
The banner and the host page show `Virtual Xbox 360 (ViGEmBus)` when it works.

## 4. Verify the pad

- Press `Win+R`, run `joy.cpl` (**Set up USB game controllers**): an
  **Controller (XBOX 360 For Windows)** entry appears while the server runs.
  Open **Properties** and press buttons on the phone.
- Steam → Settings → Controller lists an Xbox 360 controller.

## Notes

- **Firewall:** the phone connects over the LAN; allow Node on **Private**
  networks when Windows asks (see the README's firewall section).
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
