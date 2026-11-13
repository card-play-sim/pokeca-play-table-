'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},performance,console,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),context);const E=context.window.Pokeca;
const S=vm.runInNewContext(fs.readFileSync('tests/fixtures/control-005-scenarios.js','utf8'),{console});
const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json')),rows=S.inventory(E,manifest),results=[];assert.equal(rows.length,60);
for(const row of rows){for(const variant of ['COMBO','HAMMER','COIN_PROTECT'].includes(row.plan?.mechanic)?['heads','tails']:['normal']){
 const item={effectId:row.effectId,cardName:row.cardName,kind:row.kind,mechanic:row.plan?.mechanic,variant};
 try{
  const frame=S.create(E,manifest,row,variant);if(frame.blocked){results.push({...item,status:'BLOCKED',cause:frame});continue;}
  let game=frame.game;const port=E.createUIPort({getGame:()=>game,setGame:g=>game=g});assert(port.loadGame(game).ok);
  if(row.plan.mechanic==='MEOWTH_ENTRY')assert(port.dispatch('you',{type:'bench_basic',cardId:frame.sourceId}).ok);
  const option=S.option(E,port,frame);assert(option&&(option.ok??option.enabled),JSON.stringify(option));const before=port.getSnapshot();
  const reply=port.dispatch('you',option.action);assert(reply.ok,JSON.stringify(reply));const after=port.getSnapshot();
  const checks=S.verify(E,frame,before,after,option.action);const saved=port.getResumeSnapshot();assert(port.restoreSession(saved).ok);assert.equal(JSON.stringify(port.getSnapshot()),JSON.stringify(after));
  results.push({...item,status:'EXECUTED',checks,saveRestoreExact:true});
 }catch(error){results.push({...item,status:'FAILED',causeId:'EXPECTED_STATE_OR_GATEWAY_FAILURE',error:String(error),stack:error.stack});}
}}
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/control-005-node.json',JSON.stringify({scope:'controlled-reference-effects',results},null,2)+'\n');
console.log(JSON.stringify({effects:rows.length,cases:results.length,counts:results.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{}),failures:results.filter(x=>x.status==='FAILED').map(x=>({effectId:x.effectId,name:x.cardName,error:x.error}))},null,2));
if(results.some(x=>x.status==='FAILED'))process.exitCode=1;
