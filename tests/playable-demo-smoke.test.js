'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sandbox={};sandbox.window=sandbox;
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),sandbox);
const engine=sandbox.Pokeca;
let seed=123;
const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const created=engine.createDemoMatch({rng});
assert.equal(created.ok,true);
let game=created.game;
assert.equal(game.players.length,2);
for(const player of game.players){
  assert.ok(player.active?.basic===true);
  assert.equal(player.prizeCards.length,6);
  assert.equal(player.deck.length+player.hand.length+player.bench.length+player.prizeCards.length+1,60);
}
const port=engine.createUIPort({getGame:()=>game,setGame:next=>{game=next;}});
const opening=engine.getLegalActions(game,'you');
assert.ok(opening.actions.some(a=>a.type==='end_turn'));
assert.ok(!opening.actions.some(a=>a.type==='attack_turn'),'First-turn attack must be prohibited');
const turnEnd=opening.actions.find(a=>a.type==='end_turn');
assert.equal(port.dispatch('you',turnEnd).ok,true);
assert.equal(game.turnPlayer,'ai');
const aiActions=engine.getLegalActions(game,'ai');
assert.ok(aiActions.actions.some(a=>a.type==='end_turn'));
assert.ok(aiActions.actions.length>0);
// Run the real AI policy, not merely an artificial end-turn action.
(async()=>{
  const aiResult=await engine.runAITurn(port,'ai',{maxActions:30});
  assert.equal(aiResult.ok,true,JSON.stringify({stage:aiResult.stage,errors:aiResult.errors}));
  assert.ok(aiResult.actions>=1);
  assert.equal(game.turnPlayer,'you');
  assert.equal(game.turnNumber,3);
  console.log('Demo engine: setup, first-turn lock, legal moves, real AI turn PASS (synthetic demo only)');
})().catch(error=>{console.error(error);process.exitCode=1;});
