---
status: proposed
created: 2026-11-03
review: required
---

# ADR-0014: Independent electrical, motor and power safety limits

**Status:** Proposed — NOT approved, implemented or validated.  
**Source decisions:** Q04, Q09; Maker and Robotics. See [`../discovery/working-decisions.md`](../discovery/working-decisions.md).  
**Existing accepted ADRs:** ADR-0001 to ADR-0003 remain unchanged.

## Context

Maker and Robotics support direct connections to electrical circuits and moving mechanisms. An AI policy decision on the host cannot protect against firmware bugs, communication loss, stall currents, unexpected loads or unsafe wiring.

## Options considered

1. Depend on Claude instructions and MCP prompts to avoid unsafe outputs.
2. Permit arbitrary power/actuation once the user consents.
3. **Proposed:** independent hardware/firmware operating envelopes, explicit physical authorisation and tested fault-stop behaviour.

## Proposed decision

Before device-connected actuation, validate the actual module's rated electrical supply, pin voltage, current and thermal limits from evidence. Record a bounded fixture-specific operating envelope. Provide external circuit protection, independent stop/interlock as appropriate, safe startup defaults, timeouts and defined loss-of-control behaviour. The MCP authorises narrowly scoped actuation, but no host command may defeat a required hardware interlock. Unknown electrical characteristics block energisation; passive design work may continue with clear uncertainty labels.

## Consequences and exclusions

Hardware fixtures and protective components are part of qualification. This is not a promise of general robotics functional-safety certification; high-energy or hazardous machines require separately engineered controls and review.

## Evidence needed before acceptance

Production Maker/Robotics specifications, measured loads, real motor/supply fixture, documented failure behaviour and an appropriate independent stop mechanism.

## Verification

Current/voltage checks, connection-loss and timeout tests, safe reset, intentional fault/stop observations and negative tests for unverified current or pins.