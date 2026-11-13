# Production P4/C5 workflow — tagged manufacturer SDK v0.1.0

Use this together with the `kode-dot-dev` skill and the manufacturer's
[v0.1.0 application template](https://github.com/kodediy/kode-app-template/tree/v0.1.0).

## Before development

- Confirm the requested target is a **production P4/C5** Kode Dot, not the
  archived S3 prototype; record model, source tag, kodeOS/SDK revision, installed
  firmware, connected module and evidence class. Record unknowns explicitly.
- Use **ESP-IDF v6.1**, `IDF_TARGET esp32p4`, and the released `kode-sdk v0.1.0`
  dependency. The repository's prior environment script pinned IDF 6.0.1;
  that older installation is not evidence for the new official SDK.
- Pull board facts from `components/kbsp/sdkconfig.board`,
  `components/kbsp/partitions.csv`, and `kbsp/exp/include/kbsp_exp.h`.
- Do not assume every app uses radio, LVGL, or every SDK component. Use the
  official template's defaults and component dependencies.

## Official app steps

1. Scaffold from `kodediy/kode-app-template` at a verified tag in the **user's
   target app repository**. Check licence before distributing generated code.
2. Make the app's `project(<name>)` 1–31 lowercase letters/digits/underscores;
   set a meaningful `PROJECT_VER` and `KODE_APP_MANIFEST("Name", "category")`.
3. Place custom behaviour in an app-owned Active Object with QP/C events.
   **Never block an AO**. Use its `kode_worker` for blocking operations and
   handle only the matching completion sequence. Worker jobs must not call
   flash/NVS routines while executing from PSRAM.
4. Prefer `kode.h` for ordinary tasks; `kode_sys.h` for event-driven/AO calls.
   Have one owner for every hardware peripheral and request it via messages.
5. Build with `idf.py build` in a correctly configured **v6.1** environment.
   Capture `dependencies.lock`, image checksum, SDK tag and build log.
6. Run the [catalogue's RULES.md](https://github.com/kodediy/kode-apps/blob/main/RULES.md)
   checks where available. A catalogue check passing is **not** physical proof.

## Deployment is not part of the initial MCP slice

The manufacturer exposes `kcli.py` with console operations, app installation and
screen capture. The **MCP currently exposes only a fixed read-only subset**.
Do not expose a passthrough `cmd`, `install`, `flash`, `erase` or user-configurable
console verb: it would bypass Q04/Q10 permission gates.

The source's app-role CMake hook redirects `idf.py flash` to the partition named
`app_pending` and has an explicit image size check. However, the v0.1.0 app
README's manual `esptool` location (`0x1C00000`) does **not** match the SDK
partition's mailbox start (`0x1A00000`). Do not use the raw command or
hard-coded offsets. Capture and check generated flasher arguments before any
approved device-writing workflow. App images larger than the mailbox limit
need a different documented install route.

Opening a USB serial connection can reset kodeOS. **Operator opt-in and
explicit COM port are required** for even read-only MCP observations. The MCP
checks SHA-256 of both official `kcli.py` and `kpayload.py` before invoking the
script and does not automatically retry failed operations. Screenshots use a
private temporary file that is removed after returning the image.

## External module coverage

- Maker: J3 pin and I²C/SPI/UART examples form the base SDK foundation.
- Robotics/Camera/Mesh/F*CK: vendor catalogue names separate module SDKs;
  their source/production integration and electronic limits remain to verify.
- ESP32-C5 firmware: source is Apache-2.0, but production Secure Boot accepts
  Kode-signed images; do not attempt a custom C5 firmware flash.
- All five require independently evidenced L4 physical module tests for v1.

## Evidence record

For every consequential claim: `claim`, `upstream repo + tag + file`, `source
retrieval date`, `board/module/firmware revision`, `evidence level`, `test
procedure`, `artefact SHA`, `conflicts`, `invalidated-by` and `next gate`.
Manufacturer **source evidence** does not become hardware evidence by inference.

## Licensing

The plugin and original TypeScript MCP code are MIT; kodeOS and kode-sdk and
firmware derived from the official app template are GPL-3.0-or-later. The SDK
incorporates third-party QP/C (GPL/commercial) and RFAL (ST SLA0051) with
special additional permissions and notices. The manufacturer's Python console
client is GPL-licensed and is **executed externally**, not copied into this
MIT project. Review redistribution and commercial use separately.
