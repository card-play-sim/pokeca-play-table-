'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {applyEdits,exactGroup,selectBatch,normalizeHistory,recordHistory,sourceFingerprint,localCompletion,parseModelProposal,repairProfile,modelAnchors,resolveAnchorProposal}=require('../scripts/local-unknown-effect-generator.cjs');
const path='engine/reference-effect-plans.cjs',before='const reviewedUniqueAnchor = true;';
const sources={[path]:before};
assert.equal(applyEdits(sources,{edits:[{path,before,after:before+'\nconst newEffect = true;'}]})[path],before+'\nconst newEffect = true;');
assert.equal(sources[path],before);
assert.throws(()=>applyEdits(sources,{edits:[{path:'.github/workflows/unsafe.yml',before,after:'no'}]}),/PROTECTED_PATH/);
assert.throws(()=>applyEdits(sources,{edits:[{path,before:'a nonexistent source anchor',after:'no'}]}),/NONUNIQUE_OR_STALE_ANCHOR/);
assert.throws(()=>applyEdits({[path]:before+'\n'+before},{edits:[{path,before,after:'no'}]}),/NONUNIQUE_OR_STALE_ANCHOR/);
assert.throws(()=>applyEdits(sources,{edits:[]}),/INVALID_EDIT_COUNT/);
const text='未知の効果をテストする。',html='<html>official fixture</html>',id='12345',url='https://www.pokemon-card.com/card-search/details.php/card/'+id;
const hash=crypto.createHash('sha256').update(html).digest('hex');
const row={officialCardId:id,officialPageUrl:url,source:{path:'data/effect-extensions/evidence/'+id+'.json',sha256:hash}};
const group={effectKind:'attack',exampleOfficialText:text,printedDamage:'0',energyCost:[],officialCardIds:[id]};
const raw=new Map([[id,row]]),proof=()=>({html,htmlSha256:hash,url}),compile=()=>({records:[{attacks:[{text,damage:'0',cost:[],plan:null}]}]});
assert.deepEqual(exactGroup(group,raw,new Set(),proof,compile),[row]);
assert.deepEqual(exactGroup(group,raw,new Set([id]),proof,compile),[]);
assert.deepEqual(exactGroup({...group,exampleOfficialText:'違う効果。'},raw,new Set(),proof,compile),[]);
assert.throws(()=>exactGroup(group,raw,new Set(),()=>({...proof(),html:'modified'}),compile));
// Exact failure modes from quarantine run 45972683023.
const arrayRow=" ['BENCH_NON_RULE_PROTECTION','official text',['PREVENT_DAMAGE']],";
assert.throws(()=>applyEdits({[path]:arrayRow},{edits:[{path,before:arrayRow,after:'[F0_31] '+arrayRow}]}),/MODEL_ANCHOR_LABEL_LEAK/);
assert.throws(()=>applyEdits({[path]:arrayRow},{edits:[{path,before:arrayRow,after:arrayRow.slice(0,-1)}]}),/MODEL_ARRAY_SEPARATOR_LOST/);
const nextRow=" ['NEXT_MECHANIC','another official text',['DAMAGE']],";
assert.equal(applyEdits({[path]:arrayRow},{edits:[{path,before:arrayRow,after:arrayRow+'\n'+nextRow}]})[path],arrayRow+'\n'+nextRow);
assert.equal(repairProfile('MODEL_ANCHOR_LABEL_LEAK',2).type,'ANCHOR');
assert.equal(repairProfile('MODEL_ARRAY_SEPARATOR_LOST',2).type,'SYNTAX');
console.log('LOCAL_UNKNOWN_GENERATOR_CONTRACT PASS');

// Batch related exact texts without losing distinct print IDs or confusing effect kinds.
const candidate=(id,text,ids,kind='attack')=>({group:{sharedTaskId:id,exampleOfficialText:text,category:'pokemon',effectKind:kind},records:ids.map(officialCardId=>({officialCardId}))});
const a=candidate('a','相手の手札をトラッシュし、山札を引く。',['1','2','3']);
const b=candidate('b','自分の手札をトラッシュし、山札を引く。',['3','4']);
const c=candidate('c','ダメカンをのせる。',['5']);
const d=candidate('d','手札をトラッシュし、山札を引く。',['6'],'ability');
assert.deepEqual(selectBatch([c,b,a,d],1).map(x=>x.group.sharedTaskId),['a','b']);
assert.deepEqual(selectBatch([c,b,a,d],1,{maxGroups:1}).map(x=>x.group.sharedTaskId),['a']);
assert.deepEqual(selectBatch([c,b,a,d],1,{maxPrints:3}).map(x=>x.group.sharedTaskId),['a']);
assert.equal(selectBatch([c,b,a,d],2)[0].group.sharedTaskId,'a');
assert.deepEqual(selectBatch([],1),[]);
assert.throws(()=>selectBatch([a],0),/INVALID_RUN_NUMBER/);
console.log('LOCAL_UNKNOWN_GENERATOR_BATCH PASS');

const mkId=n=>'OFFICIAL_SHARED_MECHANIC_'+String(n).padStart(20,'0');
const aa=candidate(mkId(1),'相手の手札をトラッシュし、山札を引く。',['1','2','3']);
const bb=candidate(mkId(2),'自分の手札をトラッシュし、山札を引く。',['3','4']);
const cc=candidate(mkId(3),'ダメカンをのせる。',['5']);
const fp='a'.repeat(64),fp2='b'.repeat(64);
let hist=recordHistory(null,[aa.group,bb.group],'QUARANTINE_FAILED',1,fp,'engine failed');
assert.equal(hist.groups[mkId(1)].attempts,1);
assert.equal(hist.groups[mkId(1)].feedback,'engine failed');
assert.equal(selectBatch([aa,bb,cc],2,{history:hist,fingerprint:fp})[0].group.sharedTaskId,mkId(3));
assert.equal(selectBatch([aa,bb,cc],2,{history:hist,fingerprint:fp2})[0].group.sharedTaskId,mkId(3));
assert.equal(hist.groups[mkId(1)].totalAttempts,1);
hist=recordHistory(hist,[aa.group],'NO_VALID_MODEL_PATCH',1,fp,'retry');
assert.equal(hist.groups[mkId(1)].attempts,1);
hist=recordHistory(hist,[aa.group],'QUARANTINE_FAILED',3,fp,'new run');
assert.equal(hist.groups[mkId(1)].attempts,2);
hist=recordHistory(hist,[aa.group],'GENERATED_NOT_TESTED',4,fp2,'new source');
assert.equal(hist.groups[mkId(1)].attempts,1);
assert.equal(hist.groups[mkId(1)].totalAttempts,3);
assert.equal(selectBatch([aa,bb,cc],5,{history:hist,fingerprint:'c'.repeat(64)})[0].group.sharedTaskId,mkId(3));
// Old schema records are safely migrated without losing their attempt counts.
assert.equal(normalizeHistory({schemaVersion:1,groups:{[mkId(1)]:{attempts:4,lastRun:8,status:'QUARANTINE_FAILED',fingerprint:fp}}}).groups[mkId(1)].totalAttempts,4);
assert.deepEqual(normalizeHistory({schemaVersion:1,groups:{'../../bad':{attempts:1,lastRun:2}}}).groups,{});
assert.deepEqual(selectBatch([aa],1,{maxPrints:2})[0].records.map(r=>r.officialCardId),['1','2']);
assert.throws(()=>selectBatch([aa],1,{maxPrints:0}),/INVALID_PRINT_BUDGET/);
const largeGroup=candidate(mkId(4),'山札からカードを引く。',Array.from({length:70},(_,i)=>String(i+100)));
const largeBatch=selectBatch([largeGroup],1);
assert.equal(largeBatch[0].records.length,64);
assert.equal(largeGroup.records.length,70);
assert.deepEqual(selectBatch([{...largeGroup,records:largeGroup.records.slice(64)}],2)[0].records.map(r=>r.officialCardId),['164','165','166','167','168','169']);
assert.equal(sourceFingerprint({'engine/reference-effect-plans.cjs':'a','engine/pokeca_reference_effect_runtime.cjs':'b','scripts/lib/shared-effect-engine-worker.cjs':'c'}).length,64);
console.log('LOCAL_UNKNOWN_GENERATOR_HISTORY PASS');

// Test the same HTTP transport with a real delayed loopback response and
// independently verify a bounded deadline for a nonresponding model server.
async function transportTest(){
 const http=require('node:http');
 const server=http.createServer((req,res)=>{
  let body='';req.on('data',chunk=>body+=chunk);
  req.on('end',()=>{
   const input=JSON.parse(body);
   if(input.mode==='hang')return;
   setTimeout(()=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'ok'}}]}));},60);
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const port=server.address().port;
  const result=await localCompletion({mode:'delayed'},{port,timeoutMs:1000});
  assert.equal(result.choices[0].message.content,'ok');
  await assert.rejects(localCompletion({mode:'hang'},{port,timeoutMs:30}),/LOCAL_MODEL_DEADLINE/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 console.log('LOCAL_UNKNOWN_GENERATOR_HTTP PASS');
}
transportTest().catch(e=>{console.error(e);process.exitCode=1;});

// The model actually returned fenced JSON in run 45825665165.
const modelProposal={edits:[{path,before,after:before+'\nconst newEffect = true;'}]};
const json=JSON.stringify(modelProposal);
const fence='```';
assert.deepEqual(parseModelProposal(json,'stop'),modelProposal);
assert.deepEqual(parseModelProposal(fence+'json\n'+json+'\n'+fence,'stop'),modelProposal);
assert.deepEqual(parseModelProposal(fence+'\r\n'+json+'\r\n'+fence,'stop'),modelProposal);
assert.throws(()=>parseModelProposal(json,'length'),/MODEL_OUTPUT_TRUNCATED/);
assert.throws(()=>parseModelProposal('explanation\n'+fence+'json\n'+json+'\n'+fence,'stop'));
assert.throws(()=>parseModelProposal(fence+'json\n'+json+'\n'+fence+'\n'+fence+'json\n'+json+'\n'+fence,'stop'));
assert.throws(()=>parseModelProposal('[]','stop'),/MODEL_PROPOSAL_SCHEMA/);
assert.throws(()=>applyEdits(sources,parseModelProposal('{"edits":[]}','stop')),/INVALID_EDIT_COUNT/);
assert.throws(()=>applyEdits(sources,parseModelProposal(JSON.stringify({edits:[{path:'.github/workflows/unsafe.yml',before,after:'no'}]}),'stop')),/PROTECTED_PATH/);
console.log('LOCAL_UNKNOWN_GENERATOR_RESPONSE_FORMAT PASS');

// Use the exact errors observed in run 45825665165 and verify the next repair differs.
const timeoutRepair=repairProfile('Error: LOCAL_MODEL_TRANSPORT:LOCAL_MODEL_DEADLINE',2);
assert.equal(timeoutRepair.type,'TRANSPORT');assert.equal(timeoutRepair.groups,1);assert(timeoutRepair.maxTokens<repairProfile().maxTokens);
assert.equal(repairProfile('SyntaxError: Unexpected token backtick',2).type,'FORMAT');
assert.equal(repairProfile('MODEL_OUTPUT_TRUNCATED',2).type,'TRUNCATED');
assert.equal(repairProfile('NONUNIQUE_OR_STALE_ANCHOR',2).type,'ANCHOR');
assert.equal(repairProfile('PROTECTED_PATH',2).type,'PROTECTED');
assert.equal(repairProfile('AssertionError: expected battle state',2).type,'ENGINE');
assert.equal(repairProfile('').type,'INITIAL');
console.log('LOCAL_UNKNOWN_ADAPTIVE_REPAIR PASS');

// Synthetic excerpt labels were selected by all four model replies in run 45847577140.
const realLine=' const deckEnergyCount = player.deck.length;';
const fixtureSource={ [path]:['function plan(text){',realLine,' const repeatedEnergyCount = player.deck.length;',' const repeatedEnergyCount = player.deck.length;','}'].join('\n') };
const anchorMap=modelAnchors(fixtureSource,{exampleOfficialText:'山札のエネルギー'},4500);
const selectedAnchor=[...anchorMap].find(([,e])=>e.before===realLine);
assert(selectedAnchor,'REAL_SOURCE_ANCHOR_REQUIRED');
assert(![...anchorMap.values()].some(e=>e.before.includes('source lines')||e.before.includes('repeatedEnergyCount')));
const resolved=resolveAnchorProposal({edits:[{anchor:selectedAnchor[0],after:realLine+'\n const newVerifiedCount = deckEnergyCount;'}]},anchorMap);
assert(applyEdits(fixtureSource,resolved)[path].includes('newVerifiedCount'));
assert.throws(()=>resolveAnchorProposal({edits:[{anchor:'// source lines 216-231',after:'fake'}]},anchorMap),/NONUNIQUE_OR_STALE_ANCHOR/);
assert.throws(()=>resolveAnchorProposal({edits:[{anchor:selectedAnchor[0],path:'.github/workflows/unsafe.yml',after:'fake'}]},anchorMap),/PROTECTED_PATH/);
assert.throws(()=>resolveAnchorProposal({edits:[{anchor:selectedAnchor[0],before:'different',after:'fake'}]},anchorMap),/NONUNIQUE_OR_STALE_ANCHOR/);
const {annotatedModelContext}=require('../scripts/local-unknown-effect-generator.cjs');
const context=annotatedModelContext(fixtureSource,{exampleOfficialText:'山札のエネルギー'},4500,anchorMap);
assert(context.includes('['+selectedAnchor[0]+'] '+realLine));
assert.equal(context.split(realLine).length-1,1);
assert.equal(context.split('['+selectedAnchor[0]+']').length-1,1);
assert.throws(()=>annotatedModelContext(fixtureSource,{exampleOfficialText:'山札のエネルギー'},1,anchorMap),/MODEL_CONTEXT_ANCHOR_MISSING/);
assert(repairProfile('LOCAL_MODEL_DEADLINE',2).excerptChars<repairProfile().excerptChars);
console.log('LOCAL_UNKNOWN_COMPACT_CONTEXT PASS');
console.log('LOCAL_UNKNOWN_EXACT_ANCHOR_IDS PASS');

// Exact receipt failure selects the component requiring repair, not a generic retry.
assert.equal(repairProfile('QUARANTINE_RECEIPT_FEEDBACK {"state":"NO_SELECTED_PRINT_QUALIFIED","targetFailures":[{"reason":"TARGET_NOT_COMPILED"}]}',2).type,'COMPILE');
assert.equal(repairProfile('QUARANTINE_RECEIPT_FEEDBACK {"state":"NO_SELECTED_PRINT_QUALIFIED","targetFailures":[{"reason":"ENGINE_EXECUTION_FAILED"}]}',2).type,'EXECUTION');
assert.equal(repairProfile('QUARANTINE_RECEIPT_FEEDBACK {"state":"PRIOR_RECORD_CHANGED"}',2).type,'INTEGRITY');
assert.equal(repairProfile('NO_SELECTED_PRINT_QUALIFIED NO_LEGAL_VERIFICATION_FIXTURE',2).type,'FIXTURE');
assert.equal(repairProfile('TARGET_NOT_COMPILED NO_LEGAL_VERIFICATION_FIXTURE',2).type,'COMPILE');
const {excerpts}=require('../scripts/local-unknown-effect-generator.cjs');
const longSource=['function plan(text){',...Array.from({length:200},(_,i)=>' const unrelatedValue'+i+' = '+i+';'),' const targetEnergyCounter = deck.energy.length;','}'].join('\n');
const relevant=excerpts(longSource,{exampleOfficialText:'山札のエネルギー'},path,250);
assert(relevant.includes(' const targetEnergyCounter = deck.energy.length;'),'LATE_RELEVANT_SOURCE_MUST_SURVIVE');
assert(!relevant.includes('unrelatedValue0')||relevant.includes('targetEnergyCounter'));
const relevantAnchors=modelAnchors({[path]:longSource},{exampleOfficialText:'山札のエネルギー'},250);
assert([...relevantAnchors.values()].some(x=>x.before===' const targetEnergyCounter = deck.energy.length;'));
assert(annotatedModelContext({[path]:longSource},{exampleOfficialText:'山札のエネルギー'},250,relevantAnchors).includes('targetEnergyCounter'));
console.log('LOCAL_UNKNOWN_RECEIPT_REPAIR_ROUTING PASS');

// Compact repair may expose one group only: never adopt or count the other groups.
const {retryBatch,attemptScope}=require('../scripts/local-unknown-effect-generator.cjs');
const fullScope=attemptScope([aa,bb,cc],{groups:2});
assert.deepEqual(fullScope.groups.map(x=>x.sharedTaskId),[mkId(1),mkId(2)]);
assert.deepEqual(fullScope.records.map(x=>String(x.officialCardId)),['1','2','3','4']);
const narrowScope=attemptScope([aa,bb,cc],{groups:1});
assert.deepEqual(narrowScope.records.map(x=>String(x.officialCardId)),['1','2','3']);
const prevScope={fingerprint:fp,groups:fullScope.groups,targetIds:fullScope.records.map(x=>String(x.officialCardId))};
assert.deepEqual(retryBatch([cc,bb,aa],prevScope,fp).map(x=>x.group.sharedTaskId),[mkId(1),mkId(2)]);
assert.deepEqual(retryBatch([cc,bb,aa],prevScope,fp2),[]);
assert.deepEqual(retryBatch([cc],prevScope,fp),[]);
assert.deepEqual(retryBatch([aa,bb],{...prevScope,targetIds:['1','2','3']},fp).map(x=>x.group.sharedTaskId),[mkId(1)]);
const largeScope=attemptScope(largeBatch,{groups:1});
const largePrev={fingerprint:fp,groups:largeScope.groups,targetIds:largeScope.records.map(r=>String(r.officialCardId))};
assert.equal(retryBatch([largeGroup],largePrev,fp)[0].records.length,64);
assert.deepEqual(retryBatch([largeGroup],{...largePrev,targetIds:largePrev.targetIds.slice(1)},fp),[]);
console.log('LOCAL_UNKNOWN_LARGE_GROUP_BOUNDARY PASS');
console.log('LOCAL_UNKNOWN_EXACT_RETRY_SCOPE PASS');

// Run the production repair loop against a controlled first-invalid, then
// corrected proposal. Parsing is not execution; this proves orchestration only.
const {focusFailedBatch,validateCandidateSyntax,generateWithRepair}=require('../scripts/local-unknown-effect-generator.cjs');
assert.deepEqual(focusFailedBatch([aa,bb],{targetFailures:[{id:'4'}]}).map(x=>x.group.sharedTaskId),[mkId(2),mkId(1)]);
assert.deepEqual(focusFailedBatch([aa,bb],{targetFailures:[{id:'999'}]}),[aa,bb]);
assert.throws(()=>validateCandidateSyntax(sources,{[path]:before+'\nconst broken = ;'}),/CANDIDATE_JS_SYNTAX/);
assert.equal(repairProfile('CANDIDATE_JS_SYNTAX:engine/example.cjs:Unexpected token',2).type,'SYNTAX');
async function repairLoopTest(){
 const calls=[],rejections=[];
 const result=await generateWithRepair([aa,bb],sources,{
  propose:async(groups,src,feedback,profile,previousPatch)=>{
   calls.push({groups:groups.map(g=>g.sharedTaskId),type:profile.type,feedback,previousPatch});
   return {edits:[{path,before,after:before+(calls.length===1?'\nconst broken = ;':'\nconst repaired = true;')}]};
  },onReject:(n,reason)=>rejections.push([n,reason])});
 assert.equal(calls.length,2);assert.equal(rejections.length,1);
 assert.equal(calls[1].type,'SYNTAX');assert(calls[1].feedback.includes('CANDIDATE_JS_SYNTAX'));
 assert(calls[1].previousPatch.includes('broken'));assert.deepEqual(calls[1].groups,[mkId(1)]);
 assert.equal(result.changed[path],before+'\nconst repaired = true;');assert.equal(sources[path],before);
 const failed=await generateWithRepair([aa],sources,{propose:async()=>({edits:[]})});
 assert.equal(failed.changed,undefined);assert(failed.feedback.includes('INVALID_EDIT_COUNT'));
 console.log('LOCAL_UNKNOWN_PRODUCTION_REPAIR_LOOP PASS');
}
repairLoopTest().catch(e=>{console.error(e);process.exitCode=1;});

// Actual quarantine run 45989556763: ability generation edited attack-only acceleration.
{
 const gen=require('../scripts/local-unknown-effect-generator.cjs');
 const file='engine/reference-effect-plans.cjs';
 const source=['function additionalAttackPlan(entry,text){',' const wrong= text.match(/山札からエネルギーをベンチにつける/);',' return wrong;','}','function plan(entry,kind){',' const right= text.match(/山札からエネルギーをベンチにつける/);',' return right;','}'].join('\n');
 const group={effectKind:'ability',exampleOfficialText:'山札からエネルギーをベンチにつける'};
 const ability=gen.modelAnchors({[file]:source},group,4000);
 const attack=gen.modelAnchors({[file]:source},{...group,effectKind:'attack'},4000);
 assert(![...ability.values()].some(x=>x.before.includes('const wrong=')));
 assert([...ability.values()].some(x=>x.before.includes('const right=')));
 assert([...attack.values()].some(x=>x.before.includes('const wrong=')));
 assert.equal(gen.repairProfile('JSON.stringify(...) Error: EXTENSION_IMMUTABLE_SOURCE_CONFLICT:45496:compiled facts differ').type,'INTEGRITY');
}

// Unknown compiler rules must be additive, and the safe insertion anchor must
// survive an excerpt dominated by unrelated keyword matches.
{
 const compiler='engine/reference-effect-plans.cjs';
 const oldLine=' const previousEnergyRule = /山札からエネルギーを選ぶ/;';
 assert.throws(()=>applyEdits({[compiler]:oldLine},{edits:[{path:compiler,before:oldLine,after:' const previousEnergyRule = /別の文法/;'}]}),/MODEL_COMPILER_ANCHOR_REMOVED/);
 assert.equal(applyEdits({[compiler]:oldLine},{edits:[{path:compiler,before:oldLine,after:' const newRule = /新しい効果/;\n'+oldLine}]} )[compiler],' const newRule = /新しい効果/;\n'+oldLine);
 const insertion=" const additional=kind==='ATTACK'?additionalAttackPlan(entry,generic):null;";
 const src=Array.from({length:80},(_,i)=>' const energyRule'+i+' = /山札 エネルギー/;').join('\n')+'\n'+insertion;
 const anchors=modelAnchors({[compiler]:src},{effectKind:'ability',exampleOfficialText:'山札からエネルギーを選ぶ'},1200);
 assert([...anchors.values()].some(x=>x.before===insertion));
 assert.equal(repairProfile('MODEL_COMPILER_ANCHOR_REMOVED').type,'INTEGRITY');
}

// Real run 45993305278 lost a RECON row while attempting a new ability.
{
 const compiler='engine/reference-effect-plans.cjs';
 const original=" ['RECON','自分の番に1回使える。自分の山札を上から2枚見て、どちらか1枚を選び、手札に加える。残りのカードは、山札の下にもどす。',['SEARCH_DECK','ADD_TO_HAND','RETURN_TO_DECK']],";
 const next=" ['FIXTURE_ONLY','new rule',['ADD_STATE']],";
 const anchors=new Map([['F0_12',{path:compiler,before:original}]]);
 for(const [op,expected] of [['insertBefore',next+'\n'+original],['insertAfter',original+'\n'+next]]){
  const result=resolveAnchorProposal({edits:[{anchor:'F0_12',[op]:next}]},anchors);
  assert.equal(applyEdits({[compiler]:original},result)[compiler],expected);
 }
 assert.throws(()=>resolveAnchorProposal({edits:[{anchor:'F0_99',insertBefore:next}]},anchors),/NONUNIQUE_OR_STALE_ANCHOR:F0_99/);
 assert.throws(()=>resolveAnchorProposal({edits:[{anchor:'F0_12',insertBefore:next,after:original}]},anchors),/MODEL_EDIT_OPERATION_REQUIRED/);
 assert.throws(()=>resolveAnchorProposal({edits:[{anchor:'F0_12',insertBefore:original}]},anchors),/MODEL_DUPLICATE_INSERTION_ANCHOR/);
}

// Actual rejected Palafin ex ability must include the explicitly named
// transform ability even when a compact repair would otherwise select one.
{
 const restriction='このカードは、「イルカマン」の特性「マイティチェンジ」の効果によってしか場に出せない。';
 const transform='自分の番に、このポケモンがバトル場からベンチにもどったとき、1回使える。自分の山札から「イルカマンex」を1枚選び、このカードと入れ替える（ついているカード・ダメカン・特殊状態・効果などは、すべて引きつぐ）。入れ替えたなら、このカードは山札にもどす。そして山札を切る。';
 const a={group:{sharedTaskId:mkId(301),effectKind:'ability',category:'pokemon',exampleOfficialText:restriction},records:[{officialCardId:'45727',name:'イルカマンex'}]};
 const b={group:{sharedTaskId:mkId(302),effectKind:'ability',category:'pokemon',exampleOfficialText:transform},records:[{officialCardId:'45726',name:'イルカマン',abilities:[{name:'マイティチェンジ',text:transform}]}]};
 const batch=selectBatch([a,b],1);
 assert.equal(batch.length,2);
 const scope=attemptScope(batch,{groups:1});
 assert.equal(scope.groups.length,2);
 assert.deepEqual(scope.requiredTogether.sort(),['45726','45727']);
 const prev={groups:scope.groups,targetIds:['45726','45727'],fingerprint:fp};
 assert.equal(retryBatch([a,b],prev,fp).length,2);
 assert.deepEqual(retryBatch([a,b],{...prev,targetIds:['45727']},fp),[]);
 assert.deepEqual(selectBatch([a,b],1,{maxPrints:1}),[]);
}
