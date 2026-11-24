"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const {compile}=require("../engine/reference-effect-plans.cjs");
const W=require("../scripts/lib/shared-effect-engine-worker.cjs");
const record=(text,damage="0")=>({officialCardId:"46235",category:"pokemon",name:"REGRESSION",facts:{basic:true},abilities:[],attacks:[{name:"ATTACK",text,damage,cost:["無色"]}]});
const plan=(text,damage)=>compile({records:[record(text,damage)]}).records[0].attacks[0].plan;
const fixtures=[
 ["自分の山札からポケモンを3枚まで選び、相手に見せて、手札に加える。そして山札を切る。","pokemon",3],
 ["自分の山札からエネルギーを4枚まで選び、相手に見せて、手札に加える。そして山札を切る。","energy",4],
 ["自分の山札から「ポケモンのどうぐ」を1枚選び、相手に見せて、手札に加える。そして山札を切る。","tool",1],
 ["自分の山札から[悪]ポケモンを3枚まで選び、相手に見せて、手札に加える。そして山札を切る。","typedPokemon",3,"悪"],
 ["自分の山札から[炎]ポケモンと「基本[炎]エネルギー」を合計3枚まで選び、相手に見せて、手札に加える。そして山札を切る。","typedPokemonOrBasicEnergy",3,"炎"],
 ["自分の山札から[草]ポケモンとスタジアムを合計3枚まで選び、相手に見せて、手札に加える。そして山札を切る。","typedPokemonOrStadium",3,"草"],
 ["自分の山札から「基本[草]エネルギー」を3枚まで選び、相手に見せて、手札に加える。そして山札を切る。","typedBasicEnergy",3,"草"],
 ["自分の山札から好きなカードを2枚まで選び、手札に加える。そして山札を切る。","any",2]
];
for(const [text,filter,limit,type] of fixtures){
 const p=plan(text);assert.equal(p?.batchSearch,true,text);assert.equal(p.filter,filter);assert.equal(p.limit,limit);assert.equal(p.type,type);
 assert.equal(p.commands.includes("REVEAL"),filter!=="any");
 assert.equal(plan(text+"さらに山札を引く。"),null);
 assert.equal(plan(text,"30+"),null);
}
for(const [text,type] of [
 ["自分の山札からたねポケモンを好きなだけ選び、ベンチに出す。そして山札を切る。",undefined],
 ["自分の山札から[超]タイプのたねポケモンを3枚まで選び、ベンチに出す。そして山札を切る。","超"]
]){
 const p=plan(text);assert.equal(p?.mechanic,"SEARCH_BASIC_TO_BENCH_ATTACK");assert.equal(p.type,type);assert.equal(p.limit,type?3:5);assert.equal(p.batchSearch,true);
}
assert.equal(plan(fixtures[4][0].replace("基本[炎]","基本[水]")),null);
const compiled=JSON.parse(fs.readFileSync("data/effect-extensions/compiled.json"));
const audit=JSON.parse(fs.readFileSync("reports/official-effect-continuation/deck-search-bulk-intake.json"));
const verified=[],blocked=[];
for(const r of compiled.records)for(const [index,a] of r.attacks.entries()){
 if(!a.plan?.batchSearch)continue;
 const e={...a,effectIndex:index},t=W.prepare(r,e,"attack"),outcome=W.verifyCase(t,e);
 if(outcome.status==="BLOCKED"){blocked.push({id:r.officialCardId,index,reason:outcome.reason});continue;}
 assert.equal(outcome.status,"SUCCEEDED",JSON.stringify({id:r.officialCardId,index,outcome}));
 verified.push({id:String(r.officialCardId),index,filter:a.plan.filter||"basicBench",type:a.plan.type});
}
assert(audit.targetPrintIds.length>0,"NO_OFFICIAL_SEARCH_TARGETS");
assert(verified.length>0,"NO_EXACT_PRINT_EXECUTED");
fs.mkdirSync("test-results",{recursive:true});
const result={targetPrintIds:audit.targetPrintIds,verifiedEffectSlots:verified.length,verified,blocked,publicBattleVerified:false};
fs.writeFileSync("test-results/battle-deck-search-official.json",JSON.stringify(result,null,2)+"\n");
console.log("BATTLE_DECK_SEARCH_OFFICIAL PASS",JSON.stringify({targetPrints:audit.targetPrintIds.length,verifiedEffectSlots:verified.length,blocked:blocked.length}));
