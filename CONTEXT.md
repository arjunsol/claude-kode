# claude-kode

A Claude Code plugin, plus firmware tooling, for developing kodeOS apps on the production Kode Dot (ESP32-P4/ESP32-C5). Personal-use tool for now, not a public-audience product.

## Language

**Kode Dot**:
The production ESP32-P4/ESP32-C5 device selected by ADR-0004. Board/module revisions and production pin maps require scoped evidence. The old ESP32-S3 configuration is an unreleased prototype, archived under `archive/esp32-s3/`.

**kodeOS**:
The device's application runtime/launcher. Production loader format, ABI, packaging and recovery are under investigation in CK-R001. ADR-0009 selects a kodeOS-first workflow; acceptance does not verify that interface.
_Avoid_: treating generic firmware and an installable kodeOS app as interchangeable.

**App**:
An application accepted by a verified, compatible kodeOS loader. A generic build artefact is not an installable app until an evidenced packaging/validation contract establishes that. Historical S3 `app_name` only sets a binary filename.

**Category**:
A category folder described in historical S3-era docs. Whether the production loader uses that same organisation remains unverified. ADR-0002's findings remain historical and are not silently superseded or extended to P4.

**Template**:
A copyable starting project with a verified target. No production template is currently shipped; `archive/esp32-s3/app` is historical build-only material. `/new-kode-app` scaffolds a new app from a template into wherever the user is working - not necessarily inside claude-kode itself.
_Avoid_: example (see below - a template is what you copy *from*, an example is what results when *we* copy it for our own dogfooding).

**Example**:
A demo app maintained inside this repo, under `examples/`, built using this plugin's own templates so the plugin can be dogfooded against real (if personal) use. Distinct from a user's own app, which lives in whatever repo they ran `/new-kode-app` in.

**Driver component**:
One of kodediy's individually Apache-2.0-licensed GitHub repos (e.g. `esp_lcd_co5300`, `kode_lsm6dsox`), pulled into a template via `lib_deps`. Distinct from kodediy's *example*-repo bundled BSP code (`kodedot_bsp` inside `kodedot_examples`/`kodedot_SharedExamples`), which carries no LICENSE and is never vendored into this repo.
