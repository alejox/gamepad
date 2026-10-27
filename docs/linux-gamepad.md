# Linux: virtual Xbox 360 pad (uinput)

On Linux the server creates a virtual **Microsoft X-Box 360 pad**
(USB `045e:028e`) through the kernel's `uinput` module. Games, SDL and Steam
see it as a wired Xbox 360 controller and apply their built-in mapping.

It needs two things: the `uinput` module loaded, and write access to
`/dev/uinput` for your user. Root is not required.

## 1. Load the uinput module

```sh
sudo modprobe uinput
```

Load it on every boot:

```sh
echo uinput | sudo tee /etc/modules-load.d/uinput.conf
```

If `/dev/uinput` is missing, the server reports
`uinput module not loaded (sudo modprobe uinput)`.

## 2. Allow your user to write to /dev/uinput

Create `/etc/udev/rules.d/60-gamepad-uinput.rules`:

```
KERNEL=="uinput", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"
```

Add yourself to the `input` group, then reload the rules:

```sh
sudo usermod -aG input $USER
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=uinput
```

Log out and back in (or reboot) so the new group applies. Check with
`ls -l /dev/uinput`: it should show `crw-rw---- root input`.

Without access the server reports `no permission on /dev/uinput`.

## 3. Start the server in pad mode

```sh
npm start -w @gamepad/server -- --driver=gamepad
```

`--driver=gamepad` exits with the reason if the pad cannot be created;
`auto` (default) falls back to keyboard/mouse and prints the reason instead.
The banner and the host page show `Virtual Xbox 360 (uinput)` when it works.

## 4. Verify the pad

- `/proc/bus/input/devices` lists `Name="Microsoft X-Box 360 pad"` while the
  server runs:
  ```sh
  rg -A4 'X-Box 360 pad' /proc/bus/input/devices
  ```
- `sudo evtest`, pick the pad, and press buttons on the phone: you should see
  `BTN_SOUTH`, `ABS_X`, `ABS_HAT0Y`… events.
- `jstest-gtk` or Steam → Settings → Controller shows an Xbox 360 controller.

## Mapping

| Phone | evdev |
|-------|-------|
| A / B / X / Y | `BTN_SOUTH` / `BTN_EAST` / `BTN_WEST` / `BTN_NORTH` |
| L1 / R1 | `BTN_TL` / `BTN_TR` |
| L2 / R2 | `ABS_Z` / `ABS_RZ` (0 or 255) |
| Select / Start | `BTN_SELECT` / `BTN_START` |
| L3 / R3 | `BTN_THUMBL` / `BTN_THUMBR` |
| Left / right stick | `ABS_X`, `ABS_Y` / `ABS_RX`, `ABS_RY` (−32768..32767, down is positive) |
| D-pad | `ABS_HAT0X`, `ABS_HAT0Y` (−1..1) |

`BTN_MODE` (guide) is declared for compatibility but never sent.
