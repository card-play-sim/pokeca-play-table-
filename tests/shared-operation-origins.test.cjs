'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={window:{},performance,console,Math,setTimeout};vm.runInNewContext(fs.readFileSync(process.env.OPERATION_TEST_BUNDLE||'ui/engine.bundle.js','utf8'),c);const E=c.window.Pokeca;
const S=vm.runInNewContext(fs.readFileSync('tests/fixtures/control-005-scenarios.js','utf8'),{console}),base=JSON.parse(fs.readFileSync('data/fixed-test-decks.json'));
const rows=S.inventory(E,base),results=[];const clone=x=>JSON.parse(JSON.stringify(x));
function test(name,f){try{f();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAILED',error:String(e),stack:e.stack});}}
function fixture(row,manifest=base){const frame=S.create(E,manifest,row);let game=frame.game;const port=E.createUIPort({getGame:()=>game,setGame:g=>game=g});assert(port.loadGame(game).ok);return {frame,port};}
function reject(port,a){const before=JSON.stringify(port.getSnapshot());assert.equal(port.dispatch('you',a).ok,false);assert.equal(JSON.stringify(port.getSnapshot()),before,'rejection preserves every state and RNG field');}
// Every verified alternate print, not only default fixed-deck bindings, uses the same path.
for(const record of E.getReferenceEffectCatalog().records){
 const original=rows.find(x=>x.cardName===record.deckName&&x.kind==='ability');if(!original)continue;
 for(const ability of record.abilities.filter(a=>a.plan&&!['SKYLINE','FAIRY_ZONE','BENCH_NON_RULE_PROTECTION'].includes(a.plan.mechanic))){
  const row={...original,officialCardId:record.officialCardId,effectId:ability.effectId,plan:ability.plan,text:ability.text,effectName:ability.name};
  const manifest=clone(base);for(const d of manifest.decks)for(const card of d.cards)if(card.name===record.deckName)card.referenceOfficialCardId=record.officialCardId;
  test(record.officialCardId+' '+ability.plan.mechanic+' legal UI/AI/save connection',()=>{
   const {frame,port}=fixture(row,manifest);if(row.plan.mechanic==='MEOWTH_ENTRY')assert(port.dispatch('you',{type:'bench_basic',cardId:frame.sourceId}).ok);
   const option=S.option(E,port,frame);assert(option&&(option.ok??option.enabled));const before=port.getSnapshot();
   assert(E.getLegalActions(before,'you').actions.some(a=>JSON.stringify(a)===JSON.stringify(option.action)));
   const info=port.getCardInfo('you',frame.sourceId).entries.find(e=>e.id===row.effectId);assert.equal(info.actionAvailable,true);assert(info.activationOrigin.zones.length);
   assert(port.dispatch('you',option.action).ok);assert.deepEqual(S.identities(port.getSnapshot()),S.identities(before));
   const saved=port.getResumeSnapshot(),expected=JSON.stringify(port.getSnapshot());assert(port.restoreSession(saved).ok);assert.equal(JSON.stringify(port.getSnapshot()),expected);reject(port,option.action);
  });
 }
}
for(const m of ['RECON','REVERSAL_DRAW','ADRENA_BRAIN'])test(m+' forged hand ability rejected without mutation',()=>{
 const {frame,port}=fixture(rows.find(r=>r.plan.mechanic===m)),a=S.option(E,port,frame).action,g=port.getSnapshot(),p=g.players[0];
 const source=p.active;p.active=p.bench.shift();p.hand.push(source);assert(port.loadGame(g).ok);reject(port,a);
 assert(!E.getLegalActions(port.getSnapshot(),'you').actions.some(x=>x.type==='use_ability'&&x.sourceInstanceId===frame.sourceId));
 const info=port.getCardInfo('you',frame.sourceId).entries.find(e=>e.id===a.abilityId);assert.equal(info.actionAvailable,false);assert(info.inactiveReasons.some(s=>s.startsWith('ABILITY_SOURCE_ZONE')));
});
for(const m of ['RECON','REVERSAL_DRAW','ADRENA_BRAIN'])test(m+' bench origin remains usable',()=>{
 const {frame,port}=fixture(rows.find(r=>r.plan.mechanic===m)),g=port.getSnapshot(),p=g.players[0],source=p.active;p.active=p.bench.shift();p.bench.push(source);assert(port.loadGame(g).ok);
 const option=port.getPokemonActions('you',frame.sourceId).find(o=>o.kind==='ability');assert(option.enabled);assert(port.dispatch('you',option.action).ok);
});
for(const condition of ['no-mega','full-bench','already-field','other-turn'])test('hand activation '+condition+' rejected with unchanged state',()=>{
 const row=rows.find(r=>r.plan.mechanic==='EXCITE_DIVE'),{frame,port}=fixture(row),g=port.getSnapshot(),p=g.players[0];
 if(condition==='no-mega'){
  for(const mon of [p.active,...p.bench].filter(c=>E.getReferenceEffectRecord(c).facts.prizeCount===3)){
   if(p.active===mon)p.active=p.bench.shift();else p.bench.splice(p.bench.indexOf(mon),1);p.hand.push(mon);
  }
 }
 if(condition==='full-bench')while(p.bench.length<5){const i=p.deck.findIndex(c=>c.kind==='pokemon');const mon=p.deck.splice(i,1)[0];Object.assign(mon,{cardId:mon.id,damage:0,enteredTurn:0,energies:[],energyCards:[],tools:[]});p.bench.push(mon);}
 if(condition==='already-field'){const i=p.hand.findIndex(c=>c.id===frame.sourceId),mon=p.hand.splice(i,1)[0];Object.assign(mon,{cardId:mon.id,damage:0,enteredTurn:0,energies:[],energyCards:[],tools:[]});p.bench.push(mon);}
 if(condition==='other-turn')g.turnPlayer='ai';assert(port.loadGame(g).ok);
 reject(port,{type:'use_ability',sourceInstanceId:frame.sourceId,abilityId:row.effectId});
});
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/shared-operation-origins.json',JSON.stringify({scope:'verified-origin-and-operation-contract',results},null,2));console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAILED'))process.exitCode=1;
