'use strict';
// Export existing provenance-checked reference print text for Codex intake.
// Does not fetch images, modify the 1945-record catalog, or claim 6000 effect records.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2]||'data/reference-effects/plans.json';
const output=process.argv[3]||'reports/reference-official-effect-evidence.json';
const data=JSON.parse(fs.readFileSync(input,'utf8'));
if(!Array.isArray(data.records)||data.scope!=='PRINT_SPECIFIC_EFFECT_REFERENCES_NOT_DECK_ADOPTION')throw Error('INVALID_REFERENCE_EFFECT_SOURCE');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const rows=[],blocked=[];
for(const record of data.records){
 const common={officialCardId:String(record.officialCardId),category:record.category,officialPageUrl:record.officialPageUrl,
  provenance:{kind:record.source?.kind,recordSha256:record.source?.recordSha256,referenceOnly:true}};
 const add=(kind,name,text,index)=>{
  if(typeof text!=='string'||!text.trim()){blocked.push({officialCardId:common.officialCardId,effectKind:kind,effectName:name||'',reason:'MISSING_REFERENCE_EFFECT_TEXT'});return;}
  rows.push({...common,effectKind:kind,effectName:name||'',effectIndex:index,effectText:text.trim(),officialTextSha256:hash(text.trim())});
 };
 if(record.category==='pokemon'){
  for(const [i,attack] of (record.attacks||[]).entries())if(attack.plan)add('attack',attack.name,attack.text,i);
  for(const [i,ability] of (record.abilities||[]).entries())if(ability.plan)add('ability',ability.name,ability.text,i);
 }else if(record.mainPlan)add(record.category,record.name,record.text,0);
}
const seen=new Set();
for(const row of rows){
 const key=[row.officialCardId,row.effectKind,row.effectName,row.effectIndex].join(':');
 if(seen.has(key))throw Error('DUPLICATE_REFERENCE_EFFECT_IDENTITY:'+key);
 seen.add(key);
}
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,JSON.stringify(rows,null,2)+'\n');
console.log('REFERENCE_EFFECT_EVIDENCE_EXPORT:',JSON.stringify({prints:data.records.length,effects:rows.length,blocked:blocked.length,output}));
if(blocked.length){console.error('REFERENCE_EFFECT_EVIDENCE_BLOCKED:',JSON.stringify(blocked));process.exitCode=2;}
module.exports={rows,blocked};
