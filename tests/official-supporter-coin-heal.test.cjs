'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {compile}=require('../engine/reference-effect-plans.cjs');
const intake=JSON.parse(fs.readFileSync('data/effect-extensions/intake.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('data/deck-building/catalog.json','utf8'));
const groups={
 coin:{ids:['45463','45487','45512','45439'],text:'コインを1回投げる。オモテなら4枚、ウラなら2枚、自分の山札を引く。',mechanic:'COIN_DRAW_CARDS',commands:['COIN_FLIP','DRAW'],heads:4,tails:2},
 heal:{ids:['45508','46606'],text:'自分のバトルポケモンのHPを「70」回復する。',mechanic:'HEAL_ACTIVE_DAMAGE',commands:['HEAL'],amount:70}
};
for(const group of Object.values(groups)){
 for(const id of group.ids){
  const row=intake.records.find(x=>String(x.officialCardId)===id);
  const meta=catalog.records.find(x=>String(x.officialCardId)===id);
  assert(row&&meta&&meta.regulationMark==='H'&&meta.legality==='printed-hij','unverified H print '+id);
  assert.equal(row.deckPrintAdopted,false);
  assert.equal(row.imageSourceUrl,meta.source.identityImageUrl);
  assert.equal(row.source.path,'data/effect-extensions/evidence/'+id+'.json');
  assert.equal(row.text,group.text);
  const plan=compile({records:[row]}).records[0].mainPlan;
  const expected={mechanic:group.mechanic,commands:group.commands};
  if(group.amount)expected.amount=group.amount;
  else Object.assign(expected,{heads:group.heads,tails:group.tails});
  assert.deepEqual(plan,expected,'official compiled plan '+id);
 }
}
function plan(text,category='supporter'){
 return compile({records:[{officialCardId:'999999',name:'generic fixture',category,text,attacks:[],abilities:[],facts:{prizeCount:1}}]}).records[0].mainPlan;
}
for(const text of [
 groups.coin.text.replace('4枚','5枚').replace('2枚','1枚').replace('コインを1回投げる。','コインを1回投げる。次の相手の番、'),
 groups.coin.text.replace('コインを1回投げる。','コインを2回投げる。')
]){
 assert.equal(plan(text),null,'unreviewed coin wording must remain blocked');
}
assert.equal(plan(groups.coin.text,'item'),null,'coin supporter effect cannot be treated as item');
assert.equal(plan(groups.heal.text.replace('バトルポケモン','ベンチポケモン')),null);
assert.equal(plan(groups.heal.text,'item'),null);
console.log('PASS official H source identities and six exact supporter plans');
