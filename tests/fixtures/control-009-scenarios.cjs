'use strict';
const fs=require('node:fs'),vm=require('node:vm');
module.exports=function(E){
 const allowed=new Set(JSON.parse(fs.readFileSync('data/effect-extensions/control-009-example-decks.json')).decks.flatMap(d=>d.cards.map(c=>c.referenceOfficialCardId)));
 const S=vm.runInNewContext(fs.readFileSync('tests/fixtures/control-005-scenarios.js','utf8'),{console}),fixed=JSON.parse(fs.readFileSync('data/fixed-test-decks.json'));
 const mechanisms=new Set(['DISCARD_HAND_DRAW','RECOVER_BASIC_ENERGY','CONDITIONAL_MAX_HP','SUPPRESS_RULE_ABILITIES']),records=E.getReferenceEffectCatalog({includeExtensions:true}).records.filter(r=>allowed.has(r.officialCardId)).filter(r=>mechanisms.has(r.mainPlan?.mechanic));
 const manifest=require('./control-009-extension-manifest.cjs')(fixed,records);
 function create(ident,deck=0){
  const r=records.find(r=>r.officialCardId===ident),row={cardName:r.name,category:r.category,officialCardId:ident,plan:r.mainPlan,kind:'main',locations:[{deck}],effectId:'reference-'+ident+'-main-0'};
  const frame=S.create(E,manifest,row),g=frame.game,p=g.players[0];p.active.damage=20;
  if(r.mainPlan.mechanic==='RECOVER_BASIC_ENERGY')for(let n=0;n<2;n++){const i=p.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial);if(i<0)throw Error('BASIC_ENERGY_FIXTURE_REQUIRED');p.discard.push(p.deck.splice(i,1)[0]);}
  let game=g;const port=E.createUIPort({getGame:()=>game,setGame:x=>game=x});const loaded=port.loadGame(g);if(!loaded.ok)throw Error(JSON.stringify(loaded));
  return {frame,r,port,S};
 }
 return {records,manifest,create,S};
};
