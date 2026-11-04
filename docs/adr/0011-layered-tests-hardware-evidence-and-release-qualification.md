---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0011: Layered tests, hardware evidence and release qualification

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q08, Q09, Q12. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

The product must establish whether generated firmware merely compiled, behaved correctly in a simulator or actually worked on a production Kode Dot and its five modules. The owner explicitly made real physical module validation mandatory for v1.

## Options considered

1. Treat build success as feature readiness.
2. Demand full autonomous hardware lab infrastructure from the outset.
3. **Proposed:** layered L1–L4 verification with provenance, operation-specific safety permissions and manual physical tests where necessary.

## Proposed decision

Track separate results for L1 **reproducible build**, L2 **automated/simulated logic tests**, L3 **production-device execution**, L4 **production-device plus module physical integration**. Each result identifies test protocol, artefact hash, board and module revision, firmware/OS version, host toolchain, measurement/observation, time and applicable environmental constraints. Allowed states include `passed`, `failed`, `unsupported`, `not_tested` and `blocked` with reasons. Evidence cannot be promoted to higher levels by inference.

Q04 permissions apply to tests that flash, reset, probe active buses, transmit or move actuators. Each of the five modules needs at least one meaningful L4 integration test with agreed pass/fail criteria before a v1 release is declared. A future autonomous physical test laboratory is optional, not a first-release requirement.

## Consequences and exclusions

Provides useful evidence and honest release claims, at the expense of fixtures, acquisition and result maintenance. No arbitrary pass threshold or test duration is specified without hardware evidence.

## Evidence needed before acceptance

Agreed test manifest schema, module fixture list, flagship base-Dot end-to-end demo and audit process for evidence expiry.

## Verification

Tests that forbid fake L4 qualification from mocks, incorrect hardware profiles or stale artefact hashes; at least one genuine L3 run and five distinct physical L4 records for v1.