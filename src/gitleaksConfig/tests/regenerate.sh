#!/bin/bash
# Regenerates golden/*.toml with the OLD generator (Typeform/gitleaks-config,
# tomlkit==0.11.1). Usage: regenerate.sh <path to a gitleaks-config clone>
# The goldens are the byte-for-byte reference the vitest compares against.
set -euo pipefail
clone=$(cd "$1" && pwd)
here=$(cd "$(dirname "$0")" && pwd)
venv=$(mktemp -d)
python3 -m venv "$venv"
"$venv/bin/pip" -q install tomlkit==0.11.1

gen() { # gen <global> <repo-or-empty> <out>
  work=$(mktemp -d)
  cp "$1" "$work/global_config.toml"
  [ -n "$2" ] && cp "$2" "$work/.gitleaks.toml"
  (cd "$work" && "$venv/bin/python" "$clone/gitleaks_config_generator.py") > "$3"
}

global="$here/../../../scripts/secrets-scan/global_config.toml"
cmp "$global" "$clone/global_config.toml"   # vendored copy must match the clone
gen "$global" "" "$here/golden/none.merged.gitleaks.toml"
for f in "$here"/fixtures/*.gitleaks.toml; do
  n=$(basename "$f" .gitleaks.toml)
  gen "$global" "$f" "$here/golden/$n.merged.gitleaks.toml"
done
for g in "$here"/variant/*.global.toml; do
  n=$(basename "$g" .global.toml)
  gen "$g" "$here/variant/$n.repo.toml" "$here/variant/$n.merged.gitleaks.toml"
done
