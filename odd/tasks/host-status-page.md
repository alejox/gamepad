# Host status page (PC side)

## Objective

Give the PC host a visible status screen: "Server started", LAN IP(s), port,
PIN, mode, and live gamepad connected/disconnected indicator. Build it as a web
page served by the existing Node server first; package as a desktop .exe later.

## Problem / Why

Today the host only prints IP/PIN to the console. Opening the WebSocket port in
a browser returns `426 Upgrade Required`. Users expect a small host window like
other phone-as-controller apps.

## Scope

- HTTP + WebSocket on the same port (7531): HTTP serves the status page and a
  live status feed; WebSocket upgrade keeps serving the phone.
- Status page restricted to loopback requests (it shows the PIN).
- Live connection status (connected/disconnected, phone address).
- Fix the broken `dev` script (`tsx watch` argument order).

- LAN auto-connect (added 2026-10-26, user-approved): the phone's central
  gamepad button scans the local subnet over HTTP (`GET /discover` on 7531,
  public, never exposes the PIN) and requests a connection; the PC host page
  shows an Allow / Deny prompt that replaces PIN entry for that flow.

Out of scope: QR pairing, UDP/mDNS discovery (needs a native Capacitor plugin;
revisit with the APK), .exe packaging (later tasks).

Decision: HTTP subnet scan over UDP broadcast because it works both in the
phone browser (dev loop) and in the APK WebView without native code. Tradeoff:
~2–3 s scan, /24 networks only.

## Constraints

- Hexagonal layout already in `apps/server/src` (domain/ports/adapters/application).
- No new runtime dependencies unless justified; `node:http` is enough.
- English UI copy and code.

## Delivery strategy

`ask-on-risk`. Forecast ~300 authored changed lines (single PR).

## Tasks

- [x] T1 Status page served over HTTP on the WS port, loopback-only, live status, dev script fix, tests — route: delegated (2+ non-trivial files: WebSocketGamepadServer, new HTTP/status adapter, main.ts, tests)
- [ ] T2 Server: public `GET /discover` (CORS, host name + protocol version, no PIN); protocol message to request approval without PIN; pending-approval state; Allow/Deny on the host page (loopback-only actions); tests — route: delegated (shared protocol + server + page)
- [ ] T3 Mobile: central gamepad button / Connect screen action scans the /24 subnet for `/discover`, connects, shows "waiting for approval on PC", handles deny/timeout; tests — route: delegated (mobile stores/adapters/views)
- [x] T4 Mobile: new "Pro" skin (matte black dotted body, blue neon edge outline, L2/L1/R1/R2 top tabs, recessed sticks, dark round face buttons with colored letters Y green / X purple / B red / A blue, glowing central button). Original artwork only — no third-party logos or names — route: delegated (apps/mobile/src/domain/settings.ts, src/styles/skins.css, gamepad view markup if needed)

## Acceptance criteria

- `http://localhost:7531/` shows server status, IP, port, PIN, mode, gamepad status.
- Status updates live when the phone connects/disconnects (no manual refresh).
- Non-loopback HTTP requests get 403 and never see the PIN.
- Phone WebSocket connection keeps working on the same port.
- `npm run dev -w @gamepad/server` starts in watch mode.
- Server tests and typecheck pass.

## Progress / Evidence

T1 (2026-10-26): server tests 79/79 pass, typecheck clean (writer); parent spot check: tests 79/79, `curl localhost:7531/` → 200, `/status` JSON ok, LAN IP → 403. Extra: Host-header check against DNS rebinding.
T4 (2026-10-26): mobile tests 34/34, typecheck clean (writer); parent spot check tests 34/34. "pro" is now default skin; decorative center emblem (protocol has no home button id — T3 may turn it into the connect button). Visual check pending on device.

## Next step

User visual check of Pro skin, then T2/T3.
