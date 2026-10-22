# Phase 1 — Keyboard/Mouse Gamepad (Android → Windows/macOS)

## Objective

Turn an Android phone into a Wi-Fi gamepad for a PC. The phone shows a virtual
controller; a PC server receives the input and emulates keyboard and mouse
events (same model as "Real Gamepad").

## Problem / Why

Users want to play PC games from the couch with their phone as a controller,
without buying hardware. Keyboard/mouse emulation works on Windows and macOS
with no kernel driver, so it is the deliverable MVP. Real XInput is Phase 2
(Windows only) because ViGEmBus is retired and macOS virtual HID requires
restricted Apple entitlements.

## Scope

In:
- npm workspaces monorepo: `packages/shared`, `apps/server`, `apps/mobile`.
- Shared, versioned JSON protocol over WebSocket with runtime validation.
- PC server: WebSocket transport, 6-digit pairing PIN, LAN IP display,
  keyboard/mouse emulation via `@jitsi/robotjs` behind an `InputDriver` port.
- Mobile app: Vue 3 + Vite + Pinia + Capacitor 8, landscape, multitouch
  buttons (Pointer Events), two virtual sticks, haptics, connect screen
  (manual IP + PIN, last host remembered).
- Left stick → digital directional keys (WASD by default) with deadzone.
- Right stick → mouse movement (velocity, server-side tick), configurable
  sensitivity.
- Key mapping per button, persisted on the phone.
- Five skins via CSS custom properties: Modern, NES, SNES, Xbox-like,
  PlayStation-like (generic look, no trademarks or logos).

Out (later phases):
- XInput virtual controller (Phase 2, Windows only).
- Automatic discovery (UDP/mDNS) and QR scanning in the app.
- Server packaging into a single executable; signed APK release.

## Constraints

- Generated artifacts (code, UI copy, docs) in English.
- No trademarked names or logos in skins.
- npm 12 blocks install scripts by default: native deps rely on prebuilt
  binaries loaded via `node-gyp-build` (verified for `@jitsi/robotjs` on
  Node 26 / macOS arm64).
- macOS requires granting Accessibility permission to the terminal/app that
  runs the server.
- No JDK / Android SDK on this machine: APK build cannot be verified here.

## Architecture

- `packages/shared`: protocol types, message constructors, `parseMessage`
  validator, default key mapping, button ids. Pure TS, unit tested.
- `apps/server` (hexagonal):
  - domain: `ControllerState` (button/stick → key down/up diffs),
    `stickToKeys` (deadzone + 8-way), `MouseMotion` (velocity → per-tick delta).
  - ports: `InputDriver` (`keyDown`, `keyUp`, `moveMouseBy`, `mouseButton`).
  - adapters: `RobotInputDriver`, `LoggingInputDriver` (dry run),
    WebSocket transport with PIN pairing, CLI entry printing IP/port/PIN.
  - On disconnect, all pressed keys are released (no stuck keys).
- `apps/mobile` (container/presentational):
  - composables: `useConnection` (ws + reconnect + hello/PIN),
    `usePointerButton`, `useVirtualStick`, `useHaptics`.
  - stores: `settings` (skin, mapping, sensitivity, last host) persisted.
  - views: `ConnectView`, `GamepadView`, `SettingsView`.

## Protocol v1 (client → server)

- `{ t: "hello", v: 1, pin: "123456", mapping }`
- `{ t: "btn", id: ButtonId, down: boolean }`
- `{ t: "stick", id: "L" | "R", x: number, y: number }` (each in [-1, 1])
- `{ t: "mapping", mapping }`
- `{ t: "ping", ts }`

Server → client: `{ t: "welcome" }`, `{ t: "error", code }`, `{ t: "pong", ts }`.

## Delivery strategy

Branch: `main` (user chose to stay on the checked-out branch). No remote yet;
PR slicing decided when a remote exists. Forecast: ~1500–2000 authored lines.

## Tasks

- [ ] T1 Monorepo scaffold + shared protocol with tests
- [ ] T2 Server domain (state diffing, stick→keys, mouse motion) with tests
- [ ] T3 Server adapters (ws + PIN pairing, robotjs driver, logging driver, CLI)
- [ ] T4 Mobile scaffold (Vue/Vite/Pinia/Capacitor, landscape) + connection
- [ ] T5 Gamepad UI: multitouch buttons, virtual sticks, haptics
- [ ] T6 Skins (5) + settings (mapping, skin, sensitivity) persisted
- [ ] T7 README: run server, grant macOS permission, build APK

Route per task: delegated writer (multi-file, non-trivial).

## Acceptance criteria

- `npm test` passes across workspaces.
- `npm run typecheck` and `npm run build` pass for all workspaces.
- Server starts, prints LAN IP, port, PIN; rejects wrong PIN; releases keys on
  disconnect.
- Mobile web build runs in a browser and drives the server in dry-run mode.

## Progress / Evidence

(updated per task)

- Engram mirror `odd/phase-1-keyboard-mouse/tasks`: PENDING (host session
  registration failed on first save).

## Next step

T1.
