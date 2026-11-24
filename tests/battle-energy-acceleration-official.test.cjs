"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const {compile}=require("../engine/reference-effect-plans.cjs"),W=require("../scripts/lib/shared-effect-engine-worker.cjs");
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
for(const r of compiled.records)for(const [index,a] of r.attacks.entries()){
 if(a.plan?.mechanic!=="ATTACK_ACCELERATE_BASIC_ENERGY")continue;
 const e={...a,effectIndex:index},t=W.prepare(r,e,"attack"),outcome=W.verifyCase(t,e);
 if(outcome.status==="BLOCKED"){blocked.push({id:r.officialCardId,index,reason:outcome.reason});continue;}
 assert.equal(outcome.status,"SUCCEEDED",JSON.stringify({id:r.officialCardId,index,outcome}));
 verified.push({id:String(r.officialCardId),index,zone:a.plan.zone,type:a.plan.type,target:a.plan.target});
}
assert(audit.targetPrintIds.length>0,"NO_OFFICIAL_ACCELERATION_TARGETS");
assert(verified.length>0,"NO_EXACT_PRINT_EXECUTED");
fs.mkdirSync("test-results",{recursive:true});
fs.writeFileSync("test-results/battle-energy-acceleration-official.json",JSON.stringify({targetPrintIds:audit.targetPrintIds,verifiedEffectSlots:verified.length,verified,blocked,publicBattleVerified:false},null,2)+"\n");
console.log("BATTLE_ENERGY_ACCELERATION_OFFICIAL PASS",JSON.stringify({targetPrints:audit.targetPrintIds.length,verifiedEffectSlots:verified.length,blocked:blocked.length}));
