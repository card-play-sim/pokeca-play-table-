'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={window:{},console,performance,Math,setTimeout};
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),ctx);
const E=ctx.window.Pokeca,manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json','utf8'));
const copy=x=>JSON.parse(JSON.stringify(x));
async function main(){
 let game;
 const port=E.createUIPort({getGame:()=>game,setGame:g=>{game=g;}});
 const fixture=vm.runInNewContext(fs.readFileSync('tests/fixtures/g-base-008-browser.js','utf8'),{
  Pokeca:E,PokecaMobile:{port},fetch:async()=>({json:async()=>copy(manifest)})
 });
 await fixture({active:['ロケット団のニューラ','ニャースex'],bench:[['マシマシラ','シェイミ'],['スボミー','ドラメシヤ']],energy:[{},{active:['基本炎エネルギー','基本炎エネルギー','基本炎エネルギー']}],damage:{0:20}});
 const initial=port.getSnapshot();initial.turnPlayer='ai';assert(port.loadGame(initial).ok);
 const before=port.getSnapshot(),turn=before.turnNumber,attacker=before.players[1].active,defender=before.players[0].active;
 const attack=E.getLegalActions(before,'ai').actions.find(a=>a.type==='attack_turn'&&a.attackIndex===0);
 assert(attack,'exact printed return attack must be legal');
 assert(port.dispatch('ai',attack).ok);
 let state=port.getSnapshot();
 assert.equal(state.turnNumber,turn);
 assert.equal(state.players[1].active,null);
 assert.equal(state.players[0].active.id,defender.id,'knockout must wait for attacker promotion');
 assert.equal(state.pendingReferenceChoice.kind,'PROMOTE');assert.equal(state.pendingReferenceChoice.playerId,'ai');
 assert(!state.pendingPrizeSelection);
 assert.equal(state.referenceAttackAwaitingPromotion,true,'attack resolution must remain pending until the mandatory replacement is selected');
 assert(state.players[1].hand.some(c=>c.id===attacker.id));
 for(const energy of attacker.energyCards)assert(state.players[1].hand.some(c=>c.id===energy.id));
 const saved=port.getResumeSnapshot();assert(port.restoreSession(saved).ok);assert.equal(JSON.stringify(port.getSnapshot()),JSON.stringify(state));
 const choices=E.getLegalActions(state,'ai').actions;
 assert.equal(choices.length,2);
 assert.equal(E.getLegalActions(state,'you').actions.length,0);
 const invalid={...choices[0],benchInstanceId:'not-a-bench-id'};
 assert.equal(port.dispatch('ai',invalid).ok,false);
 assert.equal(JSON.stringify(port.getSnapshot()),JSON.stringify(state));
 const aiResult=await E.runAITurn(port,'ai',{maxActions:20});
 assert(aiResult.ok,JSON.stringify(aiResult.errors));
 state=port.getSnapshot();
 assert.equal(state.players[1].active.id,choices[0].benchInstanceId);
 assert.equal(state.players[0].active,null);
 assert.equal(state.pendingReferenceChoice.playerId,'you');
 assert.equal(state.turnNumber,turn);
 // Prize selection, where pending, must precede the opponent's promotion.
 if(state.pendingPrizeSelection){
  const actor=state.pendingPrizeSelection.playerId,action=E.getLegalActions(state,actor).actions[0];
  assert(action&&action.type==='take_prizes');assert(port.dispatch(actor,action).ok);state=port.getSnapshot();
 }
 const next=E.getLegalActions(state,'you').actions.find(a=>a.type==='resolve_reference_choice');
 assert(next);assert(port.dispatch('you',next).ok);
 state=port.getSnapshot();
 assert.equal(state.turnNumber,turn+1);assert.equal(state.turnPlayer,'you');
 assert(state.players.every(p=>p.active));assert(!state.pendingReferenceChoice);assert(!state.referenceAttackAwaitingPromotion);
 assert(state.players[0].discard.some(c=>c.id===defender.id));
 assert.equal(state.history.filter(e=>e.type==='knockout'&&e.details?.cardId===defender.id).length,1);
 assert.equal(state.players[1].prizes,before.players[1].prizes-1);
 assert.equal(state.history.filter(e=>e.type==='end_turn'&&e.turnNumber===turn).length,1);
 console.log('ATTACK_RETURN_PROMOTION_ORDER_PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
