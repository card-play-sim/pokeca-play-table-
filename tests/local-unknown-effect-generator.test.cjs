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
assert.equal(selectBatch([aa,bb,cc],2,{history:hist,fingerprint:fp2})[0].group.sharedTaskId,mkId(1));
hist=recordHistory(hist,[aa.group],'NO_VALID_MODEL_PATCH',1,fp,'retry');
assert.equal(hist.groups[mkId(1)].attempts,1);
hist=recordHistory(hist,[aa.group],'QUARANTINE_FAILED',3,fp,'new run');
assert.equal(hist.groups[mkId(1)].attempts,2);
hist=recordHistory(hist,[aa.group],'GENERATED_NOT_TESTED',4,fp2,'new source');
assert.equal(hist.groups[mkId(1)].attempts,1);
assert.deepEqual(normalizeHistory({schemaVersion:1,groups:{'../../bad':{attempts:1,lastRun:2}}}).groups,{});
assert.deepEqual(selectBatch([aa],1,{maxPrints:2}),[]);
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
console.log('LOCAL_UNKNOWN_EXACT_ANCHOR_IDS PASS');

// Exact receipt failure selects the component requiring repair, not a generic retry.
assert.equal(repairProfile('QUARANTINE_RECEIPT_FEEDBACK {"state":"NO_SELECTED_PRINT_QUALIFIED","targetFailures":[{"reason":"TARGET_NOT_COMPILED"}]}',2).type,'COMPILE');
assert.equal(repairProfile('QUARANTINE_RECEIPT_FEEDBACK {"state":"NO_SELECTED_PRINT_QUALIFIED","targetFailures":[{"reason":"ENGINE_EXECUTION_FAILED"}]}',2).type,'EXECUTION');
assert.equal(repairProfile('QUARANTINE_RECEIPT_FEEDBACK {"state":"PRIOR_RECORD_CHANGED"}',2).type,'INTEGRITY');
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
