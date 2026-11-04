---
status: accepted
created: 2026-11-03
review: approved
accepted: 2026-11-04
---

# ADR-0004: Production P4/C5 identity and versioned hardware capability profiles

**Status:** Accepted by the product owner on 4 November 2026. Implementation and hardware validation remain outstanding.
**Source decisions:** Q03, Q09, Q10. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

The shipped Kode Dot is the ESP32-P4/ESP32-C5 product. The repository currently contains an ESP32-S3 prototype pin map and flash configuration; that design was not commercially released. Using those assumptions against the production Dot may lead to invalid code or destructive flashing. The five expansion modules also require version-specific electrical and software knowledge.

## Options considered

1. Embed hardware constants in each skill and firmware template. Simple, but difficult to verify and update consistently.
2. Build a fully generic device-model framework. Flexible, but speculative and costly before the production interface is understood.
3. **Selected:** maintain a small, versioned, typed profile for each *supported* production board/module combination, with a narrow extension point for future revisions.

## Decision

Use a machine-readable, strongly validated P4/C5 profile as the primary supported target. Include manufacturer/model identifiers; observed board revision; relevant bootloader and kodeOS versions; peripheral and module capabilities; pin, bus and power constraints; toolchain compatibility; and identifiers linking each claim to evidence. Claims must specify what is merely advertised, documented or physically observed. Never infer module auto-detection unless proven. A manual module-selection workflow may be necessary, but must not bypass safety eligibility checks.

Quarantine S3-specific source as **unreleased-prototype archival material**. Reject destructive commands unless current target identity and hardware constraints match a verified supported profile. Do not encode an unverified P4 flash offset or partition scheme.

## Consequences and exclusions

A single source of hardware truth improves debugging and refusal consistency. It introduces profile maintenance and invalidation responsibilities. Supporting arbitrary other boards or a full hardware ontology is *not* an initial commitment.

## Required implementation and qualification evidence

Confirm actual production identifiers, hardware/firmware revisions, pin/expansion map and safe means of querying them. Verify one profile against a physical Dot and record mismatches explicitly.

Approval adopts the architectural direction; it does not establish production compatibility or satisfy the evidence requirements above. CK-R001 remains open.

## Verification

Automated schema tests; mismatch/unknown revision tests; a physical identity observation; and negative tests proving that an S3 profile cannot authorise a P4 flash.
