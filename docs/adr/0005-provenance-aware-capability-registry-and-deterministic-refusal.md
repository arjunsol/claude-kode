---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0005: Provenance-aware capability registry and deterministic refusal

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q08, Q10. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

Manufacturer claims, documentation, source code, simulated tests and physical tests provide different levels of certainty. Claude may plausibly generate unsafe commands when specifications are incomplete, stale or contradictory. Physical operations therefore cannot be allowed solely because a language model thinks a capability exists.

## Options considered

1. Rely on agent judgement, citations and warnings.
2. Require physical proof for *all* guidance, including harmless design exploration.
3. **Proposed:** operation-specific evidence thresholds and a deterministic policy evaluator, while allowing appropriately qualified non-destructive guidance.

## Proposed decision

Maintain machine-readable capability claims with: source URI or artefact identity; date; supplier/provenance; production hardware and module revision scope; firmware/toolchain scope; verification method; observed result; freshness/invalidation triggers; and explicit states such as `advertised`, `documented`, `tested`, `device_verified`, `unknown`, `unsupported` and `conflicting` (final taxonomy TBD).

Each action declares the evidence it requires. A pure design question may use labelled manufacturer documentation; a flash, radio transmit or motor action demands verified identity, specific operational evidence and Q04 permission. The **TypeScript MCP policy layer**, not the model prompt, returns structured `allowed` or `refused` outcomes with machine-readable reason codes and next-verification requirements. Evidence is revocable when revisions or test assumptions change.

## Consequences and exclusions

Safer failure modes, reproducible decisions, and clear explanations. Requires careful schema governance and test fixtures; not a simple scalar confidence score or blanket prohibition of useful pre-hardware work.

## Evidence needed before acceptance

Agree the minimal operation taxonomy, claims schema, invalidation rules and permission linkage. Verify source-of-truth conflicts with sample production claims.

## Verification

Golden policy tests for missing, contradictory, stale and superseded evidence; cases where documented guidance is allowed but destructive action is refused; no prompt or low-level tool bypass.