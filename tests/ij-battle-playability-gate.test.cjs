'use strict';
// Regression: an effect plan is never equivalent to a playable card.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ij-playability-'));
try {
  const report=path.join(dir,'coverage.json');
  const result=spawnSync(process.execPath,['scripts/report-ij-effect-coverage.cjs',report,'--require-playable'],{encoding:'utf8',timeout:120000});
  assert.equal(result.status,1,result.stderr||result.stdout);
  assert.match(result.stderr,/BATTLE_PLAYABILITY_INCOMPLETE/);
  const data=JSON.parse(fs.readFileSync(report,'utf8'));
  assert.equal(data.completionGate,'PUBLIC_BATTLE_VERIFICATION_REQUIRED');
  for(const mark of ['I','J']) {
    assert.equal(data.playability[mark].total,data.audit[mark].total);
    assert.equal(data.playability[mark].playable+data.playability[mark].incomplete,data.playability[mark].total);
    assert.equal(data.playability[mark].playable,0);
    assert.equal(data.playability[mark].executionVerified,data.counts[mark].EXECUTION_PASS||0);
    assert(data.playability[mark].incomplete>0,'Unexecuted cards must block completion');
  }
  console.log('PASS: H/I/J battle-playability completion gate rejects unexecuted effects');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
