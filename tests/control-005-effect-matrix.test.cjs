'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},performance,console,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),context);const E=context.window.Pokeca;
const S=vm.runInNewContext(fs.readFileSync('tests/fixtures/control-005-scenarios.js','utf8'),{console});
const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json')),rows=S.inventory(E,manifest),results=[];assert.equal(rows.length,60);
function summarize(g){return {turn:g.turnNumber,turnPlayer:g.turnPlayer,status:g.status,players:g.players.map(p=>({id:p.id,hand:p.hand.length,deck:p.deck.length,bench:p.bench.length,discard:p.discard.length,prizes:p.prizes,normalEnergyAttached:p.normalEnergyAttached,turnLimits:p.turnLimits,field:[p.active,...p.bench].filter(Boolean).map(c=>({id:c.id,damage:c.damage,energies:(c.energyCards||[]).map(e=>e.id)}))}))};}
for(const row of rows){for(const variant of ['COMBO','HAMMER','COIN_PROTECT'].includes(row.plan?.mechanic)?['heads','tails']:['normal']){
 const item={effectId:row.effectId,cardName:row.cardName,kind:row.kind,mechanic:row.plan?.mechanic,variant};
 try{
  const frame=S.create(E,manifest,row,variant);if(frame.blocked){results.push({...item,status:'BLOCKED',cause:frame});continue;}
  let game=frame.game;const port=E.createUIPort({getGame:()=>game,setGame:g=>game=g});assert(port.loadGame(game).ok);
  if(row.plan.mechanic==='MEOWTH_ENTRY')assert(port.dispatch('you',{type:'bench_basic',cardId:frame.sourceId}).ok);
  const option=S.option(E,port,frame);assert(option&&(option.ok??option.enabled),JSON.stringify(option));const before=port.getSnapshot();
  const reply=port.dispatch('you',option.action);assert(reply.ok,JSON.stringify(reply));const after=port.getSnapshot();
  const ai=E.getLegalActions(before,'you').actions,aiLegalActionMatched=ai.some(a=>['type','cardId','sourceInstanceId','abilityId','attackIndex','cardIndex'].every(k=>a[k]===option.action[k]));assert(aiLegalActionMatched,'AI legality does not match UI primary action');
  const checks=S.verify(E,frame,before,after,option.action);const saved=port.getResumeSnapshot();assert(port.restoreSession(saved).ok);assert.equal(JSON.stringify(port.getSnapshot()),JSON.stringify(after));
  results.push({...item,status:'EXECUTED',checks,aiLegalActionMatched,canonicalActionType:option.action.type,saveRestoreExact:true,stateBefore:summarize(before),stateAfter:summarize(after)});
 }catch(error){results.push({...item,status:'FAILED',causeId:'EXPECTED_STATE_OR_GATEWAY_FAILURE',error:String(error),stack:error.stack});}
}}
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/control-005-node.json',JSON.stringify({scope:'controlled-reference-effects',results},null,2)+'\n');
console.log(JSON.stringify({effects:rows.length,cases:results.length,counts:results.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{}),failures:results.filter(x=>x.status==='FAILED').map(x=>({effectId:x.effectId,name:x.cardName,error:x.error}))},null,2));
// The downstream status reporter must be able to distinguish a validated
// reference execution from print-identity adoption. These fields are the
// contract used for an independent, scoped execution PASS.
for(const result of results.filter(x=>x.status==='EXECUTED')){
 assert.equal(result.aiLegalActionMatched,true,'executed case must match AI legal action');
 assert.equal(result.saveRestoreExact,true,'executed case must restore identical game state');
 assert(Array.isArray(result.checks)&&result.checks.length>0,'executed case must assert effects');
}
if(results.some(x=>x.status==='FAILED'))process.exitCode=1;
