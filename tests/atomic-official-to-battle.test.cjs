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
console.log('ATOMIC_OFFICIAL_TO_BATTLE PASS: acquisition + mechanic + physical execution one work unit; exact shared task groups; unresolved never completed');
