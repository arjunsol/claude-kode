# Claude Kode MCP — first read-only device slice

A locally launched TypeScript MCP stdio server, building on the original
`inspect_capability` simulation fixture. **This is not a flashing, motor-control,
RF-transmission, remote device or arbitrary console-command server.**

## Build and test

Run on Node **24.x** with the repository's locked dependencies:

```sh
cd mcp
npm ci
npm run build
npm test
```

The plugin root `.mcp.json` declares the built `mcp/dist/server.js` using
`${CLAUDE_PLUGIN_ROOT}`. Run the build before enabling the plugin; start Claude
Code with `claude --plugin-dir /absolute/path/to/claude-kode` and inspect
`/mcp`. Direct execution is `node mcp/dist/server.js`. stdout is **only** MCP
JSON-RPC; no HTTP listener or cloud service is created.

## Tools

| Name | Behaviour | Default |
| --- | --- | --- |
| `inspect_capability` | Existing simulated P4/C5 fixture only | Available |
| `kode_ping` | Run official `kcli.py -p COMx ping` | Blocked |
| `kode_boot_info` | Run fixed `cmd boot_info` and return observations | Blocked |
| `kode_list_apps` | Run fixed `cmd app_list` and return observations | Blocked |
| `kode_capture_screen` | Capture PNG through the official console and return MCP image; delete temporary file | Blocked |

No tool accepts caller-supplied device commands, file paths, serial ports,
Python executables or write/flash options. Host process execution uses
`execFile` with an argv array and **no shell**, limited output/timeout and no
automatic retry. No device discovery is attempted.

**Caution:** Opening the official USB serial connection can **reset the Dot**.
Although the chosen console verbs are informational, serial attachment is not
perfectly side-effect-free; MCP tool annotations deliberately do not claim
`readOnlyHint=true` for hardware calls. Device identity is **not yet fully
validated** by these observations.

## Operator opt-in (Windows, example PowerShell)

1. Obtain a checked-out, trusted **v0.1.0** of
   [kodediy/KodeOS](https://github.com/kodediy/KodeOS/releases/tag/v0.1.0).
   Do not use the moving `develop` branch. Install Python/pyserial in a trusted
   environment (ESP-IDF provides Python). Leave the manufacturer files outside
   this MIT repository.
2. In the terminal from which Claude Code is launched, set the official tools
   directory, its two **operator-pinned SHA-256** values and explicit COM port:

```powershell
$env:KODE_TOOLS_DIR = (Resolve-Path 'C:\src\KodeOS\tools').Path
$env:KODE_CLI_SHA256 = (Get-FileHash "$env:KODE_TOOLS_DIR\kcli.py" -Algorithm SHA256).Hash
$env:KODE_PAYLOAD_SHA256 = (Get-FileHash "$env:KODE_TOOLS_DIR\kpayload.py" -Algorithm SHA256).Hash
$env:KODE_PORT = 'COM7'                 # replace with the connected Dot's port
$env:KODE_PYTHON = 'python'            # or full path to a trusted venv's python.exe
$env:KODE_ENABLE_CONSOLE_READS = '1'   # explicit opt-in: serial can reset the Dot
```

SHA values are **local operator pins**, not a cryptographic attestation of
upstream provenance. First verify the checkout/tag independently; the two pins
then prevent silently running changed local scripts. Because `kcli.py` imports
other Python dependencies, this is **not a complete subprocess sandbox**.

Re-launch Claude Code from that terminal. For ordinary use or after testing,
set `KODE_ENABLE_CONSOLE_READS=0`. The server always refuses device operations
if the opt-in is absent, port is not `COM1`–`COM256`, either SHA is wrong,
its script is missing, or the operation is not allowlisted.

The console output or screenshot may contain serial numbers, screen contents
or other personal information. These are returned to the requesting MCP client
without telemetry; screenshots are held in a random temporary directory only
while the command executes, then removed. Avoid forwarding captured results to
third-party services unless you intend to.

## Evidence and boundaries

- Source: [official KodeOS tools/kcli.py v0.1.0](https://github.com/kodediy/KodeOS/blob/v0.1.0/tools/kcli.py)
  and [kpayload.py v0.1.0](https://github.com/kodediy/KodeOS/blob/v0.1.0/tools/kpayload.py).
- Build and console APIs are documented in official source, **not verified here
  on a production Dot**. Hardware testing must still demonstrate actual port,
  firmware identity, command output, screenshots and the post-reset state.
- Production firmware installation is a separate future feature. App-role
  `idf.py flash` is redirected by the official SDK, but no MCP write/flash
  endpoint exists, and raw `esptool` offsets are deliberately disallowed.
- The host-policy layer is only one safety boundary; external shell tools
  available to Claude Code are outside this MCP's enforcement.
- Currently pinned MCP SDK v1.32.2 in the earlier scaffold, with exact npm lock.
  The newer MCP TypeScript SDK v2 can be evaluated in a separate versioned
  migration rather than silently changing the package contract mid-PR.

Run `npm test` for injected fake-console tests and an independent MCP client
protocol test. These test **host control flow**, not actual device behaviour.
