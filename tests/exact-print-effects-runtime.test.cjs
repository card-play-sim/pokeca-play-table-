'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const worker=require('../scripts/lib/shared-effect-engine-worker.cjs');
const ctx={window:{},console,performance,Math,setTimeout};
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),ctx,{timeout:10000});
const records=ctx.window.Pokeca.getReferenceEffectCatalog({includeExtensions:true}).records;
for(const spec of [{id:'49573',mechanic:'POKEPAD',action:'play_item'},{id:'47288',mechanic:'BOSS',action:'play_supporter'}]){
 const ref=records.find(r=>String(r.officialCardId)===spec.id);
 assert(ref && ref.mainPlan?.mechanic===spec.mechanic,'exact source missing '+spec.id);
 const t=worker.prepare(ref,{name:ref.name,text:ref.text,plan:ref.mainPlan,effectIndex:0},'main');
 assert(!t.blocked,'fixture blocked: '+spec.id+': '+t.blocked);
 const port=t.port,before=port.getSnapshot();
 const option=port.getHandOptions('you',t.sourceId).find(o=>o.ok&&o.action?.type===spec.action);
 assert(option,'print '+spec.id+' must expose a legal UI action');
 const action=option.action;
 assert(port.canDispatch('you',action),'canonical preflight '+spec.id);
 assert.equal(port.dispatch('ai',action).ok,false,'opponent cannot use player card');
 assert.equal(port.dispatch('you',{...action,cardId:'invalid-physical-card'}).ok,false,'forged card rejected');
 assert.deepEqual(port.getSnapshot(),before,'invalid requests must not mutate state');
 const result=port.dispatch('you',action);
 assert.equal(result.ok,true,'exact printing must execute real command '+spec.id);
 assert.equal(result.transitionAudit?.conservation?.ok,true,'preserve all physical cards');
 const after=port.getSnapshot();
 assert(after.players[0].discard.some(c=>c.id===t.sourceId),'played print physically discarded');
 if(spec.mechanic==='POKEPAD'){
   const chosen=action.selections?.cards||[];
   assert.equal(chosen.length,1,'one non-rule Pokémon must be chosen');
   const pokemon=before.players[0].deck.find(c=>c.id===chosen[0]);
   assert(pokemon,'chosen physical Pokémon must exist in deck');
   assert(after.players[0].hand.some(c=>c.id===pokemon.id),'Pokepad searched Pokémon must enter hand');
   assert(!after.players[0].deck.some(c=>c.id===pokemon.id));
   assert(after.history.slice(before.history.length).some(e=>e.details?.command==='SHUFFLE_DECK'),'Pokepad must shuffle');
 }else{
   const target=action.selections?.bench?.[0];
   assert(target,'Boss must require an opponent Bench target');
   assert(before.players[1].bench.some(p=>p.id===target),'chosen Bench target belongs to opponent');
   assert.equal(after.players[1].active.id,target,'Boss must force opponent switch');
   assert(after.players[1].bench.some(p=>p.id===before.players[1].active.id),'previous Active must enter Bench');
 }
 assert(port.restoreSession(port.getResumeSnapshot()).ok,'save/restore on exact printing');
 assert.deepEqual(port.getSnapshot(),after,'restored match preserves card action');
}
console.log('PASS exact Pokepad/Boss physical print runtime, illegal-action rejection and save/restore');
