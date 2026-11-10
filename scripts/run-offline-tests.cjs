'use strict';
// Run only test entrypoints; shard deterministic sorted tests to locate slow cases.
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
function save(){
 fs.writeFileSync(output,JSON.stringify({schemaVersion:1,kind:'offline-node-test-timings',
  shardIndex,shardCount,total:testFiles.length,failed,timeoutMs,results},null,2)+'\n');
}
save();
for(const file of testFiles){
 const started=Date.now();
 console.log('START',file,'shard',shardIndex+'/'+shardCount);
 const result=spawnSync(process.execPath,[path.join('tests',file)],{stdio:'inherit',timeout:timeoutMs});
 const durationMs=Date.now()-started;
 const ok=result.status===0&&!result.error;
 const item={file,status:ok?'PASS':'FAIL',durationMs,exitCode:result.status,signal:result.signal||null,error:result.error?.message||null};
 results.push(item);
 if(!ok)failed++;
 save(); // preserve partial progress after every test
 console.log(ok?'PASS':'FAIL',file,JSON.stringify({durationMs,exitCode:item.exitCode,error:item.error}));
}
console.log('OFFLINE_NODE_SUMMARY',JSON.stringify({shardIndex,shardCount,total:testFiles.length,failed,timeoutMs}));
if(failed)process.exitCode=1;
