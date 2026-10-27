# macOS menu bar status item (native host UI)

## Objective

Replace the browser-based host page with a native menu bar status item on
macOS. Clicking the icon shows the addresses, PIN, driver and connection state,
plus **Quit**. No browser opens automatically; the host stays a background
(accessory) app.

## Scope

- The launcher becomes an AppKit application (`NSStatusItem`) that still forks
  the bundled Node server and pipes its output to the log.
- The server stops auto-opening the browser on packaged macOS and prints a
  machine-readable `GAMEPAD_READY <port>` line so the launcher can find the
  (possibly fallback) port.
- The menu queries `GET /status` on loopback when it opens, copies address/PIN
  on click, and offers **Open host page** (browser fallback) and **Quit**.
- A pending pairing request appears in the menu with **Allow** / **Deny** (the
  same approval the host page offers), and the menu pops open automatically when
  a request arrives, so no browser is needed.
- Keep the error dialog on abnormal exit and the `~/Library/Logs/AlejoxGamepad`
  log capture.

## Constraints

- Windows package, mobile app and `npm run start` unchanged.
- Never grant Accessibility permissions or change security settings.
- The status item is visual and cannot be verified in CI; CI still must build,
  launch, serve `/status` and shut down cleanly.

## Delivery strategy

`single-pr`, branch `feat/macos-status-item`.

## Tasks

- [x] W1 Server prints `GAMEPAD_READY` and no longer opens the browser on macOS.
- [x] W2 Rewrite the launcher as an AppKit status-item app.
- [x] W3 Approval (Allow/Deny) in the menu, smoke/docs/version bump and release.

## Acceptance criteria

- Launching the app shows a gamepad icon in the menu bar; the menu lists the
  LAN addresses, PIN and driver, and Quit stops the host and the app.
- A pending pairing request shows Allow/Deny in the menu (the menu pops open on
  arrival) and approves/denies without opening a browser.
- No browser opens automatically; **Open host page** opens it on demand.
- The packaged app still serves `/status` and shuts down cleanly on SIGTERM.

## Progress / Evidence

Branched `feat/macos-status-item` from `main` cdffc20 (v0.2.2). Work units:

- W1 `10c0663 feat(server): emit a ready line and stop auto-opening the browser
  on macOS`. `shouldOpenBrowser` now opens only for the packaged Windows host;
  `main.ts` prints `GAMEPAD_READY <port>` when packaged. `test/browserOpener`
  10 tests passed; server typecheck passed.
- W2 `cbbbdfe feat(macos): replace browser host page with a menu bar status
  item`. Replaced `launcher.cpp` with `launcher.mm`: an AppKit accessory app
  with an `NSStatusItem` whose menu (delegate `menuNeedsUpdate:`) queries
  `GET /status` on loopback, copies address/PIN on click, and offers **Open host
  page** and **Quit**. The bundled server runs under `NSTask`; its output is
  piped to the log and scanned for `GAMEPAD_READY`. `package-macos.sh` compiles
  with `-fobjc-arc -framework Cocoa`.
- W3 version bump to 0.3.0 and README menu bar instructions. Also added the
  approval flow: `menuNeedsUpdate:` shows Allow/Deny when `/status` reports a
  `pending` request, `approve:`/`deny:` POST to `/approve`/`/deny` with the
  loopback CSRF headers, and a 1 s poll pops the menu when a request arrives.
  The POST headers were verified against the server (`409` no-pending, not the
  `403` CSRF rejection).

Local verification on arm64:

- `clang++ -Werror -fobjc-arc -framework Cocoa` compiles `launcher.mm` clean.
- `npm run package:macos` produced the 0.3.0 DMG (VALID).
- `GAMEPAD_PORT=17531 python3 scripts/macos-package-smoke.py`: PASS — the
  status-item launcher served `/status` and exited cleanly on SIGTERM, with the
  graceful-shutdown line captured in the log.
- Manual launch: the log contains `GAMEPAD_READY 17531`, `/status` returns the
  full JSON, and the process stays alive. The menu bar rendering itself is
  visual and remains for the user to confirm on their Mac.
