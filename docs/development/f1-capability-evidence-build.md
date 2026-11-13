# F1: capability registry, evidence and build-only pipeline

**Status:** Implemented in a proposed PR (stacked on PR #4); tested on a Windows host with
no device; one real ESP-IDF v6.1 build passed on commit 46271fa; a build of the later code was
attempted and is BLOCKED (cut short, no failure found), so that code has not been built for real; **NOT TESTED** on a physical Dot. Date: 13 November 2026.
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
  v0.1.1 by default. A v0.1.0 template built against SDK v0.1.1 built once with a real
  ESP-IDF v6.1 (PASS, see "Real ESP-IDF build"). Pinned to SDK v0.1.0 it is **NOT TESTED**.
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
  than the claim's review date and no later than the day the claim was recorded. A claim
  scoped to board revisions needs a record for every revision in its scope, and every scoped
  revision must be one the profile knows; an unscoped claim still needs one record on a known
  revision. Dates must be real calendar dates. A claim recorded more than one calendar day
  after the evaluation date (the day is for time zones) is not applicable, and the policy
  detail says it is dated in the future. Every claim listed in a module's `claimIds` must have
  the subject `module:<that module's id>`. A very old observation (the review used
  1970-01-01) is still accepted: how old a record may be is a policy value nobody has set.
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
  project with no `build/`, `sdkconfig` or `sdkconfig.old` (`BUILD_STATE_PRESENT`
  otherwise; see "Every build is a clean build", below), a passing validation and build
  logic that is the pinned template's (the build gate, below).
  It runs the one command above without a shell, once, with a deadline (default 1800 s,
  bounds 60 to 7200). It then inspects the image and records a build receipt. It reports
  whether the ESP-IDF commit equals the pinned v6.1 commit (`reproduciblyPinned`), and
  carries the build-logic warnings (`buildLogicWarnings`, such as `BL-UNVERIFIABLE`) in its
  result and message. The evidence it reports is L1 only.
- **`kode_inspect_image`** keeps four stages apart: source project; compiled image
  (P4 chip id, app descriptor, project identity); kodeOS-install compatible (a source-level
  judgement: ESP-IDF v6.1, `KAPD` manifest with a display name of 1 to 31 characters and 1
  to 4 catalogue categories, `KODEOS_BOOT_ROLE_APP`, `KODEOS_HOME_HOLD` and `KQP_AO_WATCH`
  both true in the resolved configuration (`app.home_hold`, `app.ao_watchdog`; absent, false,
  a non-boolean or an unreadable `sdkconfig.json` fails them), P4 target, a generated
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
- no `idf_ext.py`, extra `*.cmake`, extra `CMakeLists.txt`, top-level `components/`,
  `sdkconfig.defaults.<x>`, `CMakePresets.json`, `CMakeUserPresets.json`,
  `sdkconfig.rename`, `sdkconfig.rename.<x>` or file whose name starts with `Kconfig` (any
  letter case) anywhere in the project outside `build/` and `managed_components/`
  (`BL-EXTRA-BUILD-FILE`), found by a walk bounded in depth and entries
  (`BL-WALK-BOUND`). The `Kconfig*` refusal is a precaution, not a demonstrated exploit:
  upstream kconfiglib has a preprocessor with a shell function, whether ESP-IDF's variant
  runs it was not checked (ESP-IDF was not installed when the rule was written), and the official template
  has no Kconfig file. The preset files are refused because idf.py reads them from the
  project and passes the chosen preset to cmake (read in the ESP-IDF v6.1 source; the cmake
  half was run, the idf.py half was not), and `sdkconfig.rename` because a rename line with
  `!` inverts a protected setting (run with kconfgen alone, not through idf.py). The
  other project-directory inputs idf.py reads in v6.1 (`idf_ext.py`, `CMakeLists.txt`,
  `dependencies.lock`) were found already modelled;
- no links at the top level or in `main/` and `appdata/` (`BL-LINK`);
- `sdkconfig.defaults` holds only lines of the accepted grammar, with no byte outside
  printable ASCII, tab, LF and CRLF (`BL-DEFAULTS-GRAMMAR`; the grammar is described with the
  static rules below);
- a root `sdkconfig`, if present, keeps the app role and the ESP32-P4 target, with the same
  byte rule (`BL-SDKCONFIG`).

In practice `kode_build` builds projects made by `kode_new_app` whose build-logic files and
other modelled build inputs have not been altered or added to. That is a claim about the
inputs listed above; the review of the second fix round showed that the list was incomplete
once (the preset files), and finding G2-1 below showed that the `sdkconfig.defaults` rules
were not a complete model of Kconfig. Round three replaced the model with a closed grammar. Source files, `sdkconfig.defaults`, `appdata/` and the `SRCS` list remain the
app author's to edit. A pre-existing `managed_components/` or `dependencies.lock` cannot be
verified by the server and is reported as a warning (`BL-UNVERIFIABLE`) that does not make
the project ineligible. The gate narrows what a build runs; it does not make the build a
sandbox.

### Every build is a clean build

The gate and the static rules read the project's source files. State that exists before the
build starts is not covered: a planted `build/CMakeCache.txt` whose `CMAKE_PROJECT_INCLUDE`
pulls in project CMake, a junction inside `build/` that sends output outside the workspace,
and a root `sdkconfig` whose settings override `sdkconfig.defaults` (the only file the static
rules read). Generated state that exists before a build cannot be told apart from planted
state. `kode_build` therefore refuses with `BUILD_STATE_PRESENT` (status `refused`), before
any process starts, when any of `build/`, `sdkconfig` or `sdkconfig.old` exists in the
project, and the message names which are present.

The server does not delete them: it never removes files it did not create in the same call.
The caller removes them with its own file tools and calls `kode_build` again.
`kode_inspect_image` still reads `build/`, so it is called after a build and before the
removal. `managed_components/` and `dependencies.lock` stay allowed, because fetching the SDK
again on every build is not practical; they remain reported as unverifiable. The rule removes
one way of planting state ahead of a build. It does not make a build safe or a sandbox.

### Build receipts

Files under `build/` can be written by anything, so their presence proves no build ran.
`kode_build` records three SHA-256 digests, in memory, for the life of the server process
(`mcp/src/build/receipts.ts`): the image, `build/config/sdkconfig.json` and
`build/flasher_args.json`, with a missing file recorded as absent. An image is observed only
when all three match, so changing any of them gives `BUILD_NOT_OBSERVED`. Receipts are
deliberately not persisted: a file the model's own shell could edit would prove nothing.
After a restart every image is unattested until it is built again.

### Other build and workspace guards

- At the deadline the build process and the processes still attached to it are ended
  (Windows: `taskkill /PID <pid> /T /F` by PID; elsewhere the process group). A process that
  detached itself, whose parent has already exited, is not reached, and Node cannot place a
  child in a Windows Job Object without a native module. The timeout message says only that
  the attached processes were ended, says that a detached process cannot be tracked and may
  still be running, and says so when even the attached ending could not be confirmed.
  `BUILD_TIMEOUT` is returned only when the build process itself had not exited at the
  deadline. The runner also listens for the `exit` event: when the build process has exited
  with a code but something it started still holds the output pipes, it waits 2000 ms for
  normal output, stops reading, reports the exit code and sets `outputHeldOpen` (with a
  sentence in the message, and on `BUILD_FAILED` after the log tail). It does not end the
  holder. Before this change such a build was reported as a timeout.
- `managed_components/` that is a link is refused before a build, and a file with more than
  one hard link is refused. A pre-existing `build/`, `sdkconfig` or `sdkconfig.old` is
  refused whether or not it is a link. The reason code depends on the form: a plain
  existing entry (including a `sdkconfig.old` that is a directory, a file with an alternate
  data stream or a different letter case) gives `BUILD_STATE_PRESENT`; a `build/` or `sdkconfig`
  that is a junction, a dangling junction, the wrong kind of entry or a hard link gives
  `WORKSPACE_ESCAPE`, because the entry check runs first; only a `sdkconfig.old` that is
  a junction gives `BUILD_STATE_PRESENT`. Every form is refused before any process starts.
  The check-then-open race is narrowed, not closed.
- Rule C12 (flash and OTA calls) scans every text file under `main/` (no NUL byte in the
  first 8 KiB) whatever its extension, within the depth, count and size bounds, strips a
  leading byte-order mark, treats CRLF and a lone CR as line breaks, joins a backslash
  followed by spaces, tabs, form feeds or vertical tabs and a line break before matching, and
  matches identifier families. It adds a warning (`C12-INCLUDE`) when a source under `main/`
  has an `#include` (also spelt `%:`, `??=`, `include_next` or `import`, with form feed or
  vertical tab around the `#`) whose operand leaves `main/`: a `..` path, an absolute path or
  drive letter, a macro or other non-literal operand, or one that is not a well-formed
  literal. Files outside `main/` are not scanned. Trigraph splices are not joined. It is a
  source heuristic: token pasting or a prebuilt library defeats it, and it is not a
  substitute for checking the built ELF.
- The `sdkconfig.defaults` rules (app role B4, hold-BOT D8, watchdog C2-WATCH, B3, B7) no
  longer imitate the Kconfig reader (finding G2-1). They read only lines of a small grammar,
  and a file with any other line is refused whole: the project is not eligible to build
  (`BL-DEFAULTS-GRAMMAR`, naming the line number and the accepted forms), the verdict fails
  (`CK-DEFAULTS-GRAMMAR`), and B3, B4, B7, D8 and C2-WATCH fail with it. The accepted lines
  are: an empty line; a comment starting `#` (but not the `# default:` pragma, the
  `# Deprecated options for backward compatibility` and `# End of deprecated options`
  markers, or an "is not set" line that is not exactly the accepted one); exactly
  `CONFIG_NAME=value`, with no space around `=`, `NAME` of A-Z, 0-9 and `_`, and a value
  that is `y`, `n`, a decimal, a `0x` hex number or a double-quoted string of printable ASCII
  with no backslash and no inner quote; and exactly `# CONFIG_NAME is not set`. For the
  symbols the rules read, the type is enforced too: the app role, OS role, hold-BOT,
  watchdog, radio, esp-hosted and Bluetooth settings take only `y` or `n`, and the partition
  table only a quoted string, because Kconfig ignores a value of the wrong type and keeps
  the earlier one. Whole-file byte rule: only printable ASCII, tab, LF and CRLF are read, so
  a lone CR, 0x1C to 0x1F, DEL, NEL, U+2028, a byte order mark and anything not ASCII are
  refused wherever they sit, comments included. The same byte rule applies to
  `main/idf_component.yml` (`CK-MANIFEST-BYTES`) and to a root `sdkconfig` (`BL-SDKCONFIG`,
  which also refuses the deprecated-options markers and the `# default:` pragma). On the
  accepted grammar the validator and kconfgen 3.14.0 agree on every value; that was run, not
  argued (see "G2-1 proof" below). B4, D8 and C2-WATCH judge every assignment, B3 and B7 use
  the last. Two narrowing rules cover Kconfig meaning that the grammar cannot see (finding
  N-1): B3 also fails when any `CONFIG_PARTITION_TABLE_*` symbol other than
  `PARTITION_TABLE_CUSTOM_FILENAME` is assigned in any form (another member of the
  partition-table choice selects a different table), and B7 applies unless the last radio
  line is `CONFIG_KODEOS_RADIO=y`, so a deleted radio line counts as off and then needs
  `ESP_HOSTED_ENABLED=n` and `BT_ENABLED=n`. This does not read Kconfig defaults. A refused
  file looks like this: `sdkconfig.defaults line N cannot be read with certainty: <reason>`
  followed by the list of accepted forms. Inspection also checks the resolved configuration for B3 and B7
  (`app.partition_table`, `app.radio`), so a wrong static reading cannot reach
  `kodeos_install_compatible`.
- A parsed project text file over 64 KiB, or with a line over 4096 characters, is rejected
  (`CK-FILE-BOUND`) without being run through a regex. Values echoed from project files and
  from build metadata are capped at 64 characters, and `kode_inspect_image` reports at most
  16 flash entries and says when more were present.
- The mailbox offset in `flasher_args.json` is accepted only as `0x` followed by hex digits,
  and compared numerically. The manifest check needs a display name with at least one
  non-space character and distinct categories. Project names that are Windows reserved
  device names (`con`, `prn`, `aux`, `nul`, `com1` to `com9`, `lpt1` to `lpt9`) are refused.

## Threat model and limitations

- **A build is not a sandbox.** `kode_build` runs the project's and the SDK's CMake and
  Python code on the host and fetches the SDK over the network by tag. That is why it is
  off until the operator sets `KODE_ENABLE_BUILD=1`. The build gate limits the project's own
  build logic to the pinned template's, and the clean-build rule refuses a build when state
  already exists; the SDK's build scripts still run, and a pre-existing `managed_components/`
  or `dependencies.lock` cannot be verified. Build with no Dot attached.
- **Build output is not trusted by its presence.** Anything can write under `build/`.
  `kode_inspect_image` gives build-level evidence only for an image this server process
  built, and only while the image and the two build metadata files match their receipt
  (`BUILD_NOT_OBSERVED` otherwise).
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

Run on the Windows host that built the slice: Node 24.22.1, no device. The unit tests use no
ESP-IDF. A real ESP-IDF v6.1 was installed later in the work and is used by the real build
below and by one optional test.

| Check | Result |
| --- | --- |
| Before changes: MCP tests | PASS, 14 of 14 |
| Before changes: Python setup tests | PASS, 13 of 13 |
| `npm run build` | PASS, clean |
| `npm test`, no template checkout | PASS: 422 tests, 419 pass, 0 fail, 3 skipped (the real-template test and the real-build-directory test are two; the third was not identified in this record) |
| `npm test`, `KODE_TEST_TEMPLATE_DIR` set to a real template v0.1.0 checkout | PASS: 422 tests, 420 pass, 0 fail, 2 skipped; a real scaffold is created, pinned to SDK v0.1.1, passes validation (including the new `sdkconfig.defaults` grammar), is eligible to build, and becomes ineligible when `idf_ext.py` or an `execute_process` line is added |
| `npm test` with the template and `KODE_TEST_REAL_BUILD_DIR` both set | PASS on the code of the fix-g2 package, before the last narrowing fix: 408 tests, 407 pass, 0 fail, 1 skipped; the real resolved `sdkconfig.json` of the earlier real build passes the two new inspection checks. NOT TESTED on the final code with both variables set |
| Python setup tests (`python -m unittest discover -s tests -v`) | PASS: 13 tests, OK |
| Real `kode_build` of a scaffolded app on ESP-IDF v6.1.0 | PASS, once, on commit 46271fa; see "Real ESP-IDF build" below |
| Real `kode_build` of the code in this commit | BLOCKED: the attempt was cut short, see "Real build of the final code" below |

Node was v24.22.1 for every run above. The tests added since commit 46271fa are in six new
files: `wf1-gate.test.ts`, `wf1-build-report.test.ts` and `wf1-registry.test.ts` (round one),
and `wf2-defaults-grammar.test.ts`, `wf2-resolved.test.ts` and `wf2-kconfig-semantics.test.ts`
(this round), plus a changed helper (`mcp/test/helpers.ts`). Three controls in
`wf1-gate.test.ts` became refusals (an inline comment after a value, twice, and a lone CR),
because the grammar refuses those shapes; no assertion was loosened.

Guard-breaking check (safety guards broken one at a time, each expected to turn the suite
red):

- First pass, before the review: 25 guards. 22 turned the suite red and 3 were rejected by
  the compiler, which shows the edit was impossible rather than that a test guards it.
- Second pass, on the reviewed code: 48 guards, the original set (with those 3 rewritten so
  that they compile) plus one for each fix the review prompted. 45 turned the suite red, 3
  were rejected by the compiler, none survived. The 3 are the scope gates: the helper's type
  now admits only `refused`, so a weaker status cannot be written there. Those gates are
  also asserted directly in `protocol-f1.test.ts` and `expiry.test.ts`.
- Third pass, on the code after the confirmation fixes: 60 guards, the second pass's set
  re-anchored plus one for each second-pass fix. 56 turned the suite red, 3 were rejected by
  the compiler (the same scope gates), none survived. One, the rule that a build-gate
  refusal lists only reject-level findings, did not run in the harness because its
  multi-line anchor did not match the file's line endings; it was broken by hand instead and
  its test failed.
- Fourth pass, on the fixes of this round: the first gate broke 24 guards one at a time and
  all 24 turned tests red. The second gate ran 16 more checks (re-checks and the first gate's
  fixes): 13 turned tests red and 3 stayed green, which are changes no test guards (G2-2,
  below). Each file was restored and
  checked by SHA-256, and the working tree was identical before and after. The
  implementers also ran their new tests before their fixes and saw them fail (for example 25
  of 49 gate tests and 7 of 12 registry tests).
- Fifth pass, on the round-three code (this round). The fix packages saw their new tests fail
  before the grammar existed (11 tracked-type tests failed with "the project must not be
  eligible to build") and ran 14 guard mutations of their own, each turning 1 to 81 tests red
  (the two G2-2 guards: 2, 2 and 1 tests). Gate 1 broke 27 guards: 26 turned the suite red
  and 1 stayed green (G-10, an inline comment accepted in the value; harmless, because the
  type rule still refuses it on every tracked symbol and no rule reads untracked ones).
  Gate 2 broke 32 guards: 31 turned the suite red, including all six guards of the B3 and B7
  narrowing, and 1 stayed green (G-14, `!readable ||` in the B7 condition), an equivalent
  mutant: for an unreadable file the radio is undefined, so B7 still applies. Every mutated
  file was restored and checked by SHA-256, and `git diff HEAD` hashed the same at the start
  and end of each gate.
- After each pass every mutated file was confirmed restored.

One note on evidence: the fix-g2 package did not run the four gate scripts (x1, n1, r2b,
mutate-x3) before changing code, so the red evidence for the grammar comes from its own new
tests run against a stub. Its first red run was for the wrong reason (unpinned fixtures) and
was corrected; the first right-reason red it saved covers the tracked-type cases only. The
other grammar tests were not seen red for the right reason before the grammar existed. The
gates re-ran the four scripts afterwards and every earlier shape is refused.

This check shows that each listed guard is covered by at least one test. It does not show
that the list of guards is complete.

NOT RUN: anything on a physical Dot, any module, Claude Code plugin discovery, macOS or
Linux (so the POSIX process-group kill path), GitHub Actions, a real `idf.py` run with a
preset file in the project, GCC (the include and splice checks were compared with clang
through zig cc only), and two `kode_build` calls on one project at the same time.

The build service is mostly tested with an injected runner. Those tests show the control
flow and the single fixed command; they do not show that an ESP-IDF build succeeds. The
real build, below, does, for one project on one host.

### Real ESP-IDF build

Result: **PASS** (`kode_build` itself returned `ok`). Run on commit 46271fa, before the
fixes in this round, through the MCP tools in order, with no device attached.

- Toolchain: ESP-IDF v6.1.0, commit `fff9895c82d744c7237be8847347bdd1b07c6643`, equal to the
  pin; Python 3.13 environment created by the installer; Node 24.22.1. Template v0.1.0
  (`9cfaa43b`), built against kode-sdk v0.1.1.
- The worktree and the export used for the run were identical apart from line endings.
- Run A used Node 22 by accident: build `ok` in 443 s, image sha256
  `291667a6c73d3f6970d2aa2f4b023263a14df4667002e2d2123517fabccb7b6f`. Kept as evidence only.
- Run B (Node 24, the authoritative run): `kode_get_toolchain_status` ok; `kode_new_app` ok;
  `kode_validate` ok (verdict pass, one warning, build logic eligible); `kode_build` ok in
  321 s, `reproduciblyPinned` true, log tail "Project build complete";
  `kode_inspect_image` ok. Image `rb_app.bin`, 517680 bytes, sha256
  `c7c127fee1e83ca3ffefec9a926ce2b6ca261eb43a05f0d91f40b4371a9e3c5b`. The two runs gave
  different hashes; the run notes attribute this to an embedded build time, which was not
  separately tested.
- Inspection, on the code of that commit: source project true, compiled image true,
  kodeOS-install compatible true, device verified false (NOT TESTED), stage
  `kodeos_install_compatible`, chip esp32p4, flash plan `mailbox_only` at `0x1a00000` for
  `rb_app.bin`, 9 of 9 checks pass. After the fixes the inspection has 13 checks (the resolved configuration is read for the app role, hold-BOT, watchdog, partition table and radio); the
  optional test `KODE_TEST_REAL_BUILD_DIR` runs the current code over this build directory
  and it is install-compatible with every check passing.
- A second `kode_build` without cleaning was refused with `BUILD_STATE_PRESENT`, as
  designed. The server's stderr was empty. The scaffold's long path (about 150 characters)
  did not break the build.
- No pipeline defect was found, so no code change came from the build. Three installer
  findings (environment class, not fixed here, because the installer belongs to the pull
  request below this one):
  1. The first run, with the default toolchain path under the state directory, failed in
     `git clone` with "Filename too long" (Windows MAX_PATH, `core.longpaths` unset), exit 128.
  2. A retry from Git Bash failed with "ERROR: MSys/Mingw is not supported" from
     `idf_tools.py`.
  3. `--firmware-only` rewrote the activation scripts without the Node 24 PATH line.
  Workaround that passed: `KODE_TOOLCHAIN_ROOT=C:/kt`, and the same unmodified script run
  from PowerShell.
- Combinations still NOT TESTED: the v0.1.0 template pinned to SDK v0.1.0; building the same
  project twice to learn what differs between images; a direct `idf.py build` (not needed,
  as the MCP build passed); a build of the fixed code (attempted, see below).

### Real build of the final code

Result: **BLOCKED**. No image was built and no inspection was run.

- Code the attempt used: commit c823f00 plus uncommitted changes (`git diff HEAD` hashed to
  git object `c3a085d4e20fa3f91daa771a37e071f50efb586e`, covering 7 tracked files, plus three
  untracked test files). Those uncommitted changes are the ones this commit records, as they
  stood when the attempt began; the commit may differ from them if code changed after that,
  which this record cannot show. The attempt therefore does not establish that a build of the
  commit passes.
- What ran: `kode_get_toolchain_status`, `kode_new_app` and `kode_validate` returned status OK
  and reason code OK (0.171 s, 0.035 s, 0.02 s). `kode_build` was started and had not
  finished when the attempt was stopped. It was stopped because the agent was told to give its
  final answer while the five-to-eight-minute compile was still running. No failure was found.
- NOT TESTED: `kode_inspect_image` on the new build (so the 13 inspection checks have not run
  on a fresh real image), the second-build refusal on the new code, the negative check
  (`neg.mjs`, written and never run), the real-build-directory test against a new build, and
  whether the worktree was left clean by that attempt.
- To repeat: `pwsh -File <scratchpad>/wf2/rebuild/run.ps1 main`, then `run.ps1 neg`, with
  `KODE_TEST_REAL_BUILD_DIR=<scratchpad>/wf2/rebuild/ws/rb_app/build`.
- The only real build that passed remains the one on 46271fa above. After it, the
  `sdkconfig.defaults` grammar, the B3 and B7 narrowing and two inspection checks were added.
  The real resolved `sdkconfig.json` of that earlier build passes the two new inspection
  checks (a test), which is not a new build.

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
| Project build logic other than the pinned template's | `validate-build-logic.test.ts`: a project made by kode_new_app and left alone (eligible, also with an added source file, CRLF endings, and a build/ directory, which affects only `kode_build`, where it is refused as build state); the reviewer's build-logic bypasses are not eligible (execute_process, a second `set(IDF_TARGET ...)`, a bracket comment, `SDKCONFIG_DEFAULTS`, `idf_ext.py` in any letter case, a hostile `main/CMakeLists.txt`, `override_path`, a local `components/kbsp`, root `sdkconfig` forms); the bounded directory walk; validation of a hand-made project stays a harmless read; `review-build.test.ts`: a project with build logic that is not the pinned template is refused before any process starts |
| Build receipts and image evidence | `review-build.test.ts`: a build records a receipt for its image, and only that exact image is observed; a receipt covers the image and both build metadata files: changing, removing or adding any one of them is not observed; a metadata file that was absent at the build is recorded as absent and does not match a present file; kode_inspect_image reports build evidence only for an image this server built |
| Install-compatible only when strict | `review-build.test.ts`: an empty or out-of-catalogue manifest, or an image the mailbox cannot hold, is not install-compatible; a manifest whose name is only spaces, or that repeats a category, is not install-compatible; a flash plan whose file is a path other than `<name>.bin` is not the mailbox plan; only 0x followed by hex digits names the mailbox offset, in either letter case of the digits; strings taken from build metadata are echoed at most 64 characters, and at most 16 flash entries are reported |
| Clean builds, the build gate and unverifiable state | `review-build.test.ts`: a build, sdkconfig or sdkconfig.old that exists before the build refuses with BUILD_STATE_PRESENT and starts nothing; the refusal names every one of build, sdkconfig and sdkconfig.old that is present; a build runs, a second build is refused, and it builds again once the state is removed; a build that trusts a pre-existing managed_components or dependencies.lock carries the warning in its outcome and message; a build-gate refusal names the rules that caused it, not the warnings beside them; a real buildApp run passes exactly the six expected arguments |
| Process tree and links at build time | `review-build.test.ts`: the deadline ends the whole process tree, not only the top process; a timeout message claims only what is known, in both branches; a process that detached itself (double fork) survives the deadline, and the message does not say it was ended; a build, managed_components or sdkconfig that is a link is refused before any process starts; a file that is a hard link to content outside the project is refused |
| Flash-call heuristic and parse bounds | `validate-build-logic.test.ts`: C12 sees the flash and OTA identifiers the review showed it missing; no parsed file can freeze the server; values echoed from a project file are capped at 64 characters; B1 and B2 are not fooled by the reviewer's inputs |
| Uniform refusals and cautions | `expiry.test.ts`: every scope gate refuses as a tool error, for every knowledge tool; a refused compatibility decision is a tool error with the first reason code and the full payload; an allowed console read says in its message that opening the port resets the Dot; the SDK contract serves release-scoped facts only for their release, and console digests for every kodeOS release; `policy.test.ts`: an allowed console read carries the cautions |
| Test records scoped to their claim | `registry.test.ts`: a test record backs only the claim it was taken for: profile, board revision, module and date |
| Build inputs idf.py reads that the gate must refuse | `wf1-gate.test.ts` section A: `CMakePresets.json`, `CMakeUserPresets.json` (any letter case, also under `main/`), `main/sdkconfig.rename` and `main/sdkconfig.rename.esp32p4` are refused with `BL-EXTRA-BUILD-FILE`, and 5 controls stay eligible |
| `sdkconfig.defaults` read as Kconfig reads it | `wf1-gate.test.ts` section B: the unset form, every assignment (`=n` then `=y`), a lone CR line break, a CR-only file, an inline `#` comment and the stock project, against D8, C2-WATCH, B4, B3 and B7. Three of these shapes (two inline comments, a lone CR) are now refusals by the grammar, not controls |
| `sdkconfig.defaults` accepted only as a closed grammar (G2-1) | `wf2-defaults-grammar.test.ts`: the shapes X1 to X15, byte cases (lone CR, 0x1C to 0x1F, DEL, NEL, BOM, non-ASCII), the type rule for tracked symbols, the pragma and deprecated markers, "is not set" near misses, fail-closed B3, B4, B7, D8 and C2-WATCH, the same byte rule for `main/idf_component.yml` and a root `sdkconfig`, a stand-in project asserting build eligibility, and the pinned template's own file |
| `idf_component.yml` scans split on a lone CR (G2-2) | `wf2-defaults-grammar.test.ts` section D (M2, M3: 2 tests each go red when the `override_path` scan or `parseDependencies` is reverted); `wf2-resolved.test.ts`: the `kode_get_evidence` not-found message (1 test goes red when reworded back) |
| Inspection reads partition table and radio from the resolved configuration | `wf2-resolved.test.ts`: `app.partition_table` (CUSTOM true, both filename keys hold the board table) and `app.radio` (boolean; esp-hosted and Bluetooth false when off); a real build's `sdkconfig.json` passes both (`KODE_TEST_REAL_BUILD_DIR`) |
| Kconfig meaning behind accepted lines (N-1) | `wf2-kconfig-semantics.test.ts`: `TWO_OTA`, `SINGLE_APP_LARGE`, `SINGLE_APP=n`, an unset-form member, `CUSTOM=y` and `OFFSET` fail B3; a deleted radio line with esp-hosted or Bluetooth not set to n fails B7; untouched projects stay eligible |
| C12 splices and the include warning | `wf1-gate.test.ts` section C: backslash with spaces, tab, form feed, CRLF or a lone CR before the line break; a BOM; form feed and vertical tab around `#`; CR-only line endings; absolute, drive-letter, backslash, macro, `%:`, `??=`, `include_next`, `import` and spaced includes warn; four plain includes do not |
| Inspection reads the resolved configuration | `wf1-build-report.test.ts`: `KODEOS_HOME_HOLD` and `KQP_AO_WATCH` true gives install-compatible with 13 checks; absent, false or the string "true" in `sdkconfig.json` fails `app.home_hold` or `app.ao_watchdog` (3 tests each); a missing `sdkconfig.json` fails both; a real build directory (`KODE_TEST_REAL_BUILD_DIR`) inspects as install-compatible |
| A finished build is not reported as a timeout | `wf1-build-report.test.ts`: exit 0 and exit 3 with the output held open are reported by exit code; a normal exit has no `outputHeldOpen`; a process that never exits is still a timeout with no exit code; `buildApp` carries the fact and the sentence for exit 0 and for `BUILD_FAILED` |
| Registry scoping, dates and module claims | `wf1-registry.test.ts`: a scoped claim on an unknown revision is refused; a two-revision scope needs a record for each; a claim cannot be recorded before its observation; impossible dates are refused; a board claim or another module's claim under the maker module is refused; a future-recorded claim is not applicable and the detail says so; one day ahead is still applicable; the shipped registry loads and every shipped claim is applicable |
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

### Confirmation pass on the fixes

After the fixes above, a confirmation pass re-ran the original reviewer's inputs against the
fixed code. All 13 original inputs were fixed. Six findings were closed outright. Seven had a
further variation that still got through; each was addressed in a second fix pass.

| Finding | Outcome of the confirmation | Second fix pass |
|---|---|---|
| 1 | Original input fixed; a variation got through | Clean build required; unverifiable-SDK warnings carried into the build result; `Kconfig*` files refused |
| 2 | Original input fixed; a variation got through | Clean build required |
| 3 | Original input fixed; a variation got through | Timeout message claims only what is known: attached processes ended, a detached process cannot be tracked |
| 4 | Original input fixed; a variation got through | C12 scans every text file under `main/` and joins line splices; warns on includes that leave `main/` |
| 5 | Original input fixed; a variation got through | Clean build required |
| 7 | Original input fixed; a variation got through | Unscoped claims are checked against the profile's known board revisions; any record behind a module claim must name the module |
| 9 | Original input fixed; a variation got through | Receipt extended to `build/config/sdkconfig.json` and `build/flasher_args.json` |
| 6, 8, 10, 11, 12, 13 | Closed outright | None needed beyond smaller hardening of 13 (echo caps, mailbox offset, manifest name and categories, reserved project names) |

The second fix pass was checked by re-running the confirmation scripts against the
integrated code. What they printed:

| Bypass | Result on re-run |
|---|---|
| Planted `build/CMakeCache.txt` that includes project CMake (1) | `refused BUILD_STATE_PRESENT`, runner calls 0 |
| Junction inside `build/` (2) | `refused BUILD_STATE_PRESENT`, runner calls 0 |
| Root `sdkconfig` with a hostile partition table setting (5) | `refused BUILD_STATE_PRESENT`, runner calls 0 |
| Process that detaches itself before the deadline (3) | Still survives. The message now says attached processes were ended and that a detached process cannot be tracked |
| `.c++`, `.cp`, `.sx`, `.hxx` sources, an included `.txt`, a line-spliced identifier (4) | C12 fails each |
| Record for an unknown revision on an unscoped claim; board-level record behind a module claim (7) | Both refused |
| Build metadata edited by hand after a real build (9) | `buildObserved=false` |
| 200,000-character flash file name (13) | Echoed at 64 characters |

Still passing on that re-run, and listed under residual risks or documented limits rather
than fixed: an identifier assembled by macro concatenation; a header outside `main/` reached
by a relative include (now reported by the `C12-INCLUDE` warning); flash-related functions
outside the families C12 lists; and source placed under `appdata/`, which C12 does not scan.

The second fix pass was written by the same kind of agent as the first. At the time of the
confirmation pass it had no independent adversarial review; it has one now (next section).
The confirmation scripts showed the demonstrated bypasses closed; they did not show that no
other bypass exists, and the next review found some.

### Independent review of the second fix round

A further independent review read the code at commit 46271fa and tried to break each claim
of the second fix round, by running scripts (r1 to r8) against the real kode-app-template and
the real pinned template list, with Node 24.22.1 and `tsx` over `src/`. Where a finding
depended on ESP-IDF behaviour it read the ESP-IDF v6.1.0 source; it also ran cmake 3.29.2 and
a clang preprocessor (zig cc) on their own. It found 7 problems: 1 high, 1 medium and 5 low.
It did not run `npm run build` or `npm test`, and it left the worktree clean.

Claims that held: clean build (13 forms of `build/`, `sdkconfig`, `sdkconfig.old`, none
started a process), receipts (a byte change to either metadata file, or a deleted one,
gives not observed), image inspection (18 cases) and project names (25 names). The review
found nothing that the second fix round broke.

| # | Severity | Finding | What was done |
|---|---|---|---|
| F1 | high | `CMakePresets.json` and `CMakeUserPresets.json` in the project root passed the gate. In the ESP-IDF v6.1 source, idf.py loads them and passes `--preset` to cmake, and cmake run alone with the same arguments ran a file named by the preset. The README sentence "build logic has not been altered" was untrue | Fixed: refused at any depth. Closed by both gates. The idf.py half is from source reading, not run |
| F2 | medium | `# CONFIG_X is not set` in `sdkconfig.defaults` was not read, so hold-BOT or the watchdog could be turned off and a later `KODEOS_BOOT_ROLE_OS=y` passed B4; a build then reported install-compatible | Fixed for the reported inputs (static rules, plus the resolved-configuration checks). Partly open: see G1-1 and G2-1 |
| F3 | low | The include warning missed absolute, macro and digraph includes; a backslash-space-newline splice was not joined | Fixed for the reported inputs. Neighbours found by the gates, G1-2, fixed |
| F4 | low | A build that exited 0 was reported as `BUILD_TIMEOUT` when a detached child held the output pipes | Fixed: the exit event is used. The rerun gave exit code 0 after about 2.1 s |
| F5 | low | SKILL.md and `/new-kode-app` said `BUILD_TIMEOUT` meant the processes were ended; the code also returns it when ending was not confirmed | Documentation corrected |
| F6 | low | Registry: (a) a scoped claim on an unknown revision, (b) an observation after the claim was recorded, (c) a 1970 observation, (d) a board claim under a module were accepted | (a), (b), (d) fixed, and a claim recorded in the future is not applicable. (c) is not fixed: needs an owner decision |
| F7 | low | This record named `BUILD_STATE_PRESENT` for a linked `build/` or `sdkconfig`; the code gives `WORKSPACE_ESCAPE` | Documentation corrected; no safety effect |

Before the fixes the planner also found, by running kconfgen 3.14.0 alone, that a
`main/sdkconfig.rename` line with `!` inverts a protected setting (`KODEOS_HOME_HOLD`
resolved to false). The review had judged that file harmless. It is refused now.

The fixes were made in three packages (build gate and static rules; what a build reports;
registry), then checked by two gates (a gate is a further independent review of the changed
code).

**Gate 1** (re-ran the review's scripts; broke 24 guards): F1 and F4 closed; F2, F3 and F6
partly closed; F5 and F7 were documentation items. New findings:

- G1-1 (medium): `sdkconfig.defaults` was still not read as kconfgen reads it. A lone CR is a
  line break and an inline ` # comment` is stripped (both run with kconfgen 3.14.0). Inputs
  such as `# note<CR>CONFIG_KODEOS_HOME_HOLD=n` passed D8, C2-WATCH, B4, B3 and B7.
- G1-2 (low): C12 missed a CR-only splice, and the include warning missed a BOM, form feed
  or vertical tab, and CR-only line endings.
- G1-3 (low): a claim made not applicable by the new future-date rule was refused with a
  detail naming a different release or revision.

A fix round closed G1-1 and G1-2 as reported, and G1-3, and found one more bypass of its
own (a name after a CR-only `//` comment was hidden); all have tests. After that,
`npm test` gave 269 tests, 267 pass, 0 fail, 2 skipped.

**Gate 2** (on the final code; read it; 16 guard checks): F1, F3, F4, G1-2 and G1-3 closed;
F2, F6 and G1-1 partly closed. New findings:

- G2-1 (medium; open when gate 2 of round two reported it, closed in round three): lines that kconfgen reads differently from the validator still pass.
  Run with kconfgen 3.14.0: Python `strip()` removes control bytes 0x1C to 0x1F and U+0085;
  a bool value of `no` or empty reads as n; kconfgen ignores `CONFIG_X =v`,
  `#  CONFIG_X  is not set` (extra spaces), lines inside a deprecated-options block and an
  assignment after `# default:`. B3 and B7 are fully bypassed (for example
  `CONFIG_KODEOS_RADIO=no` with `ESP_HOSTED_ENABLED=y`, or a `mine.csv` partition table
  name that the validator hides), and with synthetic outputs `kode_build` reached
  `kodeos_install_compatible` for them. D8, C2-WATCH and B4 are bypassed by the static rules
  only; the resolved-configuration checks catch them after the build has run. The validator's
  own comment that "reading wider can only refuse more" is false for the last-value rules B3
  and B7. The gate's suggested fix is to refuse any line that is not a plain comment, blank,
  or an exact assignment, or to add resolved-configuration checks for B3 and B7. Both were done in round three.
- G2-2 (low; closed in round three): the changes that split `idf_component.yml` scans on every line break, and the
  reworded not-found message in `kode_get_evidence`, are guarded by no test. Reverting them
  left the suite green. With the scan change reverted, a lone-CR `override_path` passes
  rule B1 again, although `BL-SDK-PIN` still refuses the build. Tests were added in round three.

### Round three: G2-1 and G2-2

Three rounds had each fixed the reported `sdkconfig.defaults` line shapes and left a
neighbour, because the validator tried to imitate esp-idf-kconfig's reader. Round three stops
imitating. The accepted grammar, the byte rule and the types enforced for the tracked symbols
are described under the gate's list above. A file the validator cannot read with certainty
makes the project not eligible (`BL-DEFAULTS-GRAMMAR`) and fails the verdict
(`CK-DEFAULTS-GRAMMAR`), and the rules that read it fail closed.

One bypass was found while proving the grammar and is closed by the type rule: a tracked bool
given a number is ignored by kconfgen (it keeps the earlier value), but a reader that took the
value at face value saw "not n". For example `CONFIG_KODEOS_RADIO=n`, then
`CONFIG_KODEOS_RADIO=0`, with `CONFIG_ESP_HOSTED_ENABLED=y`: kconfgen has the radio off and
esp-hosted on, and B7 would not have applied.

**G2-1 proof.** `proof.mts` (kept with the round's scratch files, not in the repository) runs the real
kconfgen 3.14.0 (ESP-IDF v6.1 tools, `python -I -m kconfgen`) on toy Kconfig files and compares
what it resolves with what the validator reads: (1) every accepted value form of every type, in
four file layouts (LF, CRLF, no final newline, comments and blank lines), 124 cases; (2) 600
random files drawn from the grammar over the tracked symbols, checking that the validator's
last value is kconfgen's value for each tracked bool and the partition table, and that whenever B3,
B4, B7, D8 or C2-WATCH passes, kconfgen resolved what the rule demands, and that B7 is applied
exactly when kconfgen has the radio off; (3) the pinned template's own `sdkconfig.defaults`, line
by line; (4) a control: the seven shapes gate-2 found are refused, and the round-two reader
disagreed with kconfgen on six of them, so the harness does see a disagreement. 5464 checks, all
equal. Mutation checks of the guards: every one turned tests red.

**G2-2.** `wf2-defaults-grammar.test.ts` section D reverts to red when the `override_path` scan or
`parseDependencies` stops splitting on a lone CR, and `wf2-resolved.test.ts` when the
`kode_get_evidence` message is reworded back.

#### Gates of round three

Two further gates read the code and ran it. Neither changed the worktree (`git diff HEAD`
hashed the same before and after).

**Gate 1** (the round-three code as first written). G2-1 closed, G2-2 closed. Harness
`grammar.mts`: 87,498 whole-file cases in one real-template project, 26,718 accepted and each
resolved by the real kconfgen 3.14.0 through its entry point on a toy Kconfig with the real
tracked names and types, 279,409 comparisons, 0 disagreements. The cases were every accepted
form in three layouts (730), then mechanical edges: each code point U+0000 to U+00FF and 22
Unicode separators at every position class, raw bytes 0x80 to 0xFF, every one-character
substitution and deletion, and 8 kinds of line break. No raw byte and no line-break variant
was accepted. B3, B4, B7, D8 and C2-WATCH outcomes were not vacuous (for example B7: 22,286
absent, 221 pass, 4,211 fail). The re-run gate scripts (x1, n1, r2b, r2-gate) refused every
earlier shape, and `kode_build` of X1, X6 and X13 starts no process. Two new low findings:

- N-1: Kconfig meaning, not reading. `CONFIG_PARTITION_TABLE_TWO_OTA=y` (or
  `SINGLE_APP_LARGE`) passed B3 although kconfgen resolved a different table, and deleting
  `CONFIG_KODEOS_RADIO=n` while setting `CONFIG_ESP_HOSTED_ENABLED=y` passed because B7 was not
  applied. The build then started and only the resolved-configuration checks stopped it at
  `compiled_image`.
- N-2: this record and `mcp/README.md` still said 11 checks, or only three resolved settings.

Both were fixed (see the first bullet of the residual risks for the narrowing, and the
documents for the counts), and the gate scripts `route-choice.mts` and `route-radio.mts` went
from `verdict=pass eligible=true` to `verdict=fail` with `kode_build` refused
`VALIDATION_FAILED` and `processStarted=0`.

**Gate 2** (the final code: grammar unchanged since gate 1, plus the B3 and B7 narrowing).
G2-1 closed, G2-2 closed, N-1 closed, N-2 closed. Harness `grammar2.mts`: 118,655 cases, 37,555
accepted, each resolved by the real kconfgen 3.14.0 twice, once on the toy Kconfig (reading)
and once on the real kdefs, kaos, kqp, esp_hosted and ESP-IDF v6.1 partition-table Kconfig
with the real board file loaded first (meaning, 343 symbols, including every real symbol in
every value form). 0 reading disagreements in 609,692 comparisons. The legitimate edits of a
scaffolded project pass and reach `kodeos_install_compatible`: untouched; added
`CONFIG_FOO=y` and `CONFIG_BAR="text"`; the KLOG hint uncommented; the radio turned on; LF line
ends; radio `y` with the esp-hosted and Bluetooth lines deleted; an added int and unset
line. A trailing space after a value is refused, as the grammar intends. Two new low
findings, both fail-safe, neither a bypass:

- NEW-1: the template's own comment "To turn the network on, delete the three lines below"
  now fails B7 (`verdict=fail`, `eligible=true`, `kode_build` refused with
  `processStarted=0`), although kconfgen resolves a safe all-off state. The B7 message tells
  the user to make `CONFIG_KODEOS_RADIO=y` the last radio line, which is accepted. The template
  comment is upstream and GPL and is not edited here.
- NEW-2: `CONFIG_APP_NO_BLOBS=y` passes statically. kconfgen then treats `BT_ENABLED` as
  invisible and leaves it out of the resolved json, so `app.radio` (which needs
  `BT_ENABLED === false`) fails after the build and the image stays at `compiled_image`,
  although Bluetooth cannot be on. 21 of the gate's semantic comparisons came from this one
  line. Whether a real `sdkconfig.json` omits `BT_ENABLED` is inferred from kconfgen's json
  writer, not observed in a build.

Not covered by either gate: environment inputs (`SDKCONFIG_DEFAULTS`), and a
`sdkconfig.rename` file inside a managed component. Gate 2 found none in ESP-IDF v6.1 or the
pinned components that maps a name onto a tracked symbol, and nothing there selects or
implies `BT_ENABLED`, `ESP_HOSTED_ENABLED`, `KODEOS_RADIO` or a partition-table choice
member (the one exception, `PARTITION_TABLE_MD5`, is read by no check).

State of the review items at the end of this work: closed F1, F2 and G1-1 (both under G2-1),
F3, F4, F5 (documentation), F7 (documentation), G1-2, G1-3, G2-1, G2-2, N-1, N-2. Open:
F6 part c (owner decision), NEW-1 and NEW-2 (both low, fail-safe). The last gate read the
final code; this record was written after it. The real build did not run on that code
(BLOCKED, above).

Deferred, with the reason:

- F6 part c (a very old observation backs a claim): the age limit is a policy value
  nobody has set, and proposed ADR-0011 says no arbitrary threshold is to be invented.
  The shipped registry has no physical records. Owner decision.
- An L1 host-build record in the registry for the real build: not added. The record shape
  needs a board revision (`board.profileId` and `board.revision`), and
  `kode_get_evidence` states that no L1 to L4 record exists. Owner decision.
- An unscoped physical claim reads as proof for every revision the profile knows. Latent,
  because the profile knows one revision (DVT). Not changed.
- Installer hardening (long paths, Git Bash refusal, the Node line in activation scripts):
  `scripts/setup_environment.py` belongs to the pull request below this one.
- The manufacturer's catalogue checker (`kcheck` rules C and D) compares only with `n`, so
  it has the same "is not set" gap. It is upstream GPL code; nothing was copied. After
  these fixes this server is stricter than the checker on those two rules.
- Not tested by the review: a real `idf.py` run with a preset file; `esp-idf-kconfig`
  behaviour was later run with kconfgen alone; the component manager's use of a planted
  `dependencies.lock`; `build/flash_args` (idf.py flash reads it; receipts and inspection
  do not); the POSIX kill path; two builds at once; `fsutil setshortname` (needs admin).
  A `flasher_args.json` over 256 KiB is refused with the reason code `VALIDATION_FAILED`,
  a misleading name; not changed.

### Residual risks

- `kode_build` is not a sandbox. The SDK's own build scripts run, the component manager
  fetches the SDK by tag, and a pre-existing `managed_components/` or `dependencies.lock`
  cannot be verified (`BL-UNVERIFIABLE`). The first defect was never reproduced through
  idf.py; the preset bypass (F1) was reproduced with cmake alone and its idf.py half read
  from source. A real ESP-IDF is now installed on the development host, so this can be run.
- The gate is a list of the project inputs ESP-IDF v6.1 reads, and the first review of the
  second round found the list incomplete once. Other inputs may exist. Inputs driven by the
  operator's environment (`IDF_EXTRA_ACTIONS_PATH`, `SDKCONFIG_DEFAULTS`, `EXTRA_CFLAGS`,
  `IDF_EXTENSION_ALLOW_UNTRUSTED`) are outside what MCP can set and are not modelled.
- **Closed, gate-checked (G2-1, G2-2, N-1):** the `sdkconfig.defaults` rules no longer model
  Kconfig's reader. A file with any line outside the grammar is refused whole, B3 and B7 are
  also checked in the resolved configuration, and B3 and B7 are narrowed as described under
  the static rules. Two independent gates found no reading disagreement with kconfgen 3.14.0
  on the accepted grammar. The grammar does not cover environment-driven or SDK-supplied
  inputs: a rename file shipped inside a managed component could map an old name onto a
  tracked symbol (none exists in the pinned set), and `SDKCONFIG_DEFAULTS` comes from the
  operator's environment.
- **Open (NEW-1, low, fail-safe):** deleting the template's three radio lines, as its own
  comment says to turn the network on, is refused by B7. Setting `CONFIG_KODEOS_RADIO=y` is
  accepted. The cost of not reading Kconfig defaults.
- **Open (NEW-2, low, fail-safe):** `CONFIG_APP_NO_BLOBS=y` passes statically, then `app.radio`
  fails after the build because `BT_ENABLED` is absent from the resolved configuration. A
  false refusal, not a bypass; inferred, not observed in a real build.
- Kconfig meaning can still change a protected value through accepted lines that no static
  rule names. Only the five resolved-configuration checks catch that, after the build has
  run.
- **Open (F6 part c):** an old test record still backs a physical claim until the owner sets
  a maximum age. The shipped registry has no physical records.
- Rule C12 is a source heuristic. Token pasting, trigraph splices, a prebuilt library and
  includes the heuristic cannot see defeat it, and it is not a substitute for checking the
  built ELF. It was compared with clang, not GCC.
- A build can still report a stage from files whose resolved configuration was checked for
  five settings (app role, hold-BOT, watchdog, partition table, radio trio), and not at all for settings outside those.
- `build/flash_args`, which `idf.py flash` reads, is outside the receipts and the
  inspection. The server never flashes.
- Two `kode_build` calls on one project at once, and the POSIX process-group kill path,
  were not tested.
- One real build passed (commit 46271fa). The attempt to build the code after it was BLOCKED
  (cut short, no failure found); that code has not been built for real.
- Build receipts last only for the server process. After a restart every image is
  unattested until it is rebuilt.
- A process that detaches itself outlives a timed-out build. The deadline ends the build
  process and what is still attached to it; the timeout message says a detached process
  cannot be tracked.
- A pre-existing `managed_components/` is still trusted, with a warning
  (`BL-UNVERIFIABLE`, repeated in the `kode_build` result).
- `kode_get_sdk_contract` and `kode_get_evidence` return `ok` while their payload includes
  the conflicting claims. The conflict is stated in the payload, not in the status.
- `kode_get_module_spec` for an unknown module returns `unsupported`. That is an answer, not
  a tool error.
- The check-then-open race on workspace files is narrowed, not closed.
- Claude Code's own shell remains outside MCP policy.

## Manual validation checklist

Items marked done were done by the workflow on the development host, on commit 46271fa (except the G2-1 item, which is a code and gate item), and
are not a person's validation on a device. Everything else has not been done and needs a
person with the stated hardware or host.

- [x] Install ESP-IDF v6.1 (commit `fff9895c82d744c7237be8847347bdd1b07c6643`), activate it,
      and run `kode_get_toolchain_status`: done; the commit matches the pin. Run the
      installer from PowerShell with a short `KODE_TOOLCHAIN_ROOT` such as `C:/kt`.
- [x] Set the host variables; run `kode_new_app`, `kode_validate`, `kode_build` and
      `kode_inspect_image` on a real project: done once, image digest
      `c7c127fe...9e3c5b` (full value above). Repeat on the final commit: not done.
- [ ] Build a scaffolded project against kode-sdk v0.1.0 (the v0.1.0 template against SDK
      v0.1.1 is done, once).
- [x] Confirm the generated `flasher_args.json` is the single mailbox entry on a real build:
      the inspection reported `mailbox_only` at `0x1a00000` for `rb_app.bin`.
- [ ] Rebuild the unmodified template on the final code and check 13 of 13 inspection checks.
      Attempted once and BLOCKED (cut short); the optional test covers the older build
      directory only. Then run `run.ps1 neg` and the second-build refusal.
- [ ] Run the CMake preset attack through a real `idf.py` with a harmless marker file, to
      move F1 from "read in source" to "executed". Build only, no device.
- [x] G2-1: done (the grammar refusal and the resolved-configuration checks) and checked by
      two gates; see "Round three" above.
- [ ] Decide on NEW-1 (accept the refusal of the deleted radio lines, or ask for a different
      message) and NEW-2 (accept the false refusal for `CONFIG_APP_NO_BLOBS=y`).
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
