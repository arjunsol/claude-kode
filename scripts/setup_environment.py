#!/usr/bin/env python3
"""Per-user, build-only setup shared by the Windows, macOS and Linux launchers."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import platform
import shlex
import shutil
import stat
import subprocess
import sys
import tarfile
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
IDF_COMMIT = '8c19b156084a0753687347cca1f5355782893533'
NODE_VERSION = '24.22.1'


class SetupError(RuntimeError):
    pass


def default_state(system: str | None = None) -> Path:
    system = system or platform.system()
    if system == 'Windows':
        return Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local')) / 'claude-kode'
    if system == 'Darwin':
        return Path.home() / 'Library/Application Support/claude-kode'
    return Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'claude-kode'


def node_archive(system: str, machine: str) -> tuple[str, str]:
    arch = {'x86_64': 'x64', 'amd64': 'x64', 'arm64': 'arm64', 'aarch64': 'arm64'}.get(machine.lower())
    os_name = {'Windows': 'win', 'Darwin': 'darwin', 'Linux': 'linux'}.get(system)
    if not arch or not os_name:
        raise SetupError(f'Unsupported platform: {system}/{machine}. See docs/SETUP.md.')
    suffix = '.zip' if system == 'Windows' else '.tar.gz' if system == 'Darwin' else '.tar.xz'
    stem = f'node-v{NODE_VERSION}-{os_name}-{arch}'
    return stem, stem + suffix


def run(args: list[str | Path], *, cwd: Path = ROOT, env: dict | None = None,
        capture: bool = False) -> str:
    # Argument arrays and an explicit working directory preserve paths with spaces.
    # No user text is interpolated into shell code.
    result = subprocess.run([str(a) for a in args], cwd=cwd, env=env,
                            text=True, capture_output=capture, check=True)
    return result.stdout.strip() if capture else ''


def download(url: str, destination: Path) -> None:
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + '.part')
    try:
        with urllib.request.urlopen(url, timeout=60) as response, partial.open('wb') as out:
            shutil.copyfileobj(response, out)
        partial.replace(destination)
    except (OSError, urllib.error.URLError) as error:
        partial.unlink(missing_ok=True)
        raise SetupError(f'Download failed for {url}: {error}. Keep TLS verification enabled; check proxy/network settings.') from error


def verify_sha256(path: Path, expected: str) -> None:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected.lower():
        raise SetupError(f'SHA-256 mismatch: {path}. File will not be extracted or executed. Remove this cached file and retry from the official source.')


def safe_path(root: Path, name: str) -> Path:
    target = (root / name.replace('\\', '/')).resolve()
    if not target.is_relative_to(root.resolve()):
        raise SetupError(f'Unsafe archive path: {name}')
    return target


def extract_node(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    if archive.suffix == '.zip':
        with zipfile.ZipFile(archive) as source:
            for item in source.infolist():
                safe_path(destination, item.filename)
                if stat.S_ISLNK(item.external_attr >> 16):
                    raise SetupError('Unexpected symbolic link in Node ZIP')
            source.extractall(destination)
    else:
        with tarfile.open(archive) as source:
            for item in source.getmembers():
                safe_path(destination, item.name)
                if item.issym():
                    safe_path(destination, str(Path(item.name).parent / item.linkname))
                elif item.islnk():
                    safe_path(destination, item.linkname)
                elif not (item.isfile() or item.isdir()):
                    raise SetupError(f'Unexpected archive entry: {item.name}')
            # Node's archive is SHA-verified first; also validate extraction paths.
            if hasattr(tarfile, 'data_filter'):
                source.extractall(destination, filter='data')
            else:
                source.extractall(destination)


def ensure_node(state: Path, env: dict) -> Path:
    existing = shutil.which('node', path=env.get('PATH'))
    if existing:
        version = run([existing, '--version'], env=env, capture=True)
        if version.startswith('v24.'):
            print(f'Using Node {version}', flush=True)
            return Path(existing)
    stem, filename = node_archive(platform.system(), platform.machine())
    install_root = state / 'node'
    executable = install_root / stem / ('node.exe' if os.name == 'nt' else 'bin/node')
    if not executable.exists():
        base = f'https://nodejs.org/dist/v{NODE_VERSION}'
        manifest = state / 'downloads' / f'node-v{NODE_VERSION}-SHASUMS256.txt'
        download(base + '/SHASUMS256.txt', manifest)
        hashes = {parts[1].lstrip('*'): parts[0] for row in manifest.read_text().splitlines()
                  if len(parts := row.split()) == 2}
        if filename not in hashes:
            raise SetupError(f'Official Node manifest does not contain {filename}')
        archive = state / 'downloads' / filename
        print(f'Installing user-local Node {NODE_VERSION} ({filename})', flush=True)
        download(base + '/' + filename, archive)
        verify_sha256(archive, hashes[filename])
        # A partial prior extraction is owned by this installer, but never replace
        # an unrelated existing directory without inspection.
        if (install_root / stem).exists():
            raise SetupError(f'Incomplete Node installation at {install_root / stem}; inspect/remove it before retrying.')
        extract_node(archive, install_root)
    version = run([executable, '--version'], env=env, capture=True)
    if version != f'v{NODE_VERSION}':
        raise SetupError(f'Unexpected local Node version: {version}')
    return executable


def setup_host(state: Path, env: dict) -> Path:
    node = ensure_node(state, env)
    env['PATH'] = str(node.parent) + os.pathsep + env.get('PATH', '')
    npm_cli = (node.parent / 'node_modules/npm/bin/npm-cli.js' if os.name == 'nt'
               else node.parent.parent / 'lib/node_modules/npm/bin/npm-cli.js')
    if npm_cli.is_file():
        npm = [node, npm_cli]
    else:
        # Existing OS/package-manager installations may place npm separately.
        npm_path = shutil.which('npm', path=env['PATH'])
        if not npm_path:
            raise SetupError('Node 24 was found but npm is missing. Install npm and retry.')
        npm = [Path(npm_path)]
    print('Installing locked MCP dependencies, building and testing...', flush=True)
    for command in [['ci'], ['run', 'build'], ['test']]:
        run([*npm, *command], cwd=ROOT / 'mcp', env=env)
    run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v'], env=env)
    return node


def setup_firmware(toolchains: Path, env: dict) -> Path:
    if not shutil.which('git', path=env.get('PATH')):
        raise SetupError('Git is required for firmware setup. Install Git, reopen the terminal and retry; see docs/SETUP.md.')
    source = toolchains / 'esp-idf-v6.0.1'
    tools = toolchains / 'esp-idf-tools-v6.0.1'
    toolchains.mkdir(parents=True, exist_ok=True)
    env['IDF_TOOLS_PATH'] = str(tools)
    if not source.exists():
        run(['git', 'clone', '--depth', '1', '--branch', 'v6.0.1', '--recursive',
             '--shallow-submodules', 'https://github.com/espressif/esp-idf.git', source], env=env)
    actual = run(['git', '-C', source, 'rev-parse', 'HEAD'], env=env, capture=True)
    if actual != IDF_COMMIT:
        raise SetupError(f'Existing SDK has HEAD {actual}, expected {IDF_COMMIT}; refusing to reset it.')
    for args in [['diff', '--quiet'], ['diff', '--cached', '--quiet']]:
        run(['git', '-C', source, *args], env=env)
    submodules = run(['git', '-C', source, 'submodule', 'status', '--recursive'], env=env, capture=True)
    # run(capture=True) strips the first leading blank; inspect markers per line.
    if not submodules or any(row.startswith(('-', '+', 'U')) for row in submodules.splitlines()):
        raise SetupError('SDK submodules are incomplete or mismatched; inspect before rerunning. No local files were reset.')
    idf_tools = source / 'tools/idf_tools.py'
    for args in [['install', '--targets', 'esp32p4'], ['install', 'cmake', 'ninja'],
                 ['install-python-env'], ['check-python-dependencies']]:
        run([sys.executable, idf_tools, *args], env=env)
    return source


def ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_activation(state: Path, node: Path | None, source: Path | None, toolchains: Path) -> None:
    # Generate new files only in our per-user state directory, not shell profiles.
    sh = ['# Source this file in bash/zsh.']
    ps = ['# Dot-source this file in PowerShell.']
    cmd = ['@echo off']
    if node:
        sh.append(f'export PATH={shlex.quote(str(node.parent))}:"$PATH"')
        ps.append(f'$env:PATH = {ps_quote(str(node.parent))} + [IO.Path]::PathSeparator + $env:PATH')
        cmd.append('set "PATH=' + str(node.parent).replace('%', '%%') + ';%PATH%"')
    if source:
        tools = str(toolchains / 'esp-idf-tools-v6.0.1')
        sh += [f'export IDF_TOOLS_PATH={shlex.quote(tools)}', f'. {shlex.quote(str(source / "export.sh"))}']
        ps += [f'$env:IDF_TOOLS_PATH = {ps_quote(tools)}', f'. {ps_quote(str(source / "export.ps1"))}']
        cmd += ['set "IDF_TOOLS_PATH=' + tools.replace('%', '%%') + '"',
                'call "' + str(source / 'export.bat').replace('%', '%%') + '"']
    for name, lines in [('activate.sh', sh), ('activate.ps1', ps), ('activate.cmd', cmd)]:
        (state / name).write_text('\n'.join(lines) + '\n',
                                  encoding='utf-8-sig' if name.endswith('.ps1') else 'utf-8')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--host-only', action='store_true', help='Install/test Node MCP tools; skip ESP-IDF')
    group.add_argument('--firmware-only', action='store_true', help='Install ESP-IDF; skip Node MCP tools')
    parser.add_argument('--state-dir', type=Path, default=default_state())
    parser.add_argument('--no-pause', action='store_true', help='For noninteractive OS launchers')
    args = parser.parse_args(argv)
    if sys.version_info < (3, 10):
        parser.error('Python 3.10 or newer is required; see docs/SETUP.md.')
    state = args.state_dir.expanduser().resolve()
    state.mkdir(parents=True, exist_ok=True)
    toolchains = Path(os.environ.get('KODE_TOOLCHAIN_ROOT', state / 'toolchains')).expanduser().resolve()
    env = os.environ.copy()  # Preserve injected authentication, CA trust and proxies.
    try:
        print(f'Build-only setup. State: {state}', flush=True)
        node = setup_host(state, env) if not args.firmware_only else None
        source = setup_firmware(toolchains, env) if not args.host_only else None
        write_activation(state, node, source, toolchains)
        print(f'Setup passed ({"host only" if args.host_only else "firmware only" if args.firmware_only else "host + firmware tools"}).', flush=True)
        print(f'Activation files: {state / "activate.sh"}, activate.ps1, activate.cmd', flush=True)
        print('No device was contacted. Firmware compilation and physical qualification are separate checks.', flush=True)
        return 0
    except (SetupError, subprocess.CalledProcessError, OSError) as error:
        print(f'SETUP INCOMPLETE: {error}', file=sys.stderr, flush=True)
        print('Fix the reported prerequisite and rerun the same launcher. See docs/SETUP.md.\n'
              'No success or firmware-readiness claim is made for this run.', file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
