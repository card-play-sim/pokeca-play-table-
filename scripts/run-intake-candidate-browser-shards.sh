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
# Shard zero already supports its own slots followed by the full AI match.
# Run it once, concurrently with the three slots-only shards.
pids=()
for shard in 0 1 2 3; do
  artifact="$prefix-$shard"
  slots=1
  if [[ "$shard" == 0 ]]; then
    artifact="$prefix-full-ai"
    slots=0
  fi
  POKECA_BROWSER_SLOTS_ONLY="$slots" POKECA_BROWSER_SHARD_INDEX="$shard" POKECA_INTAKE_ARTIFACT="$artifact" python tests/test_control_013_browser.py >"artifacts/$artifact.log" 2>&1 &
  pids+=("$!")
done
rv=0
for pid in "${pids[@]}"; do wait "$pid" || rv=1; done
for f in artifacts/"$prefix"-full-ai.log artifacts/"$prefix"-[1-3].log; do tail -n 15 "$f"; done
test "$rv" = 0
# Verify exact partition coverage and preserve the shard-zero receipt name
# without rerunning any browser actions. The full AI receipt stays unchanged.
python - "$prefix" "$POKECA_INTAKE_PREFIX" <<'PY'
import sys,json
from pathlib import Path
prefix,folder=sys.argv[1:]
fixtures=json.loads((Path(folder)/'browser-fixtures.json').read_text())
artifacts=Path('artifacts')
def expected(f):
    return (str(f['r']['officialCardId']),f['kind'],f['e'].get('effectIndex',0))
def actual(c):
    assert c['domExecuted'] and c['aiParity'] and c['offlineRestoreExact']
    return (str(c['print']),c['effectKind'],c['effectIndex'])
for shard in range(4):
    name=prefix+('-full-ai' if shard==0 else '-'+str(shard))
    data=json.loads((artifacts/(name+'-browser.json')).read_text())
    assert not data['javascriptErrors']
    wanted=sorted(expected(f) for i,f in enumerate(fixtures) if i%4==shard)
    assert sorted(actual(c) for c in data['cases'])==wanted, 'BROWSER_SLOT_COVERAGE_MISMATCH'
    if shard==0:
        match=data['expandedAIMatch']
        assert match['finished'] and match['executedNewPrints']
        assert set(map(str,match['executedNewPrints']))<={str(f['r']['officialCardId']) for f in fixtures}
        receipt={k:v for k,v in data.items() if k!='expandedAIMatch'}
        receipt.update(browserShard=0,totalFixtures=len(fixtures))
        (artifacts/(prefix+'-0-browser.json')).write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
print('BROWSER_EXACT_FOUR_SHARDS_AND_AI_PASS')
PY
