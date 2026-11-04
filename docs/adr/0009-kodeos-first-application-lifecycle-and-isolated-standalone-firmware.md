---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0009: kodeOS-first application lifecycle and isolated standalone firmware

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q07, Q12; review of ADR-0002. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

The owner chose kodeOS applications as the normal product experience. Standalone ESP-IDF images may eventually be supported, but only in an explicitly isolated mode after backup and recovery are proven. Existing accepted ADR-0002 documents S3-era investigation and must not be assumed to prove the shipped P4 loader's interface or lack of a manifest.

## Options considered

1. Replace kodeOS with bare-metal/standalone images for every application. Simple integration with generic ESP-IDF but sacrifices the supported runtime and risks device recovery.
2. Use kodeOS exclusively and ban standalone development forever. Preserves the OS but restricts experimentation.
3. **Proposed:** kodeOS-first application packaging and separately gated standalone firmware, with distinct artefact identities and deployment commands.

## Proposed decision

Normal release functionality must target a **manufacturer-supported and verified production kodeOS loading mechanism**. No binary format, manifest, partition offset, core assignment or lifecycle hook is to be fabricated from incomplete documentation. A generic ESP-IDF build is *not* an installable kodeOS app until an independently verified integration contract says so. All installation requires verified device identity, compatibility, specific approval and an observability/recovery plan.

Standalone firmware remains **disabled** until a production-device backup/recovery procedure is demonstrated and the user explicitly selects that separate mode. Both image types carry unambiguous metadata and cannot be passed to each other's deployment paths. If the production loader contract cannot be established, record a release-blocking unresolved interface, not an invented workaround.

## Consequences and exclusions

Preserves manufacturer features and safer operational expectations, but introduces a vendor API dependency that could block v1. ADR-0002 stays accepted as a historical record pending a separately reviewed supersession decision; this draft does not quietly rewrite it.

## Evidence needed before acceptance

Official P4 production sample, loader format and documented safe install/recovery route; device-side verified application lifecycle. Confirm if historical ADR-0002 remains relevant.

## Verification

Real-device allowed app install and observable execution using a documented path; negative tests for unknown image types, wrong identity, missing recovery and unapproved standalone image.