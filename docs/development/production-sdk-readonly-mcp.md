# Production SDK integration — first read-only MCP vertical slice

**Status:** Implemented in proposed PR only; host logic tested with fake
console fixtures, **not physically validated**. Date: 13 November 2026.

## Why this changed

Kode released kodeOS, kode-sdk, kode-app-template and C5 firmware 
`v0.1.0` on 9–10 November 2026. Their public source establishes a real
`KODE_APP_MANIFEST` and complete-firmware app loader, unlike the historical S3
prototype described in accepted ADR-0002. A separate [source-audit PR #3](https://github.com/arjunsol/claude-kode/pull/3)
documents those facts and proposes ADR-0017; **neither is merged/accepted here**.

## What this PR adds

- Production `kode-dot-dev` skill and `/new-kode-app` guidance anchored to
  official `kode-sdk v0.1.0`, ESP-IDF **v6.1**, and QP/C Active Objects.
- Update the per-user firmware installer from ESP-IDF 6.0.1 to **v6.1** at
  release commit `fff9895c82d744c7237be8847347bdd1b07c6643`. This is a
  source pin, **not evidence that its Python setup/build ran**.
- Keep the original S3 template quarantined under the PR #2 `archive/esp32-s3`.
- Add a stdio MCP server for **four fixed informational operations** through
  the official `KodeOS/tools/kcli.py` v0.1.0: `ping`, `boot_info`, `app_list`,
  and a PNG screenshot. Existing simulation-only `inspect_capability` remains.
- Require explicit `KODE_ENABLE_CONSOLE_READS=1`, user-set **Windows COM port**,
  absolute vendor tools directory, and SHA-256 pins of **both** `kcli.py` and
  `kpayload.py` before any subprocess invocation.
- `execFile` no shell; no user-supplied CLI string, installation flag or target.
  Bound output, timeout, no retry and temp file cleanup for screenshots.
- Add `.mcp.json` using `${CLAUDE_PLUGIN_ROOT}` for optional Claude Code plugin
  auto-registration after `npm ci && npm run build`.

## Threat model and explicit limitations

1. **USB serial port opening can reset the device**, even if the command itself
   is informational. This is why the default is disabled and the MCP tool hints
   do **not** claim strict side-effect-free read-only status.
2. The SHA pins are **operator-provided**, not automatically verified vendor
   signatures. They detect subsequent on-disk changes to those two scripts;
   other Python packages and the interpreter remain a trusted host dependency.
3. This is not a process sandbox. The Claude Code host's external shell/tools
   are **outside** the MCP tool's permission restrictions.
4. The MCP does not identify every physical hardware revision or guarantee that
   the connected port is the intended Dot. `boot_info` output is evidence only.
5. It contains **no** tools for flashing, app installation, OS/C5 updates,
   arbitrary console commands, changing files on the board, Wi-Fi configuration,
   NFC/RFID emulation, RF transmission or motor motion.
6. Screenshots may include private data. They are returned to the calling MCP
   client and erased from the host temporary directory afterward, without
   persistence or telemetry by this service.
7. Real hardware acceptance, Windows execution and an end-to-end kodeOS app
   build/install must still be tested; they are not claimed from source review.

## Known upstream hazard

[Official template v0.1.0 README](https://github.com/kodediy/kode-app-template/blob/v0.1.0/README.md)
contains a **manual raw esptool write at `0x1C00000`**, whereas the
[SDK partition table](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kbsp/partitions.csv)
sets `app_pending` to **`0x1A00000`**. These values are inconsistent. The
[official application-role CMake override](https://github.com/kodediy/kode-sdk/blob/v0.1.0/components/kbsp/project_include.cmake)
uses the partition *name* and checks image size. Do not implement a raw offset
installer; inspect generated flasher arguments on the actual built project before
separately approving any deployment.

## Manual validation checklist

- [ ] Clean Windows installer and build in Node 24, TypeScript and SDK environment.
- [ ] Full `npm test` (including independent MCP stdio client), with device
      reads explicitly disabled in the test subprocess.
- [ ] Pinned manufacturer tools checkout and SHA verification.
- [ ] Real Dot USB connect: confirm serial reset behaviour and `kode_ping`.
- [ ] `kode_boot_info`, `kode_list_apps` and screenshot output on actual hardware.
- [ ] No new permissions or extra CLI verbs appear in MCP discovery.
- [ ] Verify SHA mismatch, missing COM port and denied opt-in fail closed.
- [ ] Later PR: compile harmless P4 app, inspect role/manifest/flash arguments,
      obtain device authorisation and confirm safe install/recovery.
- [ ] Later: distinct L4 integration evidence for all five user-required modules.

## Licensing

`mcp/` remains original MIT-licensed TypeScript. Upstream KodeOS Python host
scripts are GPL-3.0-or-later and deliberately **not vendored**. The generated
firmware template and kode-sdk are GPL-3.0-or-later with QP/C and RFAL notices.
Review redistributable packaging and commercial licensing separately.
