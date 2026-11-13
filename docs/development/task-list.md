# Production foundation tasks

Updated 2026-11-13. “Done” means the scoped deliverable exists, not that production
hardware works. Physical release gates remain unmet.

| Task | State | Exit evidence / dependency |
|---|---|---|
| Merge discovery PR #1 | Done | main at 8675aca; proposals are in the repository |
| Record ADR-0004 / ADR-0009 approval | Pushed for review | Accepted records and register on docs/approve-adr-0004-0009; main integration pending |
| Read official plugin authoring guidance | Done | Pinned sources and validation plan in plugin-authoring.md |
| Quarantine S3 template and active advice | Pushed for review | Archive, removed flash recipe, build-only target guard and tests |
| CK-R001 production contract audit | In progress | Dated source register and matrix; Doom P4 sample and Arduino kodeOS integration source found; version/physical contract unresolved |
| Production hardware/revision and electrical contract | Blocked on evidence | Source-specific pin/power/module map and physical identity observation |
| Production kodeOS app/loader contract | Integration source inspected | Arduino descriptor/mailbox/wrappers found; release compatibility, native IDF packaging and physical install/recovery unverified |
| Backup/recovery procedure | Not demonstrated | Production assets and separately authorised physical test |
| Cross-platform setup guide and launchers | Implemented | Shared installer, Windows/macOS/Linux entry points; Linux host/bootstrap verified; automatic CI disabled by owner; hosted OS validation unverified |
| Native cloud firmware environment | Partially installed | IDF 6.0.1, P4 compiler, CMake and Ninja verified; constrained Python setup blocked by dl.espressif.com policy |
| One reproducible P4 build-only sample | Candidate identified | Doom example targets IDF 6.0.1/P4; requires verified WAD asset and toolchain setup before build |
| Versioned hardware profiles | Pending | Claim-level provenance, schema and invalidation/refusal tests |
| ADR-0005 / ADR-0006 policy review | Pending | Explicit decision on refusal and operation authorisation |
| TypeScript MCP read-only feasibility slice | Linux prototype validated | Pinned SDK/runtime, compiled stdio service, six passing tests; Windows/Claude validation and ADR-0007 acceptance pending |
| F1 capability registry, evidence and scaffold, build and inspect MCP pipeline (CK-R003) | Implemented in proposed PR; host-tested only | 149 tests, 148 pass, 1 skipped on Windows; independent safety review done before first push (12 confirmed defects fixed, residual risks listed); pins moved to v0.1.1; see f1-capability-evidence-build.md |
| Real ESP-IDF v6.1 build of a scaffolded app through `kode_build` | Not run | No ESP-IDF v6.1 on the development host; needs an operator build and a recorded L1 result |
| Resolve raw-offset (`0x1C00000` vs `0x1A00000`) and HTTPS vs SSH SDK pin conflicts | Open | Both persist at v0.1.1; need manufacturer resolution |
| Device identity, install, recovery and test-evidence tools (F2 and later) | Not implemented | Specified in PR #6; need an observed Dot and an approval channel |
| Base kodeOS end-to-end demonstration | Blocked | Loader, recovery, build, policy and identified hardware |
| Five module qualification streams | Pending | Maker, Robotics, Camera, Mesh and F*CK physical evidence |
| v1 qualification | Pending | All agreed Windows, workflow, module and release gates |

Next useful work: audit and reproduce the discovered Doom P4 sample without
flashing (including its required WAD asset), and separately establish the supported
kodeOS SDK/loader contract. Do not substitute a generic
ESP32-P4 binary for a verified kodeOS app. Mock policy development may proceed
independently; it cannot satisfy physical qualification.
