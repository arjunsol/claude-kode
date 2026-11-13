# claude-kode

A Claude Code plugin and TypeScript MCP development layer for the **production
ESP32-P4 / ESP32-C5 Kode Dot**. Personal-first, with public-ready engineering
and hardware evidence as the goal.

## Source-backed production foundation

Kode released the first public source versions of
[kodeOS](https://github.com/kodediy/KodeOS/releases/tag/v0.1.0),
[kode-sdk](https://github.com/kodediy/kode-sdk/releases/tag/v0.1.0),
[kode-app-template](https://github.com/kodediy/kode-app-template/releases/tag/v0.1.0)
and [C5 firmware](https://github.com/kodediy/kode_slave_c5/releases/tag/v0.1.0)
on 9–10 November 2026. These provide the manufacturer app manifest,
whole-firmware kodeOS app lifecycle, source-defined P4/C5 board profile and
serial-console protocol. **Source availability is not hardware verification.**

- `skills/kode-dot-dev/` teaches native **ESP-IDF v6.1**, the official GPL SDK,
  QP/C Active Objects, embedded `KODE_APP_MANIFEST` and evidence limits.
- `/claude-kode:new-kode-app` guides generation from the **official tagged
  Kode app template**, not the unreleased historical S3 template.
- `mcp/` is a TypeScript stdio MCP service (version 0.2.0, 17 tools, 8 resources).
  It has the simulated capability probe, **four opt-in console observations**
  (ping, boot state, installed apps, a non-persistent screenshot), eight
  source-level knowledge tools backed by an evidence registry pinned to
  kode-sdk and kodeOS **v0.1.1**, and a scaffold, validate, build and inspect pipeline (`kode_new_app`,
  `kode_validate`, `kode_build`, `kode_inspect_image`). Builds are off until the
  operator enables them, run only on projects whose build logic is the pinned
  template's, and are not sandboxed. No installation, flashing, arbitrary CLI commands,
  radio transmit or motor control is available through MCP. One build has been run
  against a real ESP-IDF v6.1 (on an earlier commit of this branch); nothing has
  run on a device. See the
  [design and evidence record](docs/development/f1-capability-evidence-build.md).
- `.mcp.json` registers the local server for Claude Code **after** you have run
  `npm ci && npm run build` in `mcp/`; runtime starts safely with device reads
  **disabled** until explicitly opted in.
- `archive/esp32-s3/` contains research for an **unreleased prototype**.
  Never flash it or use its pin numbers on a production Kode Dot.

## First steps

1. Install Node 24 and build the local MCP (host-only setup is supported by the
   [installation guide](docs/SETUP.md)):

   ```sh
   cd mcp
   npm ci
   npm run build
   npm test
   ```

2. Launch Claude Code with this checkout as a plugin:

   ```sh
   claude --plugin-dir /absolute/path/to/claude-kode
   ```

3. The `inspect_capability` fixture is usable without hardware. To use
   console tools, explicitly configure a pinned official kodeOS tools
   checkout (v0.1.1 or v0.1.0) and a known Windows COM port; follow [mcp/README.md](mcp/README.md).
   **Opening serial can reset the Dot.** No auto-discovery or silent connection.
4. For actual firmware work, use ESP-IDF **v6.1** and the official vendor
   template. The old installer pinned 6.0.1; this branch updates its target to
   v6.1 but no clean build or physical integration has been verified here.

## Release boundaries and project memory

The [working decisions](docs/discovery/working-decisions.md) require an
end-to-end development agent, versioned evidence profiles, supervised physical
operations, a Windows-first host, and hardware qualification of **all five
expansion modules** before calling the project v1.

The original ADR-0002's closed-source/no-manifest claim is obsolete for the
production P4, and [a source audit and proposed ADR-0017](https://github.com/arjunsol/claude-kode/pull/3)
record that change. The PR is separate; accepted ADRs remain unchanged until
explicit review.

A first useful **read-only** MCP service is not an end-to-end flashing agent,
not a module driver and not device-qualified. The Camera, Mesh, F*CK and Robotics
module SDKs named by the vendor catalogue were not publicly accessible during
the 11 November source audit. Do not claim v1 completeness.

## Licence

Original Claude Kode plugin/TypeScript tooling is **MIT**. Apps generated from
the manufacturer's `kode-app-template` and linked to the GPL SDK have separate
**GPL-3.0-or-later** obligations (including third-party QP/C/RFAL notices and
potential special permissions). Do not copy the manufacturer's GPL Python
console scripts into this MIT repository. The MCP invokes a separately checked,
operator-pinned official checkout.
