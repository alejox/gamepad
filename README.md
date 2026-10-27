# Gamepad — use your Android phone as a Wi-Fi PC controller

The phone shows a virtual controller (two sticks, d-pad, face buttons,
shoulders, Start/Select). A small Node server on the PC receives the input over
WebSocket and emulates **keyboard and mouse** on Windows or macOS. No drivers.

- Left stick → digital directional keys (WASD by default).
- Right stick → mouse movement (velocity based, configurable sensitivity).
- Every button maps to a key or mouse button, editable on the phone.

## Quick path

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
| Node.js | 22 or newer (developed on Node 26) |
| PC OS | Windows 10/11 or macOS (keyboard/mouse via `@jitsi/robotjs` prebuilt binaries) |
| Phone | Android 7+ (API 24) on the same Wi-Fi as the PC |
| APK build only | JDK 21 + Android SDK (Android Studio) |

## Run the server

```bash
npm run start -w @gamepad/server             # real keyboard/mouse emulation
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

### macOS: grant Accessibility permission

Input emulation is blocked until the app that runs Node is trusted:

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Enable your terminal (Terminal, iTerm, VS Code…). Add it with **+** if missing.
3. Restart the terminal and the server.

### Windows: firewall

On first start Windows asks whether Node.js may accept connections. Allow it on
**Private networks** (make sure your Wi-Fi profile is set to Private). If you
missed the prompt, allow `node.exe` in *Windows Defender Firewall → Allow an app*.

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

- **Phase 2:** real XInput virtual controller (Windows only).
- Automatic discovery (mDNS/UDP) and QR pairing.
- Single-executable server and signed release APK.
