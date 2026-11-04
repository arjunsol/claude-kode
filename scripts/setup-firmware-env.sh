#!/usr/bin/env bash
# Compatibility entry point for cloud firmware setup; shared platform logic.
set -euo pipefail
kode_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$kode_repo_root/install.sh" --firmware-only "$@"
