# Virtual gamepad (real controller on the PC)

## Objective

Make the PC see the phone as a real game controller so games auto-map it:
Windows → virtual Xbox 360 (XInput) via ViGEmBus; Linux → uinput Xbox-style
pad; macOS → keep the keyboard/mouse driver (virtual HID needs an Apple
entitlement). Add a PlayStation-style skin on the phone (shapes on face buttons)
independent of what the PC sees.

## Problem / Why

Keyboard/mouse emulation forces manual mapping per game and turns analog sticks
into 4 digital keys. XInput is the most widely supported controller API on PC.

## Scope

- Phone: "Shapes" skin (△ ○ ✕ □ face glyphs, PS-like layout look). Original
  artwork; no Sony logos, PS button logo or "PlayStation" name in the UI.
- Server: new `VirtualGamepadDriver` adapter(s) behind a gamepad port; mode
  selectable at start, auto fallback to keyboard/mouse when unavailable.
- Windows + Linux drivers; macOS unchanged.

## Constraints

- Dev machine is macOS: Windows/Linux drivers cannot be run here. Pure mapping
  logic is unit-tested on Mac; final validation needs the user's Windows PC.
- Library choice pending research (vigemclient / uinput / koffi FFI).

## Delivery strategy

`ask-on-risk`. Stacked on `feat/host-status-page`.

## Tasks

- [x] V1 Mobile "Shapes" skin — route: delegated (mobile skin CSS/settings/components)
- [x] V2 Research (2026-10-26): ViGEmBus v1.22.0 retired/archived but installable; `vigemclient` npm has no prebuilds (needs MSVC); npm `uinput` dead; koffi 3.3.4 N-API prebuilds win/linux/darwin → single FFI route. macOS virtual HID needs DriverKit entitlement → keep robotjs. Protocol: sticks analog [-1,1] y-down; L2/R2 digital; no guide button.
- [ ] V3 Server domain: `GamepadDriver` port (setButton/setStick/setTrigger/flush), protocol→pad-state mapper (Y inversion, triggers 0/255), driver selection by platform + capability probe with robotjs fallback, `--driver` flag/env; tests — route: delegated
- [ ] V4 Linux adapter: koffi → libc open/ioctl/write on /dev/uinput as Xbox 360 (045e:028e), pure struct/ioctl encoders tested on Mac, fake-binding adapter tests; udev rule docs — route: delegated
- [ ] V5 Windows adapter: koffi → ViGEmClient.dll X360 target (XUSB_REPORT), fake-binding tests; DLL build path (CI workflow or build on user's Windows PC — decision pending); ViGEmBus install docs; fallback when bus missing — route: delegated
- [ ] V6 Real-hardware validation on user's Windows PC (and Linux if available) — user

## Acceptance criteria

- Shapes skin selectable in Settings, looks good in landscape, other skins unchanged.
- (V2+) Windows game detects an Xbox 360 controller; Linux SDL detects a pad.

## Progress / Evidence

V1 (2026-10-26): mobile 69/69, typecheck clean (writer); parent spot check 69/69. Shapes skin reuses geo glyph mechanism via usesFaceGlyphs(). Visual check pending on device.

## Next step

V3 (server GamepadDriver port + mapper + driver selection). V5 waits on DLL build decision.
