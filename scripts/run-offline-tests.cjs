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
const testFiles=all.filter((_,i)=>i%shardCount===shardIndex);
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
 // These two seeded full-match suites deliberately cover thousands of audited state transitions.
 // Keep all seeds and assertions; grant only these suites a bounded workload-specific budget.
 const workloadTimeoutMs=['reference-effect-cross-family-seeded.test.cjs','reference-effect-extended-gameplay.test.cjs'].includes(file)
  ? Math.max(timeoutMs,300000):timeoutMs;
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
