#!/bin/bash
# custom-rules: run Typeform's Opengrep rules (rules/ at the root of this action)
# against the repo. On pull requests only findings the PR introduces are reported
# (--baseline-commit at the merge base). Findings become GitHub annotations; the
# check fails only on rules with severity ERROR.
#
#   run.sh         scan $GITHUB_WORKSPACE (or the current directory)
#   run.sh test    run the rules' own tests (rules/**/<rule>.<ext> annotated files)
#
# OPENGREP_BIN overrides the pinned download (e.g. for local runs).

set -euo pipefail

OPENGREP_VERSION="v1.30.0"
OPENGREP_SHA256_X86="35779bdd72e92129c8df2a77f0c55e8c08356801ea92591ef32108d6b28d564c"
OPENGREP_SHA256_AARCH64="a5d5a4a58ba5d46ff51e921663da1c2bba38f4b03987f4aeec87f16c6ad3ecae"

RULES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../rules" && pwd)"

install_opengrep() {
    if [ -n "${OPENGREP_BIN:-}" ]; then echo "$OPENGREP_BIN"; return; fi
    case "$(uname -m)" in
        x86_64)        arch=x86;     sha="$OPENGREP_SHA256_X86" ;;
        aarch64|arm64) arch=aarch64; sha="$OPENGREP_SHA256_AARCH64" ;;
        *) echo "::error::custom-rules: unsupported architecture $(uname -m)" >&2; exit 1 ;;
    esac
    local dir="${RUNNER_TEMP:-/tmp}/opengrep-${OPENGREP_VERSION}"
    local bin="$dir/opengrep"
    if [ ! -x "$bin" ]; then
        mkdir -p "$dir"
        curl -fsSL --retry 3 -o "$bin" \
            "https://github.com/opengrep/opengrep/releases/download/${OPENGREP_VERSION}/opengrep_manylinux_${arch}"
        echo "${sha}  ${bin}" | sha256sum -c - >&2
        chmod +x "$bin"
    fi
    echo "$bin"
}

OPENGREP="$(install_opengrep)"

if [ "${1:-}" = "test" ]; then
    exec "$OPENGREP" test "$RULES_DIR"
fi

cd "${GITHUB_WORKSPACE:-.}"

args=(scan --config "$RULES_DIR" --taint-intrafile --json --quiet --disable-version-check)
if [ -n "${GITHUB_BASE_REF:-}" ]; then
    # Pull request: report only findings introduced since the merge base.
    git fetch --quiet --no-tags origin "${GITHUB_BASE_REF}" || true
    if base="$(git merge-base "origin/${GITHUB_BASE_REF}" HEAD 2>/dev/null)"; then
        args+=(--baseline-commit "$base")
        echo "Reporting findings introduced since ${base} (merge base with ${GITHUB_BASE_REF})."
    else
        echo "::warning::custom-rules: no merge base with ${GITHUB_BASE_REF}; reporting all findings."
    fi
fi

results="$(mktemp)"
set +e
"$OPENGREP" "${args[@]}" . > "$results"
status=$?
set -e
# Opengrep exits 0 when the scan ran (findings or not); anything else is a scan error.
if [ "$status" -ne 0 ]; then
    echo "::error::custom-rules: opengrep failed (exit ${status})."
    jq -r '.errors[]?.message // empty' "$results" 2>/dev/null | head -20 || true
    exit "$status"
fi

# One annotation per finding. Workflow commands need %, CR and LF escaped in the
# message, and also : and , in properties.
jq -r '
  def msg: gsub("%"; "%25") | gsub("\r"; "%0D") | gsub("\n"; "%0A");
  def prop: msg | gsub(":"; "%3A") | gsub(","; "%2C");
  .results[] |
  (.extra.severity | if . == "ERROR" then "error" elif . == "WARNING" then "warning" else "notice" end) as $level |
  "::\($level) file=\(.path | prop),line=\(.start.line),endLine=\(.end.line),title=\(.check_id | split(".") | last | prop)::\(.extra.message | msg)"
' "$results"

total="$(jq '.results | length' "$results")"
errors="$(jq '[.results[] | select(.extra.severity == "ERROR")] | length' "$results")"
echo "custom-rules: ${total} finding(s), ${errors} with severity ERROR."
if [ "$errors" -gt 0 ]; then
    exit 1
fi
