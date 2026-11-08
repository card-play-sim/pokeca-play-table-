#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {collect,atomic,hash,parseDetail}=require('./collect-official-image-evidence.cjs');
const rules=require('../ui/official-image-validation.js');
const {importEvidence}=require('./import-verified-image-evidence.cjs');
const root=path.resolve(__dirname,'..'),state=path.join(root,'data/image-automation');
async function run(){
 fs.mkdirSync(state,{recursive:true});
 const protectedFiles=['data/fixed-test-decks.json','ui/engine.bundle.js','ui/session-storage.js'];
 // Protect any actually present original files, independently of their count.
 for(const file of fs.readdirSync(path.join(root,'data')))if(/FORMAL_BASELINE|card_catalog|image_registry\.json/.test(file))protectedFiles.push('data/'+file);
 const before=Object.fromEntries(protectedFiles.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
 const registryFile=path.join(root,'data/official-image-registry.json');
 const registry=JSON.parse(fs.readFileSync(registryFile));
 const decks=JSON.parse(fs.readFileSync(path.join(root,'data/fixed-test-decks.json')));
 const candidates=JSON.parse(fs.readFileSync(path.join(root,'data/fixed-deck-official-image-candidates.json'))).candidates;
 const report={runId:process.env.GITHUB_RUN_ID||null,checkedAt:new Date().toISOString(),productionPass:false,requestsAttempted:0,officialPagesVerified:0,imageReferencesAdded:0,deckPrintsAdopted:0,protectedSha256:before};
 try{
  const collected=await collect(candidates,fetch,{state:path.join(state,'records')});
  report.requestsAttempted=collected.requestsAttempted;report.officialPagesVerified=collected.cards.length;report.holds=collected.holds;
  atomic(path.join(state,'collection.json'),collected);
  // Register independently compared print references only, never deck identities.
  // The importer remains the existing implementation; candidate reviewStatus is
  // preserved in the checkpoint, not turned into an APPROVED formal card.
  const verifiedBatch=[];
  for(const record of collected.cards){
   const candidate=candidates.find(c=>String(c.officialCardId)===record.officialCardId);
   if(!candidate?.set||!candidate?.cardNumber||!record.printExpected)continue;
   const checkpoint=JSON.parse(fs.readFileSync(path.join(state,'records',record.officialCardId+'.json')));
   const verified=parseDetail(checkpoint.html,record.officialCardId,record.name,candidate);
   if(verified.status!=='CANDIDATE'||!rules.matches(verified,record)||hash(checkpoint.html)!==record.detailSha256)throw Error('OFFICIAL_REPLAY_MISMATCH');
   verifiedBatch.push({...record,verified:true,verificationStatus:'OFFICIAL_ID_NAME_PRINT_MATCH',deckPrintAdopted:false});
  }
  // The shared importer validates every print and all evidence before one atomic write.
  const imported=importEvidence({cards:verifiedBatch},registry,decks);
  atomic(registryFile,imported.registry);
  registry.cards=imported.registry.cards;
  report.imageReferencesAdded=imported.added;
  report.coverage=require('./check-fixed-120-images.cjs').audit(decks,registry);
  report.referenceCoverageReady=report.coverage.registryCoveragePass&&collected.holds.length===0;
  // Only the separate real-browser measurement can establish image-display PASS.
  report.productionPass=false;
 }catch(error){report.error=String(error.message);}
 finally{
  report.protectedUnchanged=Object.entries(before).every(([f,sha])=>hash(fs.readFileSync(path.join(root,f)))===sha);
  if(!report.protectedUnchanged)report.productionPass=false;
  atomic(path.join(state,'latest.json'),report);
 }
 console.log(JSON.stringify(report,null,2));
 if(!report.productionPass)process.exitCode=2;
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
