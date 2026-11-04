#!/usr/bin/env bash
# Linux/macOS terminal entry point. Installs per-user build tools, never flashes.
set -euo pipefail
kode_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for kode_python in python3 python; do
  if command -v "$kode_python" >/dev/null 2>&1 && "$kode_python" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
    exec "$kode_python" "$kode_repo_root/scripts/setup_environment.py" "$@"
  fi
done
printf '%s\n' 'Python 3.10+ is required. Install Python, then rerun. See docs/SETUP.md.' >&2
exit 1
