---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0016: Platform-neutral core with Windows-first transport implementation

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q02, Q05. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

The initial supported host is Windows with one connected Dot over local USB. The owner wishes to avoid locking the core architecture to Windows so Linux, macOS, network transport or multiple devices can be added eventually, without promising them now.

## Options considered

1. Embed Windows serial and subprocess details throughout workflows.
2. Build a universal cross-platform, remote multi-device framework immediately.
3. **Proposed:** implement one simple Windows adapter behind minimal core interfaces derived from the first real use case.

## Proposed decision

Keep the capability registry, safety evaluator, build intent, artefact types and result contracts platform-neutral. Put operating-system-specific USB discovery, serial access, ESP-IDF tool invocation and filesystem/path details behind separately testable adapters. Host runtime and package portability do not imply supported device transports. Do not expose a remote endpoint or implement multi-device scheduling until a new approved need and threat model exist.

## Consequences and exclusions

A small amount of separation now avoids expensive coupling; speculative abstractions are intentionally deferred. Full cross-platform CI and Wi-Fi/multi-device support are not required for initial release.

## Evidence needed before acceptance

One tested Windows USB workflow and one mock/non-Windows contract test showing separation without boilerplate-heavy abstractions.

## Verification

Windows physical integration plus unit tests of core logic without Windows-specific dependencies; no undocumented network port opened by default.