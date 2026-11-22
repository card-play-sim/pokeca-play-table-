'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const worker=require('../scripts/lib/shared-effect-engine-worker.cjs');
const bundle=fs.readFileSync('ui/engine.bundle.js','utf8'),context={window:{},console,performance,Math,setTimeout};
vm.runInNewContext(bundle,context);
const E=context.window.Pokeca,records=E.getReferenceEffectCatalog({includeExtensions:true}).records;
function get(id,mechanic){
 const ref=records.find(x=>String(x.officialCardId)===id);
 assert(ref&&ref.mainPlan?.mechanic===mechanic,'missing compiled official source '+id);
 return ref;
}
function create(id,mechanic){
 const ref=get(id,mechanic),t=worker.prepare(ref,{name:ref.name,text:ref.text,plan:ref.mainPlan,effectIndex:0},'main');
 assert(!t.blocked,'fixture blocked '+id+': '+t.blocked);
 const options=t.port.getHandOptions('you',t.sourceId);
 const option=options.find(x=>x.ok&&x.action?.type==='play_supporter');
 assert(option,'missing legal supporter action '+id+' '+JSON.stringify(options));
 return {port:t.port,action:option.action,sourceId:t.sourceId};
}
for(const id of ['45463','45487','45512','45439']){
 const ref=get(id,'COIN_DRAW_CARDS');
 assert.equal(ref.mainPlan.heads,4);assert.equal(ref.mainPlan.tails,2);
}
for(const seed of [0,1000]){
 const {port,action}=create('45463','COIN_DRAW_CARDS');
 const prepared=port.getSnapshot();prepared.referenceRngState=seed;
 assert(port.loadGame(prepared).ok,'seeded game must load');
 const before=port.getSnapshot();
 assert.equal(port.dispatch('ai',action).ok,false,'opponent must not use supporter');
 assert.deepEqual(port.getSnapshot(),before,'invalid opponent action must roll back');
 assert(port.dispatch('you',action).ok,'legal coin draw must play');
 const after=port.getSnapshot(),heads=seed===0,amount=heads?4:2;
 const tail=after.history.slice(before.history.length);
 assert(tail.some(x=>x.details?.command==='COIN_FLIP'&&x.details.heads===heads),'seeded coin result');
 assert(tail.some(x=>x.details?.command==='DRAW'),'DRAW command missing');
 assert.equal(after.players[0].hand.length-before.players[0].hand.length,amount-1,'physical hand draw count');
 assert.equal(after.players[0].turnLimits.supporterUsed,true);
 assert(port.restoreSession(port.getResumeSnapshot()).ok);
 assert.deepEqual(port.getSnapshot(),after,'coin branch must survive exact restore');
}
for(const id of ['45508','46606']){
 const {port,action,sourceId}=create(id,'HEAL_ACTIVE_DAMAGE'),before=port.getSnapshot();
 const old=before.players[0].active.damage;
 assert(old>0,'damaged Active required for healing fixture');
 const bench=JSON.stringify(before.players[0].bench);
 assert.equal(port.dispatch('ai',action).ok,false,'wrong-player supporter');
 assert.deepEqual(port.getSnapshot(),before);
 assert(port.dispatch('you',action).ok,'legal healing supporter must play');
 const after=port.getSnapshot();
 assert.equal(after.players[0].active.damage,Math.max(0,old-70));
 assert.equal(JSON.stringify(after.players[0].bench),bench,'benched Pokemon must not be healed');
 assert(port.restoreSession(port.getResumeSnapshot()).ok);
 assert.deepEqual(port.getSnapshot(),after,'healing must survive save/restore');
}
console.log('PASS 6 official H supporters: random heads/tails, legal hand dispatch, active-only heal and save/restore');
