'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../scripts/report-reference-effect-failure-causes.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-causes-'));
try{
 const file=path.join(dir,'handoff.json');
 const run=()=>{const result=spawnSync(process.execPath,[script,file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return fs.readFileSync(file,'utf8');};
 const first=run();assert.equal(first,run(),'handoff must be reproducible');
 const h=JSON.parse(first);
 assert.equal(h.purpose,'CODEX_SHARED_EFFECT_CAUSE_HANDOFF');
 assert.equal(h.adoptedDeckPrints,0);
 assert.equal(h.referencePrints,89);
 assert.equal(h.unresolvedEffects,h.issues.reduce((n,x)=>n+x.occurrences,0));
 assert.equal(h.safetyStopRequired,h.issues.length>0);
 assert.equal(h.executionVerifiedByInventory,0);
 for(const x of h.issues){assert.equal(x.status,'BLOCKED');assert.equal(x.occurrences,x.affectedPrints.length);assert.ok(x.affectedPrints.every(p=>p.officialCardId&&p.name));}
 console.log('REFERENCE_EFFECT_CAUSE_HANDOFF_GATE PASS:',h.issues.length);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
