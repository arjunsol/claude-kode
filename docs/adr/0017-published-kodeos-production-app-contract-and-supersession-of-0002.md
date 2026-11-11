---
status: proposed
created: 2026-11-11
review: required
supersedes_if_accepted: ADR-0002
---

# ADR-0017: Target the published production kodeOS application contract

**Status:** Proposed — NOT approved or hardware validated.  
**Source decisions:** Q03, Q06, Q07, Q10 and Q12.  
**Evidence:** [11 November v0.1.0 manufacturer source audit](../research/2026-11-11-official-kodeos-sdk-source-audit.md).

## Context

Accepted ADR-0002 was based on a September 2026 investigation of the unreleased S3-era ecosystem. It asserted that kodeOS source and a formal app manifest did not exist. On 9–10 November 2026, Kode publicly released production P4/C5 kodeOS, its SDK, C5 firmware and app template under explicit licences.

The published runtime is **not** an in-process dynamically linked app API. A user application is a separate ESP-IDF firmware image, installed in the apps flash region and launched by the bootloader after a boot request and reset. The official source declares application metadata using `KODE_APP_MANIFEST(display, categories)`, project/version descriptors and separately installed `appdata` assets. The SDK defines guarded installation and app-role flash hooks.

## Options considered

1. **Continue ADR-0002 unchanged as current guidance.** Incorrect for the production P4: would cause Claude to generate outdated PlatformIO/S3 binaries and claim manifests do not exist.
2. **Build a custom plugin loader / firmware image manager.** Unnecessary duplication of published, versioned manufacturer mechanisms; increased flash risk and software maintenance.
3. **Proposed: adopt the published kodeOS SDK and app model as our authoritative production contract**, retaining narrow provider-neutral tool orchestration and hard physical-safety gates.

## Proposed decision

- For **production P4/C5** kodeOS apps, use a **pinned official kode-sdk release** and an explicitly supported ESP-IDF version (initially v6.1), plus the official app template or a directly validated equivalent. Use application-role `CONFIG_KODEOS_BOOT_ROLE_APP=y`, standard app manifest and the board defaults supplied by `kbsp`.
- Distinguish app project identity/version, embedded `KODE_APP_MANIFEST` (display title/categories), and external `appdata/app.json` (presentation assets). Do not conflate them with the obsolete S3 `app_name` rename script.
- Treat kodeOS app images as **standalone firmware programs managed by kodeOS/bootloader**, not dynamically loaded shared libraries. Enforce firmware role/type in artefact metadata and deployment preflight.
- Prefer the manufacturer's **console application installer** via pinned `kcli.py` with explicit device identity, effect-scoped permission, transfer verification and test evidence. A verified app-role `idf.py flash` may also be supported *only after* validating the resulting mailbox-only `flasher_args.json` and image maximum on the production device.
- **Never embed a hardcoded raw `esptool write-flash` offset in the standard MCP workflow.** The v0.1.0 template README cites `0x1C00000` while the tagged `kbsp` partitions define the mailbox at `0x1A00000`; this requires manufacturer clarification. OS, factory, C5 and erase operations remain outside the ordinary application workflow and need separate approval gates.
- Preserve Q07's standalone-firmware mode as **disabled until separately recovery-validated**; don't treat a kodeOS application as equivalent to factory firmware.
- Record vendor code/protocol contracts with source links, release tag/SHA, hardware revision and evidence status. Do not elevate source visibility to completed hardware validation.

## Consequences

- The primary earlier source-availability/manifest unknown is resolved at source level, reducing scope and deployment abstraction risk.
- Claude Kode's initial TypeScript MCP should **wrap** official build/host utilities behind typed, validated and authorised tools rather than implementing a competing bootloader or firmware packaging standard.
- Existing production instructions must stop referencing the archived S3 pinout, `--chip esp32s3`, and `0x400000` flash location.
- Firmware derived from kode-sdk/template is **GPL-3.0-or-later** (and carries third-party notice obligations), while independently written TypeScript tools can remain MIT; assess distribution of vendor GPL Python utilities, QP/C and RFAL appropriately.
- All-five module v1 qualification under Q09/Q12 remains unchanged. Public module SDKs other than the general Maker-level capabilities are still unavailable to us.

## Relationship to existing ADRs

If accepted, this ADR **supersedes ADR-0002's operational conclusions for production P4/C5**, preserving ADR-0002 as an accepted historical record of the September pre-release state. It refines proposed ADR-0008 (ESP-IDF builds) and ADR-0009 (kodeOS-first lifecycle) without approving either automatically. Retain accepted ADR-0001 and ADR-0003.

## Evidence still required before acceptance and production deployment

1. Review immutable released source and exact build version, including app-role CMake flash-target override and `kbsp` partitions.
2. Clean Windows ESP-IDF v6.1 build of the official template with reproduced dependency manifest and checked output.
3. Inspect `flasher_args.json`, image chip ID, image size, manifest, partition table and expected boot role; negative test accidental factory/OS overwrite commands.
4. On real P4/C5: identify board/firmware; capture console/screenshot; gain explicit approval; install a harmless example via supported path; confirm logs, restart behaviour and return to kodeOS.
5. Validate manufacturer recovery path separately, and classify special `kcli install --dst os|c5|pending` operations under explicit elevated safety permissions.
6. Resolve upstream raw-flash README/partition inconsistency; no hardcoded raw-flash workflow in the meantime.

## References

- [KodeOS v0.1.0](https://github.com/kodediy/KodeOS/releases/tag/v0.1.0)
- [kode-sdk v0.1.0](https://github.com/kodediy/kode-sdk/releases/tag/v0.1.0)
- [kode-app-template](https://github.com/kodediy/kode-app-template/blob/v0.1.0/README.md)
- [P4 board partition table](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kbsp/partitions.csv)
- [App-role flash override](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kbsp/project_include.cmake)
- [App manifest format](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kdrv/apps/include/kapp_desc.h)
- [Installer client](https://github.com/kodediy/KodeOS/blob/v0.1.0/tools/kcli.py)
