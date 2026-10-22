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

- [x] T1 Monorepo scaffold + shared protocol with tests
- [x] T2 Server domain (state diffing, stick→keys, mouse motion) with tests
- [x] T3 Server adapters (ws + PIN pairing, robotjs driver, logging driver, CLI)
- [x] T4 Mobile scaffold (Vue/Vite/Pinia/Capacitor, landscape) + connection
- [x] T5 Gamepad UI: multitouch buttons, virtual sticks, haptics
- [x] T6 Skins (5) + settings (mapping, skin, sensitivity) persisted
- [x] T7 README: run server, grant macOS permission, build APK

Route per task: delegated writer (multi-file, non-trivial).

## Acceptance criteria

- `npm test` passes across workspaces.
- `npm run typecheck` and `npm run build` pass for all workspaces.
- Server starts, prints LAN IP, port, PIN; rejects wrong PIN; releases keys on
  disconnect.
- Mobile web build runs in a browser and drives the server in dry-run mode.

## Progress / Evidence

(updated per task)

- T1 `a8324f3` feat(shared) — route: delegated writer. RED: 25/25 shared
  tests failed (exports missing). GREEN: `npm test -w @gamepad/shared` 39
  passed; shared `typecheck` and `build` clean (TypeScript 7.0.2).
  Workspace packages expose a `source` export condition (src/*.ts) used by
  typecheck/vitest/tsx; `build` resolves the compiled `dist`.
- T2 `10bd249` feat(server) domain — route: delegated writer. RED: 4 test
  files failed with "Cannot find module" (domain absent). GREEN: server 22
  passed, shared 39 passed; root `typecheck` and `build` clean.
  stickToDirections is angle-based (8 x 45-degree sectors, radial deadzone).
- T3 `cd8e0e3` feat(server) adapters — route: delegated writer. RED: 3 new test
  files failed with "Cannot find module" (config, LoggingInputDriver,
  WebSocketGamepadServer). GREEN: server 42 passed (stable over 5 runs),
  shared 39 passed. Root `npm install` OK (install scripts for robotjs,
  esbuild, fsevents left blocked; robotjs prebuilt loads via
  node-gyp-build, verified by loading `RobotInputDriver` from dist).
  `npm run typecheck` exit 0, `npm run build` exit 0. `npm run start:dry`
  printed banner (LAN IPv4:port, PIN, dry-run mode) and released input on
  SIGINT; `node dist/main.js --dry-run` also starts.
  Known gaps: no PIN brute-force rate limiting (one attempt per
  connection only); real robotjs input not exercised (needs macOS
  Accessibility grant, manual check).

- T4 `9506ff9` feat(mobile) scaffold + connection — route: delegated writer.
  RED: connectionStore.test.ts failed with "Cannot find module
  ../src/domain/reconnect.js". GREEN: mobile 9 passed. vue-tsc cannot run on
  TypeScript 7 (no JS API); `scripts/vue-tsc.cjs` runs it against a
  workspace-local TypeScript 6.0.3 (verified it reports injected errors).
  `npx cap add android` OK; manifest has `usesCleartextTraffic="true"` and
  `screenOrientation="sensorLandscape"`; `server.androidScheme: "http"`
  (option name verified in @capacitor/cli 8.5.3 declarations).
- T5 `e0b960b` feat(mobile) gamepad UI — route: delegated writer. RED: dpad and
  stick tests failed with "Cannot find module" (domain absent). GREEN: mobile
  28 passed. L3/R3 = small buttons under each stick (double-tap conflicts with
  stick movement). Browser/multitouch behaviour not exercised by the writer.
- T6 `0406367` feat skins + settings + mouseSensitivity — route: delegated
  writer. RED: shared 5 failed (mouseSensitivity), server 3 failed
  (per-session sensitivity, got 20 px/tick instead of 5), logging aggregation
  1 failed, mobile 5 failed (settings fields, hello/mapping sensitivity).
  GREEN: shared 44, server 47, mobile 34 passed. Protocol choice: optional
  field on hello/mapping instead of a new message, because older servers drop
  unknown fields but answer an unknown message type with bad_message.
- T7 `27f6001` docs README — JDK 21 verified from Capacitor 8 gradle
  (`JavaVersion.VERSION_21`).
- Verification (after T7): `npm install` OK; `npm run typecheck` exit 0;
  `npm test` 44/47/34 passed; `npm run build` exit 0; `npx cap sync android`
  OK. E2E: dry-run server + Node `ws` client with `mouseSensitivity: 800`
  received welcome + pong; log showed key down/up space and aggregated mouse
  lines (~4/s); disconnect released keys. Vite dev server served HTTP 200,
  then both were stopped with SIGINT. APK build not possible (no JDK/SDK).
- Known gap: `apps/server/vitest.config.ts` resolves `@gamepad/shared` from
  `dist` (node/SSR environment ignores `resolve.conditions`), so server tests
  use a stale shared build until `npm run build`. Mobile fixed with
  `ssr.resolve.{conditions,externalConditions}`; the server config was outside
  the writer's edit surface.

- Engram mirror `odd/phase-1-keyboard-mouse/tasks`: PENDING (host session
  registration failed on first save).

## Next step

Done by parent: server vitest resolves shared from source (41b5034; 47 passed
with `packages/shared/dist` removed). Browser check at 844x390 against the
dry-run server: pairing OK, latency shown, A → `space`, D-pad slide → `right`,
right stick → aggregated mouse moves, left stick up → `w`, settings open/close
keeps the session, Geometric skin renders. Not verifiable here: real
multitouch (needs a phone), real robotjs input (needs macOS Accessibility
grant), APK build (needs JDK 21 + Android SDK).

Remaining: manual test on a phone via `npm run dev -w @gamepad/mobile`
(Network URL) and real input without `--dry-run`; APK build.
