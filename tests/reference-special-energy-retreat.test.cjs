'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../ui/engine.bundle.js'),'utf8');
const sandbox={window:{},performance:require('node:perf_hooks').performance,setTimeout};
vm.runInNewContext(source,sandbox,{filename:'engine.bundle.js',timeout:10000});
const engine=sandbox.window.Pokeca;
const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/fixed-test-decks.json'),'utf8'));
function fixture(){
 const made=engine.createReferenceValidationMatch(manifest,{rng:()=>0.51,firstDeck:0,firstPlayer:'you'});
 assert.equal(made.ok,true);
 let game=made.game;const own=game.players[0],other=game.players[1];
 const evolved=other.deck.find(c=>c.kind==='pokemon'&&c.stage>0);
 const ignition=own.deck.find(c=>c.name==='イグニッションエネルギー');
 assert.ok(evolved&&ignition);
 other.deck.splice(other.deck.indexOf(evolved),1);
 own.deck.splice(own.deck.indexOf(ignition),1);
 other.deck.push(own.active);
 own.active={...evolved,cardId:evolved.id,damage:0,energyCards:[ignition],energies:[],enteredTurn:0,retreatCost:3};
 const gateway=engine.createUIPort({getGame:()=>game,setGame:next=>{game=next;}});
 assert.equal(gateway.loadGame(game).ok,true);
 return {get game(){return game;},own,gateway,ignition};
}
// Ignition supplies three colorless units to an evolved Pokemon, but is one physical card.
{
 const f=fixture(),actions=engine.getLegalActions(f.game,f.own.id).actions.filter(a=>a.type==='retreat');
 assert.ok(actions.length>0,'SPECIAL_ENERGY_RETREAT_ACTION_MISSING');
 assert.equal(actions[0].energyIds.length,1,'RETREAT_MUST_DISCARD_MINIMUM_PHYSICAL_CARDS');
 assert.equal(actions[0].energyIds[0],f.ignition.id);
 const result=f.gateway.dispatch(f.own.id,actions[0]);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.transitionAudit?.conservation?.ok,true);
 assert.ok(f.game.players[0].discard.some(c=>c.id===f.ignition.id),'SPECIAL_ENERGY_NOT_DISCARDED');
}
// Two Ignition cards must not both be selected for a three-unit retreat.
{
 const f=fixture(),other=f.own.deck.find(c=>c.name==='イグニッションエネルギー');
 assert.ok(other);
 f.own.deck.splice(f.own.deck.indexOf(other),1);f.own.active.energyCards.push(other);
 const actions=engine.getLegalActions(f.game,f.own.id).actions.filter(a=>a.type==='retreat');
 assert.ok(actions.length>0);
 assert.equal(actions[0].energyIds.length,1,'EXCESS_SPECIAL_ENERGY_PAYMENT');
 const before=JSON.stringify(f.game);
 const invalid=f.gateway.dispatch(f.own.id,{...actions[0],energyIds:f.own.active.energyCards.map(c=>c.id)});
 assert.equal(invalid.ok,false,'EXCESS_PAYMENT_ACCEPTED');
 assert.equal(JSON.stringify(f.game),before,'EXCESS_PAYMENT_MUTATED_GAME');
}
console.log('REFERENCE_SPECIAL_ENERGY_RETREAT PASS');
