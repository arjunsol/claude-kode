---
name: new-kode-app
description: Scaffold a new PlatformIO app project targeting the Kode Dot (kodeOS on ESP32-S3)
---

Scaffold a new Kode Dot app named `$ARGUMENTS` (ask for a name if not given).

1. Load the `kode-dot-dev` skill first for board/pin/toolchain context and
   the licensing note about not vendoring `kodedot_bsp` from the examples
   repos.
2. Copy `templates/app/` (relative to this plugin's root) into
   `apps/<name>/` in the working repo, preserving the directory structure:
   `platformio.ini`, `boards/kode_dot.json`, `partitions_app.csv`,
   `extra_scripts/rename_bin.py`, `include/kode_pins.h`, `src/main.cpp`.
3. In the new `platformio.ini`, set `app_name = <name>` (PascalCase or
   whatever the user prefers, but keep it filesystem-safe).
4. Update the header comment in the new `src/main.cpp` to describe what
   this app actually does, based on what the user asked for - don't leave
   the generic NeoPixel-blink description if the app does something else.
5. If the app needs the display, touch, IMU, audio, or power/fuel-gauge
   drivers, add the relevant Apache-2.0 `kodediy` component(s) to
   `lib_deps` (see the skill for the list and URLs) rather than copying
   any BSP convenience code from the unlicensed examples repos.
6. Tell the user: how to build/flash (`pio run -t upload` from inside
   `apps/<name>/`), and that the kodeOS app manifest/lifecycle beyond
   `app_name` is undocumented as of this writing - flag it if their app
   needs launcher metadata (icon, category) beyond what's known.
