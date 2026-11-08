#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {collect,atomic,hash,pageURL}=require('./collect-official-image-evidence.cjs');
const rules=require('../ui/official-image-validation.js');
const defaultRoot=path.resolve(__dirname,'..');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function filesUnder(root,relative){
 const target=path.join(root,relative);
 if(!fs.existsSync(target))return [];
 if(!fs.statSync(target).isDirectory())return [relative];
 return fs.readdirSync(target).flatMap(name=>filesUnder(root,path.join(relative,name)));
}
function protectionSnapshot(root){
 const files=[...filesUnder(root,'data').filter(f=>f!=='data/official-image-registry.json'&&!f.startsWith('data/image-automation/')), ...filesUnder(root,'engine'),...['ui/engine.bundle.js','ui/session-storage.js'].filter(f=>fs.existsSync(path.join(root,f)))];
 return Object.fromEntries(files.sort().map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
}
function preserved(before,after){
 if(Array.isArray(before))return Array.isArray(after)&&JSON.stringify(before)===JSON.stringify(after);
 if(before&&typeof before==='object')return after&&typeof after==='object'&&Object.entries(before).every(([k,v])=>Object.hasOwn(after,k)&&preserved(v,after[k]));
 return before===after;
}
function candidatesFrom(root,sources){
 const rows=[];
 for(const source of sources){
  const data=read(path.join(root,source)),cards=data.candidates??data.cards;
  if(!Array.isArray(cards))throw Error('CANDIDATES_SCHEMA_'+source);
  rows.push(...cards);
 }
 const ids=new Map();
 for(const raw of rows){
  const c=rules.canonical(raw),id=c.officialCardId;
  if(!/^\d+$/.test(id||'')||typeof c.name!=='string'||!c.name.trim()||!c.set||!c.cardNumber)throw Error('EXPECTED_PRINT_REQUIRED_'+id);
  if(!(c.officialDetailsUrl||c.officialPageUrl||c.officialCardPageUrl))throw Error('OBSERVED_DETAIL_URL_REQUIRED_'+id);
  pageURL(c);
  if(ids.has(id)&&JSON.stringify(ids.get(id))!==JSON.stringify(c))throw Error('CANDIDATE_CONFLICT_'+id);
  ids.set(id,c);
 }
 return [...ids.values()];
}
async function run({root=defaultRoot,fetcher=fetch,batchSize=50,maxRequests=50,interval=3000,refresh=false,sources=['data/fixed-deck-official-image-candidates.json','data/official-image-candidates-reviewed.json'],write=atomic}={}){
 const state=path.join(root,'data/image-automation'),registryFile=path.join(root,'data/official-image-registry.json');
 fs.mkdirSync(state,{recursive:true});
 const lock=path.join(state,'.lock');
 try{fs.mkdirSync(lock);}catch(error){if(error.code==='EEXIST')throw Error('AUTOMATION_LOCKED');throw error;}
 const report={schemaVersion:2,runId:process.env.GITHUB_RUN_ID||null,checkedAt:new Date().toISOString(),registrationPass:false,productionPass:false,imageDisplayStatus:'NOT_VERIFIED',safeToPersist:false,refresh,requestsAttempted:0,officialPagesVerified:0,imageReferencesAdded:0,replayed:0,deckPrintsAdopted:0,holds:[],processed:[]};
 let baseline,before,registry,currentDigest;
 try{
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>500||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>1000)throw Error('AUTOMATION_LIMITS');
  before=protectionSnapshot(root);report.protectedSha256=before;
  baseline=read(registryFile);registry=baseline;let index=rules.index(registry.cards);
  currentDigest=hash(fs.readFileSync(registryFile));report.baselineRegistrySha256=currentDigest;
  const candidates=candidatesFrom(root,sources),planHash=hash(JSON.stringify(candidates));
  if(!candidates.length)throw Error('NO_CONFIRMED_CANDIDATES');
  report.sources=sources;report.planSha256=planHash;report.candidateCount=candidates.length;report.batchSize=batchSize;report.maxRequests=maxRequests;
  const progressFile=path.join(state,'progress.json'),previous=fs.existsSync(progressFile)?read(progressFile):null;
  let start=previous?.planSha256===planHash?previous.nextCursor:0;
  if(!Number.isInteger(start)||start<0||start>candidates.length)throw Error('PROGRESS_CORRUPT');
  if(start===candidates.length)start=0; // a completed plan can be safely verified again
  const selected=candidates.slice(start,start+batchSize),positions=new Map(selected.map((c,i)=>[c.officialCardId,start+i]));
  let next=start,blockedAt=null;
  report.startCursor=start;
  function saveProgress(position){
   next=blockedAt==null?position:Math.min(position,blockedAt);
   write(progressFile,{schemaVersion:1,planSha256:planHash,nextCursor:next,total:candidates.length});
  }
  const collected=await collect(selected,async(...args)=>{report.requestsAttempted++;return fetcher(...args);},{state:path.join(state,'records'),interval,maxNew:maxRequests,refresh,
   onHold:async hold=>{
    const position=positions.get(hold.officialCardId);
    blockedAt=blockedAt==null?position:Math.min(blockedAt,position);
    report.holds.push(hold);
    const quarantine={planSha256:planHash,candidate:selected.find(c=>c.officialCardId===hold.officialCardId),...hold};
    write(path.join(state,'quarantine',hold.officialCardId+'-'+hash(JSON.stringify(quarantine))+'.json'),quarantine);
    saveProgress(position);
   },
   onRecord:async(record,saved)=>{
    const id=String(record.officialCardId),candidate=selected.find(c=>c.officialCardId===id);
    if(!record.printExpected||!rules.matches(record,candidate)||record.detailSha256!==hash(saved.html))throw Error('OFFICIAL_REPLAY_MISMATCH_'+id);
    if(JSON.stringify(protectionSnapshot(root))!==JSON.stringify(before))throw Error('PROTECTED_FILE_CHANGED');
    const old=index.get(id);
    const value={officialCardId:id,name:record.name,set:record.set,cardNumber:record.cardNumber,imageSourceUrl:record.imageSourceUrl,
     officialPageUrl:old?.officialPageUrl??record.officialPageUrl,detailSha256:old?.detailSha256??record.detailSha256,
     verificationStatus:'OFFICIAL_ID_NAME_PRINT_MATCH',deckPrintAdopted:false};
    const merged=old?rules.merge(old,value):rules.validate(value);
    if(hash(fs.readFileSync(registryFile))!==currentDigest)throw Error('REGISTRY_CONCURRENT_CHANGE');
    const updated=new Map(index);updated.set(id,merged);
    const desired={...registry,cards:[...updated.values()]};
    if(JSON.stringify(desired)!==JSON.stringify(registry))write(registryFile,desired);
    const reloaded=read(registryFile),checked=rules.index(reloaded.cards);
    if(JSON.stringify(reloaded)!==JSON.stringify(desired)||!rules.matches(checked.get(id),record))throw Error('REGISTRY_READBACK_'+id);
    if(!baseline.cards.every(c=>preserved(c,checked.get(String(c.officialCardId)))))throw Error('EXISTING_EVIDENCE_LOST');
    registry=reloaded;index=checked;currentDigest=hash(fs.readFileSync(registryFile));
    const checkpoint=path.join(state,'records',id+'.json');
    const receipt={schemaVersion:1,officialCardId:id,planSha256:planHash,detailSha256:record.detailSha256,checkpointSha256:hash(fs.readFileSync(checkpoint)),recordSha256:hash(JSON.stringify(checked.get(id))),status:'REGISTERED_READBACK_VERIFIED',deckPrintAdopted:false};
    const receiptFile=path.join(state,'receipts',id+'.json');write(receiptFile,receipt);
    if(JSON.stringify(read(receiptFile))!==JSON.stringify(receipt))throw Error('RECEIPT_READBACK_'+id);
    report.processed.push({officialCardId:id,status:receipt.status,added:!old});
    report.officialPagesVerified++;if(!old)report.imageReferencesAdded++;
    // All checkpoint, registry, receipt and progress readbacks finish before collect requests the next page.
    saveProgress(positions.get(id)+1);
   }});
  report.replayed=collected.resumed;
  report.nextCursor=next;report.remaining=candidates.length-next;
  report.coverage=require('./check-fixed-120-images.cjs').audit(read(path.join(root,'data/fixed-test-decks.json')),registry);
  report.scopeReferencesMatched=candidates.filter(c=>rules.matches(index.get(c.officialCardId),c)).length;
  report.registrationPass=report.holds.length===0&&next===candidates.length&&report.scopeReferencesMatched===candidates.length;
  report.safeToPersist=true;
 }catch(error){report.error=String(error.message);report.registrationPass=false;report.safeToPersist=false;}
 finally{
  try{
   report.protectedUnchanged=!!before&&JSON.stringify(protectionSnapshot(root))===JSON.stringify(before);
   if(!report.protectedUnchanged){report.registrationPass=false;report.safeToPersist=false;}
   if(baseline){const finalIndex=rules.index(read(registryFile).cards);report.existingRecordsPreserved=baseline.cards.every(c=>preserved(c,finalIndex.get(String(c.officialCardId))));if(!report.existingRecordsPreserved){report.registrationPass=false;report.safeToPersist=false;}}
   report.status=report.registrationPass?'REFERENCES_REGISTERED':report.error?'ERROR':'BLOCKED';
   const auditFile=path.join(state,'runs',hash(JSON.stringify(report))+'.json');
   if(fs.existsSync(auditFile)){if(JSON.stringify(read(auditFile))!==JSON.stringify(report))throw Error('AUDIT_HISTORY_CONFLICT');}
   else write(auditFile,report);
   write(path.join(state,'latest.json'),report);
  }finally{fs.rmdirSync(lock);}
 }
 return report;
}
async function main(){
 const options={};
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){
  if(args[i]==='--refresh')options.refresh=true;
  else if(args[i]==='--batch-size')options.batchSize=Number(args[++i]);
  else if(args[i]==='--max-requests')options.maxRequests=Number(args[++i]);
  else if(args[i]==='--candidates')options.sources=[args[++i]];
  else throw Error('UNKNOWN_OPTION_'+args[i]);
 }
 const report=await run(options);console.log(JSON.stringify(report,null,2));
 if(!report.registrationPass)process.exitCode=2;
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={run,candidatesFrom,protectionSnapshot,preserved};
