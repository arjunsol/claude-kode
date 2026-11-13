# Production P4/C5 workflow — tagged manufacturer SDK v0.1.1

Use this together with the `kode-dot-dev` skill and the manufacturer's
[v0.1.0 application template](https://github.com/kodediy/kode-app-template/tree/v0.1.0),
which is the only template release. The SDK pin is v0.1.1; v0.1.0 remains an
assessed previous release and any other release is refused.

## Before development

- Confirm the requested target is a production P4/C5 Kode Dot, not the
  archived S3 prototype. Record model, source tag, kodeOS and SDK revision,
  installed firmware, connected module and evidence class, and record unknowns
  explicitly. A Dot can update its own kodeOS, so the installed release is read
  from the device, never assumed.
- Ask the registry first: `kode_get_capabilities`, then `kode_check_compatibility`
  for the operation you intend, using profile `kode-dot-p4c5`. Use
  `kode_get_pinout` for every pin question and `kode_get_sdk_contract` for the
  contract; do not quote pin numbers or partition offsets from memory.
- Use ESP-IDF v6.1, `IDF_TARGET esp32p4`, and the `kode-sdk` dependency at
  v0.1.1. The repository's earlier environment script pinned IDF 6.0.1; that
  installation is not evidence for the official SDK.
- Do not assume every app uses radio, LVGL or every SDK component. Use the
  template's defaults and component dependencies.
- Call `kode_get_toolchain_status` to see what the host is configured with.

## App steps through the MCP

1. `kode_new_app` creates `<KODE_WORKSPACE_ROOT>/<name>` from the operator's
   checkout of kode-app-template v0.1.0 (`KODE_TEMPLATE_DIR`). Every template
   file is hash-checked against the tag; CRLF checkouts of text files are
   accepted after normalisation. The tool takes a project name, a display name
   and categories, never a path. It edits the SDK `version:` line to v0.1.1
   unless another assessed release is named, does not copy the upstream README
   (it carries the conflicting raw flash command) and writes a short generated
   one. The project is GPL-3.0-or-later and nothing is overwritten.
2. The project name is 1 to 31 of a-z, 0-9 and underscore, and is never
   `kodeos`, `c5_slave` or a Windows reserved device name (`con`, `prn`, `aux`,
   `nul`, `com1` to `com9`, `lpt1` to `lpt9`). Set a meaningful `PROJECT_VER` and
   `KODE_APP_MANIFEST("Name", "category")`; `appdata/app.json` carries the
   catalogue presentation.
3. Put custom behaviour in an app-owned Active Object with QP/C events. One
   owner per hardware device; request it by message. Never block an Active
   Object: use its `kode_worker` for waiting work and handle only the matching
   completion event. A worker job must not call flash or NVS routines, which
   are unsafe from PSRAM. Subscribe before asking for state.
4. Prefer `kode.h` in ordinary tasks and `kode_sys.h` in Active Objects.
5. `kode_validate` checks identity, the ESP32-P4 target, the app role, the SDK
   pin, the manifest and forbidden flash calls from source. It lists the rules
   it cannot check and is not the catalogue's own checker. It returns a
   `verdict` and, separately, `buildLogic: { eligible, findings }`, whether
   `kode_build` will accept the project. A project can pass the verdict and be
   ineligible to build. The flash-call rule (C12) is a source heuristic, not a
   guarantee about the built ELF: it scans every text file under `main/`,
   joins backslash-newline splices, and warns about an `#include` that leaves
   `main/`, because files outside `main/` are not scanned.
6. `kode_build` needs `KODE_ENABLE_BUILD=1`, `KODE_IDF_PATH`, `KODE_IDF_PYTHON`
   and a server started from an activated ESP-IDF v6.1 environment. It runs
   exactly `<KODE_IDF_PYTHON> <KODE_IDF_PATH>/tools/idf.py -C <project> -B
   <project>/build build`, with no shell, one attempt and a bounded time
   (`KODE_BUILD_TIMEOUT_S`, 60 to 7200, default 1800). It runs the SDK's build
   scripts and fetches the SDK, so it is not a sandbox; build with no Dot
   attached. Because `idf.py build` also runs the project's CMake and would
   import a project `idf_ext.py`, `kode_build` builds only a project whose
   build logic is the pinned template's and refuses the rest with
   `BUILD_LOGIC_NOT_PINNED`. For a project you intend to build, do not add an
   `idf_ext.py`, extra `*.cmake` or `CMakeLists.txt` files, a `components/`
   directory, `sdkconfig.defaults.<x>` or `Kconfig*` files (the last a
   precaution, not a demonstrated exploit), and do not alter the root
   `CMakeLists.txt` or `main/idf_component.yml`. Source files,
   `sdkconfig.defaults`, `appdata/` and the `SRCS` list in `main/CMakeLists.txt`
   are yours to edit. A pre-existing `managed_components/` or
   `dependencies.lock` cannot be verified (`BL-UNVERIFIABLE`, a warning that
   `kode_build` repeats in its result). If the build runs past its deadline,
   the build process and what is still attached to it are ended; a process that
   detached itself cannot be tracked and may still be running.

   Every build starts clean. `kode_build` refuses with `BUILD_STATE_PRESENT`
   while `build/`, `sdkconfig` or `sdkconfig.old` exists, because state that
   exists before a build cannot be told apart from planted state, and planted
   state can change what the build runs. After a build, call
   `kode_inspect_image` before removing anything, since it reads `build/`. To
   build again, remove `build/`, `sdkconfig` and `sdkconfig.old` with your own
   file tools, then call `kode_build`. The server does not delete them. Removing
   them is expected and safe, because a build generates all three. It removes
   one way of planting state; it does not make a build safe or a sandbox.
7. `kode_inspect_image` parses the built image and build metadata. It keeps
   four stages apart: source project, compiled image, kodeOS-install
   compatible (a source-level judgement, strict about the manifest name and
   categories, mailbox fit and a flash plan naming `<name>.bin`) and device
   verified, which is never claimed and always `NOT TESTED`. It reports `ok`
   and `verifiedLayer: build` only for an image `kode_build` produced in this
   server session, and only while the image, `build/config/sdkconfig.json` and
   `build/flasher_args.json` are unchanged since the build. For files it did not
   build, or files changed since, it returns `BUILD_NOT_OBSERVED` with
   `verifiedLayer: none`; that is a description of files, not build evidence,
   and a server restart clears the record.
8. Run the [catalogue's RULES.md](https://github.com/kodediy/kode-apps/blob/main/RULES.md)
   checks where available. Passing them is not physical proof.

If the workspace, template checkout or toolchain is not configured, the tool
refuses with `WORKSPACE_NOT_CONFIGURED`, `TEMPLATE_NOT_CONFIGURED`,
`BUILD_NOT_ENABLED` or `TOOLCHAIN_NOT_CONFIGURED`. Report that code and what the
operator must set; do not scaffold or build by hand instead.

## Reading results and refusals

Every F1 tool returns `status`, `reasonCode`, `message`, `effectClass`,
`verifiedLayer`, `hardwareAuthorized` (always `false`), `payload`, `evidence`,
`artefactSha256` and `requiredNextEvidence`. Refused and failed results are
also tool errors. Branch on `reasonCode`; report it with the missing evidence;
stop. Scope gates (`PROFILE_UNKNOWN`, `SDK_RELEASE_NOT_ASSESSED`,
`BOARD_REVISION_NOT_IN_PROFILE`) refuse on every knowledge tool, and a refused
`kode_check_compatibility` is a tool error carrying its first reason code. An
allowed serial read carries `cautions` (opening the port resets the Dot; what
is on the port is unidentified): relay them. A refusal is not an obstacle to route around, and no shell command, raw
`esptool` call or hand-written flash offset is a legitimate response to one.

Outcomes are reported as PASS, FAIL, BLOCKED or NOT TESTED, each with its
evidence. The levels are L1 build verified, L2 simulation verified, L3 device
verified on a production Dot and L4 integration verified with real modules.
`kode_build` can establish L1 at most. No L2 to L4 record exists.

## Deployment is not part of the toolset

There is no install, flash, erase, OS update or C5 update tool, and
`kode_check_compatibility` refuses each of them. The manufacturer's `kcli.py`
offers console operations, app installation and screen capture; the MCP
exposes only four fixed read-only verbs from it (`kode_ping`, `kode_boot_info`,
`kode_list_apps`, `kode_capture_screen`). Do not add a passthrough `cmd`,
`install`, `flash`, `erase` or user-configurable console verb: it would bypass
the Q04 and Q10 permission gates.

The source's app-role CMake hook redirects `idf.py flash` to the partition
named `app_pending` (`0x1A00000`, size `0x600000`, image maximum `0x5FF000`)
and checks the image size. The v0.1.0 template README's manual `esptool`
location (`0x1C00000`) does not match it, and v0.1.1 left the partition table
unchanged, so the conflict stands. Do not use the raw command or hard-coded
offsets. App images larger than the mailbox limit need a different documented
install route. A second conflict: the template pins the SDK by HTTPS URL while
catalogue rule B1 accepts only `git@github.com:kodediy/kode-sdk.git`.

Opening a USB serial connection can reset kodeOS. The console tools are off
unless the operator sets `KODE_ENABLE_CONSOLE_READS=1` and an explicit COM
port. The MCP checks SHA-256 of the official `kcli.py` and `kpayload.py` before
invoking the script and does not retry. Screenshots use a private temporary
file that is removed after the image is returned. None of this has run on a
device.

## External module coverage

- Maker: J3 pin and I²C/SPI/UART interfaces form the base SDK foundation. No
  dedicated Maker SDK is listed.
- Robotics, Camera, Mesh and F*CK: the catalogue names separate module SDKs.
  Those four repositories returned HTTP 404 on 13 November, so their APIs and
  electrical limits are unread.
- All five modules are unqualified, none can be detected, and each needs an
  independently evidenced L4 physical test for v1 (Q09, Q12).
- ESP32-C5 firmware is Apache-2.0, but production Secure Boot accepts only
  Kode-signed images; do not attempt a custom C5 firmware flash.

## Evidence record

For every consequential claim record: claim, upstream repo, tag and file,
source retrieval date, board, module and firmware revision, evidence level,
test procedure, artefact SHA, conflicts, invalidated-by and next gate.
Manufacturer source evidence does not become hardware evidence by inference.
`kode_get_evidence` shows the ledger. Claims carry a review date: tag-pinned
facts expire on 2027-02-11 and upstream-availability facts on 2026-11-27.

## Licensing

The plugin and original TypeScript MCP code are MIT. kodeOS, kode-sdk, the app
template and firmware derived from it are GPL-3.0-or-later; scaffolded
projects are marked so, and no GPL template file is stored in this repository.
The SDK incorporates third-party QP/C (GPL or commercial) and ST RFAL under
SLA0051, with special permissions and notices. From v0.1.1 the SDK notice puts
Kody artwork under CC BY-SA 4.0 and reserves the Kode trademarks. The C5
firmware is Apache-2.0. The manufacturer's Python console client is GPL and is
executed externally, not copied into this MIT project. Review redistribution
and commercial use separately.
