'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),{compile}=require('../engine/reference-effect-plans.cjs');
const intake=JSON.parse(fs.readFileSync('data/effect-extensions/intake.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('data/deck-building/catalog.json','utf8'));
const groups=[
 {ids:['46037','46172','46179','46832'],text:'自分の手札をすべて山札にもどして切る。その後、山札を4枚引く。相手のサイドの残り枚数が3枚以下なら、引く枚数は8枚になる。',expected:{mechanic:'RETURN_HAND_PRIZE_DRAW',commands:['RETURN_TO_DECK','SHUFFLE_DECK','DRAW'],normal:4,threshold:3,bonus:8}},
 {ids:['46291','46331','46613'],text:'自分の手札をすべて山札にもどして切る。その後、コインを1回投げ、オモテなら8枚、ウラなら3枚、山札を引く。',expected:{mechanic:'RETURN_HAND_COIN_DRAW',commands:['RETURN_TO_DECK','SHUFFLE_DECK','COIN_FLIP','DRAW'],heads:8,tails:3}}
];
function plan(text,category='supporter'){
 return compile({records:[{officialCardId:'999999',name:'sample',category,text,attacks:[],abilities:[],facts:{prizeCount:1}}]}).records[0].mainPlan;
}
for(const group of groups){
 for(const id of group.ids){
  const row=intake.records.find(x=>String(x.officialCardId)===id),meta=catalog.records.find(x=>String(x.officialCardId)===id);
  assert(row&&meta&&meta.legality==='printed-hij'&&meta.regulationMark==='H','unreviewed printed H '+id);
  assert.equal(row.deckPrintAdopted,false);
  assert.equal(row.imageSourceUrl,meta.source.identityImageUrl);
  assert.equal(row.text,group.text);
  assert.equal(row.source.path,'data/effect-extensions/evidence/'+id+'.json');
  assert.deepEqual(plan(row.text),group.expected,'official exact match '+id);
 }
 assert.equal(plan(group.text,'item'),null,'supporter only');
}
assert.equal(plan(groups[0].text.replace('3枚以下','2枚以下').replace('相手のサイド','自分のサイド')),null,'unverified condition');
assert.equal(plan(groups[1].text.replace('コインを1回','コインを2回')),null,'unverified coin count');
console.log('PASS 7 printed H Supporters: exact source identity, compiler and category boundaries');
