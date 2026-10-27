# macOS host robustness (never fail silently)

## Objective

The packaged macOS host runs as a background app (`LSUIElement`): no window, no
dock icon, no console. Any startup failure is invisible — the user sees "nothing
happens" with no way to know why or to quit. Make the host fail loudly and
recover from the one failure a real user can hit: the default port being taken.

## Scope

- Fall back to an available port when the preferred port (`7531`) is already in
  use, instead of crashing with `EADDRINUSE`. The host page and banner already
  show the real port, so manual pairing keeps working.
- Add a **Stop** action to the host status page so the background app can be
  closed without Activity Monitor.
- Capture the bundled server's stdout/stderr to a log file and show a native
  dialog when the app exits abnormally, so failures are no longer silent.

## Constraints

- Keep `npm run start`, the Windows package and the mobile app unchanged.
- Never grant Accessibility permissions or change security settings on the
  user's machine.
- Preserve the loopback-only and CSRF protections on the host page actions.

## Delivery strategy

`single-pr`, branch `fix/macos-host-robustness`.

## Tasks

- [x] W1 Fall back to an available port when `7531` is taken (server + tests).
- [x] W2 Stop action on the host status page (server + page + tests).
- [x] W3 Log startup output and show a dialog on abnormal exit (launcher).
- [x] W4 Version bump, README and release.

## Acceptance criteria

- Two packaged hosts can start on one machine; the second binds a free port,
  logs a warning and still serves the host page.
- The host page has a Stop button that shuts the server down cleanly.
- A host that fails to start writes its output to
  `~/Library/Logs/AlejoxGamepad/host.log` and shows an error dialog.

## Progress / Evidence

Branched `fix/macos-host-robustness` from `main` 0a33b31 after the v0.2.1
Gatekeeper fix. Work units:

- W1 `b8242e1 fix(server): fall back to an available port when the preferred
  port is taken`. Added `startServerWithFallback` + `isAddrInUse`
  (`apps/server/src/application/startServer.ts`), an optional `start(port)`
  override, wired `main.ts`, and `test/startServer.test.ts`. `npx vitest run
  test/startServer.test.ts`: 4 tests passed; server typecheck passed.
- W2 `77d46f9 feat(server): add a Stop action to the host status page`. Added a
  loopback-only, CSRF-guarded `POST /quit` backed by a `stop` option, a Stop
  button on the page, and `main.ts` wiring. `npx vitest run
  test/hostStatusHttp.test.ts`: 38 tests passed; full server suite 267 passed;
  typecheck passed.
- W3 `8e22614 fix(macos): capture host output to a log and show a dialog on
  abnormal exit`. The launcher redirects the bundled server's stdout/stderr to
  `~/Library/Logs/AlejoxGamepad/host.log` and shows an `osascript` dialog when
  the child exits non-zero. `clang++ -Werror` compiles clean; a fake-bundle run
  captured both streams and returned 0 without a dialog. The smoke script now
  asserts the graceful-shutdown message from the log.
- W4 version bump to 0.2.2 (`package.json`, `package-lock.json`, `Info.plist`)
  and README notes for the Stop button, port fallback and log file.

Local end-to-end verification on arm64:

- `npm run package:macos -w @gamepad/server` produced the 0.2.2 DMG (VALID).
- `GAMEPAD_PORT=17531 python3 scripts/macos-package-smoke.py
  dist/macos/AlejoxGamepad.app`: PASS (log captured the SIGTERM shutdown).
- Port-fallback run: with a holder on 17531, the packaged app logged
  `Port 17531 is in use; using an available port instead.`, bound port 59715,
  served the banner with the real port and stayed alive; no dialog appeared.
