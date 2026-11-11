'use strict';
// Reject invalid targets/choices without consuming cards, RNG or the turn.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../ui/engine.bundle.js'),'utf8');
const sandbox={window:{},performance:require('node:perf_hooks').performance,setTimeout};
vm.runInNewContext(source,sandbox,{filename:'engine.bundle.js',timeout:10000});
const engine=sandbox.window.Pokeca;
const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/fixed-test-decks.json'),'utf8'));
const families=new Map();
let rejected=0,executed=0;
for(let seed=1;seed<=64;seed++){
 let state=seed;
 const rng=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const created=engine.createReferenceValidationMatch(manifest,{rng,firstDeck:seed%2,firstPlayer:seed%2?'you':'ai'});
 assert.equal(created.ok,true,'setup seed='+seed);
 let game=created.game;
 const gateway=engine.createUIPort({getGame:()=>game,setGame:x=>{game=x;}});
 assert.equal(gateway.loadGame(game).ok,true);
 for(let step=0;step<35&&game.status==='active';step++){
  const actor=game.pendingReferenceChoice?.playerId||game.turnPlayer,actions=engine.getLegalActions(game,actor).actions;
  if(!actions.length)break;
  const action=actions[(seed+step)%actions.length],bad=JSON.parse(JSON.stringify(action));
  let invalid=true;
  switch(action.type){
   case 'attach_energy':bad.cardIndex=-1;break;
   case 'retreat':case 'evolve':bad.benchInstanceId='INVALID_INSTANCE';bad.targetInstanceId='INVALID_INSTANCE';break;
   case 'attack_turn':bad.attackIndex=999;break;
   case 'use_ability':bad.abilityId='INVALID_ABILITY';break;
   case 'play_item':case 'play_supporter':case 'play_stadium':case 'attach_tool':case 'bench_basic':case 'play_active_basic':bad.cardId='INVALID_CARD';break;
   case 'resolve_reference_choice':bad.benchInstanceId='INVALID_INSTANCE';bad.energyId='INVALID_ENERGY';bad.drawCount=-1;break;
   case 'take_prizes':bad.slots=[999];break;
   default:invalid=false;
  }
  if(invalid){
   const before=JSON.stringify(game);
   const result=gateway.dispatch(actor,bad);
   assert.equal(result.ok,false,'invalid action accepted seed='+seed+' step='+step+' type='+action.type);
   assert.equal(JSON.stringify(game),before,'rejected action changed game/RNG seed='+seed+' step='+step+' type='+action.type);
   rejected++;families.set(action.type,(families.get(action.type)||0)+1);
  }
  const result=gateway.dispatch(actor,action);
  assert.equal(result.ok,true,'legal action failed after rejection seed='+seed+' step='+step+' type='+action.type+' errors='+JSON.stringify(result.errors));
  assert.equal(result.transitionAudit?.conservation?.ok,true,'conservation failed after rejection');
  executed++;
 }
}
assert.ok(rejected>=1400,'INSUFFICIENT_REJECTED_ACTIONS:'+rejected);
assert.ok(families.size>=10,'INSUFFICIENT_REJECTION_FAMILIES:'+families.size);
assert.ok(families.has('take_prizes'),'PRIZE_SELECTION_REJECTION_NOT_EXERCISED');
console.log('REFERENCE_CROSS_FAMILY_REJECTION PASS',JSON.stringify({seeds:64,rejected,legalAfterRejection:executed,families:Object.fromEntries([...families].sort())}));
