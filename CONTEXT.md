# claude-kode — domain vocabulary

A Claude Code plugin and TypeScript MCP for production **ESP32-P4 / ESP32-C5**
Kode Dot development. Personal-first, public-ready. Q01–Q12 are the product
requirements; only explicitly accepted ADRs are architecturally binding.

**Kode Dot:** The shipping ESP32-P4/C5 device. The ESP32-S3 was an unreleased
prototype, preserved only under `archive/esp32-s3/`.

**kodeOS:** Public-source GPL-licensed firmware providing the UI, console,
application installer, OS OTA and bootloader integration. An installed app is
**another complete firmware**; it does not run inside kodeOS as a dynamically
loaded library. kodeOS and app start on separate boots. A Dot can update its
own kodeOS, so the installed release is read from the device, never assumed.

**App:** A P4 ESP-IDF firmware image compatible with kodeOS's app/boot contract.
Its identity is the ESP-IDF project name (1 to 31 of a-z, 0-9, underscore) and
`PROJECT_VER`, and it embeds a `KODE_APP_MANIFEST` (display name and
categories). Separate `appdata/app.json` and icon assets carry the catalogue
presentation. A generic P4 build does not by itself prove device installation
safety.

**Category:** One or more catalogue categories declared in the embedded
`KODE_APP_MANIFEST` for the production P4. Not merely an S3-era microSD folder.

**Template:** A copyable starting app project. The supported production source
is `kodediy/kode-app-template`, whose only release is v0.1.0 and which still
pins SDK v0.1.0. Its generated code links to the GPL kode SDK; it is **not MIT
firmware**, and no template file is stored in this MIT repository. The archived
S3 files are not production templates.

**Example:** A sample application used for local dogfooding/validation,
distinct from the general template and from another user's app repository.

**SDK:** The GPL-3.0-or-later `kodediy/kode-sdk`, pinned at v0.1.1 with v0.1.0
as an assessed previous release. It exposes `kode.h` blocking APIs for tasks and
`kode_sys.h` event-based facilities for Active Objects, owns peripherals through
QP/C and supplies canonical P4 board settings from `kbsp`. It embeds third-party
QP/C and RFAL with separate licensing/notice requirements, and from v0.1.1 its
notice places Kody artwork under CC BY-SA 4.0.

**Active Object:** A QP/C event-driven object that is the single owner of a
device or an app behaviour. It must never block; waiting work is given to its
`kode_worker`, whose jobs must not touch flash or NVS. It subscribes to an
event before asking for the state that event reports.

**Firmware roles:** `kodeOS` system firmware, kodeOS-installed user **app**,
C5 radio firmware and isolated standalone firmware are distinct artefact and
permission classes. The MCP exposes no firmware-changing action.

**Console observation:** An allowed query through KodeOS's pinned GPL
`kcli.py` script over an operator-selected serial port, only when
`KODE_ENABLE_CONSOLE_READS=1`. It may reset the Dot when the port opens.
Source-described commands are not device verification.

**Module:** Maker, Robotics, Camera, Mesh or F*CK. All five are owner-required
v1 hardware qualification gates and all five are currently unqualified. Never
assume a specialised module is supported simply because the base SDK has a
similarly named peripheral.

**Hardware profile:** The registry's description of a target. The production
profile is `kode-dot-p4c5`; the only board revision it knows is the `DVT` the
SDK declares.

**Claim:** One evidence record in the registry: a statement with a state
(advertised, documented, source_verified, simulated, device_verified,
integration_verified, unknown, unsupported, conflicting), a source pinned to a
commit, a scope, a review-by date and what invalidates it. No claim is
`device_verified` or `integration_verified`.

**Result envelope:** The common shape every F1 tool returns: `status`,
`reasonCode`, `verifiedLayer`, `hardwareAuthorized` (always `false`),
`evidence` and `requiredNextEvidence`. A refused or failed result is also an
MCP tool error.

**Reason code:** A value from a closed list that explains a refusal or
not-verified result, such as `TEMPLATE_NOT_CONFIGURED` or
`EVIDENCE_CONFLICTING`. A caller branches on it; it is never free text.

**Verified layer:** How far an answer was actually checked: none,
documentation, source, build, simulation, device or integration. It is never
promoted by inference.

**Test levels (L1 to L4):** L1 build verified, L2 simulation verified, L3
device verified on a production Dot, L4 integration verified with real
modules. Outcomes are PASS, FAIL, BLOCKED or NOT TESTED, each with evidence. No
L2, L3 or L4 record exists.

**Compatibility decision:** The advisory `allowed` or `refused` returned by
`kode_check_compatibility`. `allowed` means only that the evidence threshold is
met; it never authorises anything. A `refused` decision is also a tool error
carrying its first reason code.

**Install-compatible image:** An image whose source-level properties match the
kodeOS app contract (P4 chip id, app descriptor, ESP-IDF v6.1, `KAPD` manifest,
app boot role, a manifest name of 1 to 31 characters and 1 to 4 catalogue
categories, a single mailbox entry for `<name>.bin` in `flasher_args.json`, an
image that fits the mailbox). It is one of four stages `kode_inspect_image` keeps apart: source project,
compiled image, install-compatible image and device-verified image. The last is
never claimed.

**Workspace and template checkout:** The operator-configured directory
(`KODE_WORKSPACE_ROOT`) where projects live, and the operator's checkout of
kode-app-template v0.1.0 (`KODE_TEMPLATE_DIR`), hash-checked against the tag.
Tools take a project name, never a path.

**Build gate:** The check that lets `kode_build` run only on a project whose
build logic is the pinned template's, because `idf.py build` executes the
project's CMake and would import a project `idf_ext.py`. `kode_validate`
reports it separately from the verdict as `buildLogic` (rule ids `BL-...`), and
a project that fails it is refused with `BUILD_LOGIC_NOT_PINNED`. Source files,
`sdkconfig.defaults`, `appdata/` and the `SRCS` list stay the author's to edit.
It also refuses any file whose name starts with `Kconfig`, as a precaution rather
than a demonstrated exploit. It narrows what a build runs; a build is still not a
sandbox.

**Clean build:** The rule that `kode_build` starts from a project with no `build/`,
`sdkconfig` or `sdkconfig.old`, because state that exists before a build cannot be
told apart from planted state. A project with any of them is refused with
`BUILD_STATE_PRESENT`. The server never deletes them; the caller removes them with
its own file tools, after calling `kode_inspect_image`, which reads `build/`. It
removes one way of planting state ahead of a build; a build is still not a sandbox.

**Build receipt:** Three digests, of the image, `build/config/sdkconfig.json` and
`build/flasher_args.json`, recorded when `kode_build` produced them and held in
memory for the life of the server process. `kode_inspect_image` reports `ok`
and `verifiedLayer: build` only when all three match; any other files, or a changed
one, are `not_verified` with `BUILD_NOT_OBSERVED`. A server restart clears every
receipt.

**Mailbox offset conflict:** The partition table puts `app_pending` at
`0x1A00000`, while the template README prints a manual flash command at a
different location. It is unresolved upstream and unchanged in v0.1.1. No
Claude Kode tool uses a raw offset.
