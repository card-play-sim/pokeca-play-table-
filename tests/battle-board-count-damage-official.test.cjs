"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const {compile}=require("../engine/reference-effect-plans.cjs");
const W=require("../scripts/lib/shared-effect-engine-worker.cjs");
const catalog=JSON.parse(fs.readFileSync("data/effect-extensions/intake.json"));
const compiled=JSON.parse(fs.readFileSync("data/effect-extensions/compiled.json"));
const metrics=new Set(["ownCounters","ownHand","opponentHand","ownPrizesTaken","ownBasicCount","opponentBasicCount","ownStageOneCount","ownEvolvedCount","opponentEvolvedCount","ownBenchStageTwoCount","ownDamagedBenchCount","opponentTeamCounters","ownTypedPokemonCount","bothActiveEnergy","bothTeamEnergy","opponentRetreat"]);
const selected=e=>e.plan?.mechanic==="SCALED_ATTACK_DAMAGE"&&(e.plan.subtract||metrics.has(e.plan.metric));
function plan(text,damage){return compile({records:[{officialCardId:"46235",name:"REGRESSION",category:"pokemon",attacks:[{name:"ATTACK",text,damage,cost:["無色"]}],abilities:[],facts:{basic:true}}]}).records[0].attacks[0].plan;}
for(const [text,damage,metric,unit,base,subtract] of [
 ["このポケモンにのっているダメカンの数×10ダメージぶん、このワザのダメージは小さくなる。","150-","ownCounters",10,150,true],
 ["相手のバトルポケモンについているエネルギーの数×60ダメージぶん、このワザのダメージは小さくなる。","240-","opponentEnergy",60,240,true],
 ["相手のバトルポケモンのにげるためのエネルギーの数×50ダメージぶん、このワザのダメージは小さくなる。","250-","opponentRetreat",50,250,true],
 ["自分の手札の枚数×20ダメージ。","20×","ownHand",20,0,false],
 ["自分の場の進化ポケモンの数×40ダメージ追加。","40+","ownEvolvedCount",40,40,false],
 ["自分の場の[草]ポケモンの数×30ダメージ。","30×","ownTypedPokemonCount",30,0,false],
 ["おたがいのバトルポケモンについているエネルギーの数×30ダメージ追加。","30+","bothActiveEnergy",30,30,false]
]){
 const p=plan(text,damage);
 assert.equal(p?.mechanic,"SCALED_ATTACK_DAMAGE");assert.equal(p.metric,metric);assert.equal(p.unit,unit);assert.equal(p.base,base);assert.equal(Boolean(p.subtract),subtract);
 assert.equal(plan(text+"さらに山札を引く。",damage),null);
 assert.equal(plan(text,subtract?"150+":damage.endsWith("×")?"999×":"100"),null);
}
const candidates=new Set(),verified=[],blocked=[];
for(const r of catalog.records)if(r.category==="pokemon"){
 const result=compile({records:[r]}).records[0];
 if(result?.attacks.some(selected))candidates.add(String(r.officialCardId));
}
for(const r of compiled.records){
 for(const [index,a] of r.attacks.entries()){
  if(!selected(a))continue;
  const e={...a,effectIndex:index},t=W.prepare(r,e,"attack");
  if(t.blocked){blocked.push({id:r.officialCardId,effectIndex:index,reason:t.blocked});continue;}
  const outcome=W.verifyCase(t,e);
  if(outcome.status==="BLOCKED"){blocked.push({id:r.officialCardId,effectIndex:index,reason:outcome.reason});continue;}
  assert.equal(outcome.status,"SUCCEEDED",JSON.stringify({id:r.officialCardId,index,outcome}));
  verified.push({id:String(r.officialCardId),effectIndex:index,metric:a.plan.metric,subtract:!!a.plan.subtract});
 }
}
assert(candidates.size>0,"no matching official print");
assert(verified.length>0,"no exact official effect executed");
fs.mkdirSync("test-results",{recursive:true});
const result={officialMatchingPrints:candidates.size,verifiedEffectSlots:verified.length,verifiedPrintIds:[...new Set(verified.map(v=>v.id))],verified,blocked,publicBattleVerified:false};
fs.writeFileSync("test-results/battle-board-count-damage-official.json",JSON.stringify(result,null,2)+"\n");
console.log("BATTLE_BOARD_COUNT_DAMAGE_OFFICIAL PASS",JSON.stringify({officialMatchingPrints:candidates.size,verifiedEffectSlots:verified.length,blocked:blocked.length}));
