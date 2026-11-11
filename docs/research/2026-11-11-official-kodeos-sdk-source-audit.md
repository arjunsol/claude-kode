# Kode Dot official source release — technical audit (11 November 2026)

**Status:** Evidence-backed source review, not a hardware test or an approved ADR.  
**Reviewer:** Claude Kode architecture discovery.  
**Scope:** first public manufacturer `v0.1.0` releases, Kode's app catalogue, and the current Claude Kode baseline.  
**Hardware:** production ESP32-P4 + ESP32-C5 only. The old ESP32-S3 design was not released commercially.

## Executive assessment

The public release of kodeOS, kode-sdk, kode_slave_c5 and kode-app-template **removes the principal source-availability blocker** in the prior discovery, and gives us a genuine application format, boot mechanism, host console, UI/screen capture, board definition and tested building blocks. The **production deployment workflow is now source-documented but NOT demonstrated by us on a physical Dot**. We should prefer Kode's native SDK and guarded host utilities over synthesising our own flashing scheme.

The current accepted ADR-0002 ("no manifest; closed-source launcher") describes the September S3-era ecosystem and is **materially obsolete for the released P4**. Keep the historical record, but review the accompanying proposed ADR-0017 to supersede its current architectural guidance. The owner's Q01–Q12 decisions do not change; all five modules remain mandatory for qualified v1.

## 1. Source inventory and release provenance

| Repo | Public release | Purpose | Licence / qualifiers |
| --- | --- | --- | --- |
| [KodeOS](https://github.com/kodediy/KodeOS/releases/tag/v0.1.0) | 9 Nov 2026, `v0.1.0` | OS UI, installer, console, bootloader, release and factory tools | GPL-3.0-or-later, third-party notices |
| [kode-sdk](https://github.com/kodediy/kode-sdk/releases/tag/v0.1.0) | 9 Nov 2026, `v0.1.0` | P4 board definitions, application facade, device owners, UI and drivers | GPL-3.0-or-later; QP/C GPL/commercial; RFAL SLA0051 |
| [kode-app-template](https://github.com/kodediy/kode-app-template/releases/tag/v0.1.0) | 9 Nov 2026, `v0.1.0` | Project scaffolding, app manifest, AO + worker, ESP-IDF build | GPL-3.0-or-later |
| [kode_slave_c5](https://github.com/kodediy/kode_slave_c5/releases/tag/v0.1.0) | 10 Nov 2026, `v0.1.0` | SDIO/esp-hosted radio firmware for C5 | Apache-2.0; production Secure Boot restriction |
| [kode-apps](https://github.com/kodediy/kode-apps) | Live catalogue, not part of four-release set | App validation, packaging/publishing rules, module SDK registry | GPL-3.0-or-later |

**Source level:** repository code, tagged files, release metadata and documented tests have been examined. We have **not** performed a clean build, inspected compiled flasher arguments, run the CI suite ourselves, examined the arriving device or conducted hardware-in-the-loop tests. Treat listed functionality as **source-verified, not device-verified**. Prefer tagged `v0.1.0` to moving `develop` or `main` for reproductions.

## 2. The actual production architecture

### 2.1 Chip and board

- Main chip ESP32-P4; ESP32-C5 wireless coprocessor over SDIO using Espressif `esp-hosted` **2.12.9**. SDK and kodeOS explicitly target **ESP-IDF v6.1**.
- The P4 board file defines **32 MiB NOR flash and 32 MiB PSRAM**, AMOLED/touch, buttons, audio, vibration, IMU, NFC, low-frequency RFID, IR, SD, and an expansion header.
- [`kbsp_exp.h`](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kbsp/exp/include/kbsp_exp.h) describes **14 expansion positions (J3)**, including P4 GPIO, ADC and low-power capabilities. Old S3-era pinouts in `skills/kode-dot-dev` must **not** be used for production.
- The shipped C5 is described as **Secure Boot closed**: the [C5 NOTICE](https://github.com/kodediy/kode_slave_c5/blob/v0.1.0/NOTICE.md) says only Kode-signed images boot. Source availability does not imply ability to deploy custom C5 firmware on production hardware.

### 2.2 SDK application model

- The SDK is an **Active Object** framework based on QP/C. Devices are owned by one AO and accessed through messages/events; app AOs must not block.
- [`kode.h`](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kode/include/kode.h) provides approachable blocking APIs for application tasks. `kode_sys.h` is the non-blocking counterpart for application AOs. The [app template](https://github.com/kodediy/kode-app-template/blob/v0.1.0/main/app_ao.c) uses a worker for waiting operations.
- **An app is its own complete firmware**, not a dynamic library loaded into the live kodeOS process. kodeOS installs it into the apps region; the bootloader boots it on a reset. The boot logic returns to kodeOS following ordinary reset, with explicit sticky developer-run exceptions. See [KodeOS README](https://github.com/kodediy/KodeOS/blob/v0.1.0/README.md), [bootloader](https://github.com/kodediy/KodeOS/blob/v0.1.0/bootloader_components/main/bootloader_start.c), and [app region format](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kdrv/apps/include/kapps_fmt.h).
- **A real manifest now exists.** `KODE_APP_MANIFEST("My app", "tools")` embeds display name/category metadata in the firmware. Project identity/version come from ESP-IDF project/app descriptors; `appdata/app.json` and icons/screenshots are separate presentation assets. See [kapp_desc.h](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kdrv/apps/include/kapp_desc.h), [template entrypoint](https://github.com/kodediy/kode-app-template/blob/v0.1.0/main/app_main.c) and [catalogue rules](https://github.com/kodediy/kode-apps/blob/main/RULES.md).

### 2.3 Installation and recovery

- [`kcli.py`](https://github.com/kodediy/KodeOS/blob/v0.1.0/tools/kcli.py) supports `ping`, structured console commands, `install` (destinations **app**, **os**, **c5**, **pending**), screenshots, file transfer and app-data commands. The `kmirror.py` tool mirrors the screen and accepts touch/button interaction. `kble.py` exposes console functionality over BLE; remote control remains deferred under Q05.
- The board defines a factory kodeOS partition, two OS OTA slots, a separately installed apps region, user storage and a mailbox. Its [tagged partition table](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kbsp/partitions.csv) has:
  - `factory` `0x20000` / `0x400000`;
  - `ota_0` `0x420000` / `0x400000`, `ota_1` `0x820000` / `0x400000`;
  - `apps` `0xC40000` / `0xBC0000`;
  - `storage` `0x1800000` / `0x200000`;
  - **`app_pending` `0x1A00000` / `0x600000`**.
- **Important protection:** [`kbsp/project_include.cmake`](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kbsp/project_include.cmake) deliberately changes **application-mode `idf.py flash` and `app-flash`** from the dangerous ESP-IDF factory overwrite to a **mailbox-only flash**, also updating flasher arguments. [`check_mailbox_size.cmake`](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kbsp/check_mailbox_size.cmake) enforces a `0x5FF000` image maximum. Do not claim generic ESP-IDF app flashing is safe without these specific SDK hooks and `CONFIG_KODEOS_BOOT_ROLE_APP=y`.
- **Documentation inconsistency:** the [v0.1.0 app template README](https://github.com/kodediy/kode-app-template/blob/v0.1.0/README.md) gives a **manual** `esptool write-flash 0x1C00000` command, whereas the tagged partition defines the mailbox start at **`0x1A00000`**. These are different; do not reproduce the raw command in Claude Kode. Confirm with upstream and verify the generated `flasher_args.json` before device operations. The example also inconsistently says SSH access is required while its manifest and CI reference a public HTTPS checkout.
- The catalogue allows apps larger than the mailbox maximum (up to 8 MiB); those must use the **console install** route rather than mailbox flash. Never assume all app artefacts can be uploaded through the mailbox.
- A published factory recovery pack and checksums exist, but **our** recovery procedure is not validated on a real device. OS/factory/C5 flashing are distinct privileged operations and remain disabled in initial MCP tooling.

## 3. Host tool and test ecosystem

- The [KodeOS tools index](https://github.com/kodediy/KodeOS/blob/v0.1.0/tools/README.md) identifies `kcli.py`, `kpayload.py`, `kappdata.py`, `kmirror.py`, `kble.py`, release scripts, factory tooling and tests.
- The SDK advertises **17 examples**: `arduino_hello`, `audio`, `ble_peripheral`, `buttons_led`, `console_actions`, `display_lvgl`, `exp_bus`, `expansion_io`, `haptic`, `imu`, `ir_remote`, `mqtt`, `network`, `nfc_read`, `power`, `rfid_read`, `storage`. They are testable sources, not proofs of full hardware integration in our environment.
- Source has host test suites, ESP32-P4 target build variants, a factory test-station emulator and an HIL workflow. [KodeOS HIL workflow](https://github.com/kodediy/KodeOS/blob/v0.1.0/.github/workflows/hil.yml) permits an explicitly recorded **exception without a physical rig**, so workflow presence or a release badge alone cannot prove the shipped images passed physical testing. Obtain a specific run/report where needed.
- The app catalogue contains executable [RULES.md](https://github.com/kodediy/kode-apps/blob/main/RULES.md) for naming, manifest, categories, source licence, ESP-IDF, SDK pins, RAM budgets, secrets scans and review. Reuse/reference the validator rather than maintain divergent Claude-only rules.

## 4. Expansion module readiness (owner requires all five in v1)

| Module | Current source evidence | Confidence | Qualification gap |
| --- | --- | --- | --- |
| Maker | Core `kode_pin_*`, expansion I2C/SPI/UART, P4/J3 map, `expansion_io` and `exp_bus` examples | API-level foundation | Actual Maker-module rail limits and device experiment |
| Robotics | No accessible dedicated `kode-robotics-sdk` in organisation | Platform GPIO/PWM foundation only | Motor/servo APIs, power/current limits, hardware safety fixture |
| Camera | `kdrv_ov5640` exists for a **factory station** camera on J3, not proof of retail Camera support | Partial, unrelated camera driver | Dedicated module SDK, wiring and production image capture |
| Mesh | No accessible dedicated `kode-mesh-sdk` | Radio stack on built-in C5 does not prove LoRa support | Module API and second radio node |
| F*CK | No accessible dedicated `kode-fck-sdk` | General built-in NFC/RFID/IR/radio services exist | Expansion module chipset drivers, legal RF test plan |

[The catalogue's `module_sdks.txt`](https://github.com/kodediy/kode-apps/blob/main/tools/module_sdks.txt) lists `kode-camera-sdk`, `kode-fck-sdk`, `kode-mesh-sdk`, and `kode-robotics-sdk`, but all four were **404 / not publicly accessible to the connected GitHub account** on 11 November. They may be private or not yet published; do not infer non-existence. Maker appears to use the common SDK. This does **not** change Q09/Q12: v1 still requires production L4 qualification of all five.

## 5. Licence and distribution boundary

- **Keep the Claude Kode host / MCP / original skills and metadata MIT** (Q02/Q11) if independently authored. Keep firmware derived from the manufacturer GPL template/SDK as a **separately licensed generated project**, with attribution, notices and relevant sources where distribution applies. Do not copy vendor GPL runtime source into the MIT package and imply it remains MIT.
- [kode-sdk NOTICE](https://github.com/kodediy/kode-sdk/blob/v0.1.0/NOTICE.md) also identifies **QP/C GPL or commercial** and **ST RFAL SLA0051 (not open source)**, plus Kode's special GPL section 7 permission for combining RFAL. Treat third-party and artwork licences individually. This deserves review before commercial distribution; it is not a legal opinion.
- Archived S3 example repos were unlicensed and ADR-0001's old no-vendoring rule remains valid for them. **The new GPL-licensed SDK is a different source set.** Refer to it via pinned dependency and/or host tool invocation, not blind code copying.
- The manufacturer's host utilities are GPL-licensed. Initially **invoke pinned `kcli.py` as an external process** from TypeScript rather than importing/copying its implementation into MIT source. Review requirements for packaging or derivative reimplementation separately.

## 6. Design implications / ADR impact

| Existing record | Recommended treatment |
| --- | --- |
| Accepted ADR-0001 | Retain for unlicensed archived S3 repos; clarify in future review that current vendor SDK is licensed and usable under its terms |
| **Accepted ADR-0002** | Historically accurate for September S3, **incorrect for production P4**: new manifest, app data, OS source, app boot/install contract. Proposed ADR-0017 should supersede its operating guidance once explicitly accepted; do not silently delete history |
| Accepted ADR-0003 | Retain immutable dependency principle; source now uses official SDK releases, component manager and explicit board defaults |
| Proposed ADR-0004 | Update P4 profile from official `kbsp`, exact board pins/J3, flash and C5 restrictions |
| Proposed ADR-0006 / 0010 | Classify `kcli` commands by effect: benign `ping/info/screenshot` versus app install, OS/C5 updates, configuration import, file writes and hardware control |
| Proposed ADR-0007 | TypeScript MCP should wrap pinned manufacturer host tools and SDK builds, not reimplement installer/firmware transport initially |
| Proposed ADR-0008 | Specify ESP-IDF **v6.1**, Kode app-role CMake hook, manifests and output checks; do not reuse S3 PlatformIO tooling |
| Proposed ADR-0009 | Replace undocumented-loader assumption with source-documented **whole-firmware installed app** lifecycle; still require physical device verification |
| Proposed ADR-0011 / 0012 | Map the manufacturer's CI/host/factory tests to our L1–L4 gates; keep four missing module SDKs explicit release blockers |
| Proposed ADR-0013 / 0015 | Separate MIT MCP from GPL firmware and third-party radio licences; production C5 only permits vendor-signed firmware |

## 7. Highest-priority actions

1. **P0 immediately:** mark S3 skill, old S3 PlatformIO template and `--chip esp32s3 ... 0x400000` as **NOT FOR PRODUCTION**. All generation and deployment must use P4/C5 profile and verified vendor SDK.
2. **P0 source integration:** build the smallest app from the released `kode-app-template` using **ESP-IDF v6.1**; pin exact source/tool versions and capture artefact hashes. Do not flash yet.
3. **P0 preflight:** inspect generated app manifest, chip ID, partitions and **generated flasher arguments**. Fail closed on unknown role/offset, raw-flash requests, mismatched firmware or missing approval.
4. **P0 initial TypeScript MCP:** implement read-only device discovery/console/screenshot via pinned `kcli.py`, typed output parsing, sandboxed subprocess execution, timeouts and explicit allowlist. Keep `--dst os` and `--dst c5` unavailable in v1's ordinary workflow.
5. **P1 first production Dot session:** validate serial identity, `kcli ping`, screenshot, app build and permission-gated console install of a benign sample; capture logs and confirm return-to-kodeOS. Validate recovery separately.
6. **P1 vendor follow-up:** request public module SDK dates and precise revision/spec for Maker, Robotics, Camera, Mesh and F*CK; do not reduce the all-five v1 acceptance requirement.
7. **P1 governance:** review proposed ADR-0017, then update proposed ADR-0008, 0009, 0012 and the existing skill after decisions are ratified.

## Open evidence gaps

- Real `v0.1.0` clean build on **Windows** and generated flasher argument verification.
- Physical serial/USB behaviour, P4 revision, bootloader and actual installed firmware version.
- Whether release v0.1.0 was tested on production hardware by a recorded HIL run rather than an exception.
- Manufacturer clarification of README `0x1C00000` vs partition `0x1A00000` manual write location.
- Four publicly unavailable module SDKs, production module electrical data, reliable module identification and hardware test fixtures.
- Real-world recovery/factory image procedure and boundaries of vendor-signed C5 firmware updates.
- Licence review before redistributing GPL-derived firmware, third-party RFAL content or bundled GPL host utilities.

**Verdict:** CK-R001's **source-discovery portion** is materially complete. Its **hardware validation** portion remains open. The correct next milestone is a source-pinned, read-only TypeScript MCP and a production P4 build, with no direct raw flash support.
