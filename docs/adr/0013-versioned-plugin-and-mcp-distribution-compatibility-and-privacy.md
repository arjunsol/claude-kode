---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0013: Versioned plugin and MCP distribution, compatibility and privacy

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q02, Q04, Q11. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

The project is personal-first but designed to become publicly reusable. Claude Code skills and a separately identifiable TypeScript MCP runtime can evolve at different rates. A silent update must not make previously denied physical actions permissible or leak device data.

## Options considered

1. Require manual clone/install from source with no compatibility contract.
2. Ship a centrally managed cloud service with auto-updates and telemetry.
3. **Proposed:** a versioned, reproducible, local-first Claude plugin and MCP distribution, combined into tested compatibility bundles.

## Proposed decision

Publish independent component versions with a tested compatibility manifest covering plugin, MCP protocol/tool schema, firmware toolchain, supported hardware-profile schema and driver revisions. Validate the combination at startup; refuse incompatible operations with guidance. Default to local MCP stdio and no mandatory network listener or telemetry. Dependency pins, lockfiles, checksums and clean Windows installation testing are first-release gates. Upgrades are explicit; they must not increase physical-operation grants or auto-flash firmware. Device logs and camera images remain locally controlled by default, and any submission to a remote model, export or diagnostic service must be transparent and user-authorised.

Retain existing MIT project licensing unless a validated dependency or contribution issue requires a separate decision. Being publicly reusable does not create an immediate support SLA or marketplace obligation.

## Consequences and exclusions

More predictable upgrades and safer privacy posture, with a need to maintain a compatibility matrix and migration process. Offline *device tooling* does not imply the external Claude model works offline.

## Evidence needed before acceptance

Agreed package runtime, lockfile/build reproducibility method, compatibility manifest, model-data flow description and opt-in diagnostics policy.

## Verification

Clean install, mismatched-version refusal, upgrade without permission escalation, secrets/image redaction tests and operation without a mandatory Claude Kode cloud service.