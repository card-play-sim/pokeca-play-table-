#!/usr/bin/env node
'use strict';
// Offline, evidence-only batch importer. Does not fetch/scrape, guess URLs, or edit the formal catalog.
// Usage: node scripts/import-verified-image-evidence.cjs evidence.json
// Evidence: {"cards":[{"officialCardId":"...","name":"...","imageSourceUrl":"...","officialPageUrl":"...","verified":true}]}
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const registryPath=path.join(root,'data/official-image-registry.json');
const deckPath=path.join(root,'data/fixed-test-decks.json');
const coveragePath=path.join(root,'data/fixed-120-image-coverage.json');
const rules=require('../ui/official-image-validation.js');
function fail(msg){throw Error(msg)}
function importEvidence(evidence,registry,decks){
  if(!Array.isArray(evidence.cards)||!Array.isArray(registry.cards)||!Array.isArray(decks.decks))fail('SCHEMA');
  const existing=rules.index(registry.cards);
  const deckNames=new Set(decks.decks.flatMap(d=>d.cards.map(c=>c.name)));
  let added=0;
  for(const raw of evidence.cards){
    const id=String(raw?.officialCardId??'');
    let c;
    try{c=rules.validate(raw);}catch(error){throw Error('UNVERIFIED_'+id+': '+error.message);}
    if(!deckNames.has(c.name)||c.verified!==true||(!c.officialPageUrl&&!c.officialCardPageUrl))fail('UNVERIFIED_'+id);
    const old=existing.get(id);
    existing.set(id,old?rules.merge(old,c):c);
    if(!old)added++;
  }
  const cards=[...existing.values()];
  cards.sort((a,b)=>Number(a.officialCardId)-Number(b.officialCardId));
  const byName=new Map();
  for(const c of cards){const a=byName.get(c.name)||[];a.push(c.officialCardId);byName.set(c.name,a)}
  const counts=new Map();
  for(const d of decks.decks)for(const c of d.cards)counts.set(c.name,(counts.get(c.name)||0)+c.count);
  const rows=[...counts].map(([name,count])=>{const ids=byName.get(name)||[];return {name,count,previewStatus:ids.length===0?'MISSING':ids.length===1?'UNIQUE_PREVIEW':'MULTIPLE_PRINTS',candidateOfficialCardIds:ids}});
  const coverage={schemaVersion:1,purpose:'image coverage inventory only; candidate IDs are not approved deck identities',source:['data/fixed-test-decks.json','data/official-image-registry.json'],totalPhysicalCards:[...counts.values()].reduce((a,b)=>a+b,0),uniqueCardNames:counts.size,uniquePreviewNames:rows.filter(x=>x.previewStatus==='UNIQUE_PREVIEW').length,ambiguousNames:rows.filter(x=>x.previewStatus==='MULTIPLE_PRINTS').length,missingNames:rows.filter(x=>x.previewStatus==='MISSING').length,officialPrintsApproved:0,cards:rows};
  return {registry:{...registry,cards},coverage,added};
}
// Only independently reviewed collector staging records may enter the registry.
function fromCollectorStaging(staging){
  if(!Array.isArray(staging.records))fail('COLLECTOR_STAGING_SCHEMA');
  return {cards:staging.records.map(record=>{
    const evidence=record.evidence||{};
    if(record.reviewStatus!=='APPROVED'||
       evidence.officialDetailVerified!==true||evidence.imageUrlVerified!==true||
       !/^[a-f0-9]{64}$/i.test(evidence.detailSha256||'')||
       !/^[a-f0-9]{64}$/i.test(evidence.imageReferenceSha256||''))
      fail('COLLECTOR_EVIDENCE_NOT_APPROVED_'+String(record.officialCardId||''));
    return {...record,officialCardId:record.officialCardId,name:record.cardName,
      imageSourceUrl:record.imageUrl,officialPageUrl:record.officialPageUrl,
      set:record.set,cardNumber:record.cardNumber,evidence:{...evidence},verified:true};
  })};
}
function main(){
  if(process.argv.length!==3)fail('USAGE: node scripts/import-verified-image-evidence.cjs evidence.json');
  const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const evidence=Array.isArray(source.records)?fromCollectorStaging(source):source;
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  const decks=JSON.parse(fs.readFileSync(deckPath,'utf8'));
  const result=importEvidence(evidence,registry,decks);
  // Full-batch validation before either output is changed. No partial append on collision.
  const updates=[[registryPath,result.registry],[coveragePath,result.coverage]];
  const tmp=[];
  try{
    for(const [dest,data] of updates){const temp=dest+'.new';fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{flag:'w'});JSON.parse(fs.readFileSync(temp,'utf8'));tmp.push([temp,dest])}
    for(const [temp,dest] of tmp)fs.renameSync(temp,dest);
  }finally{for(const [temp] of tmp)if(fs.existsSync(temp))fs.unlinkSync(temp)}
  process.stdout.write(JSON.stringify({added:result.added,total:result.registry.cards.length,coverage:result.coverage.uniquePreviewNames,missing:result.coverage.missingNames})+'\n');
}
if(require.main===module)main();
module.exports={importEvidence,fromCollectorStaging};
