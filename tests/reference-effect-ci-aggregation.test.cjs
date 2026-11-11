'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../scripts/aggregate-reference-effect-ci-causes.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-aggregate-')),root=path.join(dir,'artifacts'),out=path.join(dir,'batch.json');
const names=['smoke','opening-actions','opening-rejection','multi-turn','extended-gameplay','cross-category','provenance'];
const artifact=n=>path.join(root,n==='provenance'?'reference-effect-coverage':'reference-runtime-causes-'+n,'reference-effect-runtime-causes.json');
const run=(conclusions=Object.fromEntries(names.map(n=>[n,{result:'success'}])))=>spawnSync(process.execPath,[script,root,out],{encoding:'utf8',env:{...process.env,...(conclusions===null?{}:{REFERENCE_CI_JOB_CONCLUSIONS:JSON.stringify(conclusions)})}});
const empty=()=>({purpose:'CODEX_RUNTIME_FAILURE_CAUSE_HANDOFF',structuredFailures:0,malformedRecords:0,safetyStopRequired:false,issues:[],malformed:[]});
const write=(n,x)=>{const f=artifact(n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x));};
try{
 assert.equal(run().status,2,'missing every job must block');
 assert.equal(JSON.parse(fs.readFileSync(out)).gaps.length,7);
 for(const n of names)write(n,empty());
 assert.equal(run().status,0,'all seven clean reports should pass');
 let batch=JSON.parse(fs.readFileSync(out));
 assert.equal(batch.receivedJobs,7);assert.equal(batch.blocked,false);
 const successful=Object.fromEntries(names.map(n=>[n,{result:'success'}]));
 assert.equal(run(successful).status,0,'successful upstream conclusions should pass');
 assert.equal(run(null).status,2,'missing upstream conclusions must block');
 assert.ok(JSON.parse(fs.readFileSync(out)).gaps.some(x=>x.reason==='MISSING_JOB_CONCLUSIONS'));
 assert.equal(run({...successful,provenance:{result:'failure'}}).status,2,'failed provenance must block even if its log is clean');
 assert.ok(JSON.parse(fs.readFileSync(out)).gaps.some(x=>x.job==='provenance'&&x.reason==='JOB_NOT_SUCCESSFUL'));
 assert.equal(run({...successful,smoke:{result:'cancelled'}}).status,2,'cancelled upstream job must block');
 assert.equal(run({...successful,smoke:{result:'skipped'}}).status,2,'skipped upstream job must block');
 assert.equal(run({...successful,smoke:undefined}).status,2,'missing conclusion must block');

 const issue=(test)=>({causeId:'INVALID_TARGET',command:'MOVE_DAMAGE_COUNTERS',occurrences:1,affectedTests:[test],affectedPrints:['48248']});
 for(const n of ['smoke','multi-turn'])write(n,{...empty(),structuredFailures:1,safetyStopRequired:true,issues:[issue(n)]});
 assert.equal(run().status,2,'runtime failures must block');
 batch=JSON.parse(fs.readFileSync(out));
 assert.equal(batch.issues.length,1);assert.equal(batch.issues[0].occurrences,2);
 assert.deepEqual(batch.issues[0].affectedJobs,['multi-turn','smoke']);
 write('smoke',{...empty(),safetyStopRequired:false,structuredFailures:1,issues:[issue('smoke')]});
 assert.equal(run().status,2,'contradictory evidence must block');
 assert.ok(JSON.parse(fs.readFileSync(out)).gaps.some(x=>x.reason==='INVALID_JOB_CAUSE_SCHEMA'));
 console.log('CODEX_CROSS_JOB_CAUSE_AGGREGATION_GATE PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
