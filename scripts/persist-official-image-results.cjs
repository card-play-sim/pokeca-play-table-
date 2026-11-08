#!/usr/bin/env node
'use strict';
// Called by Actions after regression tests, including on a BLOCKED collection.
// Safe checkpoints may be persisted, but a failed/incomplete collection stays failed.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {hash,replay}=require('./collect-official-image-evidence.cjs');
const {protectionSnapshot}=require('./automate-official-images.cjs');
const rules=require('../ui/official-image-validation.js');
const defaultBranch='feature/official-image-registry-automation';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const allowed=p=>p==='data/official-image-registry.json'||/^data\/image-automation\/(?:latest\.json|progress\.json|status\.md|(?:records|receipts)\/\d+\.json|records\/history\/\d+-[a-f0-9]{64}\.json|quarantine\/\d+-[a-f0-9]{64}\.json|runs\/[a-f0-9]{64}\.json)$/.test(p);
function summaryFor(report){
 return 'Official image reference registration: '+(report.registrationPass?'PASS':'BLOCKED')+'\n\n'+
  'Verified this batch: '+report.officialPagesVerified+'; new references: '+report.imageReferencesAdded+'; holds: '+report.holds.length+'\n\n'+
  'Progress: '+report.nextCursor+'/'+report.candidateCount+'; protected data: unchanged; existing evidence: preserved.\n\n'+
  'Fixed 120 official image display: NOT_VERIFIED. No deck print identities were adopted.\n';
}
function persist({root=path.resolve(__dirname,'..'),branch=defaultBranch,remote='origin',push=true}={}){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 if(git('branch','--show-current')!==branch)throw Error('PERSIST_WRONG_BRANCH');
 const state=path.join(root,'data/image-automation'),report=read(path.join(state,'latest.json'));
 if(process.env.GITHUB_RUN_ID&&report.runId!==process.env.GITHUB_RUN_ID)throw Error('PERSIST_STALE_RUN');
 if(report.schemaVersion!==2||report.safeToPersist!==true||report.protectedUnchanged!==true||report.existingRecordsPreserved!==true||report.error)throw Error('PERSIST_UNSAFE_REPORT');
 if(JSON.stringify(protectionSnapshot(root))!==JSON.stringify(report.protectedSha256))throw Error('PERSIST_PROTECTED_CHANGE');
 const index=rules.index(read(path.join(root,'data/official-image-registry.json')).cards);
 for(const item of report.processed){
  const id=item.officialCardId,receipt=read(path.join(state,'receipts',id+'.json')),checkpointFile=path.join(state,'records',id+'.json'),checkpoint=read(checkpointFile);
  replay(checkpoint,checkpoint.candidate);
  if(receipt.planSha256!==report.planSha256||receipt.checkpointSha256!==hash(fs.readFileSync(checkpointFile))||receipt.recordSha256!==hash(JSON.stringify(index.get(id)))||!rules.matches(index.get(id),checkpoint.record))throw Error('PERSIST_EVIDENCE_MISMATCH_'+id);
 }
 const changed=[...new Set([...git('diff','--name-only','HEAD').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean))];
 if(changed.some(p=>!allowed(p)))throw Error('PERSIST_UNEXPECTED_CHANGE');
 const summary=summaryFor(report);
 fs.writeFileSync(path.join(state,'status.md'),summary);
 git('add','--','data/official-image-registry.json','data/image-automation');
 if(!git('diff','--cached','--name-only'))return {committed:false,pushed:false,registrationPass:report.registrationPass};
 const staged=git('diff','--cached','--name-only').split('\n');
 if(staged.some(p=>!allowed(p)))throw Error('PERSIST_UNEXPECTED_STAGED_CHANGE');
 git('commit','-m','chore: persist verified image references ('+(report.registrationPass?'complete':'blocked')+') [skip ci]');
 const commit=git('rev-parse','HEAD');
 if(push)git('push',remote,'HEAD:refs/heads/'+branch); // fast-forward only; never overwrite a concurrent update
 return {committed:true,pushed:push,commit,registrationPass:report.registrationPass};
}
if(require.main===module){try{console.log(JSON.stringify(persist()));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={persist,allowed,summaryFor};
