# Claude Kode — Working Product Decisions

**Project:** https://github.com/arjunsol/claude-kode  
**Prepared:** 3 November 2026  
**Status:** Discovery register; not an approved ADR  
**Intended canonical path:** `docs/discovery/working-decisions.md`

This register records agreed *working decisions* and challenges. It does not supersede existing accepted ADRs, and no proposed decision becomes a final architecture commitment until explicitly reviewed. Each approved architectural choice should eventually be promoted to a numbered `docs/adr/` file with context, options, consequences and validation conditions.

## Q01 — Product identity and ambition

- **Decision:** C — A complete hardware engineering platform is the long-term vision.
- **First release:** B — An end-to-end development agent for the Kode Dot.
- **Status:** Agreed working decision (3 November 2026).

### Intent

The ultimate system should understand Kode Dot hardware and expansion modules, reason about electrical and physical constraints, design compatible apps, build and test firmware, and interact with a device through supervised MCP tools. The first release needs a reproducible developer workflow, rather than the entire proposed engineering platform.

### Constraints from adversarial review

1. Platform ambitions must not make the first release depend on arbitrary circuit design or autonomous experiments. **Q09 later explicitly requires first-release qualification of all five advertised expansion modules**; that requirement supersedes the earlier suggestion to defer module coverage.
2. Require verified device identity, target, firmware revision, safe pins and flash layout before device-changing operations.
3. Do not invent a kodeOS loader ABI or promise fully automated deployment where the manufacturer has not exposed the necessary capability.
4. Flashing, RF transmission and actuator movement must have explicit authorisation and independent physical safety limits.
5. Mock-only success is insufficient for a real-device release; require a demonstrated supported-hardware vertical slice.

## Q02 — Intended audience and distribution

- **Decision:** B — Personal-first, public-ready architecture, without premature public support obligations.
- **Status:** Agreed working decision (3 November 2026).

### Intent

Build for the owner's real Kode Dot workflows first, with clean separation between the device-independent engine, hardware-specific profiles/adapters, and Claude Code skills/MCP integration. Preserve clear licences, reproducible builds, understandable onboarding and documentation so the project can become open to external developers later without a wholesale rewrite.

### Constraints from adversarial review

1. **Avoid premature abstraction:** Introduce extension points only where supported by concrete use cases or compatibility requirements; a general hardware framework is not an MVP deliverable.
2. **Avoid vendor lock-in at the core:** Hardware facts, build orchestration and device communications should be usable independently of Claude Code where practical. The *product* can remain Claude-first.
3. **Do not imply support commitments:** Source availability does not imply guaranteed firmware, module, host operating system or hardware-revision compatibility. Publish a tested support matrix before promising it.
4. **Respect licences:** Retain the repo's MIT licence by default; do not vendor unlicensed manufacturer example code. Continue to follow existing ADR-0001 and ADR-0003.
5. **No mandatory telemetry or cloud dependency:** A public release policy and opt-in diagnostics may be assessed later, not assumed.

### Explicitly deferred

Release channels, community contribution policy, compatibility guarantees, support SLAs, public security advisory process and documentation completeness gate.

## Q03 — Hardware generation and compatibility

- **Decision:** B — Versioned hardware profiles, but ESP32-P4 + ESP32-C5 is the **only initially supported production hardware**.
- **Status:** Agreed working decision (3 November 2026).
- **Correction:** ESP32-S3 was an unreleased prototype/pre-production design. P4/C5 is Kode Dot version one, not generation two.

### Evidence

- Official Kode site says its earlier prototype design will not be sold: https://kode.diy/
- Manufacturer's account of P4/C5 production upgrades: https://kode.diy/news/kode-dot-kickstarter-campaign-story
- Current product specifications: https://kode.diy/product/kode-dot

### Intent

Track board revision, firmware version, attached modules, toolchain, pin mappings, safety limits and independently verified capabilities. Start with one strongly typed P4/C5 profile and a small extension seam rather than implementing a generic multigeneration hardware platform.

### Constraints from adversarial review

1. Treat the repo's existing ESP32-S3 knowledge and templates as **pre-release historical material**, not a supported product generation.
2. Never use the existing S3 `esptool --chip esp32s3` settings, partition assumptions or pin mappings to flash a P4/C5 Dot.
3. Validate the actual device identity before modifying physical hardware; unknown revisions are read-only.
4. Label claims as *manufacturer-advertised*, *documented*, *tested* or *device-verified*, with dated source provenance.
5. Only add support for future hardware when a specific supported device or test case warrants it.

### Explicitly deferred

Exact hardware-profile schema, identification protocol, compatible firmware revisions, validated flash/recovery procedures and module-specific adapters.

## Q04 — Agent autonomy and permissions

- **Decision:** B — Autonomous development and diagnostics, but explicit authorisation and independently enforced safety checks for physical or destructive operations.
- **Status:** Agreed working decision (3 November 2026).

### Intent

Claude Kode can autonomously inspect known documentation and capabilities, modify source in an explicitly authorised workspace, compile, run bounded tests or simulations, and perform genuinely read-only diagnostics. It must not require a user to approve every ordinary coding/build step.

### Enforcement model (requirements, not yet an agreed implementation architecture)

| Operation class | Examples | Default authority |
|---|---|---|
| Read-only / local | Read docs, read known files, inspect cached device info, view existing logs | Autonomous within granted scope |
| Reversible development | Edit approved workspace files, compile, run mocked tests, static analysis | Autonomous within granted workspace and resource limits; record changes |
| Potentially disruptive diagnostics | Active bus probing, RF scanning, firmware reset, test that may affect connected hardware | Require classification and approval when effects cannot be proven read-only |
| Physical/destructive | Flash/erase firmware, transmit RF, actuate motors, energise external circuits, modify security-sensitive device configuration | Explicit, action-scoped human authorisation plus enforced preflight/safety controls |

### Constraints from adversarial review

1. **'Read-only' must describe actual side effects, not a tool name.** An innocent-looking scan can transmit, wake hardware or interfere with a circuit. Uncertain probes default to approval.
2. **Approval must bind to a specific operation**, target device identity, firmware/artifact hash or command parameters, and reasonable validity window; approval for one action is not blanket approval for all future hardware actions.
3. **No prompt-only safety:** The MCP/device gateway enforces deny-by-default policy; motor current/power limits and emergency stop provisions belong in hardware/firmware, independent of model instructions.
4. **Sandbox the autonomous development loop:** Restrict file paths, resource use and execution of untrusted build/test commands. Preserve diff/review/audit evidence so an agent cannot silently modify unrelated repositories or invoke side-effecting host commands.
5. **Permission changes are not self-service for the agent.** Do not allow self-escalation, hidden auto-approval, or bypass via lower-level serial/USB/system shell access.
6. **Unknown device revisions, modules, state or safety limits remain read-only** until validated and authorised.

### Explicitly deferred

Exact policy language/schema, device attestation, operation taxonomy, approval UX, audit retention, emergency-stop requirements by module, and whether bounded unattended operations can be authorised later.

## Q05 — Host environment and device connectivity

- **Decision:** B — Windows-first implementation, platform-independent architecture; local USB/serial first. Linux, macOS, Wi-Fi, remote operations and multiple devices are deferred.
- **Status:** Agreed working decision (3 November 2026).

### Intent

Ship and validate the initial end-to-end development workflow from a Windows host connected to one production ESP32-P4/C5 Kode Dot through a locally authorised USB connection. Keep host-specific discovery, tool invocation and device transport code separated from the core use cases so later portability is possible. No remote MCP/device-control endpoint is exposed by default.

### Constraints from adversarial review

1. **Portability is an architectural boundary, not a cross-platform promise.** Test Windows first; do not claim Linux/macOS compatibility until each has been validated. Avoid unnecessary OS-specific logic in the core, but do not engineer unneeded transports.
2. **USB does not guarantee one stable COM port.** Device names, enumerations and permissions can change across firmware modes, bootloaders, reconnects or different chips. Bind actions to a verified device identity, not only an observed port string.
3. **Separate observation from programming.** The serial console, debug/JTAG path, firmware flash mechanism, and kodeOS app install/activation may be distinct operations even if they share a USB-C connector. Manufacturer-advertised 'USB flashing' does not establish an approved Kode-specific partition layout or app deployment ABI.
4. **One device in v1.** No concurrency/multi-device manager, network discovery or remote agents in the initial supported release. Design command interfaces so a later transport adapter does not require business-logic rewrites.
5. **Contain the host interface.** Local MCP tools should use narrowly scoped workspace/device permissions; redact credentials and personal data from device logs, and never bypass Q04 authorisation through a generic serial or shell command.

### Explicitly deferred

Cross-platform CI matrix, Wi-Fi transport/discovery/authentication, remote agent access, fleet management, multi-device locking, cloud services, and any remote flashing model.

## Q06 — Primary firmware toolchain and MCP host

**MCP runtime: TypeScript — agreed working decision (3 November 2026).**

The user explicitly selected **TypeScript for the local MCP server**, replacing the provisional .NET/C# proposal. The MCP implementation should use TypeScript for typed tool interfaces, orchestration and action-scoped permissions. Firmware code remains separate and must use toolchains suitable for the P4/C5 device. The precise TypeScript runtime, transport, packaging and SDK versions remain implementation details to verify.

**Adversarial constraints for the TypeScript choice:**
1. TypeScript typing is compile-time only; validate untrusted MCP inputs and device replies at runtime.
2. A tool advertised as read-only must be enforced as read-only by the device/host access layer; don't trust model instructions or tool labels.
3. Be strict about process spawning, command arguments, path allowlists, version pinning and secret redaction.
4. Keep transport/toolchain logic testable independently of Claude so a future host or client is feasible.
5. TypeScript MCP does not imply JavaScript or TypeScript firmware: the P4/C5 firmware toolchain is an **open, separate decision**.

**Firmware toolchain choice: B — ESP-IDF first, optional Arduino/PlatformIO adapters (agreed working decision, 3 November 2026).**

The native **ESP-IDF** toolchain is the authoritative build path for production ESP32-P4/C5 Kode Dot development. Arduino and PlatformIO integrations are optional later adapters, supported only after compatibility with the production device is independently validated. TypeScript remains the approved working choice for the local MCP host; TypeScript is **not** the firmware language. Do not inherit the repo's unreleased S3-era board configuration or flash offsets.

**Adversarial constraints for the ESP-IDF choice:**
1. **Preserve approachability.** Claude should handle toolchain complexity and offer high-level, intent-driven app templates; native IDF must not force every user to become a low-level firmware engineer.
2. **Pin and prove reproducibility.** Record exact ESP-IDF, tool, compiler, component and SDK versions and build hashes; distinguish verified P4/C5 combinations from advertised support.
3. **Separate build from deployment.** Compilation must be possible without hardware and must never authorise flashing by implication. Deployment is governed by Q04 and Q05.
4. **Do not silently retire the existing scaffold.** Archive, label or migrate old S3/PlatformIO examples deliberately, respecting existing licensing and ADRs, with no accidental P4 deployment path.
5. **Firmware execution environment matters.** Standard ESP-IDF builds do not automatically produce a valid kodeOS loadable app image. The loader ABI and deployment procedure must be verified separately (Q07).

**Evidence reviewed 3 November 2026:**
- Manufacturer advertises ESP-IDF among its development options: https://kode.diy/product/kode-dot
- Espressif ESP32-P4 guide: https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/get-started/index.html
- Repository's current S3-only PlatformIO configuration: `templates/app/platformio.ini`.

## Q07 — App model and kodeOS preservation

- **Decision:** B — kodeOS applications as the primary model, with standalone ESP-IDF firmware only in a separate experimental mode after recovery and safety validation.
- **Status:** Agreed working decision (3 November 2026).

### Intent

Claude Kode must preserve the production Kode Dot's kodeOS installation and use a verified manufacturer application-loading route for normal development. A future standalone firmware workflow is separate, explicit and opt-in; it must not be treated as simply another deployment setting.

### Evidence and uncertainty

- Kode's intended P4/ESP-AMP app supervision/loading model was discussed publicly, but that does not establish the released app-loader interface: https://github.com/espressif/esp-amp/issues/1
- Older S3-era kodeOS docs and the existing repository's S3 partition table are not authoritative for the shipping P4/C5 Dot.
- Verify firmware/API/partition details on production hardware before claiming app deployment works.

### Constraints from adversarial review

1. **Separate artefact types.** Explicitly model `kodeOS app` versus `standalone firmware`, with different image formats, validation, privileges and deployment paths. They cannot be interchangeable.
2. **Prove the deployment contract.** Require verified firmware/loader compatibility, image format, partition boundaries and device identity before installing applications.
3. **Recovery is a prerequisite.** Standalone mode remains disabled until reliable backup, restoration, boot/recovery entry and independent validation are demonstrated on real hardware.
4. **Explicit authorisation.** Installing a kodeOS app still changes the physical device and requires Q04 approval. Standalone firmware requires an additional clear high-risk opt-in.
5. **Do not guess the missing ABI.** If the loader remains undocumented/unavailable, permit source generation, compilation, mock tests and read-only inspection only; do not invent a flash offset or modify kodeOS.
6. **Preserve evidence.** Record target chip/revision, kodeOS version, validated loader contract, toolchain/build hashes, approval and verification/recovery results for any deployment.

### Explicitly deferred

The production kodeOS loader ABI, installation method, P4/C5 backup/recovery procedure, and standalone firmware release policy. None is currently claimed to be validated.

## Q08 — Testing and validation strategy

- **Decision:** B — Layered, evidence-driven validation, including simulation and authorised hardware-in-the-loop (HIL) testing, with a possible future autonomous hardware test laboratory.
- **Status:** Agreed working decision (3 November 2026).

### Test levels and evidence

| Level | Gate | Evidence |
|---|---|---|
| L1 — Build verified | Reproducible firmware or tool build for an identified supported target | Toolchain/SDK versions, dependency pins, artefact hashes, build log |
| L2 — Simulation verified | Target-relevant automated behavioural tests, mocks or an emulator | Test names, simulator/fixture capabilities and limitations, results |
| L3 — Device verified | Observed application behaviour on the production P4/C5 Kode Dot | Device identity/revision, kodeOS version, firmware hash, run logs, observations |
| L4 — Integration verified | Defined application behaviour with real expansion module(s)/external hardware | Module revision, circuit and power conditions, calibrated measurements where needed, pass/fail criteria |

**Evidence states:** 'passed', 'failed', 'unsupported', and 'not tested' are distinct. An emulator or mock passing cannot be labelled as real-device verification. The levels describe **evidence depth**, not a claim that passing L4 establishes all aspects of safety or reliability.

### Adversarial constraints

1. Hardware tests need explicit scenario-specific acceptance thresholds, duration, environmental conditions and where relevant electrical/radio/thermal limits. A quick success does not prove sustained reliability.
2. Tests cannot sidestep Q04 simply because they run under CI or a test runner. Flashing, RF TX, motor movement or power cycling remain side-effecting and require their own action-scoped approvals plus independent safeguards.
3. Stamp evidence with device/board revision, relevant module revision, kodeOS/firmware version, ESP-IDF and toolchain versions, image hash, host/test harness version and time.
4. Mock coverage, emulator coverage and true physical integration are reported separately; unsupported peripheral behaviours must remain explicit gaps.
5. Keep first-release test infrastructure proportionate: host-based TypeScript/MCP and ESP-IDF tests immediately; one-device local HIL only once loader and recovery gates (Q07) are verified. A fully autonomous hardware lab is a possible later capability, **not** an immediate obligation.
6. Physical quality and safety claims require appropriate negative tests and boundary conditions, not only happy-path validation.

### Explicitly deferred

Exact testing framework, qualification thresholds by module, CI design, fixture design, test result schema, unattended HIL authorisation policy and full test-lab automation.

### Sources consulted

- ESP-IDF host tests: https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/api-guides/host-apps.html
- ESP-IDF pytest-embedded: https://docs.espressif.com/projects/esp-idf/en/stable/esp32p4/contribute/esp-idf-tests-with-pytest.html
- ESP32-P4 emulator project: https://github.com/espressif/esp-emulator

## Q09 — Module and peripheral support priority

- **Decision:** C — Aim for comparable development tooling and real-hardware validation across **all five** advertised expansion modules (Maker, Robotics, Camera, Mesh and F*CK) in the first release.
- **Status:** Agreed working decision (3 November 2026).
- **Explicit override:** Q09 supersedes Q01's earlier recommendation not to make first release depend on every module. The user deliberately selected the broader scope rather than the recommended phased release.

### Intent and minimum acceptance baseline

Each of the five modules shall have:

1. An evidence-backed, versioned hardware capability profile with pinout/interfaces, dependencies, power/safety limits, module revision and source provenance.
2. A Claude skill or knowledge entry, discoverable MCP capability description, and at least one useful reference application/recipe.
3. A reproducible build for the supported production ESP32-P4/C5 target, with no borrowing of unreleased S3-era pin/flash assumptions.
4. An observable, module-relevant real-device test (L3/L4 as applicable), with explicit pass/fail criteria, firmware/module revisions, logs and reproducible procedures.
5. A module-specific safe-operation policy: external power/motor constraints for Maker and Robotics; privacy and image-data handling for Camera; UK-compliant radio configuration and explicit transmission approval for Mesh and F*CK.

**Comparable** means a common minimum standard for tools, documentation and test evidence, **not** the same API surface, feature count or maturity for inherently different modules. Built-in Dot peripherals remain part of the base-device profile, with scope prioritised separately.

### Adversarial constraints

1. **This is an aggressive release gate.** A first release claiming all five modules is blocked until each has at least one demonstrably working end-to-end physical workflow and evidence. Internal milestones, previews or deliberately labelled partial releases may precede it; they must not masquerade as the accepted first-release target.
2. **Procurement is a hard dependency.** A module that cannot be obtained or identified at the right hardware revision cannot pass L4. Simulator-only validation is not an acceptable substitution for first-release support claims.
3. **SDK maturity is a separate dependency.** A shop listing, published module chipset or manufacturer example does not establish a callable production API. Unsupported operations must be marked unavailable rather than fabricated.
4. **Radio support is not a blanket security testing authority.** Restrict to lawful, authorised testing, local regulatory configurations and explicit action-scoped approval for transmissions. 'Read-only diagnostics' must not conceal active RF emissions.
5. **Robotics requires independent physical protections** against unintended motor motion, excessive current and hazardous loads, not just software stop commands or prompt policy.
6. A generic plug-in platform is **not** justified merely because five fixed modules are in scope. Start with concrete module adapters and extract common interfaces only when verified behaviours warrant them.
7. Unknown/changed modules and revisions are not silently 'supported' on the basis of prior evidence. Compatibility must be pinned and test status surfaced.

### Evidence / provenance checked 3 November 2026

- Current Kode Dot product: https://kode.diy/product/kode-dot
- Maker: https://kode.diy/product/maker-module
- Mesh: https://kode.diy/product/radio-module
- F*CK: https://kode.diy/product/fck-module
- Official build/release timeline: https://timeline.kode.diy/
- Mesh and F*CK listings state their final specifications remain subject to confirmation before shipping.

### Explicitly deferred

Exact per-module feature matrix, supported revisions, physical test fixtures, modules available to the user, and quantified acceptance criteria. These require inspection of production hardware and the currently available SDKs; no module is claimed as physically verified yet.

## Q10 — Provenance-aware capability registry and deterministic refusal

- **Decision:** B — Build a provenance-aware capability registry with operation-specific evidence thresholds and deterministic refusal gates.
- **Status:** Agreed working decision (3 November 2026); **not yet a ratified ADR**.
- **User's decision:** “Build a provenance-aware capability registry with operation-specific evidence thresholds and deterministic refusal gates.”

### Intent

Hardware, firmware, device/module interfaces and development operations must be grounded in a versioned record of claims and evidence. The TypeScript MCP policy layer decides whether the evidence supporting a particular *operation on a particular target* is sufficient; Claude's confidence, generated prose or prompts cannot override a denial. Supported outcomes must include **permitted**, **approval required**, **not yet verified**, **incompatible/unsupported** and **denied** (for policy or safety reasons).

### Evidence and applicability

Each consequential claim should carry (where applicable):

- An unambiguous capability or constraint identifier and scope (production P4/C5 board revision, kodeOS/firmware revision, module identity/revision, host/toolchain and environmental conditions).
- Source reference, source type, date checked, source revision/commit and whether direct observation or manufacturer assertion.
- Evidence state: *manufacturer-advertised*, *documented/source-checked*, *device-verified*, *integration-verified*, or *unknown/conflicting/stale*. These are **not** numeric certainty or proof of general safety.
- The specific test procedure, artefact hashes and test evidence where physical verification is claimed (Q08).
- Dependencies, mutually inconsistent claims, expiry/revalidation triggers and explicit invalidation events.

### Adversarial constraints

1. **Context, not a global score.** Evidence of a GPIO's behaviour on one firmware/board/module revision does not certify another revision or all operating conditions. Evidence thresholds are operation-specific (design advice vs build vs flash vs motor actuation, etc.).
2. **Deterministic fail-closed enforcement.** Safety-critical decisions happen in the TypeScript MCP/tool policy gateway, independently of the language model. Model instructions or user prose cannot reclassify a physical operation as read-only or waive Q04 permission requirements.
3. **Unknown ≠ explicitly unsupported.** Expose uncertainty and missing capability detection separately from proven incompatibility. Refusals should be structured with reason codes, evidence references, affected constraints and a concrete route to verification where available.
4. **Claims can be contradicted and revoked.** A newer contradictory source, changed hardware revision, regression or failed HIL test can invalidate previously permitted operations. Do not silently keep stale approvals or convert old test successes into evergreen capability grants.
5. **Don't over-centralise every fact.** Start with a minimum typed schema for consequential facts and operations; avoid making an encyclopaedic knowledge graph a prerequisite for compiling first-release apps. Decision, policy and evidence layers should remain separate.
6. **Test the abstention behaviour itself.** Add negative/adversarial tests where pin maps conflict, source evidence is missing or expired, module identity is uncertain, a firmware update invalidates tests, or a requested operation lacks approval. The MCP gateway must refuse correctly even if Claude is confidently wrong.
7. **Keep provenance reproducible and inspectable.** A mutable third-party webpage alone is insufficient for irreversible actions; record source version/date and directly measured evidence as relevant, without infringing the existing licensing ADRs.

### Explicitly deferred

Specific TypeScript schema, source ingestion/update mechanism, policy rule format, verification expiry thresholds, evidence signature/attestation scheme, and detailed error code taxonomy. Ratify in a dedicated ADR after the remaining grilling.

## Q11 — Distribution, packaging, compatibility and privacy

- **Decision:** B — Versioned Claude Code plugin and separately identifiable TypeScript MCP package, local-first, with reproducible installation, explicit compatibility and upgrade paths, and no mandatory telemetry.
- **Status:** Agreed working decision (3 November 2026); **not yet a ratified ADR**.
- **User's decision:** “Use a versioned Claude Code plugin and separately identifiable TypeScript MCP package, local-first with reproducible installation, explicit compatibility and upgrades, and no mandatory telemetry.”

### Intent

Preserve the Claude-specific plugin/skills and local TypeScript MCP runtime as identifiable, independently testable components. Publish verified, reproducible *combinations* of plugin, MCP API/protocol version, hardware profile and toolchain versions. Keep the default flow local-first, with no mandatory project-operated cloud service, registration, analytics or telemetry. This does **not** assert that the separately operated Claude model service works offline.

### Adversarial constraints

1. **Version skew must fail explicitly.** Plugin expectations and MCP tool schemas/capability versions must be checked through a compatibility handshake. A semantic version number alone is insufficient evidence of safe interoperability.
2. **Use a known-good bundle even with separate versions.** A release should publish a tested compatibility matrix or lockfile identifying plugin, MCP runtime, device profile, ESP-IDF/toolchain, and relevant kodeOS versions, while preserving traceable version identities.
3. **Deterministic, auditable installation.** Lock package dependencies, verify distributed artefacts/checksums where feasible, document installation and rollback, and test from a clean Windows machine. Verify licensing and supply-chain provenance for upstream components (ADR-0001/0003).
4. **Updates cannot silently expand permissions.** Tool schema and safety policy changes must be reviewed; upgrading cannot auto-authorise firmware writes, RF transmission or physical motion. Approval remains bound to an exact action and target (Q04).
5. **Local-first is not an unconditional offline claim.** Once installed, locally available hardware tooling should not require project-operated cloud services. Third-party dependency downloads, Claude's model backend and manufacturer firmware services may separately require network access and should be disclosed.
6. **Privacy is enforceable, not merely a label.** No mandatory telemetry. Logs, device identifiers, radio observations, sensor data and camera images stay local to the Claude Kode tooling by default. Any intentional diagnostic export must show content and seek explicit authorisation; note that content deliberately passed to a hosted Claude model follows that provider's handling terms.
7. **Do not imply a support SLA.** The project remains personal-first and public-ready (Q02), not a fully managed service. Versioned packaging is a quality goal, not a promise of public marketplaces, hosted feeds or automatic updates.

### Explicitly deferred

Choice of package registry/installer, marketplace publication, exact package layout, release cadence, API version-negotiation schema, software-signing mechanism, and update/rollback UI. These are implementation decisions to be reviewed separately rather than presumed settled by Q11.

## Q12 — First-release success and acceptance criteria

- **Decision:** B — Evidence-gated v1. Release v1 only when the end-to-end development workflow, safety gates, packaging and all five module integrations are demonstrated on production hardware.
- **Status:** Agreed working decision (3 November 2026); **not a ratified ADR**.
- **User's explicit decision:** “Release v1 only when the development workflow, safety gates, packaging and all five module integrations are demonstrated on production hardware.”

### Definition of v1

v1 is a **hard qualification gate**, not an estimated delivery date. It will not be labelled complete unless the following evidence exists:

| Gate | Required release-one evidence |
|---|---|
| Installation | Reproducible Windows installation of a versioned Claude Code plugin and TypeScript MCP runtime, with a tested compatibility manifest and no mandatory telemetry |
| Target identity | Production P4/C5 Dot identity and hardware/firmware revision verified; legacy S3 profile is not mistaken for a shipped platform |
| Software workflow | Claude Code invokes a complete supported path to generate/modify source, compile using pinned ESP-IDF components, validate, obtain authorisation, deploy a kodeOS app, run it and retrieve observable device results |
| kodeOS safety | Production loader/app image contract validated; firmware/partition protection demonstrated; standalone firmware remains separate and ineligible until recovery proof |
| Policy/refusal | Automated positive and negative tests prove the TypeScript MCP boundary denies unknown devices, unsupported capabilities, unsafe parameters and missing or mismatched approvals, independent of model confidence |
| Module qualification | Maker, Robotics, Camera, Mesh and F*CK **each** have an evidence-backed profile, usable tooling/example and a real P4/C5 physical integration test (Q08 L4), with signed-off, module-appropriate acceptance checks |
| Packaging/documentation | Release notes, documented capabilities and known gaps, local-first privacy controls, reproducible artefacts, diagnostic procedures and a supported device/module/toolchain compatibility matrix |

### Minimum module demonstrations (proposed acceptance examples, not final specs)

- **Maker:** Safe powered circuit, measured GPIO or sensor/bus exchange, with clear voltage/current envelope and known pin mappings.
- **Robotics:** Controlled actuator movement within physical limits, independent stop/fault handling and a logged negative safety test.
- **Camera:** Capture a real image from the installed module and retrieve it into the authorised local workflow with privacy handling.
- **Mesh:** Send/receive a test message between the Dot and **a second compatible node** on a lawful configured band with verified radio/firmware revisions and user-approved transmission.
- **F*CK:** Demonstrate an explicitly scoped authorised radio diagnostic on the installed module, with its actual transceiver type/revision identified. A safe receive-only baseline may be proposed, but it must be agreed as meaningful operational integration; never use unapproved emissions to satisfy the gate.

These define **scope boundaries**, not assertions that the current hardware/software can already perform them. “Comparable tooling and validation” means consistent evidence standards and usable workflows, not identical driver coverage or equal feature counts. Detailed thresholds, fixture requirements and the exact F*CK test must be agreed before v1.

### Adversarial constraints

1. **Vendor dependency can block v1.** The manufacturer may not have published or stabilised a production kodeOS loader/API. ESP-IDF firmware compilation alone is not a substitute.
2. **Physical module availability can block v1.** Tests cannot be passed using only product pages, developer examples, module mocks or incompatible revisions. Actual access to all five modules, external fixtures and at least one compatible Mesh peer is a requirement.
3. **Preview is not v1.** Early alpha/previews may implement the base workflow and a subset of module integrations. A preview cannot quietly reinterpret Q09 or Q12.
4. **Safety approval is not granted by CI.** Physical HIL actions require Q04's approval and independently enforced safeguards, with records stamped to test, device, firmware and module identity.
5. **Do not conflate checkmarks with reliability.** Module tests need negative/boundary tests, power/radio/thermal constraints where applicable, and specific observable pass/fail criteria.
6. **A release decision cannot override missing evidence.** Q10's structured refusal gates remain operative even if that blocks demonstration or delivery.
7. **No arbitrary deadline is implied.** Set milestones with dependencies and release evidence rather than promising a completion date independent of manufacturer readiness.

### Deferred and unresolved

Detailed v1 acceptance metrics and flagship app, physical fixtures, availability of all five modules, exact Kode loader image format/API and recovery route, specific UK RF test configuration, approval-granting UX, and validated module revisions remain unresolved. These require additional feature/specification questions and technical investigations; they have **not** been approved as specific ADR contents.

## Register integrity and repository synchronisation

- All **12 working decisions have now been recorded**. ADR-0004 and ADR-0009 were ratified by the product owner on 4 November 2026; other ADR proposals remain unratified. Implementation and hardware evidence remain outstanding.
- The intended canonical path remains `docs/discovery/working-decisions.md` in https://github.com/arjunsol/claude-kode.
- During discovery on 3 November 2026, GitHub writes were temporarily unavailable (HTTP 403). Repository write access was subsequently restored; this register is submitted for review on a documentation branch. Its original inclusion did not ratify any proposed ADR; the subsequent 4 November 2026 approval applies to ADR-0004 and ADR-0009 only.
- The existing accepted ADR-0001, ADR-0002 and ADR-0003 remain unchanged. ADR-0002's S3-era findings require production-P4 review before being used as an authoritative statement about P4 kodeOS.
- Companion review: `docs/discovery/architecture-review.md` (also exported locally).