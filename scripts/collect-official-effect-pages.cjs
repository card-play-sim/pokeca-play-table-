'use strict';
// Conservative official card page collector. Extract only explicit attack/ability text blocks;
// ambiguous HTML is quarantined rather than converted into game rules.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [idsFile,outFile,reportFile]=process.argv.slice(2);
if(!idsFile||!outFile||!reportFile)throw Error('USAGE: collect-official-effect-pages.cjs ids.json output.ndjson report.json');
if(new Set([idsFile,outFile,reportFile].map(p=>path.resolve(p))).size!==3)throw Error('COLLECTOR_PATHS_MUST_DIFFER');
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
 const heading=/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
 const found=[...html.matchAll(heading)].map(m=>({index:m.index,end:m.index+m[0].length,level:Number(m[1]),label:strip(m[2])}));
 // Any malformed heading markup can shift effect boundaries; reject the entire print.
 const openingHeadings=(html.match(/<h[2-6]\b/gi)||[]).length;
 if(openingHeadings!==found.length)return {rows:[],errors:['MALFORMED_HEADING_MARKUP']};
 const result=[],errors=[];
 let section='',previousLevel=0;
 for(let i=0;i<found.length;i++){
  const h=found[i],next=found[i+1]?.index??html.length;
  if(/^(ワザ|特性|特別なルール)$/.test(h.label)){section=h.label;previousLevel=h.level;continue;}
  if(h.level<=previousLevel){section='';continue;}
  if(section!=='ワザ'&&section!=='特性')continue;
  const body=html.slice(h.end,next);
  // A nested heading cannot be a sibling effect name; quarantine rather than flatten.
  if(h.level>previousLevel+2){errors.push('AMBIGUOUS_EFFECT_HEADING_LEVEL:'+h.label);continue;}
  if(!h.label||h.label.length>120){errors.push('INVALID_EFFECT_HEADING');continue;}
  // Never include script/style or nested structural headings as an effect.
  if(/<(?:script|style|h[1-6])\b/i.test(body)){errors.push('AMBIGUOUS_EFFECT_HTML:'+h.label);continue;}
  if(/<(?:img|iframe|object|form|input|button|table|ul|ol)\b/i.test(body)){errors.push('UNSUPPORTED_EFFECT_MARKUP:'+h.label);continue;}
  const effectText=strip(body);
  // Damage-only attacks are legitimate but have no explicit effect text.
  // Do not invent an effect; record the missing text for separate card-rule handling.
  if(!effectText){errors.push('MISSING_EXPLICIT_EFFECT_TEXT:'+h.label);continue;}
  if(effectText.length>3000){errors.push('EFFECT_TEXT_TOO_LONG:'+h.label);continue;}
  const kind=section==='ワザ'?'attack':'ability';
  const index=result.filter(x=>x.effectKind===kind).length;
  // Printed damage is often suffixed to the attack heading (e.g. なみのり140).
  // Preserve the original heading; never silently strip digits from a card identity.
  result.push({officialCardId:String(id),category:'pokemon',effectKind:kind,effectName:h.label,effectIndex:index,effectText,officialTextSha256:sha(effectText),officialPageUrl:url,provenance:{kind:'OFFICIAL_HTML_EXTRACTED',officialPageSha256:sha(html)}});
 }
 if(!result.length)errors.push('NO_UNAMBIGUOUS_EFFECT_BLOCKS');
 return {rows:result,errors};
}
(async()=>{
 fs.mkdirSync(path.dirname(path.resolve(outFile)),{recursive:true});
 fs.mkdirSync(path.dirname(path.resolve(reportFile)),{recursive:true});
 const existing=fs.existsSync(outFile)?fs.readFileSync(outFile,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse):[];
 const seen=new Map();
 for(const row of existing){
  const id=String(row.officialCardId||'');
  const expected='https://www.pokemon-card.com/card-search/details.php/card/'+id;
  if(!/^\d{4,8}$/.test(id)||row.officialPageUrl!==expected||typeof row.effectText!=='string'||sha(row.effectText)!==row.officialTextSha256)throw Error('INVALID_EXISTING_COLLECTOR_EVIDENCE');
  const slot=[id,row.effectKind,row.effectName,row.effectIndex].join(':');
  if(seen.has(slot))throw Error('DUPLICATE_EXISTING_COLLECTOR_SLOT:'+slot);
  seen.set(slot,row);
 }
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
     const prior=seen.get(slot);
     if(prior.effectText!==row.effectText||prior.officialTextSha256!==row.officialTextSha256||prior.officialPageUrl!==row.officialPageUrl)throw Error('CONFLICTING_OFFICIAL_EFFECT_SLOT:'+slot);
     // Dynamic official HTML can change without altering the verified card effect.
     // Retain the original source hash instead of duplicating an unchanged effect.
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
