# Claude Kode — Architecture reconciliation, proposed ADR register and implementation roadmap

> **Evidence update — 11 November 2026:** Kode has now published v0.1.0 source for kodeOS, kode-sdk, C5 firmware and the app template, including a real manifest and loader. Source-level blockers described in the 3 November assessment have changed. See [the new source audit](../research/2026-11-11-official-kodeos-sdk-source-audit.md) and proposed ADR-0017. This does not establish hardware verification or alter the user's twelve decisions.

**Prepared:** 3 November 2026  
**Repository:** https://github.com/arjunsol/claude-kode  
**Status:** **Proposal and analysis only** — new ADR drafts are proposed, not adopted  
**Companion:** `docs/discovery/working-decisions.md`, with the full Q01–Q12 user-approved *working* decisions.  
**Repository sync:** Submitted as draft documentation for repository review. No proposed ADR is accepted by this submission.

## Executive assessment

**Product direction:** A complete hardware engineering platform in the long run, with an end-to-end Kode Dot development agent as its first product release. The initial target is the only shipped generation, ESP32-P4 + ESP32-C5, with Windows/USB-first interaction, a TypeScript local MCP server, native ESP-IDF builds, kodeOS-first applications, strong physical-operation permissions, provenance-backed capability checks, and verification on real hardware. The v1 release promise explicitly includes *all five* expansion modules — Maker, Robotics, Camera, Mesh and F*CK. This is deliberately ambitious and creates external dependencies.

**Adversarial conclusion:** The 12 choices form a coherent *vision* but **do not yet form a buildable, fully specified architecture**. There are two critical uncertain interfaces (production kodeOS application format/deployment, and production module driver/hardware contracts), a legacy S3 scaffold with unsafe deployment assumptions for the production target, and unspecified physical fixtures. These are engineering risks requiring research and technical spikes, not reasons to silently soften the agreed requirements.

**Immediate next best technical action:** Establish a **production P4/C5 compatibility and kodeOS deployment feasibility dossier**, independent of the unshipped S3 template. Do not flash experimental binaries until device identity, app format, partition safety and recovery are verified. In parallel, implement a read-only TypeScript MCP skeleton and deterministic refusal tests.

## 1. Reconciled twelve-decision baseline

| ID | Accepted working decision | Architecture/release consequence | Status |
|---|---|---|---|
| Q01 | C long-term complete hardware platform; B first product release | Prioritise a working vertical slice, then platform extensions | Agreed / not ADR |
| Q02 | B personal-first, public-ready | Clear boundaries and reproducible designs; no public support SLA | Agreed / not ADR |
| Q03 | B versioned hardware profiles, but P4/C5 is production v1; S3 was never released | P4/C5 only in first support matrix; S3 history isolated | Agreed / not ADR |
| Q04 | B autonomous coding and truly read-only diagnostics; approval for physical/destructive actions | Policy enforced outside model, plus physical interlocks and resource restrictions | Agreed / not ADR |
| Q05 | B Windows and local USB/serial first; portability later | Host adapters separated, no remote exposure by default | Agreed / not ADR |
| Q06 | B native ESP-IDF first, Arduino/PlatformIO later; **TypeScript MCP** selected separately | Typed TypeScript gateway; pinned firmware toolchain; no implicit flash | Agreed / not ADR |
| Q07 | B kodeOS applications first; isolated standalone firmware after recovery | Distinct image types and installation paths; kodeOS preservation | Agreed / not ADR |
| Q08 | B layered L1–L4 evidence, real HIL, future lab optional | Real hardware proof with provenance and negative tests | Agreed / not ADR |
| Q09 | C all five expansion modules in v1 | Five separate qualification streams, all blocking v1 | Agreed / not ADR |
| Q10 | B provenance-aware capability registry and deterministic refusals | Contextual evidence, no model-override, structured explanation | Agreed / not ADR |
| Q11 | B versioned Claude plugin + TypeScript MCP package, local-first, no mandatory telemetry | Reproducible bundle, compatibility handshake and privacy gates | Agreed / not ADR |
| Q12 | B evidence-gated v1 with five physical module integrations | No v1 declaration until every agreed gate passes; previews allowed | Agreed / not ADR |

## 2. Contradictions, tensions and their resolutions

| Severity | In tension | Issue | Reconciled position / additional decision needed |
|---|---|---|---|
| **Critical** | Q06 + Q07 | Generic native ESP-IDF binaries are not necessarily compatible with the production kodeOS supervised-app format. | Keep ESP-IDF as build foundation **and** kodeOS as normal app runtime; first prove the app image/loader contract and introduce a packaging/adapter step only if vendor evidence supports it. No guessed flash offset. **Release blocking.** |
| **Critical** | Q03 + existing repo templates/ADR-0002 | Existing board config, flash offset and pin map are ESP32-S3-only; ADR-0002's “no manifest” conclusions describe an older investigated environment. | Quarantine legacy templates from deploy commands, relabel S3 as unreleased research, review ADR-0002 against P4 kodeOS evidence; do not erase or silently supersede existing ADRs. |
| **High** | Q09 + Q12 + procurement | All five real modules must pass HIL, including hardware whose production details/shipping may still change. | Parallel module implementation is fine, but five physically evidenced qualification gates are **non-waivable for v1**. Previews may release earlier. Track external module readiness. |
| **High** | Q04 + Q01/Q08 | “Autonomous debugging/testing” may execute scripts, flash, probe buses, transmit RF or drive motors. | Classify by **actual effects**, not tool names. Bounded workspace code actions are allowed; device-changing tests require operation-scoped approval and physical safeguards. |
| **High** | Q10 + Q08 | A past successful test may be used after hardware/firmware/module changes, or a manufacturer claim may masquerade as physical proof. | Bind evidence and policy to revision, exact operation, expiry/retest trigger and artefact hash. Negative tests prove refusals under stale/conflicting inputs. |
| **Medium** | Q05 + Mesh/F*CK (Q09) | USB-first host communications are not the same as RF module functions or Mesh peer communication. | USB remains the **control transport**. Mesh still requires a compatible second node; RF tests can be local, lawful and explicitly authorised, without Wi-Fi remote management. |
| **Medium** | Q02 + Q11 + Q12 | Personal-first delivery conflicts with the amount of packaging/documentation and module qualification demanded for v1. | Keep public-ready engineering standards, but do not promise a marketplace, cloud service or external support. Package one tested Windows bundle. |
| **Medium** | Q03 + Q09 + Q10 | We want extensibility but lack proof that the device can automatically identify modules. | Profiles are versioned; support explicit/manual association where detection cannot be verified. Reject unknown/unverified combinations for unsafe operations. |
| **Medium** | Q07 + Q12 | Safe kodeOS deployment may depend on an undocumented manufacturer API. | Make loader feasibility an early research gate. If blocked, continue independent build/MCP work and publish alpha only; do not redefine completed v1. |
| **Medium** | Q09 + Q04 | F*CK coverage and robotics actuation could be mistaken for unrestricted RF or motor access. | Make legal/approved RF receive-only or tightly bounded tests and independent motor interlocks explicit acceptance constraints. No arbitrary security testing permission. |

### A material distinction

No decision has to be reversed **yet**. Most conflicts are either unsatisfied prerequisites or missing implementation details. The ESP-IDF/kodeOS interface is the only **architecture-feasibility question that could force reconsideration of an accepted choice** if production software cannot support it.

## 3. Existing ADR disposition

| Existing ADR | Current repo content | Disposition (proposal only) |
|---|---|---|
| ADR-0001 — Don't vendor unlicensed Kode examples | Manufacturer example repos have no clear licences; keep dependencies to appropriately licensed driver components and independently established facts | **Keep accepted**. Revalidate particular licence terms as code sources evolve. |
| ADR-0002 — No kodeOS app manifest | Research and no-manifest finding based on S3-era documentation and loader model | **Flag for review against P4 production**. Do not label it universally true for P4 or delete/change its accepted record without explicit supersession. |
| ADR-0003 — Pin component dependencies to exact commits | Reproducible manufacturer driver sources | **Keep accepted intent**. Generalise through a *new* decision if ESP-IDF component-manager lockfiles or versioned vendoring require a distinct approach. |

**Repo observations:** `.claude-plugin/plugin.json`, `skills/kode-dot-dev/SKILL.md`, `/new-kode-app`, `templates/app/platformio.ini` and board definitions exist, but their descriptions and targets are S3. There is currently no TypeScript MCP source/package in the inspected repository tree and no proposed ADRs have been added there. The `README.md` and skill's claims of a verified-working flash template must not be interpreted as production-P4 verification.

## 4. Proposed ADR register — NOT approved or allocated

Provisional ADR numbers below are **planning slots only**, based on accepted ADR-0001…0003. Neither filenames nor adopted decisions are created by this proposal. For each ADR, write Context → Options → Decision → Consequences → Verification/rollback only after the owner explicitly ratifies the relevant architecture.

| Provisional | Topic / decision to ratify | Inputs | Priority / prerequisite |
|---|---|---|---|
| ADR-0004 | Production device identity and versioned capability profiles | Q03, Q09, Q10 | **P0**, manufacturer P4 evidence |
| ADR-0005 | Provenance schema, evidence lifecycle and deterministic capability refusals | Q08, Q10 | **P0**, operation taxonomy |
| ADR-0006 | Agent trust boundaries, effect-based permissions and approval contracts | Q04, Q08, Q10 | **P0**, threat model |
| ADR-0007 | TypeScript MCP host architecture and isolation of core services from Claude skills | Q02, Q06, Q11 | **P0**, MCP SDK and runtime choice |
| ADR-0008 | Native ESP-IDF build contracts, component reproducibility and firmware artefact typing | Q03, Q06, ADR-0003 | **P0**, production SDK pin(s) |
| ADR-0009 | kodeOS app packaging/deployment boundary and standalone-firmware quarantine | Q07, Q12, re-evaluate ADR-0002 | **Critical P0**, verified production loader/recovery contract |
| ADR-0010 | USB-first host/device protocol, identity binding and console/debug/install separation | Q05, Q04 | **P1**, production enumeration and transport evidence |
| ADR-0011 | Layered simulation/HIL evidence schema and qualification gates | Q08, Q09, Q12 | **P1**, module acceptance test definition |
| ADR-0012 | Five module adapters and minimum supported feature contracts | Q09, Q10, Q12 | **P1**, module schematics/SDK revisions |
| ADR-0013 | Plugin/MCP packaging, compatibility handshake, upgrades and privacy default | Q02, Q11, Q04 | **P1**, release matrix model |
| ADR-0014 | Peripheral safety isolation: motor/power limits, independent physical protection | Q04, Q09 | **P1**, Robotics/Maker HIL fixture |
| ADR-0015 | UK RF operations boundary and lawful test modes for Mesh/F*CK | Q04, Q09 | **P1**, module radio capability and test setup |
| ADR-0016 | Design for host portability, future transports and device-count expansion | Q02, Q05 | **P2**, evidence from the first USB adapter |

**Not all requirements warrant ADRs.** `/new-kode-app` templates, sensor examples, progress screens and documentation tasks belong in feature specifications/issues. Q01 product vision and Q12 release criteria primarily belong in a product brief and release acceptance document, not as separate implementation ADRs unless a consequential design trade-off emerges.

### Suggested ADR approval sequence

1. Establish a verified **P4 and production kodeOS interface evidence dossier** before finalising ADR-0008/0009. Otherwise the most consequential ADRs could be built on wrong assumptions.
2. Ratify the **safety and refusal boundary** (proposed ADR-0005/0006) before any MCP tool can change physical state.
3. Ratify **MCP interfaces and device capabilities** (proposed ADR-0004/0007/0010) from one tested vertical slice, not a speculative abstraction.
4. Complete **module-specific policies, HIL and packaging** (proposed ADR-0011…0015) as evidence and implementations mature.

## 5. Missing architectural decisions / remaining grilling

The twelve questions set strategy, not all engineering contracts. These items should be answered through targeted research and **short, evidence-driven sub-questions**, rather than silently chosen by an implementer.

| ID | Unresolved choice | Why it matters | Proposed next step |
|---|---|---|---|
| R01 | Production kodeOS app binary format, lifecycle/SDK and deployment API | Can block the entire end-to-end release | Request verified manufacturer docs/sample, inspect released production SDK, prove non-destructive app load on actual device |
| R02 | Production P4 revision, board pin maps, USB identity, flash partitions and recovery | Legacy S3 flash settings are unsafe | Build a signed-off hardware profile and factory-backup/recovery test plan |
| R03 | TypeScript runtime/package format and exact MCP transport | Determines install, process lifecycle and permissions | Start with local stdio unless technical evidence favours another transport; decide Node LTS, SDK version, schemas and distribution in a spike |
| R04 | Schema for claims, capabilities, tests and policy outcomes | Needed for reproducible deterministic refusals | Minimal typed records, explicit `unknown` vs `unsupported`, reason codes and revocation cases |
| R05 | Approval handshake and non-bypassable host permission boundary | Shell commands and serial passthrough can circumvent high-level tools | Threat-model host execution, build scripts, file roots, action tokens, artefact hashes and user approvals |
| R06 | Exact flagship v1 vertical slice | Without it, “end-to-end” is ambiguous | Choose observable user request → generated source → build → permitted install → logs/results on P4 |
| R07 | Detailed per-module acceptance tests/fixtures/ownership | Q09/Q12 cannot be met by mocks alone | Obtain all five modules, revisions, power fixture, second Mesh peer and appropriate RF test method |
| R08 | How modules are identified | Auto-detection may not be exposed by hardware | Verify enumeration/interface; support manual selection with risk-aware confirmation if needed |
| R09 | Firmware/release lifecycle and rollback boundaries | Plugin, MCP, device profiles and kodeOS can drift | Define tested compatibility manifest and operator-visible upgrade/rollback procedure |
| R10 | Data protection boundaries, particularly device logs and camera imagery | “Local-first” is not equivalent to “never sent to an external LLM” | Document which data enters model prompts, explicit export/redaction settings and opt-in diagnostics |
| R11 | UI/display abstractions, testability and graphical preview support | Long-term platform differentiation but uncertain device SDK | Define minimal UI recipe only after an app is loadable and its display services can be validated |
| R12 | Real-vs-simulated hardware test philosophy and CI execution | Avoid false positive release evidence and unsupervised HIL | Specify fixture control, audit logs, test duration and authorised physical test windows |
| R13 | Hardware electrical and RF safety standards/limits | Module operation can be legally and physically sensitive | Verify Kode documentation and relevant UK legal constraints before approving any RF TX or motor testing |
| R14 | Integration with non-Claude consumers | Q02 public-ready, but Claude-first product | Keep core functions invocable via CLI/library; defer other agent clients until there is demonstrated demand |

## 6. Dependency-led implementation roadmap

**Roadmap principle:** Each workstream may progress in parallel, but only earned evidence advances a gate. A missing manufacturer interface cannot be filled by speculation, and an absent module cannot be replaced by a mock for v1 qualification.

| Stage | Deliverables / actions | Entry / exit gate | Parallelisable? |
|---|---|---|---|
| **M0 — Restore memory & quarantine hazards** | Gain working GitHub write scope; commit the discovery records in a PR; audit ADR-0002, label S3 prototype templates and disable risky deployment instructions; capture current upstream source versions | Source-of-truth synced, no S3-to-P4 deployment ambiguity | Yes; repo governance + external research |
| **M1 — P4/kodeOS feasibility spike** | Verify shipped P4/C5 design, production loader API, how ESP-IDF firmware becomes a kodeOS app, safe device identification, permitted installation, backup/recovery routes and source licences | **Gate F1:** documented/proven viable non-destructive kodeOS application path, or explicitly blocked with evidence and vendor questions | Research can start immediately; on-device proof waits for hardware |
| **M2 — TypeScript MCP build/read-only slice** | Local TypeScript MCP stdio server, strict tool schemas, scoped workspace, pinned ESP-IDF build runner, read-only capability lookups, structured refusal output, reproducible mock tests | **Gate F2:** clean Windows setup + successful build-only mock/device-profile workflow + negative policy tests | Yes, can proceed without Dot while M1 runs |
| **M3 — Base Dot complete vertical slice** | Production P4 app template, validated build/packaging, verified user-approved kodeOS app install, device log/result acquisition, error/recovery UX; integrate Claude Code skill/command | **Gate F3:** repeatable intent → code → build → permit → install → observe on real P4 with hashes and negative tests | Depends on M1; partial development parallel with M2 |
| **M4 — Five module streams** | Maker, Robotics, Camera, Mesh and F*CK each receive capability profile, skill/tooling, reference app, independent safety policy and hardware-backed integration test | **Gate F4:** five signed-off L4 records on genuine P4/C5 + relevant module revisions; not mock-only | **Yes**, once common build, policy and loader baseline is stable |
| **M5 — Release engineering/qualification** | Plugin/MCP compatibility handshake, pinned releases, fresh Windows install, docs, secure default policy, supply-chain/licence audit, regression/negative tests, module support matrix and release notes | **Gate v1:** Q01–Q12 acceptance checklist is green, including all five modules; unresolved risks transparently documented | Yes, continuous alongside M3/M4 |

### Early previews allowed

- **Alpha 0:** source read-only intelligence and build-only workflow, explicit no production deployment claim.
- **Alpha 1:** verified base kodeOS end-to-end demo, module implementations incomplete and visibly marked.
- **Beta:** module-by-module HIL evidence accumulated; remaining gates clearly listed.
- **v1:** only after all Q12 evidence gates pass, including five module qualifications.

### Module stream minimums and dependencies

| Stream | Minimum meaningful physical proof | Extra dependency/blocker |
|---|---|---|
| Maker | Properly bounded and measured GPIO/sensor bus circuit | Correct pins and power rails; safe fixture |
| Robotics | Controlled motor/servo step and fault/stop behaviour | Actuator, supply, protection, independent stop |
| Camera | Actual image capture and authorised local retrieval | Production camera module, sensor/driver and privacy path |
| Mesh | Message exchange with a separate compatible node | Two radio endpoints, compatible settings, approved UK-band TX |
| F*CK | One useful hardware-backed, explicitly authorised RF diagnostic using its verified transceiver(s) | Production RF module revision, permitted use case, RF safety and verification tools |

## 7. Critical path, risks, and next best task

### Critical path

`P4 actual hardware + verified kodeOS app contract` → `safe base P4 end-to-end workflow` → `five module HIL streams` → `evidence reconciliation + versioned release` → **v1**.

Development of the MCP policy engine, profiles, skill structure, mock tests and packaging can proceed while waiting for hardware or manufacturer information.

### Risk register (probability not invented)

| ID | Impact | Risk | Early mitigation / evidence |
|---|---|---|---|
| RK-01 | Release blocking | Production kodeOS app-loader interface undocumented or incompatible with vanilla ESP-IDF images | Ask Kode for supported loader image contract, official P4 sample and recovery docs; prove deployment in a controlled spike |
| RK-02 | Safety critical | S3 template applied to production P4/C5 | Remove unsafe default upload path, mark obsolete board profile and prohibit flash until identity/partition verified |
| RK-03 | Release blocking | One of five modules unavailable, changed or lacking a usable driver | Track availability/revision per module; decouple feature development from v1 release claims |
| RK-04 | Safety critical | Model-induced tool use bypasses MCP approvals through shell or low-level APIs | Threat model, sandbox, deny-by-default policy, scoped approvals and red-team negative tests |
| RK-05 | Hardware/legal | Robotics electrical limits or radio transmission modes unverified | Independent power/motion safeguards, lawful licensed/exempt radio setup and user-approved physical tests |
| RK-06 | Trust/reliability | Manufacturer facts or prior HIL results become stale after firmware revisions | Provenance tags, invalidate/retest triggers, versioned compatibility bundles and structured refusal reasons |
| RK-07 | Project memory | GitHub integration can read but not create/update | Repair app installation permissions; until then preserve this complete export and explicitly indicate no remote commit |

### Next best action — CK-R001 (technical research, not an adopted ADR)

**“Production Kode Dot P4/C5 app-loader and hardware contract audit”**

**Deliverables:**

- A dated primary-source register of current Kode Dot CPU/board revision, actual pin/expansion maps, public SDK components, module interfaces, kodeOS loader/ABI claims, USB identifiers and recovery process.
- A **contract matrix**: `claimed`, `documented`, `source-verified`, `observed on production Dot`, `unverified/conflicting` for every consequential function.
- A verified answer to: **Can an ESP-IDF build be packaged and loaded as a kodeOS app on the shipped P4/C5 without replacing kodeOS?** If unproven, record the exact missing artefacts, vendor questions and blocked tests.
- A clear **no-flash** warning on legacy ESP32-S3 templates and an explicit future validation gate.
- A single reproducible **build-only** P4 sample (no flash) once a verified software target can be chosen.

**Acceptance:** Another engineer can reproduce the source and toolchain audit, distinguish fact from assumption, and know exactly what must be proved before any deployment on real hardware.

**Parallel work:** Design a local TypeScript MCP server skeleton and deterministic policy/refusal tests with a simulated device profile; no physical side effects.

## 8. Source notes and uncertainties

- Manufacturer product and architecture: https://kode.diy/ and https://kode.diy/product/kode-dot (P4/C5, advertised toolchains and interfaces; not proof of published SDK contract).
- Manufacturer timeline: https://timeline.kode.diy/ (updated 1 October 2026; timeline still describes firmware and module validation, not a certified public loader API).
- Kode engineering question on ESP-AMP: https://github.com/espressif/esp-amp/issues/1 (27 March 2026 intent for core-0 supervisor/core-1 applications, not a stable released ABI).
- Kode Mesh/F*CK module pages: https://kode.diy/product/radio-module and https://kode.diy/product/fck-module (final hardware specifications may change).
- Repo baseline: https://github.com/arjunsol/claude-kode, current `README.md`, `CONTEXT.md`, `CLAUDE.md`, `docs/adr/0001-0003`, `skills/kode-dot-dev`, and `templates/app/platformio.ini`, reviewed via connected GitHub account on 3 November 2026. These are existing user-authored files, not newly adopted decisions.

**Important:** No firmware was built, flashed or physically tested in this reconciliation. All release-gate evidence is **planned**, not passed. At the time of the original Q&A review, no repository write was possible. Subsequent documentation commits do not constitute ADR approval.