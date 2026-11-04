#!/usr/bin/env bash
# Cloud build-only prerequisites. This script never connects to a device.
set -euo pipefail
kode_toolchain_root="${KODE_TOOLCHAIN_ROOT:-/workspace/toolchains}"
kode_idf_source="$kode_toolchain_root/esp-idf-v6.0.1"
kode_idf_commit=8c19b156084a0753687347cca1f5355782893533
export IDF_TOOLS_PATH="$kode_toolchain_root/esp-idf-tools-v6.0.1"
mkdir -p "$kode_toolchain_root"
if [ ! -e "$kode_idf_source" ]; then
  git clone --depth 1 --branch v6.0.1 --recursive --shallow-submodules \
    https://github.com/espressif/esp-idf.git "$kode_idf_source"
fi
# Preserve unknown installations or local edits instead of resetting them.
test "$(git -C "$kode_idf_source" rev-parse HEAD)" = "$kode_idf_commit"
git -C "$kode_idf_source" diff --quiet
git -C "$kode_idf_source" diff --cached --quiet
kode_submodules="$(git -C "$kode_idf_source" submodule status --recursive)"
if [[ -z "$kode_submodules" ]] || printf '%s\n' "$kode_submodules" | rg -q '^[+U-]'; then
  printf '%s\n' 'SDK submodules are missing or mismatched; inspect the installation before continuing.' >&2
  exit 1
fi
python3 "$kode_idf_source/tools/idf_tools.py" install --targets esp32p4
python3 "$kode_idf_source/tools/idf_tools.py" install cmake ninja
# Retain official constraints, TLS checks and tool-manifest checksum verification.
python3 "$kode_idf_source/tools/idf_tools.py" install-python-env
printf 'Activate with: export IDF_TOOLS_PATH=%q; source %q\n' "$IDF_TOOLS_PATH" "$kode_idf_source/export.sh"
