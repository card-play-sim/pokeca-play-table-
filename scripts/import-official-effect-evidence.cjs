'use strict';
// Import WORK/Codex verified official effect text incrementally, preserving every accepted record.
// Never infer effects from image URLs; never mutate image or formal-card registries.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=process.argv[2],output=process.argv[3]||'data/official-effect-evidence.json';
const checkpoint=process.argv.includes('--checkpoint');
if(!input||!fs.existsSync(input))throw Error('MISSING_EFFECT_TEXT_IMPORT');
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const key=r=>[r.officialCardId,r.effectKind,r.effectName||'',r.effectIndex??0].join(':');
const existing=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):[];
const sourceDir=path.dirname(path.resolve(input)),target=path.resolve(output);
if(path.resolve(input)===target)throw Error('INPUT_OUTPUT_MUST_DIFFER');
if(!Array.isArray(existing))throw Error('INVALID_EXISTING_EFFECT_EVIDENCE');
const byKey=new Map(),errors=[];
function verify(r,line){
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('INVALID_RECORD:'+line);
 const id=String(r.officialCardId||''),url=String(r.officialPageUrl||''),text=String(r.effectText||'').trim();
 if(!/^\d{4,8}$/.test(id)||!/^https:\/\/www\.pokemon-card\.com\/card-search\/details\.php\/card\/\d{4,8}(?:\/|$)/.test(url)||url.match(/\/card\/(\d{4,8})(?:\/|$)/)?.[1]!==id)throw Error('INVALID_PRINT_PROVENANCE:'+line);
 if(!['attack','ability','item','supporter','stadium','tool','energy','rule'].includes(r.effectKind)||!['pokemon','item','supporter','stadium','tool','energy'].includes(r.category))throw Error('INVALID_EFFECT_CATEGORY:'+line);
 if((['attack','ability'].includes(r.effectKind)&&r.category!=='pokemon')||(['item','supporter','stadium','tool','energy'].includes(r.effectKind)&&r.effectKind!==r.category))throw Error('EFFECT_KIND_CATEGORY_MISMATCH:'+line);
 if(!text||r.officialTextSha256!==hash(text))throw Error('INVALID_EFFECT_TEXT_HASH:'+line);
 if(!Number.isInteger(r.effectIndex??0)||(r.effectIndex??0)<0)throw Error('INVALID_EFFECT_INDEX:'+line);
 return {...r,officialCardId:id,effectText:text};
}
function accept(r,line){
 const row=verify(r,line),k=key(row),prior=byKey.get(k);
 if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw Error('CONFLICTING_EFFECT_EVIDENCE:'+k);return false;}
 byKey.set(k,row);return true;
}
for(const [i,row] of existing.entries())accept(row,'existing:'+i);
function persist(){
 const rows=[...byKey.values()].sort((a,b)=>Number(a.officialCardId)-Number(b.officialCardId)||key(a).localeCompare(key(b)));
 fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
 const tmp=output+'.tmp-'+process.pid;
 try{fs.writeFileSync(tmp,JSON.stringify(rows,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,output);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
let imported=0,duplicates=0;
const lines=fs.readFileSync(input,'utf8').split(/\r?\n/);
for(let i=0;i<lines.length;i++){
 if(!lines[i].trim())continue;
 let row;try{row=JSON.parse(lines[i]);}catch(e){errors.push('INVALID_NDJSON:'+String(i+1));if(checkpoint)break;continue;}
 try{if(accept(row,i+1)){if(checkpoint)persist();imported++;}else duplicates++;}catch(e){errors.push(e.message);if(checkpoint)break;}
}
if(errors.length){console.error('EFFECT_IMPORT_BLOCKED:',JSON.stringify({errors:errors.slice(0,50),count:errors.length}));process.exitCode=2;}
else{
 if(!checkpoint)persist();
 console.log('EFFECT_IMPORT_OK:',JSON.stringify({previous:existing.length,imported,duplicates,total:byKey.size,output,checkpoint}));
}
