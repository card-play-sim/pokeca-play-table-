'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const worker=require('../scripts/lib/shared-effect-engine-worker.cjs');
const bundle=fs.readFileSync('ui/engine.bundle.js','utf8');
const ctx={window:{},console,performance,Math,setTimeout};
vm.runInNewContext(bundle,ctx);
const records=ctx.window.Pokeca.getReferenceEffectCatalog({includeExtensions:true}).records;
function fixture(id,mechanic){
 const ref=records.find(x=>String(x.officialCardId)===id);
 assert(ref&&ref.mainPlan?.mechanic===mechanic,'missing official plan '+id);
 const t=worker.prepare(ref,{name:ref.name,text:ref.text,plan:ref.mainPlan,effectIndex:0},'main');
 assert(!t.blocked,'fixture blocked '+id+': '+t.blocked);
 return t;
}
function play(t,adjust){
 const port=t.port;
 if(adjust){
  const g=port.getSnapshot();adjust(g);
  const loaded=port.loadGame(g);assert(loaded.ok,'modified deterministic match must load '+JSON.stringify(loaded)+' prizes='+g.players[1].prizes+' prizeCards='+g.players[1].prizeCards?.length);
 }
 const option=port.getHandOptions('you',t.sourceId).find(o=>o.ok&&o.action?.type==='play_supporter');
 assert(option,'legal supporter UI action');
 const before=port.getSnapshot();
 assert.equal(port.dispatch('ai',option.action).ok,false,'opponent may not use our Supporter');
 assert.deepEqual(port.getSnapshot(),before);
 assert(port.dispatch('you',option.action).ok,'Supporter action must execute');
 const after=port.getSnapshot();
 const events=after.history.slice(before.history.length);
 assert(port.restoreSession(port.getResumeSnapshot()).ok,'resume should succeed');
 assert.deepEqual(port.getSnapshot(),after,'exact snapshot restore');
 return {before,after,events};
}
for(const id of ['46037','46172','46179','46832']){
 const ref=records.find(x=>String(x.officialCardId)===id);
 assert.equal(ref?.mainPlan?.mechanic,'RETURN_HAND_PRIZE_DRAW');
}
for(const count of [6,3]){
 const t=fixture('46037','RETURN_HAND_PRIZE_DRAW');
 const {after,events}=play(t,g=>{g.players[1].prizes=count;});
 assert.equal(after.players[0].hand.length,count<=3?8:4,'correct conditional draw count');
 assert(events.some(e=>e.details?.command==='SHUFFLE_DECK'));
 assert(events.some(e=>e.details?.command==='RETURN_TO_DECK'));
 assert(events.some(e=>e.details?.command==='DRAW'));
}
for(const id of ['46291','46331','46613']){
 const ref=records.find(x=>String(x.officialCardId)===id);
 assert.equal(ref?.mainPlan?.mechanic,'RETURN_HAND_COIN_DRAW');
}
const outcomes=new Set();
for(const seed of [0,1,2,3,4,5,6,7,8,9,10,1000,123456789]){
 const t=fixture('46291','RETURN_HAND_COIN_DRAW');
 const {after,events}=play(t,g=>{g.referenceRngState=seed;});
 const coin=events.find(e=>e.details?.command==='COIN_FLIP');
 assert(coin&&typeof coin.details.heads==='boolean','physical coin result');
 assert.equal(after.players[0].hand.length,coin.details.heads?8:3,'exact coin-dependent draw');
 const shuffleIndex=events.findIndex(e=>e.details?.command==='SHUFFLE_DECK');
 const coinIndex=events.findIndex(e=>e.details?.command==='COIN_FLIP');
 assert(shuffleIndex>=0&&coinIndex>shuffleIndex,'shuffle must precede coin');
 outcomes.add(coin.details.heads);
 if(outcomes.size===2)break;
}
assert.equal(outcomes.size,2,'both heads and tails must be covered');
console.log('PASS seven official H supporters: both prize branches, shuffle-before-coin, both coin branches, wrong player and save/restore');
