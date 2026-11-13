---
name: kode-dot-dev
description: Develop and debug kodeOS apps for the production ESP32-P4/C5 Kode Dot using the official GPL-licensed kode-sdk v0.1.0, ESP-IDF v6.1 and safe, evidence-gated workflows. Use for app scaffolding, pinout/module questions, Active Objects, build and read-only console diagnosis.
---

# Kode Dot development — production P4/C5

Use the **production** ESP32-P4 plus ESP32-C5 device. The unreleased ESP32-S3
prototype in `archive/esp32-s3/` is **historical only**: never use its pins,
partitions, uploader, `app_name` mechanism or firmware on a shipping Dot.

Start with `${CLAUDE_PLUGIN_ROOT}/skills/kode-dot-dev/references/production-workflow.md`.
Review `${CLAUDE_PLUGIN_ROOT}/docs/research/2026-11-11-official-kodeos-sdk-source-audit.md`
when available; otherwise read the pinned upstream release source directly.
The 3 November discovery records contain now-obsolete closed-source / no-manifest
claims. Proposed ADR-0017 documents the correction; it is not ratified yet.

## Authoritative upstream sources

- [kodeOS v0.1.0](https://github.com/kodediy/KodeOS/releases/tag/v0.1.0):
  graphical launcher, bootloader, host console, installer and mirroring utilities.
- [kode-sdk v0.1.0](https://github.com/kodediy/kode-sdk/releases/tag/v0.1.0):
  board definition, peripherals, Active Objects, `kode.h` and `kode_sys.h`.
- [kode-app-template v0.1.0](https://github.com/kodediy/kode-app-template/releases/tag/v0.1.0):
  official application template and `KODE_APP_MANIFEST`.
- [C5 firmware v0.1.0](https://github.com/kodediy/kode_slave_c5/releases/tag/v0.1.0):
  ESP-hosted 2.12.9 wireless coprocessor; production C5 accepts only vendor-signed images.
- [kode-apps catalogue](https://github.com/kodediy/kode-apps/blob/main/RULES.md):
  published validation, manifest, licence, SDK pin and RAM budget rules.

Manufacturer source is **source-verified**, not yet tested on the owner's Dot.
Use exact release references and list any incompatible new upstream changes.

## Creating a production app

1. Choose **ESP-IDF v6.1**, `IDF_TARGET esp32p4`, and a pinned official
   `kodediy/kode` component (`v0.1.0` for the first reproducible baseline).
2. Scaffold from the official **GPL-3.0-or-later** `kode-app-template`, not the
   MIT-licensed tooling repo's archived S3 PlatformIO files. Do not vendor the
   official SDK, third-party QP/C or RFAL into this MIT plugin.
3. Set the project identity/version and embedded metadata independently:
   `project(<name>)`, `PROJECT_VER`, and
   `KODE_APP_MANIFEST("Display name", "category")`. Use `appdata/app.json`
   and icon/screenshot files for catalogue presentation.
4. Use `kode.h` for calls from ordinary tasks. SDK device ownership is by
   **QP/C Active Objects**; an Active Object must never block. For waiting
   operations use its worker and completion event, or non-blocking `kode_sys.h`
   requests; subscribe before requesting current state.
5. Let `kbsp/sdkconfig.board` supply actual P4 memory/pins and the canonical
   partition layout; ensure `CONFIG_KODEOS_BOOT_ROLE_APP=y`. Never copy S3 pins
   or hand-write flash layout from recollection.
6. Build and run the manufacturer's catalogue checks when dependencies and
   toolchains are available. Record exact revisions, output hash and limitations.
   Do **not** claim build success without an observed build.

## Firmware/app lifecycle and device policy

A kodeOS app is a **complete firmware image**, not a shared library or an
in-process plug-in. kodeOS installs it in the apps region and boots it via a
modified bootloader. The `KODE_APP_MANIFEST` is a real embedded contract.

The SDK contains a guarded, *app-role* `idf.py flash` override redirecting the
image to the mailbox, but the released template README has a conflicting raw
`esptool` offset. **Never execute or generate raw write-flash addresses**.
Before any deployment, verify app role, compiled image, manifest, actual
`flasher_args.json`, device identity, firmware version, explicit approval and
recovery path. A successful compilation does not grant flashing authority.

For **initial Claude Kode MCP** only `ping`, `boot_info`, `app_list` and screen
capture are exposed via KodeOS's pinned Python console tools. They require
explicit host opt-in; opening USB serial can reset the device. There is **no**
MCP install, flash, config-import, radio-transmit or motor action. Standalone
firmware, OS updates and C5 firmware updates are not available.

## Module questions

The base SDK describes J3's 14 expansion positions, bus/pin operations and
basic Maker-oriented interfaces. The catalogue names four separate module SDKs
for Camera, Robotics, Mesh and F*CK, but those repos were not publicly
accessible during the 11 November audit. Do not infer retail-module support
from a similarly named factory camera driver or from built-in C5 Wi-Fi.
Q09/Q12 still require **physical qualification of all five modules** for v1.

## Reporting

Separate **manufacturer-advertised, documented, source-verified, host-tested,
device-tested and physically integrated** evidence. State exact source tag,
processor/board revision, toolchain and missing gate. Unknown does not mean
unsupported; a source file is never evidence of a successful device test.
The TypeScript MCP's local permissions are only one safety layer, not a
sandbox or proof that host commands and electrical operations are risk-free.
