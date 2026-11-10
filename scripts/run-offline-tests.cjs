'use strict';
// Run actual test entrypoints only. Helper scripts are not standalone tests.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const testFiles=fs.readdirSync('tests').filter(f=>/\.test\.(?:cjs|js|mjs)$/.test(f)).sort();
const timeoutMs=Number(process.env.OFFLINE_TEST_TIMEOUT_MS||120000);
if(!Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>900000)throw Error('Invalid OFFLINE_TEST_TIMEOUT_MS');
let failed=0;
const results=[];
for(const file of testFiles){
 const started=Date.now();
 console.log('START',file);
 const result=spawnSync(process.execPath,[path.join('tests',file)],{stdio:'inherit',timeout:timeoutMs});
 const durationMs=Date.now()-started;
 const ok=result.status===0&&!result.error;
 const item={file,status:ok?'PASS':'FAIL',durationMs,exitCode:result.status,signal:result.signal||null,error:result.error?.message||null};
 results.push(item);
 console.log(ok?'PASS':'FAIL',file,JSON.stringify({durationMs,exitCode:item.exitCode,error:item.error}));
 if(!ok)failed++;
}
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/offline-node-test-timings.json',JSON.stringify({schemaVersion:1,kind:'offline-node-test-timings',total:testFiles.length,failed,timeoutMs,results},null,2)+'\n');
console.log('OFFLINE_NODE_SUMMARY',JSON.stringify({total:testFiles.length,failed,timeoutMs}));
if(failed)process.exitCode=1;
