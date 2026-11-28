'use strict';
// Deterministic sharded runner with a bounded per-test timeout and durable progress.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const all=fs.readdirSync('tests').filter(f=>/\.test\.(?:cjs|js|mjs)$/.test(f)).sort();
const shardCount=Number(process.env.OFFLINE_SHARD_COUNT||1);
const shardIndex=Number(process.env.OFFLINE_SHARD_INDEX||0);
if(!Number.isInteger(shardCount)||shardCount<1||shardCount>16||
 !Number.isInteger(shardIndex)||shardIndex<0||shardIndex>=shardCount)throw Error('Invalid offline shard configuration');
// Historical seconds, measured on successful run 46089050482; scheduling only.
// Every discovered test is assigned exactly once, including new/unknown tests.
// Longest-processing-time first avoids multiple slow suites on one runner.
const weights=Object.freeze({
  "battle-board-count-damage-official.test.cjs": 9,
  "reference-effect-cross-family-rejection.test.cjs": 80,
  "battle-energy-acceleration-official.test.cjs": 10,
  "control-005-effect-matrix.test.cjs": 4,
  "control-013-continuation.test.cjs": 174,
  "battle-coin-energy-official.test.cjs": 5,
  "reference-effect-cross-family-seeded.test.cjs": 158,
  "reference-effect-runtime-bundle.test.cjs": 7,
  "official-image-foundation.test.cjs": 6,
  "reference-matches.test.cjs": 32,
  "control-014-shared-effects.test.cjs": 39,
  "reference-effect-multi-turn.test.cjs": 46,
  "battle-deck-search-official.test.cjs": 10,
  "battle-rocket-team-exact-print.test.cjs": 4,
  "control-011-engine-batch.test.cjs": 30,
  "official-image-automation.test.cjs": 21,
  "reference-effect-extended-gameplay.test.cjs": 223,
  "control-008-extensions.test.cjs": 8,
  "exact-print-import-to-battle.test.cjs": 3,
  "image-registry-existing.test.mjs": 18,
  "playable-demo-smoke.test.js": 82,
  "reference-effect-opening-actions.test.cjs": 19,
  "battle-multi-self-energy-official.test.cjs": 5,
  "reference-effect-cross-category.test.cjs": 40,
  "reference-effect-opening-rejection.test.cjs": 15
});
const weight=file=>Object.hasOwn(weights,file)?weights[file]:1;
const lanes=Array.from({length:shardCount},()=>({load:0,files:[]}));
for(const file of [...all].sort((a,b)=>weight(b)-weight(a)||(a<b?-1:a>b?1:0))){
 let index=0;
 for(let i=1;i<lanes.length;i++)if(lanes[i].load<lanes[index].load)index=i;
 lanes[index].files.push(file);
 lanes[index].load+=weight(file);
}
const assigned=lanes.flatMap(lane=>lane.files).sort();
if(assigned.length!==all.length||assigned.some((file,i)=>file!==all[i]))
 throw Error('Offline shard assignment lost or duplicated a test');
const testFiles=lanes[shardIndex].files.sort();
console.log('OFFLINE_SHARD_PLAN',JSON.stringify(lanes.map(lane=>({count:lane.files.length,estimatedSeconds:lane.load}))));
const timeoutMs=Number(process.env.OFFLINE_TEST_TIMEOUT_MS||120000);
if(!Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>900000)throw Error('Invalid OFFLINE_TEST_TIMEOUT_MS');
let failed=0;
const results=[];
const output=path.join('test-results',`offline-node-test-timings-${shardIndex}.json`);
fs.mkdirSync('test-results',{recursive:true});
let running=null;
function save(){
 fs.writeFileSync(output,JSON.stringify({schemaVersion:1,kind:'offline-node-test-timings',
  shardIndex,shardCount,total:testFiles.length,failed,timeoutMs,running,results},null,2)+'\n');
}
save();
for(const file of testFiles){
 const started=Date.now();
 running={file,startedAt:new Date(started).toISOString()};
 save(); // retain which test was in flight if job times out
 console.log('START',file,'shard',shardIndex+'/'+shardCount);
 // These seeded full-match and rejection suites cover thousands of audited state transitions.
 // Keep all seeds and assertions; grant only these suites a bounded workload-specific budget.
 const workloadTimeoutMs=['reference-effect-cross-family-seeded.test.cjs','reference-effect-extended-gameplay.test.cjs','reference-effect-cross-family-rejection.test.cjs','battle-energy-acceleration-official.test.cjs'].includes(file)
  ? Math.max(timeoutMs,300000):file==='control-013-continuation.test.cjs'?Math.max(timeoutMs,600000):timeoutMs;
 const result=spawnSync(process.execPath,[path.join('tests',file)],{stdio:'inherit',timeout:workloadTimeoutMs});
 const durationMs=Date.now()-started;
 const ok=result.status===0&&!result.error;
 const item={file,status:ok?'PASS':'FAIL',durationMs,exitCode:result.status,signal:result.signal||null,error:result.error?.message||null};
 results.push(item);
 if(!ok)failed++;
 running=null;
 save();
 console.log(ok?'PASS':'FAIL',file,JSON.stringify({durationMs,exitCode:item.exitCode,error:item.error}));
}
console.log('OFFLINE_NODE_SUMMARY',JSON.stringify({shardIndex,shardCount,total:testFiles.length,failed,timeoutMs}));
if(failed)process.exitCode=1;
