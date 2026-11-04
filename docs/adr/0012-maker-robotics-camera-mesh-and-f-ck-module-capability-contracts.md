---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0012: Maker, Robotics, Camera, Mesh and F*CK module capability contracts

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q03, Q09, Q10, Q12. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

All five official expansion modules were explicitly chosen for first-release support, despite the engineering burden and possible changes in shipping revisions. The modules use heterogeneous electrical and software interfaces; comparable support should mean comparable proof, not identical functions.

## Options considered

1. Support only one or two modules for v1. Contradicts Q09 and Q12.
2. Create a universal, feature-complete plugin framework immediately. Premature abstraction.
3. **Proposed:** module-specific adapters and versioned capability profiles sharing the common evidence, safety and test contracts.

## Proposed decision

Each of **Maker, Robotics, Camera, Mesh, F*CK** must have verified production hardware identity, documented supported APIs, a usable Claude skill/MCP workflow, reproducible reference application, appropriate side-effect policy, and an L4 physical integration record before v1. Minimum proof targets: Maker—bounded GPIO/bus sensor exchange; Robotics—controlled motor/servo action and fault/stop; Camera—capture and locally retrieve a real image; Mesh—exchange a message with a compatible second endpoint; F*CK—demonstrate a lawful authorised hardware-backed RF diagnostic, beginning with read-only behaviour wherever possible.

Modules may be integrated in parallel after the common build, device, permission and evidence boundaries are stable. If auto-enumeration cannot be verified, associate a module via explicit human-confirmed configuration; unknown combinations cannot authorise unsafe operations.

## Consequences and exclusions

All five are release blockers; unsupported features within a module must be clearly disclosed rather than claimed. Module designs and manufacturer software may change, so version-specific evidence is mandatory. No requirement for arbitrary third-party modules in v1.

## Evidence needed before acceptance

Delivered production modules, compatible test fixtures and peer radio node, manufacturer SDKs/pinouts, plus module-specific acceptance protocols.

## Verification

Five independently traceable module qualification reports and negative tests for absent/wrong/revised modules; no mock substitutions for v1.