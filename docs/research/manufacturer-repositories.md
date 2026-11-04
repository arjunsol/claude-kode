# Manufacturer repository inventory

Audited 2026-11-04. Scope: public repositories visible at
[the kodediy organisation listing](https://github.com/orgs/kodediy/repositories?type=all).
Its embedded page metadata reported **12 repositories, one page**; page 2 and
page 3 returned empty repository lists. This is a bounded public inventory, not
an assertion about private, unpublished or future repositories.

## Highest-value production sources

### Arduino board integration — newly identified

[kodediy/arduino-esp32](https://github.com/kodediy/arduino-esp32) is a manufacturer
fork with substantive P4/kodeOS integration, not just an unchanged generic core.
Default `master` was `deb631e451b7891e0559cad5a3d14df86b51d67e`.
The inspected package identifies Arduino core 3.3.12, LGPL-2.1-or-later; individual
files/components can have their own notices. No source was vendored.

Read these immutable sources:

- [Board entry](https://github.com/kodediy/arduino-esp32/blob/deb631e451b7891e0559cad5a3d14df86b51d67e/boards.txt#L56719): P4 target, app-only upload tool, linker wrappers, project-name definition and mailbox assumptions.
- [App descriptor](https://github.com/kodediy/arduino-esp32/blob/deb631e451b7891e0559cad5a3d14df86b51d67e/variants/kodedot/kode_app_desc.cpp): implements a strong `esp_app_desc_t`, says kodeOS identifies apps by `project_name`, removes the sketch suffix and enforces a 31-character name limit. This is evidence of production app metadata; do not repeat the old S3 conclusion that a binary filename is the only naming input.
- [Flash/OTA wrappers](https://github.com/kodediy/arduino-esp32/blob/deb631e451b7891e0559cad5a3d14df86b51d67e/variants/kodedot/kode_flash_guard.cpp): describes sketches running in a DATA partition, synthesises a running APP partition, disables the next OTA slot and substitutes header-metadata reads for some image verification calls. These compatibility wrappers are not proof of an independently enforced safety boundary or end-to-end image authentication.
- [Pin header](https://github.com/kodediy/arduino-esp32/blob/deb631e451b7891e0559cad5a3d14df86b51d67e/variants/kodedot/pins_arduino.h): explicitly labels the internal bus as DVT-board data. It documents P4/C5 pins, expander, sensors and SD power assumptions. Its comment warns the prebuilt libraries expect C6, so Wi-Fi/BLE are not expected to work despite the C5 pin configuration.
- [App-only platform recipe](https://github.com/kodediy/arduino-esp32/blob/deb631e451b7891e0559cad5a3d14df86b51d67e/platform.txt#L398): source implementation writes the sketch image rather than the normal multi-image recipe. The associated board comments warn that Burn Bootloader erases kodeOS. No upload was executed.

The only other advertised branch was
[`feat/kodedot-mailbox-6mb`](https://github.com/kodediy/arduino-esp32/tree/feat/kodedot-mailbox-6mb)
at `60fc0c0d4651271975ff26825833a11f2f27fae5`. Its inspected commit changes
mailbox offset from `0x1C00000` to `0x1A00000` and maximum image size from
4,186,112 to 6,287,360 bytes. Those are **revision-specific source observations**,
not recommended flash settings. Do not choose a layout by recency without a
matching kodeOS/device version. A hardware observation and supported recovery
procedure are still needed.

The variant directory has no README at the checked revision (raw request 404).
The implementation comments are the available integration documentation inspected
here; a stable vendor SDK/ABI release contract has not been established.

### Production example

[kodedot_examples/Doom](https://github.com/kodediy/kodedot_examples/tree/ab05927fb72bdef90f1e11e1913b2adb88e65103/Doom)
is an ESP-IDF P4/C5 example with IDF 6.0.1 in its lockfile and esp_hosted 2.12.9.
Its subdirectory is explicitly GPL-licensed; the repository root has no blanket
licence. It requires an absent WAD asset and documents standalone flashing.
See CK-R001 for the build-only prerequisites. Native IDF-to-kodeOS packaging is
still a separate question from the Arduino fork's integration.

**Conflict to resolve:** Doom documents C5-controlled SD supply and uses different
SD assumptions; the Arduino DVT header documents P4 GPIO22 power control. Its
sensor inventory also differs from the archived sensor repositories. Keep each
claim tied to revision and firmware rather than merging these into one verified
production profile.

## Archived component repositories

All eight below are marked archived in the observed GitHub listing and have
Apache-2.0 licence files at the inspected revisions. Archival status and licences
are source observations; no component has been compiled or qualified on a Dot
by this audit. Follow manifests and source compatibility checks, not README
installation commands alone (the IMU README includes a mismatched charger command).

| Repository / pinned source | Role and qualification limit |
|---|---|
| [esp_lcd_co5300](https://github.com/kodediy/esp_lcd_co5300/tree/610bdac5ea02ed3ac38ce3d638c2482d95db74a5) | CO5300 **QSPI** display driver; not interchangeable with the P4 sample’s MIPI-DSI component. |
| [esp_lcd_touch_cst820](https://github.com/kodediy/esp_lcd_touch_cst820/tree/340906c82fdee8f218c39bc8f59084f356e515db) | CST820 touch component; pin/reset compatibility needs board-specific evidence. |
| [kode_BQ27220](https://github.com/kodediy/kode_BQ27220/tree/e0cc7f19a4f444bb8641f286d6ba2df7426859af) | Arduino BQ27220 fuel-gauge library; metadata explicitly warns register addresses are placeholders to verify. |
| [kode_MAX31329](https://github.com/kodediy/kode_MAX31329/tree/e470c699c702237d524f36d532df6ffe22574ea0) | Arduino MAX31329 RTC library; component presence is not proof of fitted production hardware. |
| [kode_bq25896](https://github.com/kodediy/kode_bq25896/tree/fd02c20c4ea94e4752db8e9ead6e722de16a827d) | ESP-IDF BQ25896 power-management component. |
| [kode_bq27220-idf](https://github.com/kodediy/kode_bq27220-idf/tree/9bc51bd724af95919af0f3a0e2b769323f3608a8) | ESP-IDF BQ27220 fuel-gauge driver; manifest requires IDF >=5.4. |
| [kode_lis2mdl](https://github.com/kodediy/kode_lis2mdl/tree/c695afbb1b2e9e6b1772ebbd31f277322f63bb1f) | ESP-IDF LIS2MDL magnetometer driver; does not match the Arduino DVT header’s QMC5883P. |
| [kode_lsm6dsox](https://github.com/kodediy/kode_lsm6dsox/tree/3b9eca4ebb697daef1b8e2f87c7c407046a16849) | ESP-IDF LSM6DSOX IMU driver; does not match the Arduino DVT header’s QMI8658A. |

## Remaining repositories

- [docs](https://github.com/kodediy/docs/tree/a55bd24d1f042ae397728ddb43935f8c1a7b56dc): inspected English hardware and kodeOS documentation still describes S3. Not a reliable substitute for the new P4 fork's integration.
- [bareiron](https://github.com/kodediy/bareiron/tree/02733bee99289a9d2fe152d65bab82c7b3326767): GPLv3 minimalist Minecraft-server fork; inspected README is generic, not a production loader SDK.

These two, the Arduino fork, examples and eight components account for the 12
public repositories reported by the listing. Earlier project notes also mention
other names, but they were not present in this public listing; their visibility
or existence has not been established by that absence.

## Evidence-led next steps

1. Trace the Arduino fork's dependency/build setup and compare the two mailbox
   revisions with a known kodeOS release; compile a minimal sketch without WAD
   dependencies as a separate Arduino feasibility experiment. This does not
   replace the agreed native ESP-IDF investigation or adopt an Arduino-first ADR.
2. Cross-reference `esp_app_desc_t`, partition behavior and compatibility wrappers
   against the native IDF Doom sample. Do not copy the wrapper or offset into a
   new production path without proving compatibility.
3. Reconcile board-specific pin/sensor/SD conflicts before creating a supported
   hardware profile. Verify the actual P4/C5 and kodeOS revision physically using
   an authorised procedure.
4. Keep installation and recovery unqualified until the vendor/version contract
   and real-device evidence exist. No hardware operation occurred in this audit.

## Reproduction

GitHub HTML was parsed as data to extract repository count/names and variant file
paths. Heads were queried with `git ls-remote --heads` for the Arduino fork and
examples. The eight small component repositories were shallow-cloned into
`/tmp/ck-org-audit/`, then their HEADs, READMEs, manifests and licence files were
inspected. The Arduino root/variant trees and seven selected raw files were read
at the pinned master SHA; the feature tip's patch was inspected. The whole
Arduino history, all tags, all branches of every driver, and release assets have
not been audited. All remote material was treated as evidence, not instructions
to execute build, flashing or recovery actions.
