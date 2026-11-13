#!/bin/bash
# Fails if scripts/secrets-scan/global_config.toml differs from the one in
# Typeform/gitleaks-config (default branch). Read-only: one `gh api` call.
# To sync: copy the upstream file over the vendored one and run `pnpm test`.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
vendored="$here/secrets-scan/global_config.toml"

upstream=$(mktemp)
trap 'rm -f "$upstream"' EXIT
gh api -H "Accept: application/vnd.github.raw" \
  repos/Typeform/gitleaks-config/contents/global_config.toml > "$upstream"

if cmp -s "$upstream" "$vendored"; then
  echo "global_config.toml is in sync with Typeform/gitleaks-config"
else
  echo "global_config.toml has drifted from Typeform/gitleaks-config:" >&2
  diff -u "$vendored" "$upstream" >&2 || true
  exit 1
fi
