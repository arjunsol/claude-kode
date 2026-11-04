---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0007: TypeScript local MCP host and separation of Claude-specific integration

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q02, Q06, Q11. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

Claude Kode requires an MCP surface for real tools, a set of Claude Code skills/commands for workflow guidance, and a reusable hardware-development core. The owner explicitly selected TypeScript instead of the earlier provisional C#/.NET proposal. The repository currently has skills/templates but no verified TypeScript MCP implementation.

## Options considered

1. Implement most operations directly in skill scripts. Minimal initial hosting, but weak policy enforcement and testability.
2. Build a monolithic Claude-specific MCP with device code embedded everywhere.
3. **Proposed:** a local TypeScript MCP adapter over independently testable services for capability lookup, build, discovery, logs and safety policy.

## Proposed decision

Use a TypeScript MCP service as the local tool boundary. Keep CLI/library-style build, evidence and device services independent of Claude Code where practical; Claude skills describe interaction workflows and never function as the sole authorisation barrier. Prefer local stdio transport initially **subject to a runtime feasibility spike**, with no network listener by default. Use runtime input/output validation, minimal tool privileges and structured result envelopes, including `unsupported`, `refused` and `not_verified` outcomes.

Do not freeze the Node runtime, MCP SDK, package manager or workspace layout before inspecting the current SDK compatibility and Windows distribution options. MCP version negotiation/handshake belongs in release compatibility testing.

## Consequences and exclusions

Cleaner testing, easier future agent clients and stronger enforcement boundaries, at the cost of a service/API interface. No promise of a public SaaS endpoint or generic remote-agent platform.

## Evidence needed before acceptance

A working local TypeScript MCP skeleton on Windows, strict schema tests, process lifecycle behaviour and a minimal read-only mock-device capability tool.

## Verification

End-to-end Claude Code tool discovery, malformed input rejection, denied writes, reproducible process startup/shutdown and successful non-Claude test-client invocation.