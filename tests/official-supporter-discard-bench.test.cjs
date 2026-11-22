'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {compile}=require('../engine/reference-effect-plans.cjs');
const intake=JSON.parse(fs.readFileSync('data/effect-extensions/intake.json'));
const catalog=JSON.parse(fs.readFileSync('data/deck-building/catalog.json'));
const ids=['45793','45215','45535','45540','46628'];
const official='このカードは、自分の手札を1枚トラッシュしなければ使えない。\n\n相手のベンチポケモンの数ぶん、自分の山札を引く。';
function plan(text,category='supporter'){
 return compile({records:[{officialCardId:'999999',name:'test',category,text,attacks:[],abilities:[],facts:{prizeCount:1}}]}).records[0].mainPlan;
}
for(const id of ids){
 const row=intake.records.find(x=>String(x.officialCardId)===id);
 const meta=catalog.records.find(x=>String(x.officialCardId)===id);
 assert(row&&meta&&meta.legality==='printed-hij'&&meta.regulationMark==='H','H evidence missing '+id);
 assert.equal(row.name,'マツバの確信');
 assert.equal(row.text,official);
 assert.equal(row.deckPrintAdopted,false);
 assert.equal(row.imageSourceUrl,meta.source.identityImageUrl);
 assert.equal(row.source.path,'data/effect-extensions/evidence/'+id+'.json');
 assert.deepEqual(plan(row.text),{mechanic:'DISCARD_ONE_DRAW_OPP_BENCH',commands:['DISCARD','DRAW']});
}
assert.equal(plan(official.replace('1枚','2枚')),null,'different cost must stay blocked');
assert.equal(plan(official.replace('相手のベンチ','自分のベンチ')),null,'different bench owner blocked');
assert.equal(plan(official,'item'),null,'Supporter text cannot be treated as Item');
console.log('PASS five official H Matsuba supporter printings and negative exact compiler cases');
