# claude-kode

A Claude Code plugin for evidence-led development of kodeOS apps on the
production [Kode Dot](https://kode.diy), targeting ESP32-P4/ESP32-C5.
Personal-first, with public-ready engineering as the goal.

## Current capabilities

The plugin provides production research and compatibility guidance. It does not
currently ship a verified production app template, loader integration or device deployment tool. An experimental
[read-only MCP prototype](mcp/README.md) exists for simulated capability lookup;
it is not auto-registered with the plugin. Production SDK, pin maps, application format and
recovery evidence are tracked in [CK-R001](docs/research/ck-r001-production-contract-audit.md).

- `skills/kode-dot-dev/` guides source research and distinguishes build evidence
  from production hardware validation.
- `/claude-kode:new-kode-app` checks production scaffolding prerequisites. It
  reports missing evidence rather than copying an incompatible S3 template.
- `archive/esp32-s3/` preserves the unreleased prototype template and historical
  notes. Its flash command has been removed; the recipe rejects device targets.

**Do not apply archived S3 pins, partition offsets or binaries to a production
P4/C5 Dot.** Historical PlatformIO setup is not production readiness evidence.

## Local plugin use

With Claude Code installed, start a session with this checkout as a plugin:

```sh
claude --plugin-dir /absolute/path/to/claude-kode
```

Ask “check Kode Dot compatibility” or invoke `/claude-kode:new-kode-app MyApp`.
No device is needed for research. Actual Claude Code activation and Windows
compatibility still require interactive validation; see the
[plugin development notes](docs/development/plugin-authoring.md).

## Development checks

With Python 3.10 or newer:

```sh
python3 -m unittest discover -s tests -v
```

These checks exercise the archived recipe's target restrictions; they do not
build firmware or establish a host/device permission boundary.

For native firmware setup and emulator coverage, see the
[firmware environment guide](docs/development/firmware-environment.md). ESP-IDF
setup is partially installed; its Python dependencies remain network-blocked.

## Decisions and next work

[ADR-0004 and ADR-0009](docs/adr/README.md) accept versioned hardware profiles and
kodeOS-first integration. Implementation and physical qualification remain open.
See the [task list](docs/development/task-list.md) for dependencies and progress.
The other proposed ADRs remain proposals. No v1 or production compatibility claim
is made by this scaffold.

## Licensing

MIT — see [LICENSE](LICENSE). Preserve ADR-0001's restriction against vendoring
unlicensed manufacturer examples. Verify component licences before reuse; public
source access alone is not permission to copy code.
