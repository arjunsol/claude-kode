---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0010: Windows USB-first device identity and transport boundaries

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q04, Q05. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

The initial host is Windows with one physically attached P4/C5 Dot. USB enumeration can change across bootloader, app, debugging and recovery modes; port name alone is insufficient for safe target selection.

## Options considered

1. Hardcode a user-selected COM port and combine diagnostics with flashing.
2. Implement every host OS, network transport and device fleet abstraction from day one.
3. **Proposed:** one validated Windows USB adapter with narrowly scoped discovery, console, debug and deployment capabilities, leaving future adapters behind a small seam.

## Proposed decision

Provide device discovery that records observed USB descriptors and any manufacturer-supported identity, without assuming a stable COM number. Require re-identification before physical operations after relevant reconnect or mode change. Model capability-specific operations (`observe_logs`, `inspect`, `build`, `install`, `recover`) distinctly; only expose commands for verified real interfaces. No network-facing control listener, multi-device scheduler, arbitrary serial passthrough or remote firmware deployment in first-release scope.

## Consequences and exclusions

Simple local operation without tying domain logic to Windows. Some features remain unavailable if the production device only exposes unsupported low-level interfaces. Don't conflate control transport over USB with radio operation inside a module.

## Evidence needed before acceptance

Windows USB enumeration observations for the shipping board and each supported state; minimal serial/loader interface mapping and reconnection behaviour.

## Verification

Attach/detach/reconnect tests, unknown-device tests, mode-change identity mismatch, refusal on stale target selection and successful authorised read-only status collection.