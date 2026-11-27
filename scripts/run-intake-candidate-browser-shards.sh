#!/usr/bin/env bash
# Run only inside one local-candidate runner with its exact prepared source.
# Preserve all four browser shards and the additional full imported-deck AI match.
set -euo pipefail
: "${POKECA_INTAKE_RELEASE_BASE:?exact compiled base required}"
: "${POKECA_INTAKE_PREFIX:?candidate prefix required}"
: "${POKECA_TEST_URL:?local test URL required}"
[[ "${POKECA_INTAKE_LOCAL_CANDIDATE:-}" == 1 ]]
[[ "$POKECA_TEST_URL" == "http://127.0.0.1:8765/" ]]
prefix="${1:-candidate}"
[[ "$prefix" =~ ^[a-zA-Z0-9_-]+$ ]]
mkdir -p artifacts
rm -f "$POKECA_INTAKE_PREFIX/browser-fixture-reuse-receipt.json"
POKECA_INTAKE_FIXTURE_MODE=prepare python tests/test_control_013_browser.py
export POKECA_INTAKE_FIXTURE_MODE=reuse
export POKECA_BROWSER_SHARD_COUNT=4
export POKECA_BROWSER_SLOTS_ONLY=1
pids=()
for shard in 0 1 2 3; do
  POKECA_BROWSER_SHARD_INDEX="$shard" POKECA_INTAKE_ARTIFACT="$prefix-$shard" python tests/test_control_013_browser.py >"artifacts/$prefix-$shard.log" 2>&1 &
  pids+=("$!")
done
rv=0
for pid in "${pids[@]}"; do wait "$pid" || rv=1; done
for f in artifacts/"$prefix"-[0-3].log; do tail -n 15 "$f"; done
test "$rv" = 0
unset POKECA_BROWSER_SLOTS_ONLY
POKECA_BROWSER_SHARD_INDEX=0 POKECA_INTAKE_ARTIFACT="$prefix-full-ai" python tests/test_control_013_browser.py >"artifacts/$prefix-full-ai.log" 2>&1 || { tail -n 30 "artifacts/$prefix-full-ai.log"; exit 1; }
