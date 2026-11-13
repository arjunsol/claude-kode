# Firmware build environment and emulation

> **Current production dependency (13 November 2026):** the manufacturer's public `kode-sdk v0.1.0` and app template require **ESP-IDF v6.1**, release commit `fff9895c82d744c7237be8847347bdd1b07c6643`. The installer script has been updated to this version. **No v6.1 clean build or device execution has been performed here.** Use the [official SDK integration guide](production-sdk-readonly-mcp.md) and the tagged manufacturer application template; do not use an S3 build or generic P4 hello-world build as evidence of a kodeOS-compatible app.\n\nThe following details describe the **historical 6.0.1 experiment on 4 November**, retained for provenance only. Its activation commands and pin are no longer current.\n\n
Updated 2026-11-04. Status: native compiler installed; full ESP-IDF Python setup
blocked by network policy. No full firmware build or emulator run has passed.

## Historical v6.0.1 experiment (superseded for production)

Node 24 and the locked MCP dependencies support the current host tests. Firmware
work additionally needs the sample's ESP-IDF **6.0.1**, matching RISC-V tools,
CMake, Ninja and IDF's constrained Python dependencies. The historical S3
PlatformIO environment is not this toolchain.

The shared setup is documented in [SETUP.md](../SETUP.md), including Windows,
macOS and Linux launchers. `scripts/setup-firmware-env.sh` delegates to its
firmware-only mode. Tools default to a per-user directory; this cloud instance
uses `KODE_TOOLCHAIN_ROOT=/workspace/toolchains` to reuse its installed SDK. It checks
SDK commit `8c19b156084a0753687347cca1f5355782893533`, preserves existing edits,
uses IDF's tool-manifest checksums and retains its official Python constraints.
Do not use `--no-constraints` or disable TLS checks to get around access failures.

```sh
export KODE_TOOLCHAIN_ROOT=/workspace/toolchains
bash install.sh --firmware-only --state-dir /workspace/toolchains/installer-state
export IDF_TOOLS_PATH=/workspace/toolchains/esp-idf-tools-v6.0.1
source /workspace/toolchains/esp-idf-v6.0.1/export.sh
```

Current-instance evidence:

- ESP-IDF v6.0.1 source installed at that commit; all 25 recursive submodule entries
  matched their recorded revisions.
- P4-target tools downloaded through the official installer with manifest
  verification; `riscv32-esp-elf-gcc --version` reports GCC 15.2.0.
- CMake 4.0.3 and Ninja 1.12.1 are selected from IDF's pinned tool manifest.
- Python environment initialization fails fetching the official constraints file
  from `dl.espressif.com` (proxy CONNECT 403). No constraints were bypassed.

The environment draft adds `dl.espressif.com`, `components.espressif.com` and
`components-file.espressif.com` alongside existing custom destinations. Saving the
draft does not apply access to this machine; review/save the network settings
and publish the environment as required by the product. Retry the setup script
after access is applied. Do not claim `idf.py build` readiness until it succeeds.

After setup, first copy the pinned SDK's `examples/get-started/hello_world` into
an external scratch directory and build with `idf.py -DIDF_TARGET=esp32p4 build`.
That is a generic P4 compiler/framework smoke check, not Kode Dot or kodeOS
qualification. Then reproduce the source-identified manufacturer sample with its
required assets and matching dependency versions, without invoking flash or
monitor. Keep SDK sources and generated builds outside the plugin source tree.

Arduino CLI and the manufacturer's fork are a separate build-only compatibility
experiment. They are not yet installed or validated here. The current default
fork and 6 MB feature branch differ in mailbox layout, and their revision must
match the eventual device/firmware contract. See the manufacturer inventory.

## Is there an emulator?

Espressif maintains a [QEMU fork](https://github.com/espressif/qemu). Its current
[documented support matrix](https://github.com/espressif/esp-toolchain-docs/blob/main/qemu/README.md)
was inspected on 2026-11-04 and lists ESP32, ESP32-S3 and ESP32-C3. The pinned
[IDF 6.0.1 tool manifest](https://github.com/espressif/esp-idf/blob/8c19b156084a0753687347cca1f5355782893533/tools/tools.json)
selects `qemu-riscv32` for **ESP32-C3 only**, and Xtensa QEMU for ESP32/ESP32-S3.
P4 and C5 are not listed. A RISC-V CPU emulator alone is not an emulated P4 SoC
or a Kode Dot board. Do not install the C3 emulator and report it as P4 validation.

No full production Kode Dot/kodeOS emulator was identified in the audited sources.
This is a bounded finding, not proof that no private or third-party emulator exists.
The documented virtual QEMU framebuffer is synthetic, not evidence for the Dot's
MIPI-DSI panel, touch, C5 radio, expansion modules or production loader behavior.

Use host-side unit/protocol tests and explicitly simulated capability profiles
for software logic now. Add headless UI tests when a UI abstraction exists.
Real device integration and all five module qualification gates still require
appropriate physical tests. No emulator has been installed because there is no
verified matching target in this toolchain.
