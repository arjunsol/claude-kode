#!/usr/bin/env bash
# macOS Finder entry point; keep the Terminal window open to show the outcome.
kode_repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bash "$kode_repo_root/install.sh" "$@"
kode_setup_status=$?
if [[ -t 0 && " ${*} " != *' --no-pause '* ]]; then
  read -r -p 'Press Return to close this installer...' _kode_reply
fi
exit "$kode_setup_status"
