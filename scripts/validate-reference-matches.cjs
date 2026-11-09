#!/usr/bin/env node
'use strict';
// Real fixed120 cards, exact reference prints, canonical legal-action gateway. No fake effects.
const fs=require('node:fs'),vm=require('node:vm');
async function run({seeds=[2,7],maxTurns=120}={}){
 const reports=[];const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json','utf8'));
 for(const seed of seeds){
  let randomness=seed;const math=Object.create(Math);math.random=()=>{randomness=(Math.imul(randomness,1664525)+1013904223)>>>0;return randomness/4294967296;};
  const ctx={window:{},performance,console,Math:math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),ctx);
  const engine=ctx.window.Pokeca,created=engine.createReferenceValidationMatch(manifest,{rng:math.random,firstDeck:seed%2});
  if(!created.ok)throw Error(created.stage);
  let game=created.game;const port=engine.createUIPort({getGame:()=>game,setGame:g=>game=g});const loaded=port.loadGame(game);if(!loaded.ok)throw Error(JSON.stringify(loaded));
  const steps=[];let stopped=null;
  for(let step=0;step<maxTurns&&game.status==='active';step++){
   const actor=game.pendingPrizeSelection?.playerId||game.pendingReferenceChoice?.playerId||game.turnPlayer;
   const result=await engine.runAITurn(port,actor,{maxActions:80});
   steps.push({actor,ok:result.ok,stage:result.stage,actions:result.actions});
   if(!result.ok){stopped={stage:result.stage,errors:result.errors,blockedEffects:result.blockedEffects,actor,attackUsed:game.attackUsed,pendingPrize:game.pendingPrizeSelection,pendingChoice:game.pendingReferenceChoice,legal:engine.getLegalActions(game,actor),probeEnd:port.getActionExplanation(actor,{type:'end_turn'}),probeChoices:game.pendingReferenceChoice?.options.map(v=>port.getActionExplanation(actor,{type:'resolve_reference_choice',...(game.pendingReferenceChoice.kind==='MULLIGAN'?{drawCount:v}:game.pendingReferenceChoice.kind==='CIRCULATOR'?v:{benchInstanceId:v})}))};break;}
  }
  if(game.status==='active'&&!stopped)stopped={stage:'turn_limit',pendingPrize:game.pendingPrizeSelection,pendingChoice:game.pendingReferenceChoice};
  const saved=port.getResumeSnapshot(),restored=port.restoreSession(saved);
  const report={seed,source:'fixed-test-decks.json, 120 physical reference cards',adoptedDeckPrints:0,status:game.status,winner:game.winner,turnNumber:game.turnNumber,completed:game.status==='finished',stopped,saveReloadExact:restored.ok&&JSON.stringify(port.getSnapshot())===JSON.stringify(saved.game),attacks:game.history.filter(e=>e.type==='attack').length,knockouts:game.history.filter(e=>e.type==='knockout').length,steps,officialAdoptionPass:false};
  reports.push(report);console.log(JSON.stringify({...report,steps:undefined}));
 }
 return reports;
}
if(require.main===module)run().then(matches=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/reference-match-results.json',JSON.stringify({matches,allCompleted:matches.every(m=>m.completed&&m.saveReloadExact),formalAdoptionPass:false},null,2)+'\n');if(matches.some(m=>!m.completed||!m.saveReloadExact))process.exitCode=2;}).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
