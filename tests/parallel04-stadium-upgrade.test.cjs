'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {compile}=require('../engine/reference-effect-plans.cjs');
const officialCardId='50163', name='アンジュフラエッテ';
const saved=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+officialCardId+'.json','utf8'));
assert.equal(saved.url,'https://www.pokemon-card.com/card-search/details.php/card/'+officialCardId);
assert.equal(crypto.createHash('sha256').update(saved.html).digest('hex'),saved.htmlSha256);
assert.ok(saved.html.includes('カード詳細（'+name+'）'));
const text=saved.html.match(/<h2 class="mt20">スタジアム<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/<br\s*\/?>/g,'').replace(/\s+/g,'');
const row={officialCardId,name,deckName:name,category:'stadium',text,attacks:[],abilities:[],facts:{},set:'test',cardNumber:officialCardId,source:{sha256:saved.htmlSha256},imageSourceUrl:'test'};
const plan=compile({records:[row]}).records[0].mainPlan;
assert.equal(plan?.mechanic,'STADIUM_NAMED_UPGRADE_HP');
assert.equal(plan.amount,150);
assert.equal(plan.replaces,'プリズムタワー');
assert.notEqual(compile({records:[{...row,text:text+'追加条件。'}]}).records[0].mainPlan?.mechanic,plan.mechanic);
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
const box={module:{exports:{}},require:n=>{
 if(n==='./pokeca_reference_effect_data')return {records:[]};
 if(n==='./pokeca_selection_constraints')return {};
 if(n==='./pokeca_effect_extensions')return {catalog:x=>x};
 throw Error(n);
}};
vm.runInNewContext(source+'\nObject.assign(module.exports,{stadiumPlacementAllowed,namedStadiumHpBonus});',box,{filename:'reference-runtime',timeout:10000});
const {stadiumPlacementAllowed:allowed,namedStadiumHpBonus:bonus}=box.module.exports;
const card={kind:'stadium',name};
for(const turn of [3,4])for(const current of [null,'プリズムタワー','他のスタジアム',name]){
 const g={turnNumber:4,stadiumPlayedTurn:turn,stadium:current?{name:current}:null};
 const before=JSON.stringify(g);
 assert.equal(allowed(g,card,plan,current),current==='プリズムタワー');
 assert.equal(allowed(g,card,null,current),turn!==4&&current!==name);
 assert.equal(allowed(g,{...card,kind:'tool'},plan,current),false);
 assert.equal(JSON.stringify(g),before);
}
for(const n of ['メガフラエッテex','フラエッテ','メガフラエッテex以外']){
 assert.equal(bonus(plan,n),n===plan.name?150:0);
 assert.equal(bonus(null,n),0);
}
console.log('OWNER04_STADIUM_UPGRADE_LOCAL_PASS',officialCardId);
