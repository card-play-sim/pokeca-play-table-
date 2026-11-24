"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const workflow=fs.readFileSync(".github/workflows/continue-official-effects.yml","utf8");
const section=workflow.split("      - name: Collect incremental")[0];
assert.match(section,/sort -nr/,"newest checkpoints must be inspected first");
assert.match(section,/for RUN_ID in \$\(/,"must iterate beyond the newest interrupted run");
assert.match(section,/git cat-file -e FETCH_HEAD:data\/official-effect-intake\/checkpoint\.json/,"checkpoint must exist before restore");
assert.match(section,/CHECKPOINT_FOUND=1/,"found checkpoint must stop fallback");
assert.match(section,/if \[ "\$CHECKPOINT_FOUND" -eq 0 \]/,"legacy fallback only when no numbered checkpoint exists");
assert.match(section,/if ! git fetch origin "\$CHECKPOINT_BRANCH"/,"deleted branches must not abort recovery");
// Every recovery path must merge validated evidence rather than replacing the
// current checkpoint. The explicit Work replay adds a third, pinned path.
const restoreCommand=/python scripts\/restore-official-intake-evidence\.py FETCH_HEAD --merge/g;
const restoreCalls=[...section.matchAll(/python scripts\/restore-official-intake-evidence\.py[^\n]*/g)];
const replay=section.match(/if \[ "\$GITHUB_REF_NAME" = work\/issue122-next-782-replay \]; then\n([\s\S]*?)\n\s*fi/);
const numbered=section.slice(section.indexOf("for RUN_ID in $("),section.indexOf('if [ "$CHECKPOINT_FOUND" -eq 0 ] &&'));
const legacy=section.slice(section.indexOf('if [ "$CHECKPOINT_FOUND" -eq 0 ] &&'));
for(const [label,block] of [["numbered",numbered],["legacy",legacy]]){
 assert.equal([...block.matchAll(restoreCommand)].length,1,label+" must merge verified evidence exactly once");
 assert.match(block,/git cat-file -e FETCH_HEAD:data\/official-effect-intake\/checkpoint\.json[\s\S]*?python scripts\/restore-official-intake-evidence\.py FETCH_HEAD --merge/);
}
if(replay){
 assert.match(replay[1],/git fetch origin [0-9a-f]{40}\n\s*python scripts\/restore-official-intake-evidence\.py FETCH_HEAD --merge\n\s*CHECKPOINT_FOUND=1/,"Work replay must use a pinned commit and validated merge");
 assert.match(numbered,/if \[ "\$CHECKPOINT_FOUND" -eq 1 \]; then break; fi/,"pinned replay must prevent a second restore");
}
assert.equal(restoreCalls.length,replay?3:2,"only the reviewed recovery paths are permitted");
assert.equal([...section.matchAll(restoreCommand)].length,restoreCalls.length,"every recovery must use validated merge");
assert.doesNotMatch(section,/git restore --source=FETCH_HEAD/,"do not replace current main checkpoint");
console.log("INTAKE_CHECKPOINT_RECOVERY_CONTRACT PASS");
