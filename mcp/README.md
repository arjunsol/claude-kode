# Claude Kode MCP server

A locally launched TypeScript MCP stdio server (`claude-kode-feasibility`, version 0.2.0)
for the production Kode Dot (ESP32-P4 main chip, ESP32-C5 coprocessor). It answers
questions from a source-level evidence registry, scaffolds, validates and builds kodeOS
app projects, and inspects the built image. **It is not a flashing, installation,
motor-control, RF-transmission, remote-device or arbitrary console-command server.**
Nothing here has been run against a physical Dot.

## Build and test

Run on Node 24.x with the locked dependencies:

```sh
cd mcp
npm ci
npm run build
npm test
```

`npm test` runs without a device, without ESP-IDF and without network access. It runs 149
tests: 148 pass and 1 is skipped, with or without the template variable below. One test
scaffolds from a real `kode-app-template` v0.1.0 checkout and is skipped unless you set
`KODE_TEST_TEMPLATE_DIR` to that checkout (an absolute path). With the variable set, the
test that checks the refusal without a template is skipped instead.

The plugin root `.mcp.json` declares the built `mcp/dist/server.js` using
`${CLAUDE_PLUGIN_ROOT}`. Run the build before enabling the plugin, start Claude Code with
`claude --plugin-dir /absolute/path/to/claude-kode` and inspect `/mcp`. Direct execution
is `node mcp/dist/server.js`. stdout carries MCP JSON-RPC only; no HTTP listener or cloud
service is created.

## Tools

Seventeen tools are registered. Effect classes are defined in the PR #6 proposal: S0
reads the registry, H0 reads host files or configuration, H1 writes files on the host,
D1 opens the device's serial port.

| Name | What it does | Effect | Default |
| --- | --- | --- | --- |
| `inspect_capability` | Simulated test fixture from PR #2; not evidence about a device | S0 | Available |
| `kode_ping` | Runs official `kcli.py ping` | D1 | Needs operator opt-in |
| `kode_boot_info` | Runs fixed `cmd boot_info` | D1 | Needs operator opt-in |
| `kode_list_apps` | Runs fixed `cmd app_list` | D1 | Needs operator opt-in |
| `kode_capture_screen` | Captures a PNG through the console and deletes the temporary file | D1 | Needs operator opt-in |
| `kode_get_capabilities` | Board, SDK and console capabilities with evidence state. With no `capability` filter it returns `not_verified` (`EVIDENCE_CONFLICTING`), because the full list holds the two contradicting flash-offset claims; one clean capability returns `ok` | S0 | Available |
| `kode_get_pinout` | J3 expansion header positions, controllers, power, board-owned pins | S0 | Available |
| `kode_list_modules` | The five v1 modules with SDK availability and qualification | S0 | Available |
| `kode_get_module_spec` | What is recorded and unknown about one module | S0 | Available |
| `kode_get_evidence` | Evidence ledger: source, revision, state, review date, conflicts | S0 | Available |
| `kode_check_compatibility` | Deterministic, advisory allow or refuse for an operation. A refusal is `status: refused` and a tool error carrying the first reason code; an allowed serial read carries `cautions` | S0 | Available |
| `kode_get_sdk_contract` | kodeOS app contract for an assessed SDK release; a hazard is served only for a release its claim applies to, and console digests are keyed by kodeOS release (`console.integrityByKodeosRelease`) | S0 | Available |
| `kode_get_toolchain_status` | Reports host configuration; starts no process | H0 | Available |
| `kode_new_app` | Creates a project in the workspace from a verified template checkout | H1 | Needs `KODE_WORKSPACE_ROOT` and `KODE_TEMPLATE_DIR` |
| `kode_validate` | Static checks of a workspace project; reads files only. Returns a `verdict` and, separately, `buildLogic.eligible` (whether `kode_build` will accept the project) | H0 | Needs `KODE_WORKSPACE_ROOT` |
| `kode_build` | Runs the one fixed `idf.py build` command, only for a project whose build logic is the pinned template's; not a sandbox | H1 | Needs operator opt-in |
| `kode_inspect_image` | Parses the built image and build metadata; reads files only. `ok` and `verifiedLayer: build` only for an image `kode_build` produced in this server process; otherwise `BUILD_NOT_OBSERVED` | H0 | Needs `KODE_WORKSPACE_ROOT` |

Tools take a project name, never a path. A name is 1 to 31 characters of `a-z`, `0-9` and
underscore, and is never `kodeos` or `c5_slave`. Projects live at
`<KODE_WORKSPACE_ROOT>/<name>`; links and junctions that leave the workspace are refused.
No tool accepts a device command, a serial port, a Python executable, a flash offset or an
approval.

### Specified, not implemented

PR #6 specifies a catalogue of 47 operations. Only the tools above exist. Not implemented:
`kode_detect`, `kode_identify_device`, `kode_device_health`, `kode_serial_monitor`,
`kode_test`, `kode_test_evidence`, `kode_plan_install`, `kode_install_app`,
`kode_verify_firmware`, and every module tool. There is no flash, install, erase, kodeOS
update, C5 update, radio or actuator tool. `kode_check_compatibility` can name such an
operation and will refuse it.

## Resources

| URI | Content |
| --- | --- |
| `kode://profiles/kode-dot-p4c5` | Board identity and capabilities with evidence |
| `kode://sdk/v0.1.1/app-contract` | The kode-sdk v0.1.1 application contract |
| `kode://evidence/ledger` | Every evidence record |
| `kode://modules/maker` | Maker module, as recorded |
| `kode://modules/robotics` | Robotics module, as recorded |
| `kode://modules/camera` | Camera module, as recorded |
| `kode://modules/mesh` | Mesh module, as recorded |
| `kode://modules/fck` | F*CK module, as recorded |

Each resource is the same data the matching tool returns, as one JSON document.

## Result envelope

Every tool except `inspect_capability` and the four console tools returns one envelope,
both as structured content and as JSON text:

- `schemaVersion` (`"1"`), `tool`, `message`.
- `status`: `ok`, `refused`, `not_verified`, `unsupported` or `failed`.
- `reasonCode`: a value from a closed list (for example `BUILD_NOT_ENABLED`), so a caller
  can branch on it. The build gate adds `BUILD_LOGIC_NOT_PINNED` (`kode_build` refused a
  project whose build logic is not the pinned template's) and `BUILD_NOT_OBSERVED`
  (`kode_inspect_image` read files this server did not build).
- `effectClass`: the tool's effect class.
- `verifiedLayer`: `none`, `documentation`, `source`, `build`, `simulation`, `device` or
  `integration`. No tool in this slice returns `device` or `integration`.
- `hardwareAuthorized`: the literal `false`. No tool can authorise a hardware operation.
- `payload`, `evidence[]` (`claimId`, `sourceUri`, `revision`, `class`, `verifiedAt`),
  `artefactSha256` and `requiredNextEvidence[]`.

A `refused` or `failed` result is also an MCP tool error (`isError: true`). This includes
the scope gates (`PROFILE_UNKNOWN`, `SDK_RELEASE_NOT_ASSESSED`,
`BOARD_REVISION_NOT_IN_PROFILE`) on every knowledge tool; `not_verified` is kept for
answers that are served but cannot be relied on. A refusal from
`kode_build` with builds disabled has this shape (message shortened):

```json
{
  "schemaVersion": "1",
  "tool": "kode_build",
  "status": "refused",
  "reasonCode": "BUILD_NOT_ENABLED",
  "message": "Builds are off. A build executes project and SDK build scripts on this host; the operator enables it with KODE_ENABLE_BUILD=1.",
  "effectClass": "H1",
  "verifiedLayer": "none",
  "hardwareAuthorized": false,
  "evidence": [],
  "requiredNextEvidence": []
}
```

## Host configuration

The server reads its environment once per call. Everything is off or empty by default.

| Variable | Default | What it does |
| --- | --- | --- |
| `KODE_WORKSPACE_ROOT` | empty | Absolute directory that exists. The only place tools read or write projects. Without it `kode_new_app`, `kode_validate`, `kode_build` and `kode_inspect_image` refuse with `WORKSPACE_NOT_CONFIGURED`. |
| `KODE_TEMPLATE_DIR` | empty | Absolute path of a `kode-app-template` v0.1.0 checkout. `kode_new_app` hash-checks every file against the tag; CRLF checkouts of text files are accepted after normalisation. |
| `KODE_ENABLE_BUILD` | unset | `1` enables `kode_build`. Any other value leaves it refused. |
| `KODE_IDF_PATH` | empty | Absolute path of an ESP-IDF v6.1 checkout. |
| `KODE_IDF_PYTHON` | empty | The Python interpreter of that ESP-IDF environment. |
| `KODE_BUILD_TIMEOUT_S` | 1800 | Build deadline in seconds. Accepts integers 60 to 7200; any other value gives the default. |
| `KODE_ENABLE_CONSOLE_READS` | unset | `1` enables the four console tools (see below). |
| `KODE_TOOLS_DIR` | empty | Absolute path of the KodeOS `tools` directory. |
| `KODE_CLI_SHA256`, `KODE_PAYLOAD_SHA256` | empty | Operator-pinned SHA-256 of `kcli.py` and `kpayload.py`. |
| `KODE_PORT` | empty | Explicit Windows port, `COM1` to `COM256`. |
| `KODE_PYTHON` | `python` on Windows, `python3` elsewhere | Python used to run `kcli.py`. |

Build setup in PowerShell, from a terminal where the ESP-IDF v6.1 environment is
already activated:

```powershell
$env:KODE_WORKSPACE_ROOT = 'C:\kode-projects'          # must exist
$env:KODE_TEMPLATE_DIR   = 'C:\src\kode-app-template'  # v0.1.0 checkout
$env:KODE_IDF_PATH       = $env:IDF_PATH
$env:KODE_IDF_PYTHON     = (Get-Command python).Source
$env:KODE_ENABLE_BUILD   = '1'
```

Launch Claude Code from that same terminal. `kode_build` needs the server to be started
from an activated ESP-IDF v6.1 environment; without it the toolchain check refuses with
`TOOLCHAIN_NOT_CONFIGURED` or `TOOLCHAIN_VERSION_MISMATCH`. Call
`kode_get_toolchain_status` to see what the host is missing.

`kode_build` runs exactly `<KODE_IDF_PYTHON> <KODE_IDF_PATH>/tools/idf.py -C <project> -B <project>/build build`,
with no shell, one attempt and a bounded time, after the project passes validation and the
build gate. **A build is not a sandbox.** It runs the SDK's CMake and Python code and
fetches the pinned SDK over the network by tag. Enable it only for projects you trust, and
build with no Dot attached. At the deadline the whole process tree is ended; the timeout
message says so only when that was confirmed.

### What kode_build will and will not build

`idf.py build` executes the project's CMake and would import a project `idf_ext.py`, so
fixing the command line does not by itself limit what a build does. `kode_build` therefore
builds only a project whose build logic is the pinned template's, and otherwise refuses
with `BUILD_LOGIC_NOT_PINNED` before any process starts. In practice that means a project
made by `kode_new_app` whose build logic has not been altered.

- The root `CMakeLists.txt` and `main/idf_component.yml` must hash to the pinned
  template's once the scaffold's own edits (name, version, SDK release line) are reversed.
- `main/CMakeLists.txt` must be one `idf_component_register(...)` call with plain relative
  names.
- No `idf_ext.py`, extra `*.cmake`, extra `CMakeLists.txt`, top-level `components/` or
  `sdkconfig.defaults.<x>`; no links; a root `sdkconfig`, if present, keeps the app role
  and the ESP32-P4 target.

Still the app author's to edit: source files, `sdkconfig.defaults`, `appdata/` and the
`SRCS` list in `main/CMakeLists.txt`. `kode_validate` reports the gate as `buildLogic`
(rule ids begin `BL-`), so a project can pass the verdict and still be ineligible. A
pre-existing `managed_components/` or `dependencies.lock` cannot be verified; it is
reported as a warning (`BL-UNVERIFIABLE`) and does not block the build.

### Build receipts

Files under `build/` can be written by anything. `kode_build` records the digest of the
image it produced, in memory, for the life of the server process, and `kode_inspect_image`
reports `ok` with `verifiedLayer: build` only for an image with a receipt. Any other image
is `not_verified` with `BUILD_NOT_OBSERVED` and `verifiedLayer: none`; the payload still
describes the files (`buildObserved: false`). Receipts are not written to disk, so a server
restart clears them and every image is unattested until it is built again.

## Console read opt-in (Windows, example PowerShell)

The four console tools are off until the operator opts in. **Opening the official USB
serial connection can reset the Dot.** The chosen console verbs are informational, but
serial attachment is not side-effect-free, so the tool annotations do not claim
`readOnlyHint=true`.

1. Obtain a checked-out, trusted [kodediy/KodeOS](https://github.com/kodediy/KodeOS)
   release tag (v0.1.1 is the current pin; v0.1.0 is also assessed). Do not use the moving
   `develop` branch. Install Python and pyserial in a trusted environment (ESP-IDF
   provides Python). Leave the manufacturer files outside this MIT repository.
2. In the terminal from which Claude Code is launched, set the tools directory, its two
   operator-pinned SHA-256 values and the COM port:

```powershell
$env:KODE_TOOLS_DIR = (Resolve-Path 'C:\src\KodeOS\tools').Path
$env:KODE_CLI_SHA256 = (Get-FileHash "$env:KODE_TOOLS_DIR\kcli.py" -Algorithm SHA256).Hash
$env:KODE_PAYLOAD_SHA256 = (Get-FileHash "$env:KODE_TOOLS_DIR\kpayload.py" -Algorithm SHA256).Hash
$env:KODE_PORT = 'COM7'                 # replace with the connected Dot's port
$env:KODE_PYTHON = 'python'            # or full path to a trusted venv's python.exe
$env:KODE_ENABLE_CONSOLE_READS = '1'   # explicit opt-in: serial can reset the Dot
```

The digests below are the SHA-256 of the files as stored in each tagged commit (LF line
endings). `kode_get_toolchain_status` reports which release your `kcli.py` pin matches.

| Release | `tools/kcli.py` SHA-256 | `tools/kpayload.py` SHA-256 |
| --- | --- | --- |
| v0.1.1 | `a8c65236b51a904ee879c4ee1776612065417fae45eb4d15dc367c0cb737bcca` | `2d422a6982a9c3a7bb545bd53c55c3e77e02a9864b81bae095375007f1690d2e` |
| v0.1.0 | `8df04628aa2b2acf09bc60d42814a573e7545cdf99f07ad0318ca723d39ca750` | `2d422a6982a9c3a7bb545bd53c55c3e77e02a9864b81bae095375007f1690d2e` |

A Windows checkout with `core.autocrlf=true` produces different bytes, so its hashes will
not match this table. Hash your own checkout, as the example above does, after verifying
the tag independently.

The pins are local operator pins, not a cryptographic attestation of upstream provenance.
They stop the server silently running changed local scripts. Because `kcli.py` imports
other Python dependencies, this is not a complete subprocess sandbox. The server refuses
every console operation if the opt-in is absent, the port is not `COM1` to `COM256`,
either SHA is wrong, a script is missing, or the operation is not one of the four fixed
verbs. Set `KODE_ENABLE_CONSOLE_READS=0` for ordinary use.

Console output or a screenshot may contain serial numbers, screen contents or other
personal information. These go to the requesting MCP client without telemetry; screenshots
exist only in a random temporary directory while the command runs. Avoid forwarding
captured results to third-party services unless you intend to.

## Evidence and boundaries

Evidence is kept in four artefact stages and a four-level test scale. The stages
`kode_inspect_image` keeps apart are: a source project; a compiled image; an image
compatible with kodeOS installation (a source-level judgement); and a device-verified
image, which is never claimed and always reads `NOT TESTED`. The test levels are L1
(build), L2 (simulation), L3 (device) and L4 (module integration). No L1 to L4 test record
exists in the registry. `kode_build` reports observed L1 evidence for the host that ran it,
and that is not recorded in the registry.

What remains unverified:

- Any real `idf.py build`: no ESP-IDF v6.1 was available when this slice was written.
- Anything on a physical Dot, including what board revision a retail unit reports. The SDK
  declares `KBSP_BOARD_REV "DVT"`, the only revision the profile knows.
- All five modules. Electrical data, detection and qualification are `unknown` for each,
  and four module SDK repositories returned HTTP 404 on 13 November 2026.
- A v0.1.0 template built against SDK v0.1.1.
- The raw flash offset conflict: the template README prints `0x1C00000` while the SDK
  partition table puts `app_pending` at `0x1A00000`. It is unresolved, no tool uses a raw
  offset, and `kode_new_app` does not copy that README.
- Installation, recovery and kodeOS self-update. A Dot can update its own kodeOS to a
  release nobody assessed, so the installed release must be read from the device.

The host-policy layer is one safety boundary. Shell tools available to Claude Code are
outside this server's enforcement. Tag-pinned facts expire on 2027-02-11 and upstream
availability facts on 2026-11-27; after that the tools answer `not_verified` until the
registry is re-audited. See
[the design and evidence record](../docs/development/f1-capability-evidence-build.md).

Pinned MCP SDK is v1.32.2 with an exact npm lock. The MCP TypeScript SDK v2 can be
evaluated in a separate migration.

## Licence boundary

This package is original MIT-licensed TypeScript. Facts about upstream sources are
recorded; no upstream code is copied. The KodeOS Python scripts, the SDK and the app
template are GPL-3.0-or-later and are not vendored here: `kode_new_app` reads the
operator's own template checkout and writes a project that is GPL-3.0-or-later. The server
runs the manufacturer's console client from the operator's checkout as a separate
process. Review redistribution and commercial licensing separately.
