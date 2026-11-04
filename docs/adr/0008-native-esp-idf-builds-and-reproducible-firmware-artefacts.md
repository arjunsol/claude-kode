---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0008: Native ESP-IDF builds and reproducible firmware artefacts

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q03, Q06; ADR-0003. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

The production Dot uses ESP32-P4 and ESP32-C5, while existing PlatformIO/Arduino examples in the repo target an unreleased ESP32-S3 prototype. Native ESP-IDF was selected as the authoritative initial firmware toolchain; Arduino and PlatformIO remain optional future adapters. The kodeOS app format is not yet verified for production.

## Options considered

1. Migrate the old S3 PlatformIO template directly. Fast but unsafe and likely technically wrong.
2. Develop equal Arduino, PlatformIO and ESP-IDF support immediately. High testing burden.
3. **Proposed:** pin an ESP-IDF-based P4 build path and make packaging/deployment explicitly separate operations.

## Proposed decision

Use a verified ESP-IDF version supporting the production P4/C5 components. Pin build tools and dependencies with appropriate lockfiles or immutable references, preserving the intent of accepted ADR-0003. Distinguish at minimum **generic build artefact**, **verified kodeOS-installable artefact** and **standalone firmware image**; never label one as the other without an evidenced transformation and validation step. Build success does not confer deployment authority. Support reproducible `build_only` operation before any device-flash method exists.

Do not assume the S3 `esptool --chip esp32s3` command, its flash offsets, partition CSV, QSPI pinout or Arduino board JSON apply to production hardware.

## Consequences and exclusions

Maximum access to native P4 features, but more complex templates and a need for direct production SDK/loader research. Friendly application scaffolds must hide unnecessary ESP-IDF complexity from users.

## Evidence needed before acceptance

Working build-only production target; pinned toolchain, dependency and firmware code; confirmed distinction between generic binary and kodeOS app image.

## Verification

Reproducible clean Windows builds, offline rebuild after setup, checksums, build provenance and a negative test that refuses S3-target deployment to P4.