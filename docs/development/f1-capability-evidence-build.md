# F1: capability registry, evidence and build-only pipeline

**Status:** Implemented in a proposed PR (stacked on PR #4); tested on a Windows host with
no device and no ESP-IDF; **NOT TESTED** on a physical Dot. Date: 13 November 2026.
Tracking issue: [CK-R003](https://github.com/arjunsol/claude-kode/issues/7). The
specification it implements in part is the PR #6 proposal.

## What this slice adds

The MCP server moves to version 0.2.0 (name unchanged, `claude-kode-feasibility`) and
registers 17 tools and 8 resources. It adds, on top of PR #4's four console reads:

- A provenance-aware registry of claims, each with a state, a source pinned to a commit, a
  scope and a review date.
- Eight knowledge tools: `kode_get_capabilities`, `kode_get_pinout`, `kode_list_modules`,
  `kode_get_module_spec`, `kode_get_evidence`, `kode_check_compatibility`,
  `kode_get_sdk_contract` (all S0) and `kode_get_toolchain_status` (H0).
- A scaffold, validate, build and inspect pipeline: `kode_new_app` (H1), `kode_validate`
  (H0), `kode_build` (H1) and `kode_inspect_image` (H0). None of the four writes to a
  device; `kode_build` still executes build scripts on the host (see the threat model).
- One result envelope for all of them, with a closed list of reason codes, and eight MCP
  resources serving the same data.

Not added: any flash, install, erase, kodeOS or C5 update, radio or actuator tool, and any
module tool. Specified in PR #6 but not implemented: `kode_detect`, `kode_identify_device`,
`kode_device_health`, `kode_serial_monitor`, `kode_test`, `kode_test_evidence`,
`kode_plan_install`, `kode_install_app`, `kode_verify_firmware` and every module tool.

## Pins and the v0.1.1 audit

The pin moved to the v0.1.1 releases of kode-sdk, KodeOS and kode_slave_c5 during this
session, at the owner's request. All pins were resolved to commits on 13 November 2026.

| Component | Tag | Commit |
| --- | --- | --- |
| [kodediy/kode-sdk](https://github.com/kodediy/kode-sdk) | v0.1.1 | `63af5e7cde8497eaf89618a047844de1be9a41a2` |
| [kodediy/KodeOS](https://github.com/kodediy/KodeOS) | v0.1.1 | `209fd736844bfec3c97c641830fbad055865d154` |
| [kodediy/kode_slave_c5](https://github.com/kodediy/kode_slave_c5) | v0.1.1 | `c1c9a22156f88df292bc9c6674456458a0ded477` |
| [kodediy/kode-app-template](https://github.com/kodediy/kode-app-template) | v0.1.0 (only release) | `9cfaa43bcb95d3918be50fc5d68acc7fd7704379` |
| [kodediy/kode-apps](https://github.com/kodediy/kode-apps) | v0.1.0 (only tag) | `2f72a4c2cb41d402abfae74cc1c2d6a180847acc` |
| [espressif/esp-idf](https://github.com/espressif/esp-idf) | v6.1 | `fff9895c82d744c7237be8847347bdd1b07c6643` |

v0.1.0 of kode-sdk, KodeOS and kode_slave_c5 stays an assessed previous release. Any other
release is refused (`SDK_RELEASE_NOT_ASSESSED`, `KODEOS_RELEASE_NOT_ASSESSED`).

**The v0.1.1 audit found that everything the registry cites about the board and the app
contract is unchanged, and that the upstream conflicts are unchanged too.** Upstream
published v0.1.1 of kode-sdk on 11 November, and of KodeOS and kode_slave_c5 on 12
November. Every file the registry cites was compared between the two tags.

- Identical in both tags: `kbsp/partitions.csv`, `kbsp/project_include.cmake`,
  `kbsp/check_mailbox_size.cmake`, `kbsp/sdkconfig.board`, `kbsp_exp.h`, `kbsp_exp.c`,
  `kbsp_pins.h`, `kbsp_identity.h`, `kapp_desc.h`, `kapps_fmt.h` and `kapp_cat.h`. The full
  list is `SDK_FILES_IDENTICAL_ACROSS_RELEASES` in `mcp/src/registry/sdk-contract.ts`.
- Changed: `kcli.py` has a new digest, with the same subcommands and install destinations
  (`kpayload.py` is unchanged); the SDK `NOTICE.md` adds Kody artwork under CC BY-SA 4.0 and
  a trademark clause; kodeOS mounts the microSD on one data line; the SDK and C5 firmware
  gain a receive-only Wi-Fi frames service; `kode.h` gains file, audio and BLE calls. The
  board constants, including `KBSP_BOARD_REV "DVT"`, are unchanged.
- **The raw-offset conflict still stands.** The template README is still v0.1.0, the only
  template release, and prints a manual esptool command at `0x1C00000`. The partition table
  is byte-identical in v0.1.1 and puts `app_pending` at `0x1A00000` (size `0x600000`, image
  maximum `0x5FF000`). No tool uses either as an instruction, and `kode_new_app` does not
  copy the upstream README.
- A second upstream conflict was found: the template pins the SDK by HTTPS URL, while the
  catalogue checker (`kode-apps` `tools/kcheck/rules_b.py`, rule B1) accepts only
  `git@github.com:kodediy/kode-sdk.git`. Both claims are recorded as conflicting.
- **kodeOS self-update.** The v0.1.1 release notes say "About offers a newer kodeOS and
  installs it from there". A Dot can therefore run a release nobody assessed, so the
  installed release must be read from the device and never assumed. The policy evaluator
  checks a declared kodeOS release against the assessed set, and reads of device identity
  are not implemented.
- The v0.1.0 template pins kode-sdk v0.1.0. Its README names the `version:` line of
  `main/idf_component.yml` as the one edit to move SDK. `kode_new_app` makes that edit to
  v0.1.1 by default. A v0.1.0 template built against SDK v0.1.1 is **NOT TESTED**: this
  project has built nothing, because no ESP-IDF v6.1 was available.
- The four module SDK repositories (kode-camera-sdk, kode-fck-sdk, kode-mesh-sdk,
  kode-robotics-sdk) still returned HTTP 404 on 13 November. The Maker module has no
  dedicated SDK listed.

## Registry model

The registry refuses to load data that breaks its rules, so a state cannot be typed in
without the evidence that earns it. Code: `mcp/src/registry/` (`types.ts`, `registry.ts`,
`data.ts`).

- **Claim states.** `advertised`, `documented`, `source_verified`, `simulated`,
  `device_verified`, `integration_verified`, `unknown`, `unsupported`, `conflicting`. Rank
  is ordered `advertised` < `documented` and `simulated` < `source_verified` <
  `device_verified` < `integration_verified`. `unknown`, `unsupported` and `conflicting`
  carry no rank and support nothing.
- **Sources.** Each claim cites sources pinned to a commit or a dated HTTP probe. A claim in
  a source-backed state without a source reference stops the registry.
- **Scope.** A claim names a profile, the board revisions and the SDK releases it was read
  for. A claim is not applied to a release or revision it was not recorded for
  (`EVIDENCE_NOT_APPLICABLE`).
- **Expiry.** Each claim has a `reviewBy` date. Tag-pinned facts are reviewed by
  2027-02-11 (90 days). Facts about what upstream publishes, such as module SDK
  availability, are reviewed by 2026-11-27 (14 days). After its date a claim is stale and
  cannot support an operation (`EVIDENCE_EXPIRED`), and the knowledge tools answer
  `not_verified`.
- **Invalidation triggers.** Each claim lists what invalidates it: SDK, kodeOS, template,
  board revision, module revision, ESP-IDF or catalogue-rule changes, or a change in
  upstream availability. These are recorded data; no code watches upstream.
- **Conflicts.** A conflict is recorded on both claims, and a one-sided record stops the
  registry. A conflicted claim cannot support an operation (`EVIDENCE_CONFLICTING`). Two
  conflicts are recorded: the raw offset against the partition table, and the HTTPS SDK pin
  against catalogue rule B1.
- **Physical states need a real test record.** `device_verified` needs a passed,
  non-simulated L3 or L4 record. `integration_verified` needs a passed, non-simulated L4
  record that names the module and its revision. A simulated record cannot be L3 or L4. A
  record backs a physical claim only if it is for the same profile, a board revision in the
  claim's scope, the same module (for an L4 record on a module claim) and observed no later
  than the claim's review date.
  No such record exists, so no claim has either state, and every module's electrical data,
  detection and qualification are `unknown`.
- **Board revision.** The SDK declares `KBSP_BOARD_REV "DVT"`; that is the only revision the
  profile knows. What a retail unit reports has not been observed.

## Policy evaluator

`kode_check_compatibility` calls `evaluateCompatibility` in `mcp/src/registry/policy.ts`.
The same input gives the same decision and the same ordered reason codes. **A decision of
`allowed` means only that the evidence threshold is met; `grantsAuthorisation` is always
false, and no argument can supply an approval.** When the decision is
`refused`, the tool returns `status: refused` (an MCP tool error) with the first reason
code, and the whole decision stays in the payload. An allowed decision for an operation that
opens the serial port carries `cautions`: opening the port resets the Dot, and the identity
and installed kodeOS release of whatever is on the port are unverified. Rules apply in this
order, and every reason is collected rather than stopping at the first:

1. Target profile: unknown profile, or the archived S3 prototype.
2. Operations refused whatever the evidence says.
3. Declared target facts, checked and never trusted: board revision, SDK release, kodeOS
   release, ESP-IDF series and image chip.
4. Module scope: module required, unknown, mismatched, SDK unavailable, attachment
   unverifiable, not qualified.
5. Evidence thresholds, per claim: missing, not applicable, expired, conflicting,
   insufficient.
6. Effects on a device, a circuit or the air: console reads need the operator opt-in the
   server observes itself; device-changing effects (D2, P1, RF1) are always refused for
   `DEVICE_IDENTITY_NOT_OBSERVED` and `NO_AUTHORISATION_CHANNEL`; an operation with no tool
   gets `OPERATION_NOT_IMPLEMENTED`.

Refused categorically, with no evidence able to change the answer:

| Operation | Reason code |
| --- | --- |
| `raw_flash` | `RAW_FLASH_NEVER_SUPPORTED` |
| `erase_flash` | `OPERATION_EXCLUDED_FROM_TOOLSET` |
| `os_update` | `OPERATION_EXCLUDED_FROM_TOOLSET` |
| `c5_firmware_update` | `OPERATION_EXCLUDED_FROM_TOOLSET` |
| `standalone_firmware_flash` | `RECOVERY_NOT_VALIDATED` |

`install_app` and `remove_app` are not categorical, but are refused for missing device
evidence, no observed identity, no approval channel and, for install, the conflicting
mailbox offset. All module operations are refused because no module SDK, attachment proof
or L4 record exists.

## Build pipeline and trust boundaries

Tools take a project name, never a path. The only directory a tool reads or writes is
`<KODE_WORKSPACE_ROOT>/<name>`, and access is checked after links and junctions resolve.
Code: `mcp/src/build/`, `mcp/src/tools/build-tools.ts`.

| Tool | Reads | Writes | Executes |
| --- | --- | --- | --- |
| `kode_get_toolchain_status` | Environment, workspace root, template checkout, ESP-IDF version and commit files | Nothing | Nothing |
| `kode_new_app` | The operator's template checkout, hash-checked against v0.1.0 | A new project directory in the workspace; never overwrites | Nothing |
| `kode_validate` | Project files in the workspace | Nothing | Nothing |
| `kode_build` | Project files, then the built image and metadata | Build output under `<project>/build` (by `idf.py`) | `<KODE_IDF_PYTHON> <KODE_IDF_PATH>/tools/idf.py -C <project> -B <project>/build build` |
| `kode_inspect_image` | `build/<name>.bin`, `build/config/sdkconfig.json`, `build/flasher_args.json` | Nothing | Nothing |

- **`kode_new_app`** refuses a template checkout whose files differ from the tag (CRLF text
  files are accepted after normalisation; a changed binary is not). It makes the SDK pin
  edit, writes a short generated README instead of the upstream one (which carries the
  conflicting raw flash command), and validates manifest inputs so they cannot break out of
  a C string. Scaffolded projects are GPL-3.0-or-later. No GPL template file is stored in
  this MIT repository.
- **`kode_validate`** checks identity, ESP32-P4 target, app role, SDK pin, manifest and
  forbidden flash calls, and lists the rules it cannot check. It is not the catalogue's own
  checker. It reports two separate things: `verdict` (static rules, safe to run on any
  project) and `buildLogic: { eligible, findings }` (whether `kode_build` will accept the
  project). A project can pass the verdict and be ineligible to build.
- **`kode_build`** requires `KODE_ENABLE_BUILD=1`, an existing project, ESP-IDF v6.1, a
  passing validation and build logic that is the pinned template's (the build gate, below).
  It runs the one command above without a shell, once, with a deadline (default 1800 s,
  bounds 60 to 7200). It then inspects the image and records a build receipt. It reports
  whether the ESP-IDF commit equals the pinned v6.1 commit (`reproduciblyPinned`). The
  evidence it reports is L1 only.
- **`kode_inspect_image`** keeps four stages apart: source project; compiled image
  (P4 chip id, app descriptor, project identity); kodeOS-install compatible (a source-level
  judgement: ESP-IDF v6.1, `KAPD` manifest with a display name of 1 to 31 characters and 1
  to 4 catalogue categories, `KODEOS_BOOT_ROLE_APP`, P4 target, a generated
  `flasher_args.json` that is the single mailbox entry for a file named exactly
  `<name>.bin`, an image that fits the mailbox); and device verified, which is never
  claimed and always `NOT TESTED`. It reports `ok` and `verifiedLayer: build` only for an
  image with a build receipt. Any other image gets `not_verified`, `BUILD_NOT_OBSERVED`
  and `verifiedLayer: none`, and the payload (`buildObserved: false`) describes files only.

### The build gate

`idf.py build` executes the project's CMake and would import a project `idf_ext.py`, so a
fixed argument vector does not make a build "build only". `kode_build` therefore builds
only a project whose build logic is the pinned template's, and refuses anything else with
`BUILD_LOGIC_NOT_PINNED`. The gate (`checkBuildLogic` in `mcp/src/build/validate.ts`;
rule ids begin `BL-`) requires:

- `CMakeLists.txt` and `main/idf_component.yml` hash to the pinned template's once the
  scaffold's own edits (project name and version, the SDK release line) are reversed
  (`BL-ROOT-CMAKE`, `BL-SDK-PIN`);
- `main/CMakeLists.txt` is a single `idf_component_register(...)` call in a small strict
  grammar (`BL-MAIN-CMAKE`);
- no `idf_ext.py`, extra `*.cmake`, extra `CMakeLists.txt`, top-level `components/` or
  `sdkconfig.defaults.<x>` anywhere in the project (`BL-EXTRA-BUILD-FILE`), found by a walk
  bounded in depth and entries (`BL-WALK-BOUND`);
- no links at the top level or in `main/` and `appdata/` (`BL-LINK`);
- a root `sdkconfig`, if present, keeps the app role and the ESP32-P4 target
  (`BL-SDKCONFIG`).

In practice `kode_build` builds projects made by `kode_new_app` whose build logic has not
been altered. Source files, `sdkconfig.defaults`, `appdata/` and the `SRCS` list remain the
app author's to edit. A pre-existing `managed_components/` or `dependencies.lock` cannot be
verified by the server and is reported as a warning (`BL-UNVERIFIABLE`) that does not make
the project ineligible. The gate narrows what a build runs; it does not make the build a
sandbox.

### Build receipts

Files under `build/` can be written by anything, so their presence proves no build ran.
`kode_build` records the SHA-256 of the image it produced, in memory, for the life of the
server process (`mcp/src/build/receipts.ts`). Receipts are deliberately not persisted: a
file the model's own shell could edit would prove nothing. After a restart every image is
unattested until it is built again.

### Other build and workspace guards

- At the deadline the whole process tree is ended (Windows: `taskkill /PID <pid> /T /F` by
  PID; elsewhere the process group). The timeout message says the tree was ended only when
  that was confirmed.
- `build/`, `managed_components/` and a root `sdkconfig` that are links are refused before a
  build, and a file with more than one hard link is refused. The check-then-open race is
  narrowed, not closed.
- Rule C12 (flash and OTA calls) scans `main/` recursively over more extensions and matches
  identifier families. It is a source heuristic: token pasting or a prebuilt library defeats
  it, and it is not a substitute for checking the built ELF.
- A parsed project text file over 64 KiB, or with a line over 4096 characters, is rejected
  (`CK-FILE-BOUND`) without being run through a regex. Values echoed from project files are
  capped at 64 characters.

## Threat model and limitations

- **A build is not a sandbox.** `kode_build` runs the project's and the SDK's CMake and
  Python code on the host and fetches the SDK over the network by tag. That is why it is
  off until the operator sets `KODE_ENABLE_BUILD=1`. The build gate limits the project's own
  build logic to the pinned template's; the SDK's build scripts still run, and a
  pre-existing `managed_components/` or `dependencies.lock` cannot be verified. Build with
  no Dot attached.
- **Build output is not trusted by its presence.** Anything can write under `build/`.
  `kode_inspect_image` gives build-level evidence only for an image this server process
  built (`BUILD_NOT_OBSERVED` otherwise).
- **Claude Code's own shell is outside MCP policy.** This server restricts what its tools
  do. It cannot stop Claude Code from running other tools the host permits, including a raw
  `esptool`. The server only guarantees it offers no such path.
- **`kode_check_compatibility` is advice.** It does not authorise anything, and this build
  has no approval channel a model cannot write to.
- **Knowledge is source-level.** Every answer rests on manufacturer source at a tag, read
  on 13 November 2026. Nothing was observed on a device. The tools claim no more than that:
  the scope gates (`PROFILE_UNKNOWN`, `PROFILE_ARCHIVED_PROTOTYPE`,
  `SDK_RELEASE_NOT_ASSESSED`, `BOARD_REVISION_NOT_IN_PROFILE`) return `status: refused` on
  every knowledge tool; `not_verified` is kept for answers that are served but cannot be
  relied on. `kode_get_capabilities` with no `capability` filter returns `not_verified` and
  `EVIDENCE_CONFLICTING`, because the full list includes the two contradicting flash-offset
  claims; one clean capability returns `ok`. `kode_get_sdk_contract` serves a hazard only
  when its claim applies to the requested release, and gives console tool digests as
  `console.integrityByKodeosRelease`, keyed by kodeOS release, because the kodeOS on a Dot
  is independent of an app's SDK pin. `verifiedLayer` is computed from evidence that is
  still fresh and unconflicted; a fully stale answer reports `none`.
- **Facts expire.** Tag-pinned facts expire on 2027-02-11 and availability facts on
  2026-11-27, after which the tools answer `not_verified` until the registry is re-audited.
- **The installed kodeOS can differ.** A Dot can update itself, so a recorded fact may not
  describe the device in front of you.
- **Console reads can reset the Dot**, the SHA pins are operator-provided, and `kcli.py`
  imports other Python code. These limits are unchanged from PR #4.
- **Screenshots and console output may contain private data.** They go to the requesting
  client only.

## Test evidence

Run on the Windows host that built the slice: Node 24.22.1, no device, no ESP-IDF
installed.

| Check | Result |
| --- | --- |
| Before changes: MCP tests | PASS, 14 of 14 |
| Before changes: Python setup tests | PASS, 13 of 13 |
| `npm run build` | PASS, clean |
| `npm test`, no template checkout | PASS: 149 tests, 148 pass, 0 fail, 1 skipped (the real-template test) |
| `npm test`, `KODE_TEST_TEMPLATE_DIR` set to a real template v0.1.0 checkout | PASS: 149 tests, 148 pass, 0 fail, 1 skipped (the "refused without a template" test); a real scaffold is created, pinned to SDK v0.1.1, passes validation, is eligible to build, and becomes ineligible when `idf_ext.py` or an `execute_process` line is added |

Guard-breaking check (safety guards broken one at a time, each expected to turn the suite
red):

- First pass, before the review: 25 guards. 22 turned the suite red and 3 were rejected by
  the compiler, which shows the edit was impossible rather than that a test guards it.
- Second pass, on the reviewed code: 48 guards, the original set (with those 3 rewritten so
  that they compile) plus one for each fix the review prompted. 45 turned the suite red, 3
  were rejected by the compiler, none survived. The 3 are the scope gates: the helper's type
  now admits only `refused`, so a weaker status cannot be written there. Those gates are
  also asserted directly in `protocol-f1.test.ts` and `expiry.test.ts`.
- After each pass every mutated file was confirmed restored.

This check shows that each listed guard is covered by at least one test. It does not show
that the list of guards is complete.

NOT RUN: any real `idf.py build` (no ESP-IDF v6.1 on this host), anything on a physical Dot,
any module, Claude Code plugin discovery, macOS or Linux, GitHub Actions.

The build service is tested with an injected runner. Those tests show the control flow and
the single fixed command; they do not show that an ESP-IDF build succeeds.

### Handover test requirements

Each row names the test file under `mcp/test/` and the test name.

| Requirement | Test file: test name |
| --- | --- |
| Unknown or incorrect board revision | `policy.test.ts`: an unknown or incorrect board revision is refused; `protocol-f1.test.ts`: unknown boards, wrong revisions, unassessed SDK releases and the S3 prototype get no facts |
| S3 binaries for a P4 target | `policy.test.ts`: an S3 image is refused for the P4 target; `build-services.test.ts`: an S3 image supplied for the P4 target is identified and reaches no stage; `protocol-f1.test.ts`: an S3 binary supplied for the P4 target is refused over the protocol |
| Missing or conflicting evidence | `policy.test.ts`: missing evidence is refused, not assumed; installation is refused for conflicting evidence, missing device evidence and no approval channel; `registry.test.ts`: the raw-offset contradiction is recorded on both sides and marks both claims conflicting; `protocol-f1.test.ts`: the evidence ledger reports conflicts, unknowns and the absence of test records |
| Expired capability assertions | `policy.test.ts`: expired capability assertions stop supporting operations; `expiry.test.ts`: on the day of the audit every knowledge answer is current, except the list that serves conflicting claims; after the pinned review date, capability assertions expire and stop supporting builds; after the availability review date, facts about what upstream publishes are stale; `registry.test.ts`: evidence expires on its review date and availability facts expire sooner |
| Invalid SDK versions | `policy.test.ts`: SDK, kodeOS and ESP-IDF versions outside the assessed set are refused; `registry.test.ts`: a claim is not applied to an SDK release or board revision it was not recorded for; `build-services.test.ts`: the template pin can stay on the previous assessed SDK release but not on an unassessed one |
| Malformed tool arguments | `protocol-f1.test.ts`: malformed tool arguments are rejected at the schema boundary; `build-services.test.ts`: manifest inputs that could break out of a C string or the catalogue rules are refused |
| Workspace and subprocess escape attempts | `build-services.test.ts`: project names that could leave the workspace or run a command are refused; path containment treats only real descendants as inside; a project directory that is a junction to outside the workspace is refused; files reached through a link that leaves the project are refused; no build argument vector can carry a flash, erase, monitor or install verb; the real process runner uses no shell, reports exit codes and stops at the deadline; `protocol-f1.test.ts`: workspace escapes and unsafe project names are refused over the protocol |
| Unexpected device commands | `kcli-readonly.test.ts`: only fixed ping and read-only console verbs can reach the runner; runtime refuses a fabricated device-changing command; refuses operations unless the operator explicitly enables serial reads |
| Falsified user approvals | `protocol-f1.test.ts`: falsified approvals and unknown arguments are rejected by every F1 tool; `policy.test.ts`: no input combination ever allows an operation that changes a device, a circuit or the air; `capabilities.test.ts`: caller-supplied evidence or approval cannot promote a simulation |
| Attempts to invoke raw flashing | `protocol-f1.test.ts`: tools that do not exist cannot be invoked, including every raw-flash spelling; the server advertises exactly the documented tools and nothing that writes to a device; `policy.test.ts`: raw flashing, erase, OS and C5 updates and standalone firmware are refused whatever is supplied; `build-services.test.ts`: raw flash commands in project documents are reported and never executed |
| Project build logic other than the pinned template's | `validate-build-logic.test.ts`: a project made by kode_new_app and left alone (eligible, also with an added source file, CRLF endings, a build/ directory); the reviewer's build-logic bypasses are not eligible (execute_process, a second `set(IDF_TARGET ...)`, a bracket comment, `SDKCONFIG_DEFAULTS`, `idf_ext.py` in any letter case, a hostile `main/CMakeLists.txt`, `override_path`, a local `components/kbsp`, root `sdkconfig` forms); the bounded directory walk; validation of a hand-made project stays a harmless read; `review-build.test.ts`: a project with build logic that is not the pinned template is refused before any process starts |
| Build receipts and image evidence | `review-build.test.ts`: a build records a receipt for its image, and only that exact image is observed; kode_inspect_image reports build evidence only for an image this server built |
| Install-compatible only when strict | `review-build.test.ts`: an empty or out-of-catalogue manifest, or an image the mailbox cannot hold, is not install-compatible; a flash plan whose file is a path other than `<name>.bin` is not the mailbox plan |
| Process tree and links at build time | `review-build.test.ts`: the deadline ends the whole process tree, not only the top process; a timeout message says the tree was stopped only when that was confirmed; a build, managed_components or sdkconfig that is a link is refused before any process starts; a real build directory inside the project is still built; a file that is a hard link to content outside the project is refused; a real buildApp run passes exactly the six expected arguments |
| Flash-call heuristic and parse bounds | `validate-build-logic.test.ts`: C12 sees the flash and OTA identifiers the review showed it missing; no parsed file can freeze the server; values echoed from a project file are capped at 64 characters; B1 and B2 are not fooled by the reviewer's inputs |
| Uniform refusals and cautions | `expiry.test.ts`: every scope gate refuses as a tool error, for every knowledge tool; a refused compatibility decision is a tool error with the first reason code and the full payload; an allowed console read says in its message that opening the port resets the Dot; the SDK contract serves release-scoped facts only for their release, and console digests for every kodeOS release; `policy.test.ts`: an allowed console read carries the cautions |
| Test records scoped to their claim | `registry.test.ts`: a test record backs only the claim it was taken for: profile, board revision, module and date |
| Unsupported module operations | `policy.test.ts`: module operations are refused: no SDK, no attachment proof, no L4 record; `protocol-f1.test.ts`: modules are catalogued, never detected, and unknown modules get no invented specification; `registry.test.ts`: module electrical data, detection and qualification are unknown for all five modules |

## Independent review before first push

An independent review of the new code was run before the first push, with instructions to
prove each defect by running it. It confirmed 12 defects and found 1 more plausible. All
were addressed in code before anything was pushed. Severity is as the reviewer gave it.

| # | Severity | Defect | Resolution |
|---|---|---|---|
| 1 | critical (plausible; ESP-IDF not installed, so not run) | Project CMake or `idf_ext.py` can add verbs to, or run code inside, the one "build only" run | Build gate; tool text corrected; residual risk stated |
| 2 | high | A `build` junction sends build output outside the workspace | Links refused before the build |
| 3 | high | The deadline killed only the top process | Process tree ended; message conditional |
| 4 | high | Flash-call rule missed real APIs and most of the source tree | Rule widened and relabelled a heuristic |
| 5 | medium | Validation fooled by CMake, Kconfig and component-manager forms it did not model | Build gate; B1 and B2 tightened |
| 6 | medium | One regex could freeze the server for minutes | Replaced; file and line bounds |
| 7 | medium | Registry accepted a test record from the wrong profile, revision or module | Scope checks on test records |
| 8 | medium | Install-compatible reported for images that should not get it | Stricter manifest, mailbox-fit and flash-plan checks |
| 9 | medium | Hand-written build output labelled as build evidence | Build receipts |
| 10 | low-medium | Some refusals were not tool errors | Uniform `refused` status on scope gates and refused compatibility decisions |
| 11 | low | `console_read` could be `allowed` although opening the port resets the chip | `cautions` on the decision |
| 12 | low | Facts served for the wrong release, or conflicting, without saying so | Release-scoped hazards; `not_verified` for conflicting lists; freshness-aware `verifiedLayer` |
| 13 | low | Hard links and unbounded echo | Hard-linked files refused; echoed values capped at 64 characters |

**A further defect was found at integration, not by the review.** The tightened dependency
rule rejected the word `override_path` anywhere in `main/idf_component.yml`, and the
official template's own manifest uses that word in a comment, so a real scaffold failed
validation. The stand-in template used by the tests had no such comment. Comments are now
excluded from the rule, and the stand-in now carries the comment: with the fix removed, ten
tests fail.

### Residual risks

- `kode_build` is not a sandbox. The SDK's own build scripts run, the component manager
  fetches the SDK by tag, and a pre-existing `managed_components/` or `dependencies.lock`
  cannot be verified (`BL-UNVERIFIABLE`). The first defect was never reproduced because
  ESP-IDF is not installed on the host that wrote the slice.
- Rule C12 is a source heuristic. Token pasting or a prebuilt library defeats it, and it is
  not a substitute for checking the built ELF.
- Build receipts last only for the server process. After a restart every image is
  unattested until it is rebuilt.
- The check-then-open race on workspace files is narrowed, not closed.
- Claude Code's own shell remains outside MCP policy.

## Manual validation checklist

Nothing below has been done. Each item needs a person with the stated hardware or host.

- [ ] Install ESP-IDF v6.1 (commit `fff9895c82d744c7237be8847347bdd1b07c6643`), activate it,
      and run `kode_get_toolchain_status`; confirm `idfCommitMatchesPin` is true.
- [ ] Set `KODE_WORKSPACE_ROOT`, `KODE_TEMPLATE_DIR` and `KODE_ENABLE_BUILD=1`; run
      `kode_new_app`, `kode_validate`, `kode_build` and `kode_inspect_image` on a real project
      and keep the log and the image digest.
- [ ] Build a scaffolded project against kode-sdk v0.1.1, and separately against v0.1.0, and
      record the result of each. A v0.1.0 template built against v0.1.1 has not been built.
- [ ] Confirm the generated `flasher_args.json` is the single mailbox entry on a real build.
- [ ] On a physical production Dot: read the board revision, serial and installed kodeOS
      release, and compare them with the registry's `DVT` and assessed releases.
- [ ] Confirm what opening the serial port does to the Dot, then exercise the four console
      tools with the v0.1.1 `kcli.py` pins.
- [ ] Separately authorised and later: install an app and recover; each requires its own
      L3 record before any claim becomes `device_verified`.
- [ ] For each of the five modules: obtain its SDK, record electrical data, define an
      identification procedure and make an L4 record on production hardware.
- [ ] Load the plugin in Claude Code and confirm `/mcp` lists exactly 17 tools and 8
      resources.
- [ ] Before 2026-11-27, re-check upstream availability facts; before 2027-02-11, re-audit
      tag-pinned facts.
- [ ] Ask the manufacturer to resolve the `0x1C00000` against `0x1A00000` offset conflict
      and the HTTPS against SSH SDK pin conflict.
