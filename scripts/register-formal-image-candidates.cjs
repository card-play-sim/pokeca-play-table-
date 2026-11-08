#!/usr/bin/env node
'use strict';
// Reuse the evidence-only importer, preserving the snapshot's pending adoption/rights flags.
const fs=require('node:fs'),path=require('node:path');
const {importEvidence}=require('./import-verified-image-evidence.cjs');
const {atomic,hash,replay}=require('./collect-official-image-evidence.cjs');
const rules=require('../ui/official-image-validation.js');
const {preserved,protectionSnapshot}=require('./automate-official-images.cjs');
function registerUnlocked({root=path.resolve(__dirname,'..'),evidenceFile='data/formal-1945-reconciliation/candidate-evidence.json'}={}){
 const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 const file='data/official-image-registry.json',before=read(file),decks=read('data/fixed-test-decks.json'),evidence=read(evidenceFile);
 const protectedBefore=protectionSnapshot(root);let registry=before,expected=hash(fs.readFileSync(path.join(root,file))),added=0;
 const results=[];
 for(const candidate of evidence.cards){
  if(JSON.stringify(protectionSnapshot(root))!==JSON.stringify(protectedBefore))throw Error('FORMAL_PROTECTED_CHANGE');
  if(candidate.deckPrintAdopted!==false)throw Error('DECK_ADOPTION_NOT_ALLOWED');
  if(candidate.formalSource){
   if(!['zipSha256','catalogSha256','registrySha256','sourceRecordSha256'].every(k=>/^[a-f0-9]{64}$/.test(candidate.formalSource[k]||'')))throw Error('FORMAL_SOURCE_REQUIRED');
  }else{
   const proof=candidate.officialDetailEvidence;
   if(!proof||!/^data\/formal-1945-reconciliation\/(?:additional-details|numbered-energy-details)\/\d+\.json$/.test(proof.path))throw Error('OFFICIAL_DETAIL_EVIDENCE_REQUIRED');
   const raw=fs.readFileSync(path.join(root,proof.path));
   if(hash(raw)!==proof.checkpointSha256)throw Error('OFFICIAL_DETAIL_CHECKPOINT_CHANGED');
   const saved=JSON.parse(raw);replay(saved,saved.candidate);
   if(saved.result.status!=='CANDIDATE'||!rules.matches(saved.record,candidate))throw Error('OFFICIAL_DETAIL_PRINT_MISMATCH');
  }
  const old=registry.cards.find(c=>String(c.officialCardId)===String(candidate.officialCardId));
  const value={...candidate,officialPageUrl:old?.officialPageUrl??candidate.officialPageUrl};
  const result=importEvidence({cards:[value]},registry,decks);
  if(hash(fs.readFileSync(path.join(root,file)))!==expected)throw Error('REGISTRY_CONCURRENT_CHANGE');
  if(JSON.stringify(result.registry)!==JSON.stringify(registry))atomic(path.join(root,file),result.registry);
  const reloaded=read(file);if(JSON.stringify(reloaded)!==JSON.stringify(result.registry))throw Error('FORMAL_REGISTRY_READBACK');
  for(const original of before.cards)if(!preserved(original,reloaded.cards.find(c=>c.officialCardId===original.officialCardId)))throw Error('ORIGINAL_EVIDENCE_LOST');
  registry=reloaded;expected=hash(fs.readFileSync(path.join(root,file)));added+=result.added;
  const record=registry.cards.find(c=>c.officialCardId===value.officialCardId);
  const receipt={officialCardId:value.officialCardId,zipSha256:value.formalSource?.zipSha256??null,checkpointSha256:value.officialDetailEvidence?.checkpointSha256??null,recordSha256:hash(JSON.stringify(record)),status:'REFERENCE_REGISTERED_READBACK_VERIFIED',deckPrintAdopted:false,productionPass:false};
  atomic(path.join(root,'data/image-automation/formal-1945-receipts',value.officialCardId+'.json'),receipt);
  results.push(receipt);
 }
 if(JSON.stringify(protectionSnapshot(root))!==JSON.stringify(protectedBefore))throw Error('FORMAL_PROTECTED_CHANGE');
 return {candidatePrints:results.length,added,totalRegistryPrints:registry.cards.length,originalRecordsPreserved:true,protectedFilesUnchanged:true,deckPrintsAdopted:0,productionPass:false,results};
}
function register(options={}){
 const root=options.root||path.resolve(__dirname,'..'),state=path.join(root,'data/image-automation'),lock=path.join(state,'.lock');
 fs.mkdirSync(state,{recursive:true});
 try{fs.mkdirSync(lock);}catch(error){if(error.code==='EEXIST')throw Error('AUTOMATION_LOCKED');throw error;}
 try{return registerUnlocked({...options,root});}finally{fs.rmdirSync(lock);}
}
if(require.main===module){const evidenceFile=process.argv[2]||'data/formal-1945-reconciliation/candidate-evidence.json';const report=register({evidenceFile});atomic(path.join(__dirname,'../data/formal-1945-reconciliation/'+(process.argv[2]?'additional-registration.json':'registration.json')),report);console.log(JSON.stringify({...report,results:undefined}));}
module.exports={register};
