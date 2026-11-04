---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0015: Lawful RF research and constrained Mesh/F*CK operating modes

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q04, Q09, Q10; Mesh and F*CK. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

Mesh and F*CK expose radio capabilities. Hardware frequency coverage, receive capability and documented commands do not themselves establish UK legal authority to transmit, use a particular band/power, or interact with third-party systems. Tool names such as `scan` may entail transmission.

## Options considered

1. Expose unrestricted radio APIs under broad user consent.
2. Remove all transmit features, preventing meaningful Mesh integration tests.
3. **Proposed:** conservative default receive-only/metadata modes, separately approved transmit/test modes with explicit constraints and local legal checks.

## Proposed decision

Classify RF operations by actual effect: passive receive, active probing, transmit, replay and interaction with another system. Enforce frequency/mode/power/duty-cycle and target/test-environment constraints according to verified device capabilities and applicable UK rules for the specific use case, and require specific authorisation for transmit or other active activity. Prefer lab-controlled or owned devices for tests; do not treat manufacturer-advertised transceiver bands as a licence. Mesh v1 qualification still requires an actual lawful message exchange with a compatible peer. F*CK v1 qualification requires an authorised, hardware-backed diagnostic that the toolchain can actually support.

## Consequences and exclusions

Some features may be unavailable until permissions, firmware APIs or lawful test settings are verified. This draft is not a legal determination of permissible bands or operations; source-specific regulatory validation is a prerequisite to enabling TX.

## Evidence needed before acceptance

Production RF module revision, verified transceiver/antenna characteristics, official programming interfaces, relevant current Ofcom rules and a documented safe/authorised test plan.

## Verification

Negative tests for unsupported bands/power/modes and missing approval; documented physical Mesh peer exchange and compliant RF diagnostic.