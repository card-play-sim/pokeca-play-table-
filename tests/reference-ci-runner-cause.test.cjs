'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.resolve(__dirname,'../scripts/run-reference-effect-ci.cjs'),'utf8');
function run(status,stderr){
 const writes=[],logs=[],proc={argv:['node','script','tests/reference-effect-runtime-smoke.test.cjs'],env:{REFERENCE_RUNTIME_LOG:'reports/test.log'},stdout:{write:x=>writes.push(x)},stderr:{write:x=>writes.push(x)},exitCode:undefined,execPath:process.execPath};
 const fakeFs={mkdirSync:()=>{},appendFileSync:(p,s)=>logs.push(s)};
 const sandbox={process:proc,require:id=>id==='node:child_process'?{spawnSync:()=>({status,stderr,stdout:''})}:id==='node:fs'?fakeFs:id==='node:path'?path:require};
 vm.runInNewContext(code,sandbox,{timeout:1000});
 const match=writes.join('').match(/REFERENCE_RUNTIME_FAILURE_JSON:(\{[^\n]+\})/);
 return {exitCode:proc.exitCode,record:match?JSON.parse(match[1]):null,logs};
}
const fail=run(1,'AssertionError: FIRST_PLAYER_FIRST_TURN_ATTACK');
assert.equal(fail.exitCode,1);
assert.equal(fail.record.causeId,'FIRST_PLAYER_FIRST_TURN_ATTACK');
assert.equal(fail.record.test,'tests/reference-effect-runtime-smoke.test.cjs');
assert.ok(fail.logs.join('').includes('REFERENCE_RUNTIME_FAILURE_JSON:'));
const fallback=run(1,'AssertionError: ordinary mismatch');
assert.equal(fallback.record.causeId,'TEST_ASSERTION_OR_RUNTIME_FAILURE');
const ok=run(0,'');
assert.equal(ok.exitCode,0);
assert.equal(ok.record,null);
console.log('REFERENCE_CI_RUNNER_CAUSE_EXTRACTION PASS');
