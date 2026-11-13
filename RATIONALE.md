# cand-1: merge the gitleaks config in the action's TypeScript (no container)

## What was built

The `docker container run ... gitleaks-config python gitleaks_config_generator.py` step is gone, and so are
`get_gitleaks_config_image` (an `aws ecr describe-images` call that always exits 127 on the runner) and the
`docker pull` of the gitleaks-config image (4-5 s per run, plus retries). `run.sh` still uses docker for the
gitleaks scan itself (out of scope; it shows the same start-up stalls per ROOT_CAUSE.md).

- `scripts/secrets-scan/global_config.toml`: vendored copy of Typeform/gitleaks-config `global_config.toml`
  (byte-identical to upstream default branch today, checked with `scripts/check-global-config-drift.sh`, one
  read-only `gh api` call). Shipped as a file (not bundled) so it is read through `getScriptsDir()`, like the
  other scripts; no esbuild loader or `.d.ts` tricks and the vitest sees the same file as the action.
- `src/gitleaksConfig/mergeGitleaksConfig.ts`: `mergeGitleaksConfig(globalToml, repoToml?) => string`.
- `src/gitleaksConfig/scanToml.ts`: ~200-line scanner that locates the `[allowlist]` table and the raw source
  text of its array strings. It does not decode TOML.
- `src/gitleaksConfig/generateGitleaksConfig.ts`: reads both files, writes `<workspace>/tmp.XXXXXX/gitleaks_config.toml`
  (inside the workspace so the later `docker run -v` mounts keep working on dind runners, as before).
- `src/checks/bash.ts`: new optional `extraEnv` hook; `main.ts` uses it for `secrets-scan` to pass
  `GITLEAKS_CONFIG_FILE` to `run.sh`. `run.sh` fails fast if the variable is missing (it is only meant to be run by the action).
- New runtime dependency, bundled: `smol-toml@1.9.1` (BSD-3, zero deps, pinned exact, lockfile entry added by hand
  to avoid pnpm-12-vs-lockfile churn; `--frozen-lockfile` passes). dist grows 33 KB; `index.js.LEGAL.txt` now carries its licence.
- `dist/` rebuilt with `pnpm run package`. Nothing new is needed on the runner image.

## Design choice: text-level merge on top of smol-toml (byte-identical output)

The old output is `tomlkit.dumps()` of the global doc with repo values appended, plus the `print()` newline. I chose
to keep the global file's bytes and only edit it at the insertion points:

1. smol-toml parses both files (validates syntax, gives decoded values for dedupe).
2. The scanner gives, for each repo array, the raw text of each string. Repo strings are copied verbatim
   (`'''..'''`, `'..'`, `".."` with escapes keep their quote style, exactly as tomlkit does).
3. For a key already in the global allowlist (`paths`): insert the new items before the `]` line, indented
   4 spaces, comma-separated, no trailing comma on the last (tomlkit's behaviour, reproduced from observed output).
4. For a new key (`regexes`, `stopwords`, ...): add `key = [a, b]` on one line after the last non-blank line of
   the `[allowlist]` table (blank lines that trail the table stay after it, comments stay before).
5. Append `\n` (the generator `print`ed the dump).

Alternatives rejected:
- Parse + re-serialise with a JS TOML lib (smol-toml `stringify`, `@iarna/toml`): loses comments, rewrites the 180-line
  global file, escapes differently; equal only semantically, and the diff against golden would be unreviewable.
- A TOML library with a round-trip AST (`@ltd/j-toml`, `toml-eslint-parser`+printer, `@shopify/toml-patch`): larger, newer
  API surface, and they would still have to reproduce tomlkit's indentation/placement quirks.
- Zero-dependency parser (own decoder for the 4 string types and dedupe): saves 25 KB but turns "invalid TOML" and
  escape handling into my bugs; the old container did fail on invalid TOML, smol-toml keeps that.
- Semantic equality only (re-render everything canonical): simplest, but gives no cheap, strict proof; byte-equality
  against the real generator's output is a much stronger test and it turned out to cost only the scanner.
- Python/`pip` on the runner or a second node entry process: needs runtime on the image / extra process; rejected.
- Bundling the global config with an esbuild text loader: more build coupling (tsc, vitest need a module shim) for no gain.

Divergences from the old generator, all deliberate and fail loudly instead of emitting something odd:
- repo `.gitleaks.toml` with no `[allowlist]` table: the old script crashed with a KeyError (step failed); we throw (step fails).
- repo scalar in `[allowlist]` (e.g. `regexTarget = "match"`): the old code iterated its characters and crashed with
  AttributeError; a scalar equal to the global value is ignored (old behaviour), anything else throws.
- non-string array elements, `[allowlist]` defined as an inline table / dotted keys: throw "unsupported".
- Old behaviour on invalid TOML (error printed, then crash) is a throw as well.
In all these cases the old step also failed, so no repo that passes today should fail with this change, but see "Unverified".

## Equivalence evidence

Golden files = stdout of the OLD generator (`gitleaks_config_generator.py`, tomlkit==0.11.1 in a fresh venv, cwd with
`global_config.toml` [+ `.gitleaks.toml`]), produced by `src/gitleaksConfig/tests/regenerate.sh <clone>` (also checks the vendored
global equals the clone's). `pnpm test` compares the new output to them with `toBe` (strict byte equality):

| case | result |
|---|---|
| no `.gitleaks.toml` | byte-identical |
| automations, audiences-service, terraform-shared, agent-orchestrator, renderer, tracking-proxy-api (the real fixtures; cover multi-line->single-line arrays, tabs, existing `paths` append with `'''` strings, escaped basic strings, comments, no final newline, `regexes`+`stopwords`) | all byte-identical |
| synthetic fixture: duplicates (vs global and within the repo list), comments inside arrays, `"`, `'`, `"""` strings, escapes, `description`, empty array, unknown keys (`commits`, `targetRules`) | byte-identical |
| 4 variant globals (last item without comma, with comment but no comma, blank lines at EOF, comment + blank before next table) | byte-identical |

Two of the variants exist because the first run found a mismatch: where tomlkit puts new keys relative to trailing blank
lines. Fixed in the scanner and re-verified against the old generator.

## Tests run (cand-1 worktree, node v22 locally; action targets node24)

- `pnpm test`: 9 files, 166 tests passed (pre-existing suites untouched; the new file adds 18 tests,
  including the existing bash.test.ts which still passes because `extraEnv` is only awaited when given).
- `pnpm run lint` (eslint, exit 0), `pnpm run format-check` ("All matched files use Prettier code style"), `tsc --noEmit` exit 0, `bash -n run.sh` ok.
- Note: `pnpm run lint`'s glob `src/**/*.ts` is not recursive under sh; I also ran eslint explicitly on the new files (exit 0).
- Install note: `pnpm install` needs the private `@typeform` registry (401 here); I installed with `--offline` from the local pnpm store.

## Timing

New step, measured locally (Apple silicon, node v22, bundled with esbuild like the action): `generateGitleaksConfig` takes ~3 ms
in process (3.6/3.2/2.6/3.0/3.0/2.8 ms over 6 runs on automations/terraform-shared/agent-orchestrator), ~30-50 ms wall for `node` start-up + run.
Old step on the runner (findings.md, ROOT_CAUSE.md): ~1.3 s fast case, 90-252 s on the 35-42% stalled runs, plus ~4-5 s image pull
and the failing `aws` call. So the config step goes from [1.3 s .. 250 s] + pull to ~tens of ms, deterministic. NOT measured on a real runner.

## Unverified / risks

- Not run on a real ARC runner and `run.sh` was not executed end to end (needs docker pulls and a PR event; I did not do network side effects).
  Only `bash -n`, and the generated file equals what the old container produced byte for byte, so the gitleaks invocation sees the same config.
- The docker image `public.ecr.aws/typeform/gitleaks-config:latest` could be older than the repo's default branch; I verified the vendored file
  equals the GitHub default branch, not what is baked in the published image.
- Repos with `.gitleaks.toml` shapes outside the 6 fixtures + synthetic cases (e.g. `[allowlist]` as inline table, non-string items) now get an explicit error;
  I only had 6 real files, not the ~326 repos' configs. Suggest a pre-rollout dry run of `mergeGitleaksConfig` over every repo's `.gitleaks.toml` (read-only `gh api`) comparing with the old image.
- Insertion into existing global arrays assumes a multi-line array with `]` on its own line (true today, tested on variants); other layouts throw
  rather than guess. A future global_config.toml change should be run through `regenerate.sh` + `pnpm test`.
- The vendored copy can drift: `scripts/check-global-config-drift.sh` is manual; wiring it in a scheduled workflow (or in the gitleaks-config repo's CI
  as a dispatch to this repo) was not done because it would be a CI change.
- The fixtures/goldens contain real repo allowlists (incl. the AWS-key-looking stopwords of terraform-shared). They live under `tests/` and end in
  `.gitleaks.toml`, both allowlisted by the global config, but I did not run gitleaks on this branch.
- The old container wrote its config into `$GITHUB_WORKSPACE/tmp.$RANDOM`; the new one makes another `tmp.XXXXXX` dir there (never cleaned up, same as before).

## Rollout idea

1. Do not move `v1`. Push the branch, release it as a pre-release tag, move `@v1-beta` (Typeform/.github's reusable workflow picks `@v1-beta`
   when `useBeta` is true); needs Adrian.
2. Enable `useBeta` on a handful of repos that already have a `.gitleaks.toml` (the 6 fixtures' repos) and a few without; compare step durations and the
   gitleaks "Scan finished" outcome with the `v1` runs; in beta runs the generated config could also be diffed against the old container's (run both once) for a week.
3. Run the all-repos dry run above, then promote to `v1`.
4. Follow-up (separate): the scan container `docker container run --name=gitleaks` has the same stall (13/79 runs); running a pinned gitleaks binary
   from the action would remove the last container from the job.
