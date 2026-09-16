---
name: new-kode-app
description: Scaffold a new PlatformIO app project targeting the Kode Dot (kodeOS on ESP32-S3)
---

Scaffold a new Kode Dot app named `$ARGUMENTS` (ask for a name if not given).

1. Load the `kode-dot-dev` skill first for board/pin/toolchain context and
   the licensing note about not vendoring `kodedot_bsp` from the examples
   repos.
2. Ask where to scaffold if it's not obvious from context - a subdirectory
   of the current working directory (`<name>/`), or `examples/<name>/` if
   the user is working inside this claude-kode repo itself and wants a
   dogfooding example rather than a real project.
3. Copy `templates/app/` (relative to this plugin's root) into the target
   directory, preserving the directory structure: `platformio.ini`,
   `boards/kode_dot.json`, `partitions_app.csv`, `extra_scripts/rename_bin.py`,
   `include/kode_pins.h`, `src/main.cpp`.
4. In the new `platformio.ini`, set `app_name = <name>` (PascalCase or
   whatever the user prefers, but keep it filesystem-safe). This only sets
   the flashed binary's filename - see step 6.
5. Update the header comment in the new `src/main.cpp` to describe what
   this app actually does, based on what the user asked for - don't leave
   the generic NeoPixel-blink description if the app does something else.
6. If the app needs the display, touch, IMU, audio, or power/fuel-gauge
   drivers, add the relevant Apache-2.0 `kodediy` component(s) to
   `lib_deps` (see the skill for the list and URLs) rather than copying
   any BSP convenience code from the unlicensed examples repos.
7. Tell the user: how to build/flash (`pio run -t upload` from inside the
   new project directory), and that kodeOS has no manifest or icon
   mechanism at all (confirmed, see ADR-0002) - naming the app and filing
   it into a category is a manual step they do on-device after flashing,
   not something `app_name` or this command controls.
