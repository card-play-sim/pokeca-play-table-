'use strict';
// Repair derived facts only for uncompiled prints, from the same immutable HTML.
// Never turn compiler acceptance into battle completion.
const fs=require('node:fs'), crypto=require('node:crypto'), assert=require('node:assert/strict');
const {parse}=require('./parse-official-pokemon-energy.cjs');
const {isDeepStrictEqual}=require('node:util');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const withoutFacts=({facts,...row})=>row;
function verifiedFacts(row,proof){
 const id=String(row.officialCardId);
 const url='https://www.pokemon-card.com/card-search/details.php/card/'+id;
 assert(/^[1-9][0-9]{0,7}$/.test(id),'INVALID_OFFICIAL_ID');
 assert.equal(row.officialPageUrl,url,'OFFICIAL_URL');
 assert.equal(row.source.path,'data/effect-extensions/evidence/'+id+'.json','OFFICIAL_PATH');
 assert.equal(proof.url,url,'OFFICIAL_PROOF_URL');
 assert.equal(sha(proof.html),proof.htmlSha256,'HTML_HASH');
 assert.equal(row.source.sha256,proof.htmlSha256,'SOURCE_HASH');
 assert(proof.html.includes('<meta property="og:url" content="'+url+'"'),'CANONICAL_ID');
 assert.equal(sha(row.text),row.source.textSha256,'TEXT_HASH');
 const name=(proof.html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
 assert(name&&row.name===name&&row.deckName===name,'OFFICIAL_NAME');
 assert(/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\//.test(row.imageSourceUrl)&&proof.html.includes(row.imageSourceUrl.replace('https://www.pokemon-card.com','')),'OFFICIAL_IMAGE');
 assert.equal(row.deckPrintAdopted,false,'REFERENCE_BOUNDARY');
 const p=parse(proof.html);
 for(const key of ['category','text','attacks','abilities','rulesText'])
  assert.equal(JSON.stringify(p[key]),JSON.stringify(row[key]),'NON_FACT_CONFLICT:'+key);
 assert(['pokemon','energy'].includes(row.category),'UNSUPPORTED_CATEGORY');
 return p.facts;
}
function refresh({checkpoint,intake,compiled,proofFor}){
 const protectedIds=new Set(compiled.records.map(row=>String(row.officialCardId)));
 const byId=new Map();
 for(const row of [...checkpoint.records,...intake.records]){
  const id=String(row.officialCardId);
  if(protectedIds.has(id)||!['pokemon','energy'].includes(row.category))continue;
  const copies=byId.get(id)||[];copies.push(row);byId.set(id,copies);
 }
 const changes=[],blocked=[],replacements=new Map();
 for(const [id,rows] of byId){
  try {
   if(!rows.every(row=>isDeepStrictEqual(withoutFacts(row),withoutFacts(rows[0]))))throw Error('RAW_RECORD_CONFLICT');
   const proof=proofFor(rows[0]);
   const facts=verifiedFacts(rows[0],proof);
   const stale=rows.filter(row=>JSON.stringify(row.facts)!==JSON.stringify(facts));
   if(!stale.length)continue;
   replacements.set(id,{...rows[0],facts});
   changes.push({officialCardId:id,previous:stale.map(row=>row.facts),verified:facts,sourceSha256:proof.htmlSha256});
  }catch(e){blocked.push({officialCardId:id,reason:e.message.split('\n')[0]});}
 }
 const update=doc=>({...doc,records:doc.records.map(row=>replacements.get(String(row.officialCardId))||row)});
 return {checkpoint:update(checkpoint),intake:update(intake),changes,blocked};
}
function chooseVerifiedPair(a,b,proof){
 assert(isDeepStrictEqual(withoutFacts(a),withoutFacts(b)),'NON_FACT_RECORD_CONFLICT');
 const facts=verifiedFacts(a,proof);
 assert(JSON.stringify(a.facts)===JSON.stringify(facts)||JSON.stringify(b.facts)===JSON.stringify(facts),'NEITHER_RECORD_MATCHES_OFFICIAL_FACTS');
 return {...a,facts};
}
function write(p,value){fs.mkdirSync(require('node:path').dirname(p),{recursive:true});const tmp=p+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,p);}
function main(){
 const args=process.argv.slice(2);
 if(args[0]==='--verify-pair'){
  const {a,b,proof}=JSON.parse(fs.readFileSync(0,'utf8'));
  process.stdout.write(JSON.stringify(chooseVerifiedPair(a,b,proof)));return;
 }
 const checkpointPath='data/official-effect-intake/checkpoint.json',intakePath='data/effect-extensions/intake.json';
 const checkpoint=read(checkpointPath),intake=read(intakePath),compiled=read('data/effect-extensions/compiled.json');
 const result=refresh({checkpoint,intake,compiled,proofFor:row=>read(row.source.path)});
 const report={state:'OFFICIAL_FACT_REFRESH_ONLY_NOT_BATTLE_VERIFIED',changes:result.changes,blocked:result.blocked};
 write('reports/official-effect-continuation/official-fact-refresh.json',report);
 if(args.includes('--apply')){
  write(checkpointPath,result.checkpoint);write(intakePath,result.intake);
 }
 console.log(JSON.stringify({refreshed:result.changes.length,blocked:result.blocked.length,applied:args.includes('--apply'),officialIds:result.changes.map(x=>x.officialCardId)}));
}
if(require.main===module)main();
module.exports={refresh,verifiedFacts,chooseVerifiedPair};
