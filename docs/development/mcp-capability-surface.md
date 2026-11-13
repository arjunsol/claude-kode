# Claude Kode — Proposed MCP capability surface (v1 contract catalogue)

> **Status: Proposed functional API contract**, not an accepted ADR, approved operating permission, manufacturer guarantee or claim of implementation. **Date:** 13 November 2026.
>
> **Purpose:** Translate owner decisions Q01–Q12 into testable TypeScript MCP operations, keeping the initial implementation in PR #4 separate from the required v1 scope. No physical-device access or code execution was performed for this document.

## What was agreed and what was built

Q01 chose a complete hardware engineering platform as the vision and an end-to-end developer agent as the first release. Q04 requires authorisation and independent safeguards for physical effects. Q06 selects **TypeScript MCP + ESP-IDF**. Q07 selects **kodeOS application deployment first**. Q08 requires layered L1–L4 evidence. Q09 and Q12 make **all five modules** (Maker, Robotics, Camera, Mesh, F*CK) release-one qualification gates. Q10 requires provenance and deterministic refusals. Q11 requires a versioned local-first plugin/MCP bundle.

The original discovery also proposed the exact names `kode_get_capabilities`, `kode_get_pinout`, `kode_build`, `kode_validate`, `kode_detect`, `kode_serial_monitor`, `kode_list_modules`, `kode_get_module_spec`, `kode_flash`, `kode_verify_firmware`. Treat those as **prior candidate interfaces**, not as implemented tools or a signed-off versioned protocol. This catalogue preserves the unambiguous names and **splits `kode_flash` into typed app-specific planning/installation** so it cannot be used as an unrestricted raw-flash escape hatch.

**Implemented only in draft PR #4:** `kode_ping`, `kode_boot_info`, `kode_list_apps`, `kode_capture_screen`; the predecessor PR #2 also exposes a **simulated** `inspect_capability` test fixture. These are source-implemented, fake-console-tested and **not yet run on an actual production Dot**. They may open a serial port, which can reset the Dot. No other tools in this document are claimed to exist.

**Proposed catalogue size:** **47 named operations** over 9 areas. This is a **coverage inventory**, not an instruction to register 47 tools in Claude at startup; feature-gate and advertise bounded tool sets according to demonstrated capability and workspace context. There is no requirement to implement each operation as a separate MCP endpoint if a tested, constrained composite proves equivalent coverage.

## Taxonomy

**Effect categories (to be enforced by host policy, not inferred from a name):**

| Code | Actual effect | Required boundary |
|---|---|---|
| `S0` | Pure source/registry inquiry, no device and no writes | Revision-scoped evidence, bounded reads |
| `H0` | Host inspection / metadata reads | Workspace and privacy limits |
| `H1` | Host subprocess, build, test, file generation or evidence write | Explicit trusted workspace, executable allowlist, time/resource budgets; never equates to hardware approval |
| `D1` | Attached-device observation, file read or serial session | Verified port/device consent; serial open may reboot hardware; privacy controls |
| `D2` | Device app/storage changes | One-operation authorisation bound to device, action, image hash, mode and expiry; recovery prerequisites |
| `P1` | Peripheral, electrical, bus, camera or actuator state transitions | Device/fixture identity, electrical limits, independent physical safety constraints |
| `RF1` | Radio transmission / active RF interaction | Explicit owner/lab target, applicable UK frequency/power/duty-cycle limits, hardware evidence and one-action authorisation |
| `MIXED` | Composite physical test plan | Evaluate every constituent step; no implicit authorisation laundering |

**Delivery phases:** `P4` is already present in **PR #4** but not hardware-verified; `F1` is the next source/host implementation slice; `F2` is the app lifecycle and HIL validation slice; `F3` is module integration. **All F1–F3 capabilities that are required for qualification must pass before Q12 v1**. Missing vendor module SDKs are blockers, not waivers. Availability of an API in source does not prove compatibility with shipping firmware.

## Proposed tool inventory

### Capability knowledge & source provenance

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_get_capabilities` | Return versioned board/module capability and support states | S0 | F1 | registry; Q03/Q10 |
| `kode_get_pinout` | Return revision-scoped P4/J3 pin, bus, voltage and ownership constraints | S0 | F1 | kbsp; Q03/Q10 |
| `kode_list_modules` | List supported module profiles; distinguish attached from catalogued | S0 | F1 | registry; Q09 |
| `kode_get_module_spec` | Describe one module's verified electrical/software contract | S0 | F1 | registry and module SDK; Q09 |
| `kode_get_evidence` | Explain source/test records, conflicts, dates and invalidation | S0 | F1 | evidence ledger; Q08/Q10 |
| `kode_check_compatibility` | Evaluate an operation, target, build and module profile; advisory, not approval | S0 | F1 | policy evaluator; Q04/Q10 |
| `kode_get_toolchain_status` | Inspect installed ESP-IDF, SDK, C5 and host utility pins | H0 | F1 | host toolchain; Q06 |
| `kode_get_sdk_contract` | Identify official SDK/app-format/console protocol versions and sources | S0 | F1 | official v0.1.0 source; ADR-0017 proposal |

### Device identity, observability & diagnostics

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_detect` | Enumerate candidate USB devices without opening serial ports | H0 | F1 | Windows USB adapter; Q05 |
| `kode_identify_device` | Establish observed Kode serial/model/version and bind a device session | D1 | F1 | kcli/boot_info; Q03/Q05 |
| `kode_ping` | Request console liveness | D1 | P4 | kcli ping; PR #4 |
| `kode_boot_info` | Inspect boot/slot information | D1 | P4 | kcli cmd boot_info; PR #4 |
| `kode_list_apps` | List installed application identities/versions | D1 | P4 | kcli cmd app_list; PR #4 |
| `kode_device_health` | Read supported battery, power, storage and health data | D1 | F1 | verified console verbs only |
| `kode_serial_monitor` | Start bounded log collection; no arbitrary console writes | D1 | F1 | serial observer; Q08 |
| `kode_capture_screen` | Capture current screen with temporary-file controls | D1 | P4 | kcli screenshot; PR #4 |
| `kode_get_file` | Read named, permitted file from device with privacy checks | D1 | F2 | kcli file-get; path restrictions |
| `kode_collect_coredump` | Collect and identify a supported crash artefact | D1 | F2 | kodeOS coredump support; verification pending |

### Application development, validation & deployment

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_new_app` | Scaffold an app from pinned GPL production template in authorised workspace | H1 | F1 | kode-app-template; Q06/Q07 |
| `kode_validate` | Check project manifest, app role, pins, licences and inputs | H0 | F1 | kode-apps rules; Q10 |
| `kode_build` | Execute pinned ESP-IDF v6.1 build without flashing | H1 | F1 | idf.py build; Q06 |
| `kode_test` | Run bounded static/unit/host simulation checks | H1 | F1 | official host tests; Q08 |
| `kode_inspect_image` | Parse built artefact target, app role, version, manifest and digest | H0 | F1 | SDK image contract |
| `kode_catalog_check` | Run catalogue validation and explain rule failures | H1 | F2 | kode-apps tools/check_app.py |
| `kode_plan_install` | Prepare immutable install intent, preflight, expected effects and recovery | S0 | F2 | policy + kcli app installer |
| `kode_install_app` | Install only authorised kodeOS app (not OS/C5/standalone/raw flash) | D2 | F2 | kcli install --dst app; Q04/Q07 |
| `kode_verify_firmware` | Compare installed app identity/behaviour against expected build and test evidence | D1 | F2 | boot_info/app_list/observations |
| `kode_app_remove` | Remove explicitly selected app after scoped authorisation | D2 | F2 | verified app management verb; not yet tested |

### UI preview, simulation & evidence-driven hardware tests

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_ui_preview` | Render or statically preview application UI without device claims | H1 | F2 | SDK LVGL/kui; Q08 |
| `kode_simulate` | Execute bounded host-side logic simulation with labelled limitations | H1 | F2 | SDK host tests; not a full P4 emulator |
| `kode_hil_execute` | Execute a reviewed physical test plan with per-step authorisations | MIXED | F2 | fixtures, policy, Q08/Q12 |
| `kode_test_evidence` | Store/find signed or hashed results with target, fixture, revision and PASS/FAIL status | H1 | F1 | Q08/Q10 evidence record |

### Maker expansion

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_maker_validate_wiring` | Check known rail/pin limits and produce a non-binding wiring review | S0 | F3 | kbsp/exp + module specs |
| `kode_maker_bus_probe` | Probe authorised I²C address/range; may change bus state | P1 | F3 | kdrv_exp_bus; Q04 |
| `kode_maker_sensor_read` | Read via an explicitly declared supported sensor driver | P1 | F3 | verified module/sensor |
| `kode_maker_gpio_control` | Bound GPIO/PWM state change with electrical interlock | P1 | F3 | verified board/module and safety |

### Robotics expansion

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_robotics_limits` | Read verified motor/servo/electrical envelope and fixture interlocks | S0 | F3 | robotics SDK + Q04 |
| `kode_robotics_move` | Run bounded actuator test with time/current/position limits | P1 | F3 | robotics driver and independent limits |
| `kode_robotics_stop` | Request stop; never substitute for hardware emergency stop | P1 | F3 | device safety interface; Q04 |

### Camera expansion

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_camera_capture` | Capture one image via retail Camera module driver with privacy guard | P1 | F3 | module SDK unavailable publicly |
| `kode_camera_get_image` | Transfer requested capture and record digest/local retention | D1 | F3 | module integration; Q09 |

### Mesh expansion

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_mesh_status` | Inspect Mesh/GNSS configuration and verified radio capability | D1 | F3 | module SDK unavailable publicly |
| `kode_mesh_send` | Transmit scoped test message to consenting compatible peer | RF1 | F3 | lawful band/ERP/duty-cycle policy |
| `kode_mesh_receive` | Receive bounded radio messages; active radio state may change | P1 | F3 | peer protocol and fixture |

### F*CK radio expansion

| MCP tool | Intended contract | Effect | Phase | Grounding |
|---|---|---|---|---|
| `kode_rf_capabilities` | List hardware/band/firmware/permission constraints for module | S0 | F3 | module SDK unavailable publicly |
| `kode_rf_passive_capture` | Capture bounded permitted receive-only diagnostic data | P1 | F3 | verified passive mode and privacy |
| `kode_rf_lab_transmit` | Run narrowly parameterised authorised RF lab test only | RF1 | F3 | future evidence+UK rules, not arbitrary replay |

## Common typed contract

Every externally visible tool accepts a **strict validated input** with no unknown keys. Use versioned schemas and bounded data; no arbitrary shell command, console verb string, raw flash offset, unmanaged USB byte stream, unrestricted path, arbitrary radio packet or motor opcode may cross the MCP boundary.

At a minimum, return:

```ts
type KodeResult<T> = {
  schemaVersion: "1";
  status: "ok" | "refused" | "not_verified" | "unsupported" | "failed";
  reasonCode: string;
  message: string;
  payload?: T;
  evidence: Array<{
    sourceUri: string;
    revision: string;
    class: "advertised" | "documented" | "source_verified" |
           "simulated" | "device_verified" | "integration_verified";
    verifiedAt?: string;
  }>;
  actionId?: string;
  observedDeviceId?: string;
  firmwareVersion?: string;
  artefactSha256?: string;
  requiredNextEvidence?: string[];
};
```

Specific input families:

- **Offline knowledge:** `{ profileId, capability?, moduleId?, revision? }`; evidence must be contextual, never a bare global boolean.
- **USB inspection:** `{ deviceSessionId, observedDeviceId, expectedKodeOs?, timeoutMs? }`; session creation requires operator opt-in because opening a port can reset hardware. Device identity is read from the real board, not supplied as trusted fact by the model.
- **Build:** `{ workspaceId, projectId, sdkRelease, target: "esp32p4", buildProfile }`; validated absolute workspace root comes from host configuration, not a free-form user path.
- **Install:** `{ actionPlanId, deviceSessionId, artefactSha256 }`; server rechecks immutable plan, image role, chip, SDK/loader compatibility, observed identity and human authorisation. **No `approved: true` argument**. The agent cannot mint its own approval.
- **Electrical/RF:** `{ fixtureId, capabilityId, parameters, approvalHandle }`; handles are issued only by an independent authorisation interface; no unrestricted raw values or unbounded operation duration.

All results must say which layer was verified: documentation, source, build, simulation, production device, or physical module integration. Return actionable machine-readable refusals for unknown, contradictory, missing, stale or superseded evidence. Bind physical proof to exact hardware/module revision and tested conditions. A build PASS does not imply installation permission.

## Other MCP surfaces: resources and prompts, not tools

Large reference bodies should be **MCP resources** instead of crowding the tool menu:

- `kode://profiles/production-p4-c5` — versioned board identity and checked capabilities.
- `kode://modules/{module}/{revision}` — module constraints and source confidence.
- `kode://sdk/v0.1.0/app-contract` — ESP-IDF v6.1, `KODE_APP_MANIFEST`, app-role boot/partition model.
- `kode://evidence/{claimId}` — provenance and invalidation.
- `kode://test-runs/{runId}` — L1–L4 test evidence and observations.

Claude Code **skills/commands** provide guided workflows: develop, debug, module engineering, deployment preparation, HIL qualification and recovery planning. They cannot override MCP policy or substitute for independently enforced physical controls. Prompts may compose multiple tools, but do not acquire hidden permissions.

## Actual manufacturer backing

**Known official v0.1.0 components:** [kode-sdk](https://github.com/kodediy/kode-sdk/releases/tag/v0.1.0), [KodeOS](https://github.com/kodediy/KodeOS/releases/tag/v0.1.0), [app template](https://github.com/kodediy/kode-app-template/releases/tag/v0.1.0), [C5 firmware](https://github.com/kodediy/kode_slave_c5/releases/tag/v0.1.0), and [kode-apps catalogue](https://github.com/kodediy/kode-apps).

Manufacturer mechanisms we should wrap rather than rewrite: guarded `idf.py build`/app-role `idf.py flash` (after verifying generated flash arguments), `kcli.py ping`, `boot_info`, `app_list`, `screenshot`, `file-get`, `install --dst app`, `kmirror.py` and the marketplace rule checker. **Never expose general `kcli cmd`** to the agent as an escape hatch. Do not expose OS/C5 update or factory erase through normal application tooling; the shipping C5's Secure Boot is documented as permitting only Kode-signed firmware.

Known source discrepancy: the v0.1.0 app template README documents a manual raw flash offset `0x1C00000`, but the v0.1.0 SDK's `app_pending` partition starts at `0x1A00000`. The source-level CMake app-role override discovers the partition by name. **No arbitrary raw flash operation should be offered**, and image/flash arguments need evidence before using even the supported route.

Module reality as of 11–13 November 2026: manufacturer catalogue references separate **Camera, Robotics, Mesh and F*CK** SDK repositories, not publicly accessible to our GitHub integration at audit time. The base SDK has J3 GPIO/I²C/SPI/UART primitives useful for Maker and a factory-station OV5640 driver, **not proof** of retail Camera support. All five require L4 hardware reports. Get module APIs and independent stop/RF guards before implementing physical actions.

**Licensing:** original TypeScript MCP may remain MIT; Kode's official SDK, template and host Python tools are GPL-3.0-or-later with third-party licence constraints (notably QP/C and RFAL). Invoke pinned external host utilities rather than copying GPL code into the MIT package until a distribution review is complete.

## Sequencing and acceptance

1. **F1 — Contract and host intelligence:** implement provenance ledger/profile and refusal evaluator, pinned source/SDK discovery, build-only scaffolding, image inspection, read-only USB discovery. Unit/integration tests for malformed inputs, stale evidence, wrong hardware and shell escape attempts.
2. **F2 — Complete development loop:** official SDK build, catalogue checks, manifest validation, app install *plan*, approved `kcli` application installation, crash/log review, screenshots, simulation and scoped HIL. Negative tests for wrong image, mismatched SHA, expired approval, wrong serial, OS/C5 destination or illegal shell path.
3. **F3 — Five modules:** specialised drivers and safe MCP operations, each with one meaningful end-to-end application and L4 report. Maker sensor/bus, Robotics protected motion, Camera actual capture, Mesh compliant peer exchange, F*CK permitted diagnostic. This phase is **mandatory for v1**.
4. **Qualification:** clean Windows installation, plugin/MCP version handshake, physical production Dot testing, refusal/audit evidence and no mandatory telemetry. Mark items **PASS, FAIL, BLOCKED or NOT TESTED**; no mock substitute.

Avoid registering all candidate operations globally. Start with static resources plus F1 toolsets; advertise F2/F3 based on verified capability and approved session conditions. Be precise that host tools outside MCP (e.g. Claude Code shell access) are an **independent trust boundary** and can bypass our MCP's policy unless separately restricted.

## Relationship to other records

- Supports working decisions Q01–Q12; **does not alter them**.
- Elaborates proposed ADR-0004–0016 and [proposed ADR-0017](https://github.com/arjunsol/claude-kode/pull/3) (not automatically approved).
- Documents tool inventory for ongoing PR #4 (narrow implementation only) and issue #5 (physical validation), without suggesting those already implement the full catalogue.
- **Proposed API names:** subject to review; keep old documented names as cross-references but do not publish stable external compatibility promises until the versioned contract is approved.
