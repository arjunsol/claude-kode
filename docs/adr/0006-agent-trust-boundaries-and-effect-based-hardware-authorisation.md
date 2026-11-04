---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0006: Agent trust boundaries and effect-based hardware authorisation

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q04, Q08, Q10. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

Claude Kode is intended to develop code autonomously while protecting real devices, connected circuits and other local files. Apparent read-only tool names can conceal side effects (active bus scanning, reset, RF probing or arbitrary build scripts). Approving an agent instruction is not a hardware interlock.

## Options considered

1. Confirm every action with the user. Safe but obstructive for normal development.
2. Allow high-level tool calls under prompt guidance alone. Convenient but bypassable.
3. **Proposed:** bounded autonomous development plus effect-based action classification, enforced by an independent MCP gateway and, where necessary, hardware protections.

## Proposed decision

Allow source edits, builds, simulation and harmless diagnostics only inside explicitly authorised workspaces and resource budgets. Apply deny-by-default policy to uncertain or physical effects. For each destructive/physical action require a specific, user-approved operation bound to device identity, action parameters, artefact hash where relevant, expiry/validity and confirmed prerequisites. Device-state transitions invalidate approvals when their assumptions change.

The MCP must not expose generic serial/USB, shell or scripting escapes that can bypass the policy. Treat untrusted repositories, build scripts, and firmware outputs as potentially hostile; restrict subprocess execution, access paths and secrets. Enforce motor/power limits and emergency-stop behaviour in independent device/hardware controls, not just host policy. Logging/audit should capture attempted and refused operations with privacy protections.

## Consequences and exclusions

Increases implementation and threat-model complexity while permitting efficient supervised development. An approval for one flash never authorises subsequent flashes; adding unattended physical testing requires a *new* explicit governance decision.

## Evidence needed before acceptance

Specify trusted/untrusted processes, an actionable threat model, user-approval UX, command runner limits and device-specific safety prerequisites.

## Verification

Red-team negative tests for alternative tool paths, indirect shell commands, changed firmware hashes, expired approval, unknown board identity and failed safety preflight.