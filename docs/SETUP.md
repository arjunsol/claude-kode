# Development environment setup

These launchers prepare the source checkout for development on Windows, macOS or
Linux. They install per-user tools, build/test the MCP prototype and prepare the
pinned P4 firmware toolchain. They do not flash, open serial ports, change system
packages or install the plugin into Claude Code automatically.

## Before the first click

Obtain this repository, including the `mcp/package-lock.json` file, and install:

- **Python 3.10+** with pip/venv; **3.12 is recommended** for this toolchain.
- **Git** on PATH, with HTTPS access to GitHub. On macOS, complete the Xcode
  Command Line Tools installation first so `git` works without an install prompt.
- An Internet connection and several GB of free disk space for the SDK/compiler.

Node is optional as a prerequisite: the installer reuses Node **24.x**, or installs
**24.22.1** into its own per-user directory using the official Node distribution
and SHA-256 manifest. It leaves other system Node versions unchanged. Existing
Node 24 installations must include npm.

On Debian/Ubuntu, install `python3`, `python3-venv` and `git` with the system package
manager if missing. Use the corresponding native packages on other distributions.
On Windows use Python from [python.org](https://www.python.org/downloads/windows/)
and [Git for Windows](https://git-scm.com/downloads/win); enable their command-line
launchers/PATH options. On macOS use a supported Python installation and Git.
These prerequisites are explicit; the launchers do not silently run admin package
managers or change security settings.

## One-click launchers

| Platform | Entry point | Terminal equivalent |
|---|---|---|
| Windows | Double-click `install.cmd` | `install.cmd` |
| macOS | Double-click `install.command` | `bash install.command` |
| Linux | Run `install.sh` in a terminal (or choose “Run in Terminal” in a file manager that supports it) | `bash install.sh` |

Run from any working directory; paths containing spaces are supported. Keep the
launchers beside the repository's `scripts/` and `mcp/` directories. If a ZIP
extractor loses executable permissions, use the terminal equivalent, or restore
permissions to the shell launchers. If OS download policies block execution,
inspect the files and follow the OS's normal trusted-file procedure; do not
disable system protections.

Default setup runs:

1. Node selection/bootstrap with verified official distribution checksums.
2. `npm ci`, TypeScript compilation, six MCP tests and the Python test suite.
3. ESP-IDF **6.0.1**, exact commit `8c19b156084a0753687347cca1f5355782893533`,
   with its pinned submodules, P4 compiler/debug tools, CMake and Ninja.
4. The official constrained IDF Python setup and dependency check.
5. Activation files written only after the selected setup mode succeeds.

ESP-IDF's installer verifies its tool artifacts against its manifest. TLS and
Python constraints remain enabled. The script refuses to reset an unexpected
SDK revision or overwrite a dirty checkout. Upstream build tools, the SDK and
generated activation files live outside the repository. `npm ci` refreshes the
checkout's generated `mcp/node_modules` directory and `mcp/dist` is rebuilt; do not
keep hand-edited work in those generated directories.

A nonzero exit reports **SETUP INCOMPLETE**. Read the preceding command's error,
fix the prerequisite and rerun the same launcher. Do not infer success from a
partially installed compiler. Successful host tests are not proof of firmware
compilation or production device compatibility.

## Modes and locations

For plugin/MCP work without firmware downloads:

```sh
# Linux/macOS
bash install.sh --host-only
# Windows
install.cmd --host-only
```

For firmware tools only, use `--firmware-only`. The old
`scripts/setup-firmware-env.sh` entry point delegates to that same shared
installer, so its pins and validation do not drift.

State defaults:

| OS | Default state directory |
|---|---|
| Windows | `%LOCALAPPDATA%\claude-kode` |
| macOS | `~/Library/Application Support/claude-kode` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/claude-kode` |

Override with `--state-dir "path with spaces"`. SDK/tools default to the state's
`toolchains/` subdirectory. Set `KODE_TOOLCHAIN_ROOT` to reuse an existing toolchain
root, including `/workspace/toolchains` in this cloud environment. An existing
SDK must match the pin and have clean tracked files/submodules. Cached tool
artifacts and installed SDKs are reused. An incomplete Node extraction is
reported for inspection rather than blindly deleting user files.

For unattended Windows use, set `CI=1` or `KODE_SETUP_NO_PAUSE=1` before invoking
`install.cmd`; that launcher otherwise pauses so double-click users can read the
result. The macOS launcher accepts `--no-pause`. The Python runner accepts the
same setup modes directly:

```sh
python scripts/setup_environment.py --host-only --state-dir "my state"
```

## Activate after success

The last successful setup mode writes `activate.sh`, `activate.ps1` and
`activate.cmd` into the selected state directory. Host-only activation includes
Node; full/firmware activation also runs the official IDF export script.

```sh
# bash/zsh — substitute the state directory printed by the installer
source "/path/to/state/activate.sh"
```

```powershell
# PowerShell
. 'C:\path to state\activate.ps1'
```

```bat
rem Command Prompt
call "C:\path to state\activate.cmd"
```

Activation affects that terminal only. The installer does not edit shell profiles.
For MCP checks, run `npm run build` and `npm test` in `mcp/`. For firmware, start
with an external scratch copy of the SDK hello_world sample and perform a
build-only P4 check as described in [the firmware guide](development/firmware-environment.md).
The production Doom example additionally requires its game asset; the Arduino
fork and native IDF sample have distinct compatibility assumptions.

Claude Code itself is a separate prerequisite for interactive plugin testing.
After setup, use `claude --plugin-dir /absolute/path/to/claude-kode`. See
[plugin validation](development/plugin-authoring.md); no production deployment
permission or verified hardware profile is supplied by this install.

## Restricted networks and certificates

Preserve the shell's configured proxy, authentication and CA settings. Never paste
secret values into scripts or disable TLS verification. A managed-network setup
may need these destinations:

- GitHub and its release/codeload asset hosts, including raw.githubusercontent.com.
- `nodejs.org`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`.
- `dl.espressif.com` for official constraints/wheels.
- `components.espressif.com` and `components-file.espressif.com` for managed
  components used by firmware projects.

This cloud instance still returns proxy CONNECT 403 for the official IDF
constraints download. Required network additions and reusable setup instructions
are saved in the environment draft. Review/save those settings and publish as
required by the product, then retry setup. Changing a draft alone does not change
runtime access. Do not bypass the official constraints to obtain a passing run.

## Verified scope

On this Linux instance, the official Node bootstrap download/checksum/extraction
and actual host-only launcher passed. Six MCP tests and thirteen Python tests ran.
Firmware-only setup reuses the installed SDK/tools and fails at the diagnosed
constraints access check. No full firmware build passed.

Windows/macOS execution has not been validated locally. The included
[workflow](../.github/workflows/setup.yml) retains manual host checks for all three
launchers with checkout and state paths containing spaces. Automatic push/PR
triggers are removed and the hosted workflow is disabled at the owner's request.
Re-enable it in GitHub Actions before requesting any manual run. Hosted validation remains unverified;
previous jobs did not start because GitHub reported an account billing lock.
This is host setup coverage, not Windows/macOS firmware or physical-device
qualification. No full P4/C5 Kode Dot emulator is established; see the firmware
guide for QEMU limits and the distinction between mocks and physical tests.
