---
description: Scaffold, validate, build and inspect a production Kode Dot app through the Claude Kode MCP tools, without flashing hardware
argument-hint: [app-name]
---

Use the `kode-dot-dev` skill and its production-workflow reference. This
command drives the MCP tools `kode_new_app`, `kode_validate`, `kode_build` and
`kode_inspect_image`, which together stop at a compiled, inspected image. None
of them installs, flashes or opens a serial port.

For `$ARGUMENTS`:

1. Take an explicit project name: 1 to 31 lowercase ASCII letters, digits or
   underscores, never `kodeos`, `c5_slave` or a Windows reserved device name
   such as `con`, `nul`, `com1` or `lpt1`. If none was given, ask. Pass it
   to the tools as a name, not a path; the server places the project under the
   operator's workspace and refuses anything that escapes it.
2. Call `kode_get_capabilities` and `kode_check_compatibility` for
   `scaffold_app` and `build_app` (profile `kode-dot-p4c5`) before proposing
   work, then `kode_get_toolchain_status` to see what the host is configured
   for. If the status says the host is not ready, report its blockers now.
3. Call `kode_new_app` with the project name, a display name and one or more
   categories (the tool lists the allowed ones in `kode_get_sdk_contract`).
   It copies the verified official template, sets the SDK pin to v0.1.1,
   writes the manifest and a short generated README, and never overwrites.
   Add the user's behaviour in an app-owned Active Object: it must not block,
   waiting work goes to `kode_worker`, a worker job must not touch flash or
   NVS, and an Active Object subscribes before asking for state.
   Keep the project buildable: do not add an `idf_ext.py`, extra CMake or
   `*.cmake` files, a `components/` directory, `sdkconfig.defaults.<x>`,
   `CMakePresets.json`, `CMakeUserPresets.json`, `sdkconfig.rename` or
   `Kconfig*` files, and do not alter the root `CMakeLists.txt` or
   `main/idf_component.yml`. Source files, `sdkconfig.defaults`, `appdata/` and
   the `SRCS` list in `main/CMakeLists.txt` are yours to edit.
4. Call `kode_validate`. If the verdict fails, report the failed rules and fix
   the source before going on. Also read `buildLogic.eligible`: a project can
   pass the verdict and still be one `kode_build` will refuse.
5. Call `kode_build` only if the toolchain status showed the host ready and the
   project is build-eligible. It runs `idf.py build` once, needs an ESP-IDF
   v6.1 environment, and is not a sandbox; the user should build with no Dot
   attached. It refuses with `BUILD_STATE_PRESENT` while `build/`, `sdkconfig`
   or `sdkconfig.old` exists, because state that exists before a build cannot
   be told apart from planted state. The server does not delete them. If one
   is there, remove all three with your own file tools and call `kode_build`
   again; they are generated, so removing them is expected and safe. If
   `kode_build` returns `buildLogicWarnings`, such as `BL-UNVERIFIABLE`, relay
   them.
6. Call `kode_inspect_image` straight after the build, before removing
   anything, and report its four stages: source project, compiled image,
   kodeOS-install compatible, device verified. It reads `build/`, which a later
   clean build removes. An image this server session did not build through
   `kode_build`, or whose image or build metadata files changed since, comes
   back as `BUILD_NOT_OBSERVED` and is not build evidence.
7. Report the project name, licence (GPL-3.0-or-later), the SDK release, the
   `artefactSha256`, and each result as PASS, FAIL, BLOCKED or NOT TESTED
   with its reason code. The device stage is always NOT TESTED. Say what
   remains: an observed device identity, a validated recovery path, an
   approved install route and L3 and L4 tests.

If a tool refuses, report the `reasonCode`, the message and
`requiredNextEvidence`, and stop. In particular, `WORKSPACE_NOT_CONFIGURED`,
`TEMPLATE_NOT_CONFIGURED` or `TEMPLATE_INTEGRITY_MISMATCH` mean the operator has
not set `KODE_WORKSPACE_ROOT` or `KODE_TEMPLATE_DIR` to a checkout of
kode-app-template v0.1.0; `BUILD_NOT_ENABLED`, `TOOLCHAIN_NOT_CONFIGURED` and
`TOOLCHAIN_VERSION_MISMATCH` mean `KODE_ENABLE_BUILD=1`, `KODE_IDF_PATH`,
`KODE_IDF_PYTHON` or an activated ESP-IDF v6.1 are missing. Say so plainly and
ask the operator to configure the host. `BUILD_LOGIC_NOT_PINNED` means the
project's build logic is not the template's: remove the extra build files or
restore the template's, rather than working around the gate. `BUILD_STATE_PRESENT`
means generated state is already in the project: remove `build/`, `sdkconfig` and
`sdkconfig.old` and build again. `BUILD_TIMEOUT` means the build process had not
exited at the deadline: the message says whether it and what was attached to it
were ended or whether ending them was not confirmed, and a process that detached
itself cannot be tracked and may still be running, so say so. If a build result
carries `outputHeldOpen: true`, something the build started still held its
output open and may still be running; say so too. Do not substitute a hand-made scaffold,
a shell build, `esptool`, or any flash offset. A project that was scaffolded
but not built is a source project only; say that.

The archived S3 app under `archive/esp32-s3/` must never be used on production
P4/C5. The official template's manual raw flashing offset conflicts with the
released partition table; do not echo it as a recommended command.
