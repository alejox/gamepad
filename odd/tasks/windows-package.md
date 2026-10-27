# Windows package (no Node/npm for end users)

## Objective

Ship the PC host for Windows as a single installer: the user downloads one
`.exe`, installs, and runs the host — no Node, npm, git, DLL download or
manual driver hunt.

## Problem / Why

Today running the host needs Node 22+, `npm install`, downloading the
ViGEmClient.dll artifact and installing ViGEmBus by hand (docs/windows-gamepad.md).

## Scope

- Bundle the server (esbuild) into one JS file; build a Windows executable
  (Node Single Executable Application, or a bundled `node.exe` runtime if SEA
  cannot load the native addons) on the `windows-latest` CI runner.
- Ship native files next to the exe: robotjs `.node`, koffi `.node`,
  `ViGEmClient.dll` (built in CI as today).
- Inno Setup installer: installs to Program Files, Start-menu/desktop shortcut,
  optional bundled ViGEmBus 1.22.0 driver install (BSD-3, redistributable),
  Windows Firewall rule for the host port on private networks, uninstaller.
- On start the host opens `http://localhost:7531/` (status page) in the default
  browser; default driver `auto` (virtual Xbox 360 when ViGEmBus is present).
- Artifacts: installer + portable zip from the CI workflow; GitHub Release on
  `v*` tags.

Out of scope: code signing (SmartScreen warning expected), macOS/Linux packages.

## Constraints

- Dev machine is macOS: builds and validation happen on the CI runner; final
  check on the user's Windows PC.
- Keep `npm run start` dev flow unchanged.

## Delivery strategy

`ask-on-risk`, branch `feat/windows-package`.

## Tasks

- [x] W1 Remove custom photo skin (user request) — route: inline (`git revert` of e8935f5 → 781f3ac); mobile 70/70, typecheck clean. APK rebuilt; install pending (phone disconnected).
- [x] W2 Windows bundle + exe + installer + CI workflow + docs — validated by Windows CI run 40446096708
- [ ] W3 User installs on Windows PC and checks host page + joy.cpl — user

## Acceptance criteria

- CI produces `AlejoxGamepad-Setup-<version>.exe` and a portable zip.
- On a clean Windows machine (CI smoke): the exe starts, serves
  `http://localhost:7531/status`, and reports driver selection; exits cleanly.
- README "Windows quick start" needs no developer tools.

## Progress / Evidence

- W1 done (781f3ac).
- W2 browser/config behavior done in f63387d: packaged Windows opens the host
  page by default, `--no-open` suppresses it, and source development is unchanged.
- W2 packaging/CI implemented in 95def8c: esbuild bundle, portable `node.exe`
  and native launcher, staged robotjs/koffi addons and ViGEmClient.dll, pinned
  ViGEmBus redistributable with SHA-256 check, Inno installer/uninstaller,
  private firewall rule, portable/install smokes, artifacts and tag releases.
- Local macOS validation passed: `npm test` (383 tests: 58 shared + 70 mobile +
  255 server), `npm run typecheck`, `npm run build`, and
  `npm run build:bundle -w @gamepad/server`. The built bundle served `/status`
  and `/`, reported the expected macOS keyboard driver in dry-run, and exited
  cleanly with code 0 on SIGTERM. Workflow YAML and smoke Python syntax parsed.
- Windows CI run 40446096708 passed on `windows-latest`: launcher and Inno
  compilation, real portable and Program Files smoke runs, clean shutdown,
  silent uninstall and upload of both Windows packages. CI fixes: a9a7327 and
  29d9f11. The runner has no ViGEmBus kernel driver, so both smokes verify the
  expected keyboard/mouse fallback; the real virtual pad remains W3.
- Release publishing is implemented for `v*` tags and will be exercised by the
  v0.1.0 release after integration into `main`.

## Next step

Install `AlejoxGamepad-Setup-0.1.0.exe` on the user's Windows PC and complete W3:
check the host page, `joy.cpl` and input from the phone.
