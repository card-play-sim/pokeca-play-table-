"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const {compile}=require("../engine/reference-effect-plans.cjs");
const plan=(text,damage="0")=>compile({records:[{officialCardId:"46235",category:"pokemon",name:"REGRESSION",facts:{basic:true},abilities:[],attacks:[{name:"ATTACK",text,damage,cost:["無色"]}]}]}).records[0].attacks[0].plan;
for(const [text,zone,type,limit,target,holderType] of [
 ["自分の山札から基本エネルギーを1枚選び、このポケモンにつける。そして山札を切る。","deck",null,1,"self",null],
 ["自分のトラッシュから「基本[闘]エネルギー」を2枚まで選び、このポケモンにつける。","discard","闘",2,"self",null],
 ["自分の山札から基本エネルギーを2枚まで選び、自分のポケモン1匹につける。そして山札を切る。","deck",null,2,"own",null],
 ["自分のトラッシュから基本エネルギーを2枚まで選び、ベンチポケモン1匹につける。","discard",null,2,"bench",null],
 ["自分の山札から基本エネルギーを1枚選び、自分の[竜]ポケモンにつける。そして山札を切る。","deck",null,1,"own","竜"]
]){
 const p=plan(text);assert.equal(p?.mechanic,"ATTACK_ACCELERATE_BASIC_ENERGY",text);
 for(const [k,v] of Object.entries({zone,type,limit,target,holderType}))assert.equal(p[k],v);
 assert.equal(plan(text+"このポケモンをどくにする。"),null);
 assert.equal(plan(text,"30+"),null);
}
for(const text of ["自分の山札から基本エネルギーを3枚まで選び、自分のポケモンに好きなようにつける。そして山札を切る。","自分の山札から基本エネルギーを1枚選び、このポケモンにつける。"])assert.equal(plan(text),null);
const compiled=JSON.parse(fs.readFileSync("data/effect-extensions/compiled.json"));
// Reconstruct the target list from preserved official evidence rather than a
// transient report produced on a different branch. Full release rows still
// undergo the real-engine worker assertions below.
const crypto=require('node:crypto');
const raw=JSON.parse(fs.readFileSync('data/official-effect-intake/checkpoint.json'));
const targetPrintIds=[];
for(const row of raw.records){
 if(row.category!=='pokemon')continue;
 const plans=compile({records:[row]}).records[0];
 if(!plans.attacks.some(a=>a.plan?.mechanic==='ATTACK_ACCELERATE_BASIC_ENERGY'))continue;
 const proof=JSON.parse(fs.readFileSync(row.source.path));
 assert.equal(proof.url,row.officialPageUrl);
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),row.source.sha256);
 const parsed=require('../scripts/parse-official-pokemon-energy.cjs').parse(proof.html);
 assert.deepEqual(parsed.attacks,row.attacks);
 targetPrintIds.push(String(row.officialCardId));
}
const audit={targetPrintIds:[...new Set(targetPrintIds)]};
const verified=[],blocked=[];
function verifyRecords(records,W,mode){
for(const r of records)for(const [index,a] of r.attacks.entries()){
 if(a.plan?.mechanic!=="ATTACK_ACCELERATE_BASIC_ENERGY")continue;
 const e={...a,effectIndex:index},t=W.prepare(r,e,"attack"),outcome=W.verifyCase(t,e);
 if(outcome.status==="BLOCKED"){blocked.push({id:r.officialCardId,index,reason:outcome.reason});continue;}
 assert.equal(outcome.status,"SUCCEEDED",JSON.stringify({id:r.officialCardId,index,outcome}));
 verified.push({id:String(r.officialCardId),index,zone:a.plan.zone,type:a.plan.type,target:a.plan.target,mode});
}
}
assert(audit.targetPrintIds.length>0,"NO_OFFICIAL_ACCELERATION_TARGETS");
if(process.argv.includes('--isolated-candidate')){
 verifyRecords(compiled.records,require('../scripts/lib/shared-effect-engine-worker.cjs'),'isolated-candidate');
 assert(verified.length>0,'NO_EXACT_CANDIDATE_EXECUTED:'+JSON.stringify(blocked));
 console.log(JSON.stringify({verified,blocked}));
 process.exit(0);
}
verifyRecords(compiled.records,require('../scripts/lib/shared-effect-engine-worker.cjs'),'release');
if(!verified.length){
 // A mechanic can be implemented before a full printing passes the release
 // gate. Execute exact source-backed complete candidate prints in a private
 // copy of the real bundle. Never alter or add records to the release tree.
 const path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-acceleration-proof-'));
 try{
  const intake=JSON.parse(fs.readFileSync('data/effect-extensions/intake.json'));
  const selected={...intake,records:[...new Map([...intake.records,...raw.records.filter(r=>audit.targetPrintIds.includes(String(r.officialCardId)))].map(r=>[r.officialCardId,r])).values()]};
  const built=require('../scripts/build-effect-extensions.cjs').build(selected);
  const candidateIds=new Set(built.records.filter(r=>r.attacks.some(a=>a.plan?.mechanic==='ATTACK_ACCELERATE_BASIC_ENERGY')).map(r=>r.officialCardId));
  assert(candidateIds.size>0,'NO_FULLY_COMPILED_ACCELERATION_CANDIDATE');
  const releaseIds=new Set(compiled.records.map(r=>r.officialCardId));
  const records=selected.records.filter(r=>releaseIds.has(r.officialCardId)||candidateIds.has(r.officialCardId));
  for(const dir of ['data','data/effect-extensions','ui'])fs.mkdirSync(path.join(temp,dir),{recursive:true});
  for(const entry of fs.readdirSync('data'))if(!['effect-extensions','reference-effects'].includes(entry))
   fs.symlinkSync(path.join(root,'data',entry),path.join(temp,'data',entry));
  fs.cpSync('data/reference-effects',path.join(temp,'data/reference-effects'),{recursive:true});
  for(const entry of fs.readdirSync('data/effect-extensions'))if(!['intake.json','compiled.json'].includes(entry))
   fs.symlinkSync(path.join(root,'data/effect-extensions',entry),path.join(temp,'data/effect-extensions',entry));
  fs.copyFileSync('ui/engine.bundle.js',path.join(temp,'ui/engine.bundle.js'));
  for(const dir of ['engine','scripts','tests'])fs.symlinkSync(path.join(root,dir),path.join(temp,dir));
  fs.writeFileSync(path.join(temp,'data/effect-extensions/intake.json'),JSON.stringify({...intake,records}));
  for(const args of [['scripts/build-effect-extensions.cjs'],['scripts/sync-reference-effects.cjs']]){
   const result=cp.spawnSync(process.execPath,args,{cwd:temp,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
   assert.equal(result.status,0,result.stderr||result.error?.message);
  }
  const result=cp.spawnSync(process.execPath,[__filename,'--isolated-candidate'],{cwd:temp,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
  assert.equal(result.status,0,result.stderr||result.error?.message);
  const proof=JSON.parse(result.stdout.trim().split('\n').at(-1));
  verified.push(...proof.verified);blocked.push(...proof.blocked);
  assert(verified.every(row=>candidateIds.has(row.id)));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
assert(verified.length>0,"NO_EXACT_PRINT_EXECUTED");
fs.mkdirSync("test-results",{recursive:true});
fs.writeFileSync("test-results/battle-energy-acceleration-official.json",JSON.stringify({targetPrintIds:audit.targetPrintIds,verifiedEffectSlots:verified.length,releaseVerifiedEffectSlots:verified.filter(r=>r.mode==='release').length,isolatedCandidateVerifiedEffectSlots:verified.filter(r=>r.mode==='isolated-candidate').length,verified,blocked,publicBattleVerified:false},null,2)+"\n");
console.log("BATTLE_ENERGY_ACCELERATION_OFFICIAL PASS",JSON.stringify({targetPrints:audit.targetPrintIds.length,verifiedEffectSlots:verified.length,blocked:blocked.length}));
