# Architecture Decision Records — Claude Kode

> **Governance:** ADR-0001…ADR-0003 in the existing repository are accepted and **not modified** by this proposal pack. ADR-0004…ADR-0016 in this pack are all **proposed**. The product owner's Q01–Q12 answers are agreed **working decisions**; an ADR is not adopted until explicitly reviewed and its status is changed by an approved repository change.

**Canonical inputs:** [working decisions](../discovery/working-decisions.md) · [adversarial reconciliation and roadmap](../discovery/architecture-review.md).

| ADR | Proposed topic | Source decision(s) | State |
|---|---|---|---|
| [0004](0004-production-p4-c5-identity-and-versioned-hardware-capability-profiles.md) | Production P4/C5 identity and versioned hardware capability profiles | Q03, Q09, Q10 | Proposed |
| [0005](0005-provenance-aware-capability-registry-and-deterministic-refusal.md) | Provenance-aware capability registry and deterministic refusal | Q08, Q10 | Proposed |
| [0006](0006-agent-trust-boundaries-and-effect-based-hardware-authorisation.md) | Agent trust boundaries and effect-based hardware authorisation | Q04, Q08, Q10 | Proposed |
| [0007](0007-typescript-local-mcp-host-and-separation-of-claude-specific-integration.md) | TypeScript local MCP host and separation of Claude-specific integration | Q02, Q06, Q11 | Proposed |
| [0008](0008-native-esp-idf-builds-and-reproducible-firmware-artefacts.md) | Native ESP-IDF builds and reproducible firmware artefacts | Q03, Q06; ADR-0003 | Proposed |
| [0009](0009-kodeos-first-application-lifecycle-and-isolated-standalone-firmware.md) | kodeOS-first application lifecycle and isolated standalone firmware | Q07, Q12; review of ADR-0002 | Proposed |
| [0010](0010-windows-usb-first-device-identity-and-transport-boundaries.md) | Windows USB-first device identity and transport boundaries | Q04, Q05 | Proposed |
| [0011](0011-layered-tests-hardware-evidence-and-release-qualification.md) | Layered tests, hardware evidence and release qualification | Q08, Q09, Q12 | Proposed |
| [0012](0012-maker-robotics-camera-mesh-and-f-ck-module-capability-contracts.md) | Maker, Robotics, Camera, Mesh and F*CK module capability contracts | Q03, Q09, Q10, Q12 | Proposed |
| [0013](0013-versioned-plugin-and-mcp-distribution-compatibility-and-privacy.md) | Versioned plugin and MCP distribution, compatibility and privacy | Q02, Q04, Q11 | Proposed |
| [0014](0014-independent-electrical-motor-and-power-safety-limits.md) | Independent electrical, motor and power safety limits | Q04, Q09; Maker and Robotics | Proposed |
| [0015](0015-lawful-rf-research-and-constrained-mesh-f-ck-operating-modes.md) | Lawful RF research and constrained Mesh/F*CK operating modes | Q04, Q09, Q10; Mesh and F*CK | Proposed |
| [0016](0016-platform-neutral-core-with-windows-first-transport-implementation.md) | Platform-neutral core with Windows-first transport implementation | Q02, Q05 | Proposed |

## Review order

1. **Evidence first:** production P4/C5 and kodeOS discovery, including recovery and whether the loader actually accepts ESP-IDF-derived apps. Drafts 0008/0009 must not be treated as proof of an integration API.
2. **Safety before operation:** decide evidence/refusal and authorisation boundaries (0005/0006) before exposing physical-control tools.
3. **Minimal verified vertical slice:** identity, TypeScript MCP, build and USB interfaces (0004/0007/0008/0010/0016).
4. **Qualification:** module contracts, HIL, distribution and physical/RF safety (0011–0015).

## Existing accepted ADRs

- **ADR-0001:** Keep the existing policy against vendoring unlicensed manufacturer example code.
- **ADR-0002:** Treat its S3-era kodeOS manifest finding as historical pending **explicit production P4 review**. This pack does not supersede it.
- **ADR-0003:** Preserve the principle of pinned reproducible driver dependencies. Adapt ESP-IDF lockfiles through a future reviewed decision.

## Status meanings

- **Proposed:** Working architecture candidate only; not approved, may change after evidence/review.
- **Accepted:** Explicitly ratified, with implementation and acceptance tests tracked separately.
- **Superseded:** Replaced by a linked newer ADR, not silently overwritten.
- **Deprecated:** Retained for provenance but not current guidance.

## Immediate dependency

**CK-R001:** Production P4/C5 hardware and kodeOS loader contract audit. No S3-derived deployment, partition or pin assumption may be used for production flashing.