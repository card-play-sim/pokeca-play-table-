'use strict';
// Deterministic cross-family execution in the actual shipped browser engine.
// Fail with precise action/print evidence, not a one-card-only patch request.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../ui/engine.bundle.js'),'utf8');
const sandbox={window:{},performance:require('node:perf_hooks').performance,setTimeout};
vm.runInNewContext(source,sandbox,{filename:'engine.bundle.js',timeout:10000});
const engine=sandbox.window.Pokeca;
const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/fixed-test-decks.json'),'utf8'));
const families=new Map(),prints=new Set();
const priority=['resolve_reference_choice','take_prizes','bench_basic','evolve','attach_energy','play_item','play_supporter','play_stadium','attach_tool','use_ability','retreat','attack_turn','end_turn'];
let executed=0,conservation=0;
function failure(seed,step,owner,action,game,error){
 const p=game.players.find(x=>x.id===owner),card=p?.hand.find(x=>x.id===action.cardId)||[p?.active,...(p?.bench||[])].find(x=>x?.id===action.sourceInstanceId)||p?.active;
 const officialCardId=String(card?.validationReference?.officialCardId||card?.evolutionCards?.at(-1)?.validationReference?.officialCardId||'');
 const causeId=String(error?.code||error?.message||'REFERENCE_ACTION_FAILURE').match(/[A-Z][A-Z0-9_]{2,100}/)?.[0]||'REFERENCE_ACTION_FAILURE';
 const record={causeId,command:action.type||'UNKNOWN',test:'tests/reference-effect-cross-family-seeded.test.cjs',officialCardId,seed,step,actor:owner,error:String(error?.message||error).slice(0,400)};
 console.error('REFERENCE_RUNTIME_FAILURE_JSON:'+JSON.stringify(record));
}
for(let seed=1;seed<=64;seed++){
 let state=(seed*2654435761)>>>0;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const created=engine.createReferenceValidationMatch(manifest,{rng:random,firstDeck:seed%2,firstPlayer:seed%2?'you':'ai'});
 assert.equal(created.ok,true,'reference match creation failed seed='+seed);
 let game=created.game;
 const gateway=engine.createUIPort({getGame:()=>game,setGame:next=>{game=next;}});
 assert.equal(gateway.loadGame(game).ok,true);
 for(let step=0;step<55&&game.status==='active';step++){
  const owner=game.pendingReferenceChoice?.playerId||game.turnPlayer;
  const actions=engine.getLegalActions(game,owner).actions;
  if(!actions.length)break;
  // Rotate priorities by seed and step to reach different effect families.
  const rotation=(seed+Math.floor(step/7))%priority.length;
  const order=priority.slice(rotation).concat(priority.slice(0,rotation));
  const action=order.map(type=>actions.find(a=>a.type===type)).find(Boolean)||actions[0];
  const before=JSON.stringify(game);
  let result;
  try{result=gateway.dispatch(owner,action);}
  catch(error){failure(seed,step,owner,action,game,error);throw error;}
  if(!result.ok){
   failure(seed,step,owner,action,game,new Error(JSON.stringify(result.errors||result.stage||'DISPATCH_FAILED')));
   assert.fail('LEGAL_ACTION_DISPATCH_FAILED seed='+seed+' step='+step+' action='+action.type);
  }
  if(result.transitionAudit?.conservation?.ok===false){
   failure(seed,step,owner,action,game,new Error('CARD_CONSERVATION_FAILED'));
   assert.fail('CARD_CONSERVATION_FAILED seed='+seed+' step='+step);
  }
  executed++;families.set(action.type,(families.get(action.type)||0)+1);
  if(result.transitionAudit?.conservation?.ok===true)conservation++;
  const current=game.players.find(x=>x.id===owner);
  const card=current?.active;
  const print=card?.evolutionCards?.at(-1)?.validationReference?.officialCardId||card?.validationReference?.officialCardId;
  if(print)prints.add(String(print));
  assert.notEqual(JSON.stringify(game),before,'legal action must mutate state seed='+seed+' step='+step);
 }
}
assert.ok(executed>=1000,'INSUFFICIENT_CROSS_FAMILY_ACTIONS:'+executed);
assert.ok(families.size>=12,'INSUFFICIENT_EFFECT_FAMILIES:'+families.size);
assert.ok(conservation===executed,'MISSING_CARD_CONSERVATION_AUDIT:'+conservation+'/'+executed);
// Prize-taking is verified by the dedicated rejection/rollback test; random legal play may not reach a knockout.
for(const type of ['attack_turn','use_ability','play_item','play_supporter','play_stadium','attach_energy','evolve','retreat','resolve_reference_choice'])assert.ok(families.has(type),'UNTESTED_EFFECT_FAMILY:'+type);
assert.ok(prints.size>=12,'INSUFFICIENT_ACTIVE_PRINT_DIVERSITY:'+prints.size);
console.log('REFERENCE_CROSS_FAMILY_SEEDED PASS',JSON.stringify({seeds:64,actions:executed,conservation,actionFamilies:Object.fromEntries([...families].sort()),activePrints:prints.size}));
