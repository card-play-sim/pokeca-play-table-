'use strict';
// Fast fail-closed target relevance check. Run only INSIDE the same offline
// sandbox as candidate code. A parsed plan is never an execution receipt.
const fs=require('node:fs');
const assert=require('node:assert/strict');
function matchingSlots(record,group){
 if(record.category!==group.category)return [];
 const kind=group.effectKind;
 const slots=kind==='attack'?record.attacks:kind==='ability'?record.abilities:
  kind===record.category?[{text:record.text,plan:record.mainPlan}]:[];
 return (slots||[]).filter(e=>e.text===group.exampleOfficialText&&
  (kind!=='attack'||String(e.damage)===String(group.printedDamage)&&
    JSON.stringify(e.cost||[])===JSON.stringify(group.energyCost||[])));
}
function inspect(selection,rows,compile){
 if(!Array.isArray(selection.groups)||!Array.isArray(selection.targetIds)||!selection.targetIds.length)
  throw Error('TARGET_GATE_INVALID_SELECTION');
 const ids=new Set(selection.targetIds.map(String));
 if(ids.size!==selection.targetIds.length)throw Error('TARGET_GATE_DUPLICATE_SELECTION');
 const indexed=new Map(rows.map(row=>[String(row.officialCardId),row]));
 const compiled=new Map(),covered=new Set(),proved=new Set(),targetFailures=[];
 for(const group of selection.groups){
  for(const rawId of new Set(group.officialCardIds.map(String))){
   if(!ids.has(rawId))continue;
   const row=indexed.get(rawId);
   if(!row)throw Error('TARGET_GATE_MISSING_RAW:'+rawId);
   // A group's exact official slot must exist before we ask about its plan.
   const original=matchingSlots(row,group);
   if(!original.length)continue;
   covered.add(rawId);
   if(!compiled.has(rawId))compiled.set(rawId,compile({records:[row]}).records[0]);
   const current=matchingSlots(compiled.get(rawId),group);
   if(current.length===original.length&&current.every(e=>e.plan&&typeof e.plan.mechanic==='string'&&Array.isArray(e.plan.commands)&&e.plan.commands.length))
    proved.add(rawId);
   else targetFailures.push({id:rawId,groupId:group.sharedTaskId,kind:group.effectKind,reason:'TARGET_NOT_COMPILED'});
  }
 }
 for(const id of ids)if(!covered.has(id))throw Error('TARGET_GATE_NO_EXACT_OFFICIAL_SLOT:'+id);
 return {state:proved.size?'TARGET_PLAN_PRESENT_NOT_EXECUTION_PROOF':'TARGET_NOT_COMPILED',
  parsedTargetIds:[...proved].sort(),targetFailures,publicBattleVerified:[]};
}
function selfTest(){
 // Actual failed run 45913093626 selected this item wording, but proposed
 // unrelated healing rules. Never treat such an unrelated plan as success.
 const itemText='このカードは、HP60の[無色]タイプのたねポケモンとして、場に出せる。このカードは、特殊状態にならず、にげられない。自分の番の中でなら、場に出ているこのカードをトラッシュできる。';
 const row={officialCardId:'46029',category:'item',text:itemText,attacks:[],abilities:[]};
 const group={sharedTaskId:'fixture',category:'item',effectKind:'item',exampleOfficialText:itemText,officialCardIds:['46029']};
 const selection={groups:[group],targetIds:['46029']};
 const {compile}=require('../engine/reference-effect-plans.cjs');
 assert.equal(inspect(selection,[row],compile).state,'TARGET_NOT_COMPILED');
 assert.equal(inspect(selection,[row],cat=>({records:cat.records.map(r=>({...r,text:'自分のポケモン1匹のHPを回復する。',mainPlan:{mechanic:'HEAL',commands:['HEAL']}}))})).state,'TARGET_NOT_COMPILED');
 // This controlled response checks routing only; not a real card solution.
 const result=inspect(selection,[row],cat=>({records:cat.records.map(r=>({...r,mainPlan:{mechanic:'SYNTHETIC_TEST_ONLY',commands:['TEST_ONLY']}}))}));
 assert.equal(result.state,'TARGET_PLAN_PRESENT_NOT_EXECUTION_PROOF');assert.deepEqual(result.parsedTargetIds,['46029']);assert.deepEqual(result.publicBattleVerified,[]);
 const attack={officialCardId:'12345',category:'pokemon',attacks:[{text:'x',damage:'20',cost:['草'],plan:null}],abilities:[]};
 const atk={groups:[{sharedTaskId:'attack',category:'pokemon',effectKind:'attack',exampleOfficialText:'x',printedDamage:'20',energyCost:['草'],officialCardIds:['12345']}],targetIds:['12345']};
 assert.equal(inspect(atk,[attack],c=>c).state,'TARGET_NOT_COMPILED');
 assert.throws(()=>inspect({...atk,groups:[{...atk.groups[0],printedDamage:'30'}]},[attack],c=>c),/TARGET_GATE_NO_EXACT_OFFICIAL_SLOT/);
 assert.throws(()=>inspect({...selection,targetIds:['46029','46029']},[row],compile),/TARGET_GATE_DUPLICATE_SELECTION/);
 console.log('UNKNOWN_EFFECT_TARGET_PRECHECK PASS: reject unrelated proposal; require exact source slot; never mark execution');
}
if(require.main===module){
 if(process.argv[2]==='--self-test')selfTest();
 else {
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
  const result=inspect(read(process.argv[2]),read('data/effect-extensions/intake.json').records,require('../engine/reference-effect-plans.cjs').compile);
  // Put a compact failure summary at the end of engine.log for retry feedback.
  console.log('UNKNOWN_TARGET_PRECHECK '+JSON.stringify({...result,targetFailures:result.targetFailures.slice(0,6)}));
  if(result.state!=='TARGET_PLAN_PRESENT_NOT_EXECUTION_PROOF')process.exitCode=1;
 }
}
module.exports={inspect,matchingSlots};
