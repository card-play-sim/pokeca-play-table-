'use strict';
// Compare extracted effect text against independently retained print-specific reference facts.
// Never silently accept self-consistent HTML hashes as proof of correct extraction.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const [referenceFile,evidenceFile,reportFile]=process.argv.slice(2);
if(!referenceFile||!evidenceFile||!reportFile)throw Error('USAGE: compare-collected-reference-effects.cjs plans.json validated.json report.json');
const references=JSON.parse(fs.readFileSync(referenceFile,'utf8'));
const evidence=JSON.parse(fs.readFileSync(evidenceFile,'utf8'));
if(!Array.isArray(references.records)||!Array.isArray(evidence))throw Error('INVALID_COMPARISON_INPUT');
const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const expected=new Map();
for(const card of references.records){
 if(card.category!=='pokemon')continue;
 const rows=[
  ...(card.attacks||[]).map((x,i)=>({kind:'attack',index:i,text:x.text,name:x.name})),
  ...(card.abilities||[]).map((x,i)=>({kind:'ability',index:i,text:x.text,name:x.name}))
 ];
 const nonempty=rows.filter(x=>norm(x.text));
 if(!nonempty.length)continue;
 expected.set(String(card.officialCardId),nonempty);
}
const grouped=new Map(),results=[];
for(const row of evidence){
 const id=String(row.officialCardId);
 if(!grouped.has(id))grouped.set(id,[]);
 grouped.get(id).push(row);
}
for(const [id,rows] of grouped){
 const ref=expected.get(id);
 if(!ref){results.push({id,status:'BLOCKED',reason:'NO_REFERENCE_EFFECTS_FOR_PRINT'});continue;}
 const issues=[];
 for(const row of rows){
  const matches=ref.filter(x=>x.kind===row.effectKind&&x.index===row.effectIndex&&norm(x.text)===norm(row.effectText));
  if(matches.length!==1)issues.push({effectKind:row.effectKind,effectIndex:row.effectIndex,reason:'EFFECT_SLOT_NOT_SUPPORTED_BY_REFERENCE'});
  if(row.officialTextSha256!==sha(row.effectText))issues.push({reason:'INVALID_COLLECTED_EFFECT_HASH'});
 }
 for(const x of ref)if(!rows.some(r=>r.effectKind===x.kind&&r.effectIndex===x.index&&norm(r.effectText)===norm(x.text)))issues.push({effectKind:x.kind,effectIndex:x.index,reason:'REFERENCE_EFFECT_MISSING'});
 const seen=new Set();
 for(const row of rows){const key=row.effectKind+':'+row.effectIndex;if(seen.has(key))issues.push({reason:'DUPLICATE_EXTRACTED_EFFECT_TEXT'});seen.add(key);}
 results.push({id,status:issues.length?'BLOCKED':'MATCHED',expected:ref.length,collected:rows.length,issues});
}
const blocked=results.filter(x=>x.status==='BLOCKED').length;
const report={schemaVersion:1,compared:results.length,matched:results.length-blocked,blocked,results};
fs.mkdirSync(path.dirname(path.resolve(reportFile)),{recursive:true});
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
console.log('OFFICIAL_REFERENCE_EFFECT_COMPARISON:',JSON.stringify({compared:report.compared,matched:report.matched,blocked}));
if(blocked||!results.length)process.exitCode=2;
