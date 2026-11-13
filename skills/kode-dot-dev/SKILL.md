---
name: kode-dot-dev
description: Develop kodeOS apps for the production ESP32-P4/C5 Kode Dot with the official GPL-licensed kode-sdk (v0.1.1 pinned, v0.1.0 assessed), ESP-IDF v6.1 and evidence-gated workflows. Use for capability and compatibility questions, pinout and module evidence, Active Objects, app scaffolding, validation, compilation of unaltered scaffolded projects and image inspection through the Claude Kode MCP tools, and read-only console diagnosis.
---

# Kode Dot development — production P4/C5

Use the production ESP32-P4 plus ESP32-C5 device. The unreleased ESP32-S3
prototype in `archive/esp32-s3/` is historical only: never use its pins,
partitions, uploader, `app_name` mechanism or firmware on a shipping Dot.

Start with `${CLAUDE_PLUGIN_ROOT}/skills/kode-dot-dev/references/production-workflow.md`.
Review `${CLAUDE_PLUGIN_ROOT}/docs/research/2026-11-11-official-kodeos-sdk-source-audit.md`
when available; otherwise read the pinned upstream release source directly.
The 3 November discovery records contain now-obsolete closed-source / no-manifest
claims. Proposed ADR-0017 documents the correction; it is not ratified yet.

## What this plugin can and cannot do

The MCP server (`claude-kode-feasibility`, version 0.2.0) answers questions
from a registry of manufacturer facts, scaffolds and validates app projects,
compiles a scaffolded project with the fixed `idf.py build` command (it is not a
sandbox), and inspects the resulting image. It can also
perform four fixed read-only console operations (`kode_ping`, `kode_boot_info`,
`kode_list_apps`, `kode_capture_screen`), but only when the operator has set
`KODE_ENABLE_CONSOLE_READS=1`, and opening the USB serial port can reset the
Dot. None of this has been run against a physical device: no Dot was attached
at any point while the tools were written. Everything the tools report about
hardware is manufacturer source, not observation.

There is no tool for installing an app, flashing, erasing, updating kodeOS or
the C5, detecting a device or module, or driving any module, radio or actuator.
Several of these appear in the design catalogue but are specified, not
implemented; do not tell a user that one exists. If a request needs one of
them, say so and name the evidence that would have to exist first.

## Upstream sources and the version pin

Everything below is manufacturer source at a tag, read by this project. It is
source-verified, not tested on a Dot.

- [kodeOS v0.1.1](https://github.com/kodediy/KodeOS/releases/tag/v0.1.1):
  launcher, bootloader, host console, installer and mirroring utilities.
- [kode-sdk v0.1.1](https://github.com/kodediy/kode-sdk/releases/tag/v0.1.1):
  board definition, peripherals, Active Objects, `kode.h` and `kode_sys.h`.
- [kode-app-template v0.1.0](https://github.com/kodediy/kode-app-template/releases/tag/v0.1.0):
  the only template release; official application template and `KODE_APP_MANIFEST`.
- [C5 firmware v0.1.1](https://github.com/kodediy/kode_slave_c5/releases/tag/v0.1.1):
  ESP-hosted wireless coprocessor; the production C5 accepts only vendor-signed images.
- [kode-apps catalogue](https://github.com/kodediy/kode-apps/blob/main/RULES.md):
  published validation, manifest, licence, SDK pin and RAM budget rules.

The pin moved from v0.1.0 to v0.1.1 for kode-sdk, kodeOS and the C5 firmware
during this work, after the audit compared the two tags file by file for
everything the registry cites. For a reader this means three things. Release
v0.1.0 remains an assessed previous release, so facts recorded for it are still
usable. Any other release is refused (`SDK_RELEASE_NOT_ASSESSED`,
`KODEOS_RELEASE_NOT_ASSESSED`) rather than guessed at, because an unaudited
release may have changed what the registry relies on. And the conflict over
flash offsets described below still stands, because the partition table and the
other files the conflict depends on are byte-identical in both tags.

v0.1.1 also changed `kcli.py`, added Kody artwork to the SDK notice, mounts
microSD on one data line, adds a receive-only Wi-Fi frames service and adds
file, audio and BLE calls to `kode.h`. The template still pins SDK v0.1.0;
`kode_new_app` edits its `version:` line in `main/idf_component.yml` to v0.1.1
by default. A v0.1.0 template built against SDK v0.1.1 has been built once by
this project (a real ESP-IDF v6.1 build, run twice; the second run is the
authoritative one). That is build evidence only.

kodeOS can update itself ("About offers a newer kodeOS and installs it from
there"), so a Dot may be running a release nobody assessed. The installed
release must be read from the device and never assumed from what the user says.

## The SDK architecture an app must respect

The SDK owns every peripheral through QP/C Active Objects, and each device has
exactly one owner. An app that wants a device sends that owner a message; it
does not open the peripheral itself. This is why two parts of an app cannot
both drive the same bus: the single owner serialises access, and bypassing it
breaks that guarantee.

An Active Object must never block. It runs a run-to-completion event loop, so
one blocking call stalls every event queued behind it. Work that has to wait
goes to the object's `kode_worker` as a job, and the object handles the
matching completion event when it arrives. A worker job must not touch flash or
NVS, because those routines are unsafe to call while executing from PSRAM.

Use `kode.h` from ordinary tasks, where blocking calls are acceptable, and
`kode_sys.h` from Active Objects, where requests are non-blocking and answered
by events. When an object needs the current state of something, subscribe to
the relevant event before asking for it. Asking first leaves a gap in which the
answer can be published before the subscription exists, and the object then
waits for a message that has already gone.

## Manifests and packaging

An app is a complete firmware image, not a shared library or an in-process
plug-in. kodeOS installs it into the apps region and boots it through a
modified bootloader, so kodeOS and the app run on separate boots. Because the
whole image is the unit, its identity must be correct inside the image itself.

The project name given to `project(<name>)` is the app's identity: 1 to 31
characters of lowercase letters, digits and underscores, and never `kodeos`,
`c5_slave` or a Windows reserved device name such as `con`, `nul`, `com1` or
`lpt1`. `PROJECT_VER` gives
the version. `KODE_APP_MANIFEST("Display name", "category")` embeds the display
name and categories in the image. `appdata/app.json` and the icon and
screenshot files carry catalogue presentation, and are separate from the
embedded manifest. Let `kbsp/sdkconfig.board` supply actual P4 memory, pins and
the partition layout, and keep `CONFIG_KODEOS_BOOT_ROLE_APP=y`; without it,
`idf.py flash` would target kodeOS's own slot. Never copy S3 pins or write a
flash layout from memory.

## Working in order with the tools

Ask before proposing. Check what is recorded before suggesting any design, and
treat the answer as the limit of what you can claim.

1. `kode_get_capabilities` and `kode_check_compatibility` (profile
   `kode-dot-p4c5`). The first lists capabilities with their evidence states;
   the second evaluates one named operation and returns `allowed` or `refused`
   with reason codes. `allowed` only says the evidence threshold is met. It is
   advisory and never authorises anything, and no argument can supply an
   approval. A refusal comes back as a tool error whose `reasonCode` is the
   first reason, with the full decision in the payload. An allowed read that
   opens the serial port carries `cautions`: opening the port resets the Dot,
   and the identity and installed kodeOS release of whatever is on the port
   are unverified. Relay those cautions to the user; do not drop them because
   the decision says `allowed`. Called with no `capability`,
   `kode_get_capabilities` answers `not_verified` (`EVIDENCE_CONFLICTING`)
   because the full list includes the two contradicting flash-offset claims;
   ask for one capability at a time when you need a clean answer. Raw flash, erase, OS update, C5 update and standalone firmware are
   refused categorically; install is refused while the evidence conflicts, no
   device identity has been observed and no approval channel exists.
2. `kode_get_pinout` for any pin question, in place of pin numbers recalled
   from memory or from the S3 prototype. It returns J3's fourteen logical
   positions, ADC channels, controllers and the pins the board itself owns, and
   it refuses a GPIO that is not on J3. The positions are the SDK's logical
   numbering, not physical header pins, and J3's electrical limits are unknown.
   `kode_list_modules`, `kode_get_module_spec` and `kode_get_evidence` give the
   module catalogue and the evidence ledger.
3. `kode_get_sdk_contract` for the toolchain, manifest rules, image layout,
   partitions, hazards and licences of the pinned release.
4. `kode_get_toolchain_status` to see whether the host is configured to build.
   It reads configuration only and starts nothing.
5. `kode_new_app`, then `kode_validate`, then `kode_build`, then
   `kode_inspect_image`. These take a project name, never a path, and operate
   inside the operator's workspace. Scaffolding needs `KODE_WORKSPACE_ROOT` and
   a template checkout (`KODE_TEMPLATE_DIR`, verified against the v0.1.0 tag).
   Building additionally needs `KODE_ENABLE_BUILD=1`, `KODE_IDF_PATH` and
   `KODE_IDF_PYTHON`, and the server must have been started from an activated
   ESP-IDF v6.1 environment. `kode_build` runs the fixed command `idf.py build`
   once, without a shell and within a time limit. It is not a sandbox: it runs
   the SDK's build scripts and fetches the SDK over the network, so the user
   should build with no Dot attached.

   `kode_validate` returns two separate things: a `verdict` from static rules,
   and `buildLogic.eligible`, which says whether `kode_build` will accept the
   project. A project can pass the verdict and still be ineligible, so read
   both. The reason is that `idf.py build` executes the project's CMake and
   would import a project `idf_ext.py`; fixing the command line does not limit
   that. So `kode_build` builds only a project whose build logic is the pinned
   template's, and refuses anything else with `BUILD_LOGIC_NOT_PINNED`
   (findings are named `BL-...`). For a project you intend to build, do not add
   an `idf_ext.py`, extra `*.cmake` or `CMakeLists.txt` files, a `components/`
   directory, per-target `sdkconfig.defaults.<x>` files, `CMakePresets.json`,
   `CMakeUserPresets.json`, `sdkconfig.rename` files or links, and do not
   rewrite the root `CMakeLists.txt` or `main/idf_component.yml`. What is yours
   to edit: source files, `sdkconfig.defaults`, `appdata/`, and the `SRCS` list
   in `main/CMakeLists.txt`, which must stay a single plain
   `idf_component_register(...)` call.
   `sdkconfig.defaults` is read strictly. Only these lines are accepted:
   an empty line; a `#` comment (not `# default:` or a deprecated-options
   marker); exactly `CONFIG_NAME=value` with no space around `=`, no inline
   comment and a value of `y`, `n`, a number or a quoted string of printable
   ASCII with no backslash; and exactly `# CONFIG_NAME is not set`. Only
   printable ASCII, tab, LF and CRLF are allowed. The app role, OS role,
   hold-BOT, watchdog, radio, esp-hosted and Bluetooth settings take only `y`
   or `n`. Any other line makes the whole project ineligible and the verdict
   fail, with `BL-DEFAULTS-GRAMMAR` and `CK-DEFAULTS-GRAMMAR` and a message
   `sdkconfig.defaults line N cannot be read with certainty`. Do not set any
   other `CONFIG_PARTITION_TABLE_*` symbol. To turn the radio on, set
   `CONFIG_KODEOS_RADIO=y`; deleting the three radio lines is refused unless
   esp-hosted and Bluetooth are set to `n`. If the app genuinely needs more build
   logic, say that `kode_build` cannot build it and stop; do not route around
   the gate. The gate also refuses any file whose name starts with `Kconfig`
   (any letter case), so do not add one; that is a precaution, not a
   demonstrated exploit. A leftover `managed_components/` or
   `dependencies.lock` is reported as `BL-UNVERIFIABLE`: the server cannot
   check it, so suggest the user delete it. `kode_build` repeats that warning
   in its own result (`buildLogicWarnings`), so relay it.

   Every build starts clean. `kode_build` refuses with `BUILD_STATE_PRESENT`
   while `build/`, `sdkconfig` or `sdkconfig.old` exists in the project,
   because state that exists before a build cannot be told apart from state
   someone planted, and a planted `build/` or `sdkconfig` can change what the
   build runs. So after `kode_build` succeeds, call `kode_inspect_image`
   first, while `build/` is still there. To build again, remove `build/`,
   `sdkconfig` and `sdkconfig.old` with your own file tools, then call
   `kode_build`. The server does not delete them; it never removes files it did
   not create in the same call. Removing them is expected and safe, because a
   build generates all three. This removes one way of planting state ahead of
   a build; it does not make a build safe, and it is still not a sandbox.

## Reading a result

Every tool returns the same envelope. `status` is `ok`, `refused`,
`not_verified`, `unsupported` or `failed`; `reasonCode` is a value from a closed
list you can branch on; `verifiedLayer` says how far the answer was actually
checked (`none`, `documentation`, `source`, `build`, `simulation`, `device`,
`integration`); `requiredNextEvidence` lists what is still missing.
`hardwareAuthorized` is always `false`. A refused or failed result is also an
MCP tool error, so it cannot be mistaken for success. That includes the scope
gates on every knowledge tool (`PROFILE_UNKNOWN`, `SDK_RELEASE_NOT_ASSESSED`,
`BOARD_REVISION_NOT_IN_PROFILE`); `not_verified` is kept for an answer that is
served but cannot be relied on, such as stale or conflicting evidence.

Never promote `verifiedLayer`. A `source` answer is a manufacturer's file, a
`build` answer is a compiled image, and neither is evidence about a Dot.
`kode_inspect_image` keeps four stages apart: a source project; a compiled
image; an image compatible with kodeOS installation, which is a source-level
judgement (P4 chip id, app descriptor identity, ESP-IDF v6.1, the `KAPD`
manifest, the app boot role, `KODEOS_HOME_HOLD` and `KQP_AO_WATCH` both true in
the resolved configuration, a generated `flasher_args.json` with a single
mailbox entry, size limits); and a device-verified image, which this project
never claims and always reports as `NOT TESTED`. The install-compatible
judgement is strict: the manifest needs a display name of 1 to 31 characters
and 1 to 4 catalogue categories, and the image must fit the mailbox, with a
flash plan naming exactly `<name>.bin`.

Files under `build/` can be written by anything, so `kode_inspect_image` gives
`ok` and `verifiedLayer: build` only for an image `kode_build` produced in this
server session. The record covers three files: the image,
`build/config/sdkconfig.json` and `build/flasher_args.json`, and changing any
of them gives `BUILD_NOT_OBSERVED`. For any other files, including a project
built earlier or by hand, it returns `not_verified` with `BUILD_NOT_OBSERVED`
and `verifiedLayer: none`; the payload (`buildObserved: false`) only describes
the files and is not build evidence. The record is held in memory, so a server
restart clears it. To get an observed image again, remove `build/`, `sdkconfig`
and `sdkconfig.old` and run `kode_build` again.

`BUILD_TIMEOUT` means the build process had not exited at the deadline. Read the
message: either the build process and what was still attached to it were ended,
or ending them was not confirmed, and they may still be running. A process that
detached itself cannot be tracked and may still be running in either case, so
tell the user which one the message says and do not say the build left nothing
behind. A build whose process exited is reported by its exit code, never as a
timeout. If the result carries `outputHeldOpen: true`, something the build
started still held its output open; it was not ended and may still be running,
so relay that.

When a tool refuses, report the `reasonCode`, the message and the
`requiredNextEvidence`, and stop. A refusal means a precondition is absent, so
getting around it with a shell command, a raw `esptool` call or a hand-written
flash offset defeats the check rather than satisfying it. If the template
checkout, workspace or toolchain is not configured, say which of
`TEMPLATE_NOT_CONFIGURED`, `WORKSPACE_NOT_CONFIGURED`, `BUILD_NOT_ENABLED` or
`TOOLCHAIN_NOT_CONFIGURED` came back and that the operator has to configure
the host; do not substitute a hand-built scaffold.

## Test levels and the words to use

Evidence is graded L1 build verified, L2 simulation verified, L3 device
verified on a production Dot, and L4 integration verified with real expansion
modules. A build through `kode_build` is at most L1. Two real builds have passed
(commits 46271fa and b2fe984, ESP-IDF v6.1.0, v0.1.0 template against SDK v0.1.1); they are
described in the design record and are not registry records (an attempt between them was
BLOCKED and was superseded), because the record
shape cannot describe a host build. No L1, L2, L3 or L4 record exists, so no claim in the registry is
`device_verified` or `integration_verified`. Report outcomes as PASS, FAIL, BLOCKED or NOT TESTED,
with the evidence behind each: a command that was not run is NOT TESTED, not
PASS, and a refusal is BLOCKED with its reason code.

## Deployment and the flash-offset conflict

The SDK contains a guarded, app-role `idf.py flash` override that redirects the
image to the mailbox partition, `app_pending`, at `0x1A00000`, with an image
maximum of `0x5FF000`. The template README, still v0.1.0, prints a manual
`esptool` command at a different location, `0x1C00000`. The two disagree and
the manufacturer has not resolved it; v0.1.1 did not change the partition
table. For that reason the plugin never executes or generates a raw flash
address, and `kode_new_app` writes its own short README instead of copying the
upstream one. A second upstream conflict exists: the template pins the SDK by
HTTPS URL, while the catalogue checker (rule B1) accepts only the SSH form.
A successful compilation grants no flashing authority.

Installing an app from this plugin is not possible today. Before any install
could be considered, an identity observation of the Dot, its installed kodeOS
release, an explicit approval through a channel the model cannot write to, and
a validated recovery path would all have to exist.

## Licensing

kodeOS, kode-sdk, the app template and firmware built from the template are
GPL-3.0-or-later; `kode_new_app` marks scaffolded projects accordingly. The SDK
embeds QP/C (GPL-3.0-or-later or commercial) and ST RFAL under SLA0051, which
is not open source, each with its own notices. From v0.1.1 the SDK notice puts
the Kody artwork under CC BY-SA 4.0 and withholds trademark rights in the Kode
names. The C5 firmware is Apache-2.0. This plugin and its TypeScript MCP are
MIT, so no GPL template file or SDK source is stored here and none may be
copied in; the manufacturer's Python console client is executed externally,
not vendored.

## Modules and unverified hardware

The base SDK describes J3's fourteen expansion positions and basic
Maker-oriented interfaces. All five modules (Maker, Robotics, Camera, Mesh,
F*CK) are unqualified: Q09 and Q12 require an L4 record for each, and none
exists. The module SDK repositories for Camera, Robotics, Mesh and F*CK
returned HTTP 404 when last checked on 13 November, so their APIs and limits
are unread, and Maker has no dedicated SDK listed. No mechanism identifies an
attached module, so the tools never report one as attached. J3's electrical
limits and physical pin order are unknown. The only board revision the
registry knows is the `DVT` the SDK declares; what a retail unit reports has
not been observed. Do not infer module support from a similarly named factory
driver or from built-in C5 Wi-Fi.

## Reporting

Separate manufacturer-advertised, documented, source-verified, host-tested,
device-tested and physically integrated evidence. State the exact source tag,
processor and board revision, toolchain, and the missing gate. Unknown does not
mean unsupported, and a source file is never evidence of a successful device
test. Registry facts expire: tag-pinned facts are due for review on
2027-02-11 and upstream-availability facts on 2026-11-27, and a stale claim is
reported as `EVIDENCE_EXPIRED` rather than silently trusted. The MCP's local
permissions are one safety layer, not a sandbox, and do not make host commands
or electrical operations risk-free.
