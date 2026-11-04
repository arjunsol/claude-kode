# Production foundation tasks

Updated 2026-11-04. “Done” means the scoped deliverable exists, not that production
hardware works. Physical release gates remain unmet.

| Task | State | Exit evidence / dependency |
|---|---|---|
| Merge discovery PR #1 | Done | main at 8675aca; proposals are in the repository |
| Record ADR-0004 / ADR-0009 approval | Pushed for review | Accepted records and register on docs/approve-adr-0004-0009; main integration pending |
| Read official plugin authoring guidance | Done | Pinned sources and validation plan in plugin-authoring.md |
| Quarantine S3 template and active advice | Pushed for review | Archive, removed flash recipe, build-only target guard and tests |
| CK-R001 production contract audit | In progress | Dated source register and matrix; production sources/SDK still needed |
| Production hardware/revision and electrical contract | Blocked on evidence | Source-specific pin/power/module map and physical identity observation |
| Production kodeOS app/loader contract | Blocked on evidence | Supported SDK/sample, ABI/image format and install route |
| Backup/recovery procedure | Not demonstrated | Production assets and separately authorised physical test |
| One reproducible P4 build-only sample | Waiting on target | Verified sample, licences, pinned SDK/dependencies, output hashes |
| Versioned hardware profiles | Pending | Claim-level provenance, schema and invalidation/refusal tests |
| ADR-0005 / ADR-0006 policy review | Pending | Explicit decision on refusal and operation authorisation |
| TypeScript MCP read-only feasibility slice | Linux prototype validated | Pinned SDK/runtime, compiled stdio service, six passing tests; Windows/Claude validation and ADR-0007 acceptance pending |
| Base kodeOS end-to-end demonstration | Blocked | Loader, recovery, build, policy and identified hardware |
| Five module qualification streams | Pending | Maker, Robotics, Camera, Mesh and F*CK physical evidence |
| v1 qualification | Pending | All agreed Windows, workflow, module and release gates |

Next useful work: unblock primary production sources, locate the supported SDK
and sample, then choose a justified build-only target. Do not substitute a generic
ESP32-P4 binary for a verified kodeOS app. Mock policy development may proceed
independently; it cannot satisfy physical qualification.
