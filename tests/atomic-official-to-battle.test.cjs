'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildLedger,makeWorklist}=require('../scripts/atomic-battle-connection-ledger.cjs');
const {commands}=require('../scripts/run-atomic-official-battle-intake.cjs');
const unknown=(id,text)=>({
  officialCardId:id,category:'item',name:'未対応の公式グッズ',
  text,attacks:[],abilities:[],source:{path:'data/effect-extensions/evidence/'+id+'.json'}
});
const compiled={records:[{officialCardId:'9000',category:'energy',
  mainPlan:{mechanic:'BASIC_ENERGY'},attacks:[],abilities:[]}]};
const original={
  ids:['9000','9001','9002','9003','9004','9005','9006'],
  candidate:{state:'PREPUBLICATION',qualified:['9000'],
    blockers:[{id:'9002',reason:'NO_LEGAL_VERIFICATION_FIXTURE'}],
    publicBattleVerified:[]},
  checkpoint:{records:[unknown('9001','未実装効果Ａ。'),
    unknown('9005','未実装効果Ａ。'),unknown('9006','別の未知効果Ｂ。')],
    blocked:[{officialCardId:'9003',reason:'UNSUPPORTED_EVOLUTION_CHAIN'}]},
  status:{compilerBlocked:[
    {officialCardId:'9001',reason:'UNSUPPORTED_EFFECT_PATTERN'},
    {officialCardId:'9005',reason:'UNSUPPORTED_EFFECT_PATTERN'},
    {officialCardId:'9006',reason:'UNSUPPORTED_EFFECT_PATTERN'}]},
  compiled
};
const result=buildLedger(original);
const byId=new Map(result.entries.map(row=>[row.officialCardId,row]));
assert.equal(result.totalSelected,7);
assert.equal(result.qualifiedForPublication,1);
assert.equal(result.workRemaining,6);
assert.equal(result.publicBattleVerified,false);
assert.equal(result.allCardEffectsConnectedAndExecuted,false);
assert.equal(byId.get('9000').state,'QUALIFIED_PREPUBLICATION');
assert.equal(byId.get('9001').state,'NEEDS_SHARED_MECHANIC');
assert.equal(byId.get('9002').state,'NEEDS_ENGINE_EXECUTION');
assert.equal(byId.get('9003').state,'NEEDS_OFFICIAL_PARSER');
assert.equal(byId.get('9004').state,'PENDING_OFFICIAL_FETCH');
assert.equal(byId.get('9005').state,'NEEDS_SHARED_MECHANIC');
assert.equal(byId.get('9006').state,'NEEDS_SHARED_MECHANIC');
assert.equal(result.sharedMechanicGroups,2,
  'exact text must group shared mechanincs, not names or unrelated effects');
assert.deepEqual(result.sharedMechanicWorklist.map(x=>x.printCount),[2,1]);
assert.equal(result.sharedMechanicWorklist[0].officialCardIds.length,2);
assert.equal(result.sharedMechanicWorklist[0].exampleOfficialText,'未実装効果Ａ。');
assert(!result.entries.some(row=>/FETCHED_DONE|CONNECTED_DONE/.test(row.state)),
  'acquisition must never be completion');
assert.throws(()=>buildLedger({...original,compiled:{records:[]}}),
  /QUALIFIED_PRINT_NOT_IN_BATTLE_RELEASE/,
  'a plan candidate absent from public bundle cannot pass');
assert.throws(()=>buildLedger({...original,candidate:{...original.candidate,state:'DONE'}}),
  /BATTLE_EXECUTION_CANDIDATE_GATE_REQUIRED/);
const many=Array.from({length:41},(_,i)=>unknown(String(10000+i),'全印刷版で同じ未対応共通効果。'));
const manyGroups=makeWorklist(many,many.map(row=>({
  officialCardId:row.officialCardId,reason:'UNSUPPORTED_EFFECT_PATTERN'
})),new Set(many.map(row=>row.officialCardId)));
assert.equal(manyGroups.length,1);
assert.equal(manyGroups[0].printCount,41,
  'shared print counting includes every official printing');
assert.deepEqual(manyGroups[0].officialCardIds,many.map(row=>row.officialCardId));
assert.deepEqual(manyGroups[0].officialEvidencePaths,many.map(row=>row.source.path));
const base='a'.repeat(40);
const steps=commands({base,limit:400});
const names=steps.map(([name])=>name);
for(const mandatory of ['SELECT_EXACT_OFFICIAL_PRINTS',
 'FETCH_PARSE_AND_COMPILE_WITH_SHARED_ENGINE',
 'EXECUTE_ALL_CARD_EFFECTS_IN_REAL_ENGINE',
 'COMPILE_ONLY_ENGINE_QUALIFIED_PRINTS',
 'BUNDLE_ACTUAL_SHARED_RUNTIME',
 'CREATE_REAL_BATTLE_VERIFICATION_FIXTURES',
 'RETAIN_UNRESOLVED_CARDS_IN_ATOMIC_WORK_UNIT',
 'CHECK_PUBLISHED_PWA_BUNDLE'])
 assert(names.includes(mandatory),'missing one-work-unit stage '+mandatory);
assert(names.indexOf('SELECT_EXACT_OFFICIAL_PRINTS') < names.indexOf('VERIFY_OFFICIAL_FACT_REPAIR_CONTRACT'));
assert(names.indexOf('VERIFY_OFFICIAL_FACT_REPAIR_CONTRACT') < names.indexOf('REPAIR_UNCOMPILED_FACTS_FROM_OFFICIAL_EVIDENCE'));
assert(names.indexOf('REPAIR_UNCOMPILED_FACTS_FROM_OFFICIAL_EVIDENCE') < names.indexOf('FETCH_PARSE_AND_COMPILE_WITH_SHARED_ENGINE'));
assert.deepEqual(steps.find(([name])=>name==='REPAIR_UNCOMPILED_FACTS_FROM_OFFICIAL_EVIDENCE').slice(1),
 ['node',['scripts/refresh-uncompiled-official-facts.cjs','--apply']]);
assert(names.indexOf('FETCH_PARSE_AND_COMPILE_WITH_SHARED_ENGINE') <
  names.indexOf('EXECUTE_ALL_CARD_EFFECTS_IN_REAL_ENGINE'));
assert(names.indexOf('EXECUTE_ALL_CARD_EFFECTS_IN_REAL_ENGINE') <
  names.indexOf('RETAIN_UNRESOLVED_CARDS_IN_ATOMIC_WORK_UNIT'));
assert(names.indexOf('RETAIN_UNRESOLVED_CARDS_IN_ATOMIC_WORK_UNIT') <
  names.indexOf('CHECK_PUBLISHED_PWA_BUNDLE'));
assert.throws(()=>commands({base,limit:0}),/INVALID_ATOMIC_BATCH_LIMIT/);
assert.throws(()=>commands({base:'HEAD',limit:400}),/INVALID_ATOMIC_BASE_SHA/);
const workflow=fs.readFileSync('.github/workflows/continue-official-effects.yml','utf8');
assert.match(workflow,/node scripts\/run-atomic-official-battle-intake\.cjs/,
  'official intake must run one atomic official-to-battle command');
assert.match(workflow,/atomic-battle-connection\.json/,
  'unfinished effects must survive as an explicit, durable work ledger');
assert.match(workflow,/node tests\/atomic-official-to-battle\.test\.cjs/,
  'connected cards need a permanent regression gate');
// A newly compilable old intake row without current execution receipts must
// never block an unrelated proven print, escape the retry queue, or remove a
// previously published compiled print.
const {deferUnverifiedPromotions}=require('../scripts/stage-card-auto-connect.cjs');
const sourceRows=['old-live','old-deferred','old-unsupported','new-pass','new-fail']
  .map(officialCardId=>({officialCardId,source:{path:officialCardId+'.json'}}));
const stagedIntake={records:sourceRows.slice()};
const retryCheckpoint={records:[sourceRows[4]],blocked:[]};
const deferred=deferUnverifiedPromotions(stagedIntake,retryCheckpoint,
  new Set(['old-live','old-deferred','old-unsupported']),new Set(['old-live']),
  ['new-pass'],[{id:'old-deferred',reason:'EXECUTION_EVIDENCE_INCOMPLETE'},
    {id:'new-fail',reason:'ENGINE_EXECUTION_FAILED'}]);
assert.deepEqual(deferred.map(x=>x.id),['old-deferred']);
assert.deepEqual(stagedIntake.records.map(x=>x.officialCardId),
  ['old-live','old-unsupported','new-pass']);
assert.deepEqual(retryCheckpoint.records,[sourceRows[4],sourceRows[1]]);
assert.throws(()=>deferUnverifiedPromotions({records:[sourceRows[1]]},
  {records:[{...sourceRows[1],source:{path:'conflict'}}]},new Set(['old-deferred']),
  new Set(),[],[{id:'old-deferred'}]),/DEFERRED_EVIDENCE_CONFLICT/);
console.log('ATOMIC_OFFICIAL_TO_BATTLE PASS: acquisition + mechanic + physical execution one work unit; exact shared task groups; unresolved never completed');

const {compile}=require('../engine/reference-effect-plans.cjs');
const compose=text=>compile({records:[{officialCardId:'9000',category:'supporter',name:'test',text,attacks:[],abilities:[]}]}).records[0].mainPlan;
assert.deepEqual(compose('自分の山札を2枚引く。その後、自分の手札が10枚以上あるなら、さらに2枚引く。').steps,[{op:'draw',amount:2},{op:'drawIfHand',threshold:10,amount:2}]);
assert.deepEqual(compose('自分の山札を2枚引く。相手の手札を見る。相手の山札を上から1枚見て、もとにもどす。').steps,[{op:'draw',amount:2},{op:'revealHand',side:'opponent'},{op:'peekTop',side:'opponent',amount:1}]);
assert.equal(compose('自分の山札を2枚引く。その後、未知の効果を実行する。'),null);
assert.equal(compose('自分の山札を2枚引く。相手の手札を見る。未知の効果を実行する。'),null);

const evolutionTransfer=text=>compile({records:[{officialCardId:'9001',category:'pokemon',name:'test',text:'',attacks:[],abilities:[{text}]}]}).records[0].abilities[0].plan;
const evolutionPrefix='自分の番に、このカードを手札から出して進化させたとき、1回使える。';
const evolutionRecovery=evolutionTransfer(evolutionPrefix+'自分のトラッシュから「ペパーのサンドウィッチ」を2枚まで選び、相手に見せて、手札に加える。');
assert.equal(evolutionRecovery.mechanic,'MASS_ZONE_TRANSFER');assert.equal(evolutionRecovery.origin,'evolve');assert.equal(evolutionRecovery.zone,'discard');assert.equal(evolutionRecovery.nameExact,'ペパーのサンドウィッチ');assert.equal(evolutionRecovery.limit,2);
assert.equal(evolutionTransfer(evolutionPrefix+'自分のトラッシュから「ペパーのサンドウィッチ」を2枚まで選び、相手に見せて、手札に加える。未知の効果。'),null);
const fullHeal=evolutionTransfer(evolutionPrefix+'自分のポケモン1匹のHPを、すべて回復する。');
assert.equal(fullHeal.mechanic,'MASS_HEAL_OWN');assert.equal(fullHeal.origin,'evolve');assert.equal(fullHeal.amount,'all');assert.equal(fullHeal.target,'choice');
const route=evolutionTransfer(evolutionPrefix+'自分の山札から「基本[悪]エネルギー」を5枚まで選び、自分の「マリィのポケモン」に好きなようにつける。そして山札を切る。');
assert.equal(route.mechanic,'MASS_ENERGY_ROUTE');assert.equal(route.origin,'evolve');assert.equal(route.team,'マリィ');assert.equal(route.limit,5);
assert.equal(evolutionTransfer(evolutionPrefix+'自分のポケモン1匹のHPを、すべて回復する。その後、未知の効果。'),null);
const benchPrefix='自分の番に、このカードを手札からベンチに出したとき、1回使える。';
const entryEnergy=evolutionTransfer(benchPrefix+'自分の手札から「基本[闘]エネルギー」を2枚まで選び、このポケモンにつける。');
assert.equal(entryEnergy.mechanic,'MASS_ENERGY_ROUTE');assert.equal(entryEnergy.origin,'bench');assert.equal(entryEnergy.zone,'hand');assert.equal(entryEnergy.target,'self');assert.equal(entryEnergy.type,'闘');assert.equal(entryEnergy.limit,2);
assert.equal(evolutionTransfer(benchPrefix+'自分の手札から「基本[闘]エネルギー」を2枚まで選び、このポケモンにつける。その後、未知の効果。'),null);
// Unlisted combinations are synthesized as executable, ordered shared operations.
const synthAttack=(text,damage='0')=>compile({records:[{officialCardId:'9002',category:'pokemon',name:'test',text:'',attacks:[{text,damage,cost:[]}],abilities:[]}]}).records[0].attacks[0].plan;
assert.deepEqual(synthAttack('自分の手札を1枚トラッシュする。その後、自分の山札を3枚引く。').steps,[{op:'discardOwnHand',amount:1},{op:'draw',amount:3}]);
assert.deepEqual(synthAttack('相手の手札からオモテを見ないで1枚選び、トラッシュする。相手の山札を上から1枚トラッシュする。','160').steps,[{op:'blindDiscardOpponent',amount:1,side:'opponent'},{op:'mill',side:'opponent',amount:1}]);
assert.deepEqual(synthAttack('自分の手札を2枚トラッシュする。その後、自分の山札を4枚引く。次の相手の番、相手は手札からグッズを出して使えない。').steps.map(s=>s.op),['discardOwnHand','draw','itemLock']);
assert.equal(synthAttack('自分の手札を1枚トラッシュする。その後、未知の効果を実行する。'),null);

const {partitionEvidence,mergeShardResults,allExecuted}=require('../scripts/stage-card-auto-connect.cjs');
const ParallelBatch=require('../scripts/lib/shared-effect-batch.cjs');
const parallelSlots=[['1','attack',0],['1','ability',0],['2','attack',0],['3','attack',0],['3','attack',1],['4','attack',0]].map(([officialCardId,effectKind,effectIndex])=>({officialCardId,effectKind,effectIndex,effectName:'test',effectText:'exact'}));
const parallelParts=partitionEvidence(parallelSlots,3);
assert.equal(parallelParts.length,3);
assert.equal(new Set(parallelParts.flat().map(ParallelBatch.slot)).size,parallelSlots.length);
assert.deepEqual(parallelParts.map(x=>x.length),[2,2,2]);
assert.deepEqual(partitionEvidence([...parallelSlots].reverse(),3),parallelParts);
assert.equal(parallelParts.filter(rows=>rows.some(row=>row.officialCardId==='1')).length,1);
assert.throws(()=>partitionEvidence([...parallelSlots,parallelSlots[0]],3),/DUPLICATE_CANDIDATE_SLOT/);
assert.throws(()=>partitionEvidence(parallelSlots,9),/INVALID_ENGINE_SHARD_COUNT/);
assert.deepEqual(partitionEvidence([],4),[]);
const parallelFp='a'.repeat(64);
const parallelReceipts=parallelParts.map(rows=>({executionFingerprint:parallelFp,cases:rows.map(row=>({slot:ParallelBatch.slot(row),status:'SUCCEEDED'}))}));
const parallelMerged=mergeShardResults(parallelParts,parallelReceipts);
assert.equal(parallelMerged.size,parallelSlots.length);
assert(allExecuted(parallelSlots,new Map([...parallelMerged].map(([k,v])=>[k,v.status]))));
const parallelMissing=parallelReceipts.map(r=>({...r,cases:[...r.cases]}));
const parallelMissingSlot=parallelMissing[0].cases.pop().slot;
const parallelIncomplete=mergeShardResults(parallelParts,parallelMissing);
assert.equal(parallelIncomplete.get(parallelMissingSlot).status,'BLOCKED');
assert(!allExecuted(parallelSlots,new Map([...parallelIncomplete].map(([k,v])=>[k,v.status]))));
assert.throws(()=>mergeShardResults(parallelParts,parallelReceipts.map((r,i)=>i===1?{...r,executionFingerprint:'b'.repeat(64)}:r)),/FINGERPRINT_CONFLICT/);
assert.throws(()=>mergeShardResults(parallelParts,parallelReceipts.map((r,i)=>i===0?{...r,cases:[...r.cases,r.cases[0]]}:r)),/FOREIGN_OR_DUPLICATE/);
assert.throws(()=>mergeShardResults(parallelParts,parallelReceipts.map((r,i)=>i===0?{...r,cases:[...r.cases,parallelReceipts[1].cases[0]]}:r)),/FOREIGN_OR_DUPLICATE/);
assert.throws(()=>mergeShardResults(parallelParts,parallelReceipts.slice(1)),/RECEIPT_COUNT/);
console.log('ENGINE_PARALLEL_PARTITION_AND_FAIL_CLOSED_MERGE_PASS');
