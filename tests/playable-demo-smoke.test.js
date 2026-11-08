'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sandbox={performance:{now:()=>Number(process.hrtime.bigint())/1e6},setTimeout};sandbox.window=sandbox;
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
  // AI-vs-AI smoke uses actual actions and must reach a finished state.
  let full=engine.createDemoMatch({rng});
  assert.equal(full.ok,true);
  let fullGame=full.game;
  const fullPort=engine.createUIPort({getGame:()=>fullGame,setGame:next=>{fullGame=next;}});
  const seen=new Set();
  let completedTurns=0;
  for(let t=0;t<60&&fullGame.status==='active';t++){
    const playerId=fullGame.pendingPrizeSelection?.playerId||fullGame.turnPlayer;
    const result=await engine.runAITurn(fullPort,playerId,{maxActions:30});
    assert.equal(result.ok,true,'AI turn '+t+': '+JSON.stringify(result.errors));
    assert.ok(result.actions>0,'No actions on turn '+t);
    completedTurns++;
    for(const action of result.results||[])if(action?.value?.type)seen.add(action.value.type);
  }
  assert.equal(fullGame.status,'finished','Demo did not reach a game result');
  assert.ok(seen.has('attack_turn'),'No attack action was performed');
  console.log('Demo AI-vs-AI full match FINISHED in '+completedTurns+' actions cycles (synthetic demo only)');
  // Regression: prize owner can differ from turn owner after a knockout.
  // Run several reproducible games, covering prize selection and winner resolution.
  for(let trial=1;trial<=8;trial++){
    let trialSeed=trial;
    const trialRng=()=>{trialSeed=(Math.imul(trialSeed,1664525)+1013904223)>>>0;return trialSeed/4294967296;};
    let trialGame=engine.createDemoMatch({rng:trialRng}).game;
    const trialPort=engine.createUIPort({getGame:()=>trialGame,setGame:next=>{trialGame=next;}});
    let steps=0;
    while(trialGame.status==='active'&&steps<60){
      const actor=trialGame.pendingPrizeSelection?.playerId||trialGame.turnPlayer;
      const result=await engine.runAITurn(trialPort,actor,{maxActions:30});
      assert.equal(result.ok,true,'seed '+trial+' step '+steps+': '+JSON.stringify(result.errors));
      steps++;
    }
    assert.equal(trialGame.status,'finished','seed '+trial+' failed to finish');
  }
  console.log('Eight deterministic AI-vs-AI games finished (synthetic demo only)');
})().catch(error=>{console.error(error);process.exitCode=1;});
