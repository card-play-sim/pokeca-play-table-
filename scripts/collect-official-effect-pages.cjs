'use strict';
// Conservative official card page collector. Extract only explicit attack/ability text blocks;
// ambiguous HTML is quarantined rather than converted into game rules.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [idsFile,outFile,reportFile]=process.argv.slice(2);
if(!idsFile||!outFile||!reportFile)throw Error('USAGE: collect-official-effect-pages.cjs ids.json output.ndjson report.json');
const ids=JSON.parse(fs.readFileSync(idsFile,'utf8'));
if(!Array.isArray(ids)||!ids.length||ids.some(id=>!/^\d{4,8}$/.test(String(id))))throw Error('INVALID_OFFICIAL_CARD_IDS');
if(new Set(ids.map(String)).size!==ids.length)throw Error('DUPLICATE_OFFICIAL_CARD_IDS');
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
const normalize=t=>String(t).normalize('NFKC').replace(/\s+/g,' ').trim();
const decode=s=>s.replace(/&(?:nbsp|amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi,m=>{
 const known={'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(known[m.toLowerCase()])return known[m.toLowerCase()];
 const a=m.match(/^&#(x[0-9a-f]+|\d+);$/i);if(!a)return m;
 const n=a[1][0].toLowerCase()==='x'?parseInt(a[1].slice(1),16):Number(a[1]);return n>0&&n<=0x10ffff?String.fromCodePoint(n):m;
});
const strip=s=>normalize(decode(s.replace(/<[^>]*>/g,' ')));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(id){
 const url='https://www.pokemon-card.com/card-search/details.php/card/'+id;
 for(let i=0;i<3;i++){
  try{
   const r=await fetch(url,{headers:{accept:'text/html','user-agent':'CardEffectEvidenceCollector/1.0'},signal:AbortSignal.timeout(15000),redirect:'follow'});
   if(!r.ok)throw Error('HTTP_'+r.status);
   if(new URL(r.url).hostname!=='www.pokemon-card.com')throw Error('UNTRUSTED_REDIRECT');
   return {url,html:await r.text()};
  }catch(e){if(i===2)throw e;await sleep(700*(i+1));}
 }
}
function parse(id,html,url){
 // Restrict parsing to recognizable official detail headings. No broad free-text guesses.
 const heading=/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>/gi;
 const found=[...html.matchAll(heading)].map(m=>({index:m.index,end:m.index+m[0].length,label:strip(m[1])}));
 const result=[],errors=[];
 let section='';
 for(let i=0;i<found.length;i++){
  const h=found[i],next=found[i+1]?.index??html.length;
  if(/^(ワザ|特性|特別なルール)$/.test(h.label)){section=h.label;continue;}
  if(/^<h[1-3]\b/i.test(html.slice(h.index,h.end))){section='';continue;}
  if(section!=='ワザ'&&section!=='特性')continue;
  const body=html.slice(h.end,next);
  // Never include script/style or nested structural headings as an effect.
  if(/<(?:script|style|h[1-6])\b/i.test(body)){errors.push('AMBIGUOUS_EFFECT_HTML:'+h.label);continue;}
  const effectText=strip(body);
  if(!effectText){errors.push('MISSING_EFFECT_TEXT:'+h.label);continue;}
  const kind=section==='ワザ'?'attack':'ability';
  const index=result.filter(x=>x.effectKind===kind).length;
  result.push({officialCardId:String(id),category:'pokemon',effectKind:kind,effectName:h.label,effectIndex:index,effectText,officialTextSha256:sha(effectText),officialPageUrl:url,provenance:{kind:'OFFICIAL_HTML_EXTRACTED',officialPageSha256:sha(html)}});
 }
 if(!result.length)errors.push('NO_UNAMBIGUOUS_EFFECT_BLOCKS');
 return {rows:result,errors};
}
(async()=>{
 fs.mkdirSync(path.dirname(path.resolve(outFile)),{recursive:true});
 fs.mkdirSync(path.dirname(path.resolve(reportFile)),{recursive:true});
 const existing=fs.existsSync(outFile)?fs.readFileSync(outFile,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse):[];
 const seen=new Map(existing.map(r=>[[r.officialCardId,r.effectKind,r.effectName,r.effectIndex].join(':'),r]));
 const reports=[];let added=0;
 for(const id of ids){
  const key=String(id),url='https://www.pokemon-card.com/card-search/details.php/card/'+key;
  try{
   const {html}=await get(key),parsed=parse(key,html,url);
   if(parsed.errors.length){reports.push({id:key,status:'BLOCKED',reasons:parsed.errors});}
   else {
   const incoming=[];
   for(const row of parsed.rows){
    const slot=[row.officialCardId,row.effectKind,row.effectName,row.effectIndex].join(':');
    if(seen.has(slot)){
     if(JSON.stringify(seen.get(slot))!==JSON.stringify(row))throw Error('CONFLICTING_OFFICIAL_EFFECT_SLOT:'+slot);
    }else incoming.push({slot,row});
   }
   // Append only after all effects from this print have passed the extraction gate.
   if(incoming.length){
    const fd=fs.openSync(outFile,'a');
    try{for(const x of incoming)fs.writeSync(fd,JSON.stringify(x.row)+'\n');fs.fsyncSync(fd);}
    finally{fs.closeSync(fd);}
    for(const x of incoming)seen.set(x.slot,x.row);
    added+=incoming.length;
   }
   reports.push({id:key,status:'COLLECTED',effects:parsed.rows.length,added:incoming.length,officialPageSha256:sha(html)});
   }
  }catch(e){reports.push({id:key,status:'BLOCKED',reasons:[String(e.message||e)]});}
  // Checkpoint the per-print status immediately; restart is safe.
  fs.writeFileSync(reportFile,JSON.stringify({total:ids.length,processed:reports.length,added,results:reports},null,2)+'\n');
  await sleep(250);
 }
 const blocked=reports.filter(r=>r.status==='BLOCKED').length;
 console.log('OFFICIAL_EFFECT_COLLECTION:',JSON.stringify({prints:ids.length,added,blocked,outFile,reportFile}));
 if(blocked)process.exitCode=2;
})().catch(e=>{console.error(e);process.exitCode=2;});
