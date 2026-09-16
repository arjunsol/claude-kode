# claude-kode

A Claude Code plugin, plus firmware tooling, for developing kodeOS apps on the Kode Dot (a pocket ESP32-S3 maker device). Personal-use tool for now, not a public-audience product.

## Language

**Kode Dot**:
The physical device: a pocket-sized, battery-powered ESP32-S3 board with an AMOLED display, IMU, mic, microSD, speaker, and a 2×10 GPIO expansion header. Runs kodeOS.

**kodeOS**:
The on-device launcher/OS that turns a flashed firmware binary into a named, categorized entry a user can pick from a menu on the device itself.
_Avoid_: firmware (too generic - kodeOS is specifically the launcher layer, not any given app's firmware).

**App**:
A firmware binary flashed to a Kode Dot and recognized by kodeOS's launcher. Identified today only by the `app_name` PlatformIO field - kodeOS's real manifest/lifecycle format (icon, category, lifecycle hooks) is not publicly documented.
_Avoid_: project, sketch (both used loosely elsewhere in the ecosystem; here "app" means specifically the kodeOS-launcher-visible unit).

**Manifest**:
The (currently undocumented) format kodeOS would use to describe an app's icon, category, and lifecycle beyond its name. Only `app_name` is confirmed real; everything else about app packaging is an open gap, not something this project invents a format for.

**Template**:
A copyable starting project under `templates/` in this repo. `/new-kode-app` scaffolds a new app from a template into wherever the user is working - not necessarily inside claude-kode itself.
_Avoid_: example (see below - a template is what you copy *from*, an example is what results when *we* copy it for our own dogfooding).

**Example**:
A demo app maintained inside this repo, under `examples/`, built using this plugin's own templates so the plugin can be dogfooded against real (if personal) use. Distinct from a user's own app, which lives in whatever repo they ran `/new-kode-app` in.

**Driver component**:
One of kodediy's individually Apache-2.0-licensed GitHub repos (e.g. `esp_lcd_co5300`, `kode_lsm6dsox`), pulled into a template via `lib_deps`. Distinct from kodediy's *example*-repo bundled BSP code (`kodedot_bsp` inside `kodedot_examples`/`kodedot_SharedExamples`), which carries no LICENSE and is never vendored into this repo.
