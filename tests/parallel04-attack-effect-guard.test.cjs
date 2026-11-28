'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
function readRow(v,officialCardId){const name=v.html.match(/カード詳細（([^）]+)）/)[1],text=v.html.match(/<h2 class="mt20">特殊エネルギー<\/h2>\s*<p>([\s\S]*?)<\/p>/)[1].replace(/<span class="icon-none icon"><\/span>/g,"[無色]").replace(/<span class="icon-fighting icon"><\/span>/g,"[闘]").replace(/<br\s*\/?>/g,"").replace(/\s+/g,"");if(v.url!==`https://www.pokemon-card.com/card-search/details.php/card/${officialCardId}`)throw Error("url mismatch");return {officialCardId,name,deckName:name,category:"energy",text,attacks:[],abilities:[],facts:{},set:"test",cardNumber:officialCardId,source:{sha256:v.htmlSha256},imageSourceUrl:"test"}}
function verify(compile,rt,rows){
 let n=0;function eq(x,y){n++;if(x!==y)throw Error(`assert ${n}: ${JSON.stringify(x)} !== ${JSON.stringify(y)}`);}
 const compiled=compile({records:rows}).records;
 for(const row of compiled){eq(row.mainPlan?.mechanic,"ENERGY_ATTACK_EFFECT_GUARD");eq(row.mainPlan.energyType,row.officialCardId==="49713"?"闘":"無色");eq(compile({records:[{...row,text:row.text+"追加条件。"}]}).records[0].mainPlan?.mechanic==="ENERGY_ATTACK_EFFECT_GUARD",false);}
 const mon=(key,type)=>({officialCardId:key,name:key,deckName:key,category:"pokemon",attacks:[],abilities:[],facts:{types:[type],hp:200,stage:0,basic:true,prizeCount:1,retreatCost:1},set:"test",cardNumber:key,source:{sha256:"test"},imageSourceUrl:"test"});
 const ar=mon("a","草"),dr=mon("d","闘"),nr=mon("n","草");
 const card=(r,key)=>({id:key,name:r.name,kind:r.category,hp:200,damage:0,tools:[],energyCards:[],validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,sourceSha256:r.source.sha256,imageSourceUrl:r.imageSourceUrl,adopted:false}});
 const catalog={records:[ar,dr,nr,...compiled]},m={exports:{}};
 const deps=s=>{if(s==="./pokeca_reference_effect_data")return catalog;if(s==="./pokeca_selection_constraints"||s==="./pokeca_engine_core")return {};if(s==="./pokeca_effect_extensions")return {catalog:x=>x};if(s==="./pokeca_effect_service")return {apply:(game,c,ctx)=>{let target=game.players.flatMap(p=>[p.active,...p.bench]).find(x=>x.id===ctx.targetIds[0]);if(c.command==="DAMAGE")target.damage+=c.amount;else if(c.command==="PLACE_DAMAGE_COUNTERS")target.damage+=c.counterCount*10;else throw Error(c.command)}};throw Error(s)};
 new Function("module","exports","require",rt+"\nObject.assign(module.exports,{energyAttackEffectGuard,applySpecialStatus,counters,moveDamageCounters,applyPlan});")(m,m.exports,deps);
 const x=m.exports;
 for(const row of compiled)for(const type of [dr,nr]){
  const a=card(ar,"a"),d=card(type,"d"),e=card(row,"e");d.energyCards=[e];d.statusCondition="ASLEEP";
  const g={referenceEffectValidation:true,turnNumber:3,history:[],players:[{id:"you",active:a,bench:[],hand:[],deck:[],discard:[],prizes:6},{id:"ai",active:d,bench:[],hand:[],deck:[],discard:[],prizes:6}]};
  const guard=row.officialCardId!=="49713"||type===dr;
  eq(x.energyUnits(d)[0][0],row.mainPlan.energyType);eq(x.energyAttackEffectGuard(g,"you",d),guard);eq(x.energyAttackEffectGuard(g,"ai",d),false);
  eq(d.statusCondition,"ASLEEP");x.damage(g,"you",d,20);eq(d.damage,20);
  x.applySpecialStatus(g,"you",d,"CONFUSED",{attack:true});eq(d.statusCondition,guard?"ASLEEP":"CONFUSED");
  x.counters(g,"you",d,2,{attack:true});eq(d.damage,guard?20:40);x.counters(g,"you",d,1);eq(d.damage,guard?30:50);
  a.damage=30;const prior=d.damage;x.moveDamageCounters(g,"you",a,d,2,{attack:true});eq(a.damage,10);eq(d.damage,guard?prior:prior+20);
  x.applySpecialStatus(g,"you",d,"POISONED");eq(d.statusCondition,"POISONED");
  d.energyCards=[];eq(x.energyAttackEffectGuard(g,"you",d),false);x.applySpecialStatus(g,"you",d,"PARALYZED",{attack:true});eq(d.statusCondition,"PARALYZED");
 }
 return n;
}
const rows=["45288","46847","47218","49713"].map(id=>{const v=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(v.html).digest('hex'),v.htmlSha256);return readRow(v,id);});
console.log('OWNER04_ATTACK_EFFECT_GUARD_PASS',verify(compile,fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'),rows));
