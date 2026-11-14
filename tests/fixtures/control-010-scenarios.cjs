'use strict';
const fs=require('node:fs'),vm=require('node:vm');
module.exports=function(E){
 const allowed=new Set(JSON.parse(fs.readFileSync('data/effect-extensions/control-010-example-decks.json')).decks.flatMap(d=>d.cards.map(c=>c.referenceOfficialCardId)));
 const S=vm.runInNewContext(fs.readFileSync('tests/fixtures/control-005-scenarios.js','utf8'),{console}),fixed=JSON.parse(fs.readFileSync('data/fixed-test-decks.json'));
 const records=E.getReferenceEffectCatalog({includeExtensions:true}).records.filter(r=>allowed.has(r.officialCardId)).filter(r=>r.category==='pokemon'&&!E.getReferenceEffectCatalog().records.some(b=>b.officialCardId===r.officialCardId)||r.mainPlan?.mechanic==='COLORLESS_MULTI_ENERGY');
 const manifest=require('./control-009-extension-manifest.cjs')(fixed,records);manifest.decks.forEach((d,i)=>{d.id='control-010-reference-'+i;d.name='ワザ・特性・特殊エネルギー検証 '+(i+1);});
 function create(ident,kind,index=0,seed=0,deck=0){
  const r=records.find(r=>r.officialCardId===ident),effect=kind==='attack'?r.attacks[index]:kind==='ability'?r.abilities[index]:{plan:r.mainPlan},row={cardName:r.name,category:r.category,officialCardId:ident,kind,index,locations:[{deck}],effectId:effect.effectId,plan:effect.plan,cost:effect.cost||[],damage:effect.damage||'0'};
  const frame=S.create(E,manifest,row),g=frame.game,p=g.players[0];g.referenceRngState=seed;
  // Isolate baseline attack/ability tests from the separately tested special-energy modifier.
  for(const mon of [p.active,...p.bench]){p.deck.push(...mon.energyCards);mon.energyCards=[];mon.energies=[];}
  if(kind==='attack')for(let i=0;i<row.cost.length;i++){const j=p.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial);if(j<0)throw Error('FIXTURE_ENERGY');p.active.energyCards.push(p.deck.splice(j,1)[0]);}
  if(kind==='ability'&&effect.plan.mechanic==='HAND_LIMIT_DRAW_ABILITY')while(p.hand.length>1)p.deck.push(p.hand.pop());
  let game=g;const port=E.createUIPort({getGame:()=>game,setGame:x=>game=x});const res=port.loadGame(g);if(!res.ok)throw Error(JSON.stringify(res));return {r,effect,frame,port,S};
 }
 function take(p,predicate){for(const zone of ['deck','hand','prizeCards']){const i=p[zone].findIndex(predicate);if(i<0)continue;const card=p[zone][i];if(zone==='prizeCards'){p[zone][i]=p.deck.shift();p.prizeSlots=p.prizeCards.map(c=>c.id);}else p[zone].splice(i,1);return card;}throw Error('FIXTURE_CARD_MISSING');}
 function protection(ident){const row=S.inventory(E,manifest).find(r=>r.plan?.mechanic==='ANY_DAMAGE'),frame=S.create(E,manifest,row),g=frame.game,enemy=g.players[1],target=take(enemy,c=>c.validationReference.officialCardId===ident);Object.assign(target,{cardId:target.id,damage:0,enteredTurn:0,energyCards:[],energies:[],tools:[]});enemy.bench.push(target);return {frame,game:g,targetId:target.id};}
 function energyBattle(ident){const t=create(ident,'energy'),g=t.port.getSnapshot(),p=g.players[0],mon=take(p,c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c).attacks.some(a=>a.plan?.mechanic==='COIN_FAILURE_DAMAGE')&&E.getReferenceEffectRecord(c).facts.stage===1);Object.assign(mon,{cardId:mon.id,damage:0,enteredTurn:0,energyCards:[],energies:[],tools:[]});p.bench.push(p.active);p.active=mon;mon.energyCards.push(take(p,c=>c.kind==='energy'&&!c.isSpecial));g.referenceRngState=0;return {frame:t.frame,game:g,attackerId:mon.id};}
 return {records,manifest,S,create,protection,energyBattle,take};
};
