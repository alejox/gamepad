# macOS package (no Node/npm for end users)

## Objective

Ship the PC host for macOS as a downloadable `.app` in a DMG. The user drags it
to Applications and launches it without installing Node, npm, git or native
libraries.

## Scope

- Reuse the esbuild server bundle and include a macOS Node runtime.
- Include the macOS robotjs/koffi native addons required by the host.
- Native `.app` launcher: start the bundled server, open the host page and shut
  down cleanly. `--no-open` remains available for smoke tests.
- DMG with the app and an Applications shortcut; also upload a portable app zip.
- `macos-latest` CI builds and smoke-tests the actual packaged app, checks
  `/status`, the HTML page, keyboard/mouse driver selection and clean shutdown.
- Publish DMG and zip on `v*` tags alongside the Windows packages.
- Document Accessibility permission and the unsigned/unnotarized Gatekeeper
  warning. Apple signing and notarization are out of scope.

Target the current Apple Silicon runner/user machine (`arm64`). Intel and
universal binaries are out of scope unless explicitly requested.

## Constraints

- Keep `npm run start` and the Windows package unchanged.
- Verify locally on the available arm64 macOS machine as well as in CI.
- Never grant Accessibility permissions or change security settings in CI or
  on the user's machine; the final input-emulation permission check is the
  user's manual step.

## Delivery strategy

`ask-on-risk`, branch `feat/macos-package`.

## Tasks

- [x] W1 Packaged macOS browser-open behavior with focused tests.
- [x] W2 Self-contained app, DMG, CI smoke, docs and Release assets.

## Acceptance criteria

- The packaged app starts without a system Node installation, serves
  `http://localhost:7531/status`, reports keyboard/mouse and exits cleanly.
- CI uploads `AlejoxGamepad-<version>-macOS-arm64.dmg` and a portable app zip.
- README macOS quick start requires no developer tools or terminal commands.

## Progress / Evidence

Created from main 4ba329f after the Windows v0.1.0 package. W1 was committed as
`a2fd20f feat(server): open packaged host on macOS`.

Local verification on macOS arm64 with Node v26.10.0:

- `npx vitest run test/browserOpener.test.ts` from `apps/server`: 1 file, 10
  tests passed; `npm run typecheck -w @gamepad/server` passed.
- `npm test`: 30 files and 387 tests passed across shared, mobile and server.
- `npm run typecheck`: passed for all workspaces.
- `npm run build`: passed for all workspaces.
- `npm run build:bundle -w @gamepad/server`: passed.
- `npm run package:macos -w @gamepad/server`: built the native arm64 launcher,
  downloaded and checksum-verified the official Node v26.10.0 arm64 runtime,
  generated the icon from the existing Android asset, and produced
  `AlejoxGamepad-0.1.0-macOS-arm64.dmg` (47 MB) and
  `AlejoxGamepad-Portable-0.1.0-macOS-arm64.zip` (44 MB). `hdiutil verify`
  returned `VALID`.
- `lipo -archs` returned `arm64` for the launcher, Node, robotjs and koffi.
  `otool -L` on the bundled Node showed only `/System/Library` and `/usr/lib`
  dependencies. `vtool -show-build` reported Node `minos 13.5`; packaging copies
  that value to `LSMinimumSystemVersion` (verified as `13.5` with `plutil`). The
  DMG contains the app and `Applications -> /Applications`; Node, robotjs,
  koffi, node-gyp-build and ws licenses are included.
- `GAMEPAD_PORT=17531 python3 scripts/macos-package-smoke.py dist/macos/AlejoxGamepad.app`:
  passed against the real app, including robotjs loading, `/status`, HTML,
  Keyboard / mouse selection and graceful SIGTERM shutdown. The smoke replaces
  the child `PATH` with `/usr/bin:/bin`, grants no Accessibility permission and
  emits no input.
- The same smoke passed for the app mounted read-only from the DMG and for the
  app extracted from the portable zip. The DMG's Applications symlink was also
  checked.

The first default-port smoke stopped at its PIN assertion because an existing
source server (PID 85478) already owned port 7531. It was left untouched; local
package smokes therefore used 17531. CI uses the contractual default 7531 on a
clean runner. CI execution, the manual Gatekeeper flow and real input after the
user grants Accessibility remain unverified; no permission or security setting
was changed.

## Next step

Run `.github/workflows/macos-package.yml` on the hosted arm64 runner. On a `v*`
tag it uploads the DMG and portable zip to the same GitHub Release as the
Windows assets. Perform the manual Gatekeeper and post-Accessibility input check
before announcing the release.
