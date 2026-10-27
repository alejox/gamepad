# Gamepad — use your Android phone as a Wi-Fi PC controller

The phone shows a virtual controller (two sticks, d-pad, face buttons,
shoulders, Start/Select). The PC host receives the input over WebSocket and
emulates an **Xbox 360 controller** or **keyboard and mouse**.

- Left stick → digital directional keys (WASD by default) or an Xbox stick.
- Right stick → mouse movement (velocity based, configurable sensitivity) or an Xbox stick.
- Every button maps to a key or mouse button, editable on the phone.

## Windows quick start (no developer tools)

You do **not** need Node.js, npm, git, Visual Studio or a separate DLL download.

1. Download `AlejoxGamepad-Setup-<version>.exe` from the latest
   [GitHub Release](https://github.com/alejox/gamepad/releases/latest) and run it.
2. Leave **Install ViGEmBus 1.22.0** selected to create a virtual Xbox 360
   controller. Installation needs administrator rights; reboot if the driver
   installer asks for it.
3. Start **AlejoxGamepad** from the Start menu or desktop. It opens
   `http://localhost:7531/` with the PC addresses, PIN and selected driver.
4. On the phone, install/open the app while connected to the same Wi-Fi. Enter
   the PC address, port `7531` and the PIN, then tap **Connect** and play.

The installer also adds a private-network firewall rule and an uninstaller.
The packages are not code-signed, so Windows SmartScreen may show a warning.

For a portable setup, download `AlejoxGamepad-Portable-<version>.zip`, extract
it and run `AlejoxGamepad.exe`. Keep all files together. If ViGEmBus is not
installed, the included `redistributables/ViGEmBus_1.22.0_x64_x86_arm64.exe`
can install it; otherwise the host uses keyboard/mouse. Allow `node.exe` on
**Private networks** if Windows shows a firewall prompt.

## macOS quick start (no developer tools)

You need an **Apple Silicon Mac (arm64)**. Intel Macs are not supported. You do
**not** need Node.js, npm, git, Xcode or any terminal commands.

1. Download `AlejoxGamepad-<version>-macOS-arm64.dmg` from the latest
   [GitHub Release](https://github.com/alejox/gamepad/releases/latest), open it
   and drag **AlejoxGamepad** to **Applications**.
2. The app is ad-hoc signed but **not notarized or signed with a Developer ID
   certificate**, so Gatekeeper may warn that its developer cannot be verified.
   In Applications, right-click **AlejoxGamepad → Open**, then choose **Open**
   if you trust this release. If macOS still blocks it, use **System Settings →
   Privacy & Security → Open Anyway** for AlejoxGamepad. A **“damaged”** warning
   is not expected: download the latest release instead of an older package.
3. Open **System Settings → Privacy & Security → Accessibility**, enable
   **AlejoxGamepad** (add it from Applications with **+** if needed), then quit
   and reopen it. This permission is required for keyboard/mouse emulation.
4. Launch **AlejoxGamepad** from Applications. It opens the host page with the
   PC addresses, PIN and Keyboard / mouse driver. The app runs in the
   background without opening Terminal; use **Stop server** on the page to quit
   it. If port `7531` is already in use, the host picks a free port and shows it
   on the page.
5. On the phone, install/open the app while connected to the same Wi-Fi. Enter
   the PC address, the port shown on the page and the PIN, then tap **Connect**
   and play.

If the app cannot start, it writes details to
`~/Library/Logs/AlejoxGamepad/host.log` and shows an error dialog.

For a portable setup, download
`AlejoxGamepad-Portable-<version>-macOS-arm64.zip`, extract it and keep the
whole `AlejoxGamepad.app` bundle together. The same Gatekeeper and Accessibility
steps apply. macOS virtual gamepads are not included; this package uses
keyboard/mouse.

## Development quick path

1. Install dependencies: `npm install` (Node 22+, npm 10+).
2. Start the server on the PC: `npm run start -w @gamepad/server`.
   It prints the LAN address, port and a 6-digit PIN.
3. Start the app: `npm run dev -w @gamepad/mobile`, then open
   `http://<pc-ip>:5173` on the phone (same Wi-Fi) — or install the APK.
4. Enter the PC address, port and PIN, tap **Connect** and play.

Try it without touching real input first: `npm run start:dry -w @gamepad/server`
logs every key and mouse action instead of emulating it.

## Architecture

```
 Android phone (Capacitor WebView)              PC (Windows / macOS)
+-----------------------------------+        +-------------------------------+
| apps/mobile  (Vue 3 + Pinia)      |        | apps/server  (Node, hexagonal)|
|  views: Connect, Gamepad, Settings|  JSON  |  WebSocketGamepadServer       |
|  composables: pointer, stick, dpad| -----> |   PIN pairing, 1 controller   |
|  stores: connection, settings     |  ws:// |  domain: ControllerState,     |
|  adapters: socket, haptics, prefs | <----- |   stickToDirections,          |
+-----------------------------------+  :7531 |   MouseMotion (tick ~120 Hz)  |
                 \                            |  port: InputDriver            |
                  \   packages/shared         |   RobotInputDriver (robotjs)  |
                   +- protocol v1, validation |   LoggingInputDriver (dry run)|
                      key mapping, button ids +-------------------------------+
```

All held keys are released when the phone disconnects, hides the app or loses
focus, and when the server stops.

## Requirements

| What | Version / note |
|------|----------------|
| Windows end user | Windows 10/11 x64; the packaged host includes Node and all native libraries |
| macOS end user | macOS 13.5+ on Apple Silicon (arm64); the `.app` includes Node and all native addons |
| Development | Node.js 22+ and npm 10+ (developed on Node 26) |
| PC OS for development | Windows 10/11 or macOS (keyboard/mouse via `@jitsi/robotjs` prebuilt binaries) |
| Phone | Android 7+ (API 24) on the same Wi-Fi as the PC |
| APK build only | JDK 21 + Android SDK (Android Studio) |

## Run the server from source

```bash
npm run start -w @gamepad/server             # real input emulation (auto driver)
npm run start:dry -w @gamepad/server         # log only (safe to test)
GAMEPAD_PIN=123456 GAMEPAD_PORT=7531 GAMEPAD_SENSITIVITY=1500 npm run start -w @gamepad/server
```

| Variable | Default | Meaning |
|----------|---------|---------|
| `GAMEPAD_PORT` | `7531` | WebSocket port |
| `GAMEPAD_PIN` | random | 6-digit pairing PIN |
| `GAMEPAD_SENSITIVITY` | `1200` | Default cursor speed (px/s at full right stick); the phone can override it per session (100–5000) |
| `GAMEPAD_DRIVER` | `auto` | Output driver: `auto`, `gamepad` or `keyboard` (the `--driver=` flag wins) |

Stop with `Ctrl+C`; held input is released first.

### Driver modes

The server outputs either a **virtual Xbox 360 pad** or **keyboard/mouse**. Pick
one with `--driver=<mode>` (after `--` when using npm) or `GAMEPAD_DRIVER`:

| Mode | Behavior |
|------|----------|
| `auto` (default) | Virtual pad when available, otherwise keyboard/mouse with a notice |
| `gamepad` | Virtual pad or exit with an error |
| `keyboard` | Keyboard/mouse only (the phone's key mapping and right-stick mouse) |

- In pad mode buttons map by position (A/B/X/Y, L1/R1 → LB/RB, L2/R2 → full
  triggers, Select → Back), the right stick is a real stick, and key mappings
  are ignored. The banner and host page show the active driver.
- `--dry-run --driver=gamepad` logs pad state instead of creating a device.
- **macOS** always uses keyboard/mouse: virtual HID devices need a DriverKit
  entitlement.
- **Linux** creates a virtual Xbox 360 pad through `/dev/uinput`; it needs the
  `uinput` module and write access. See [docs/linux-gamepad.md](docs/linux-gamepad.md).
- **Windows** creates a virtual Xbox 360 (XInput) pad through ViGEmBus; it
  needs the ViGEmBus 1.22.0 driver and `ViGEmClient.dll` (built by CI). See
  [docs/windows-gamepad.md](docs/windows-gamepad.md).

### macOS development: grant Accessibility permission

Packaged-app setup is covered in the macOS quick start above. For source runs,
input emulation is blocked until the app that runs Node is trusted:

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Enable your terminal (Terminal, iTerm, VS Code…). Add it with **+** if missing.
3. Restart the terminal and the server.

### Windows: firewall

The installer allows TCP port 7531 for its included `node.exe` on **Private**
networks and removes that rule on uninstall. For portable or source use, allow
`node.exe` on **Private networks** when Windows asks (the Wi-Fi profile must be
Private). If you missed the prompt, use *Windows Defender Firewall → Allow an app*.

## Run the mobile app in a browser (development)

```bash
npm run dev -w @gamepad/mobile
```

Vite listens on all interfaces. Open `http://<pc-ip>:5173` on the phone, rotate
to landscape and connect. Mobile Chrome works fine; haptics fall back to
`navigator.vibrate`.

## Build the Android APK

Install **JDK 21** (required by Capacitor 8's Gradle config) and Android
Studio / the Android SDK (`ANDROID_HOME` set), then:

Without Android Studio on macOS (verified):

```bash
brew install openjdk@21
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=$HOME/Library/Android/sdk
sdkmanager --sdk_root=$ANDROID_HOME --licenses
sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-36" "build-tools;36.0.0"
echo "sdk.dir=$ANDROID_HOME" > apps/mobile/android/local.properties
```

Build:

```bash
npm run build -w @gamepad/mobile
cd apps/mobile && npx cap sync android
cd android && ./gradlew assembleDebug
# -> apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Notes:

- The WebView is served from `http://localhost` (`server.androidScheme: "http"`)
  and cleartext is enabled, so the app can open plain `ws://<lan-ip>:7531`.
- The activity is locked to `sensorLandscape`.

## Protocol v1 (JSON over WebSocket)

Client → server:

| Message | Notes |
|---------|-------|
| `{ "t": "hello", "v": 1, "pin": "123456", "mapping"?, "mouseSensitivity"? }` | Must be the first frame (within 5 s) |
| `{ "t": "btn", "id": "a", "down": true }` | Button ids: `dpad_*`, `a b x y`, `l1 r1 l2 r2`, `start select`, `l3 r3` |
| `{ "t": "stick", "id": "L" \| "R", "x": 0.5, "y": -1 }` | Each axis in [-1, 1]; y down is positive |
| `{ "t": "mapping", "mapping", "mouseSensitivity"? }` | Applied immediately; sensitivity kept when omitted |
| `{ "t": "ping", "ts": 1234 }` | Answered with `pong` (latency readout) |

Server → client: `{ "t": "welcome" }`, `{ "t": "pong", "ts" }`,
`{ "t": "error", "code" }` with `bad_pin`, `version`, `busy`, `timeout`,
`bad_message`, `not_paired`. Only one controller is active at a time.

## Development

```bash
npm test          # all workspaces (vitest)
npm run typecheck
npm run build
```

The mobile workspace type-checks with `vue-tsc` on a local TypeScript 6,
because TypeScript 7 no longer ships the JS API vue-tsc needs.

## Roadmap

- Automatic discovery (mDNS/UDP) and QR pairing.
- Signed Windows host and release APK.
