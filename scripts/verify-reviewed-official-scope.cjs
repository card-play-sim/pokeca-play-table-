'use strict';
// Independent read-only check. Use trusted checkout compiler and the saved
// official checkpoint, not records or executable code from quarantine.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {exactGroup}=require('./local-unknown-effect-generator.cjs');
const {compile}=require('../engine/reference-effect-plans.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function checkedIds(xs){
 assert(Array.isArray(xs)&&xs.length>0&&xs.length<=64,'INVALID_TARGETS');
 const ids=xs.map(String);
 assert(ids.every(x=>/^[1-9][0-9]{0,7}$/.test(x))&&new Set(ids).size===ids.length,'INVALID_TARGET_IDS');
 return ids;
}
function verifyScope(selection,records,compiled,readProof,compileRecord=compile){
 const selected=checkedIds(selection.targetIds),wanted=new Set(selected),matched=new Set(),proofs=[];
 assert(Array.isArray(selection.groups)&&selection.groups.length>0&&selection.groups.length<=6,'INVALID_GROUP_COUNT');
 const rows=new Map();
 for(const row of records){
  const id=String(row.officialCardId);
  assert(!rows.has(id),'DUPLICATE_CHECKPOINT_ROW');
  rows.set(id,row);
 }
 const groupIds=new Set();
 for(const group of selection.groups){
  assert(/^OFFICIAL_SHARED_MECHANIC_[A-F0-9]{20}$/.test(group.sharedTaskId)&&!groupIds.has(group.sharedTaskId),'INVALID_GROUP_ID');
  groupIds.add(group.sharedTaskId);
  assert(Array.isArray(group.officialCardIds),'INVALID_GROUP_MEMBERS');
  const members=[...new Set(group.officialCardIds.map(String))].filter(id=>wanted.has(id));
  assert(members.length>0,'UNBOUND_GROUP');
  for(const id of members)assert(rows.get(id)?.category===group.category,'OFFICIAL_CATEGORY_MISMATCH:'+id);
  const accepted=exactGroup({...group,officialCardIds:members},rows,compiled,readProof,compileRecord);
  assert.deepEqual(accepted.map(r=>String(r.officialCardId)).sort(),members.sort(),'OFFICIAL_EFFECT_SCOPE_MISMATCH');
  for(const row of accepted){
   const id=String(row.officialCardId);
   matched.add(id);
   proofs.push({id,group:group.sharedTaskId,sourceSha256:row.source.sha256,effectTextSha256:sha(group.exampleOfficialText)});
  }
 }
 assert.deepEqual([...matched].sort(),selected.sort(),'UNBOUND_TARGET');
 return proofs;
}
function main(root,manifestPath,checkpoint){
 assert(/^[a-f0-9]{40}$/.test(checkpoint),'INVALID_CHECKPOINT');
 const manifest=read(manifestPath);
 assert(manifest.state==='REVIEW_REQUIRED_NOT_RELEASED','INVALID_HANDOFF');
 const show=(ref,path)=>JSON.parse(execFileSync('git',['show',ref+':'+path],{encoding:'utf8',maxBuffer:64*1024*1024}));
 const rows=show(checkpoint,'data/official-effect-intake/checkpoint.json').records;
 const compiled=new Set(show(manifest.baseCommit,'data/effect-extensions/compiled.json').records.map(r=>String(r.officialCardId)));
 const proofFor=p=>{assert(/^data\/effect-extensions\/evidence\/[1-9][0-9]{0,7}\.json$/.test(p),'INVALID_PROOF_PATH');return show(checkpoint,p);};
 for(const candidate of manifest.candidates){
  if(!candidate.reviewedReproduction)continue;
  assert(['attempt-1','attempt-2'].includes(candidate.attempt),'INVALID_ATTEMPT');
  const selection=read(require('node:path').join(root,candidate.attempt,'selected.json'));
  assert.deepEqual(checkedIds(selection.targetIds).sort(),checkedIds(candidate.selected).sort(),'HANDOFF_SELECTION_CHANGED');
  candidate.officialScope={state:'OFFICIAL_SOURCE_BOUND_REVIEW_REQUIRED',checkpoint,proofs:verifyScope(selection,rows,compiled,proofFor)};
 }
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
function selfTest(){
 const id='2',html='official',url='https://www.pokemon-card.com/card-search/details.php/card/'+id,path='data/effect-extensions/evidence/'+id+'.json';
 const row={officialCardId:id,category:'item',officialPageUrl:url,source:{path,sha256:sha(html)}},proof={url,html,htmlSha256:sha(html)};
 const group={sharedTaskId:'OFFICIAL_SHARED_MECHANIC_'+'A'.repeat(20),category:'item',effectKind:'item',officialCardIds:[id],exampleOfficialText:'公式効果'};
 const selection={targetIds:[id],groups:[group]},compiler=()=>({records:[{text:'公式効果',mainPlan:null}]});
 assert.equal(verifyScope(selection,[row],new Set(),()=>proof,compiler).length,1);
 for(const bad of [{...selection,groups:[{...group,exampleOfficialText:'偽効果'}]},{...selection,groups:[{...group,category:'supporter'}]},{...selection,targetIds:['3']}])
  assert.throws(()=>verifyScope(bad,[row],new Set(),()=>proof,compiler));
 assert.throws(()=>verifyScope(selection,[row],new Set([id]),()=>proof,compiler));
 assert.throws(()=>verifyScope(selection,[row],new Set(),()=>({...proof,html:'altered'}),compiler));
 console.log('REVIEWED_OFFICIAL_SCOPE_SELF_TEST PASS');
}
if(require.main===module){if(process.argv[2]==='--self-test')selfTest();else main(...process.argv.slice(2));}
module.exports={verifyScope};
