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
const target=path.resolve(output);
const journal=output+'.checkpoint.ndjson';
const lock=output+'.checkpoint.lock';
if(path.resolve(input)===target||path.resolve(input)===path.resolve(journal))throw Error('INPUT_OUTPUT_MUST_DIFFER');
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
// The on-disk registry is authoritative; reject duplicate keys with divergent metadata.
if(byKey.size!==existing.length)throw Error('DUPLICATE_EXISTING_EFFECT_EVIDENCE');
// Replay durable accepted rows from a previous interrupted import.
// Reject incomplete journal tails rather than silently discarding evidence.
let recovered=0;
if(checkpoint&&fs.existsSync(journal)){
 const journalText=fs.readFileSync(journal,'utf8');
 if(journalText&&!journalText.endsWith('\n'))throw Error('INCOMPLETE_EFFECT_CHECKPOINT_JOURNAL');
 for(const [i,line] of journalText.split(/\r?\n/).entries()){
  if(!line.trim())continue;
  if(accept(JSON.parse(line),'journal:'+i))recovered++;
 }
}
function persist(){
 const rows=[...byKey.values()].sort((a,b)=>Number(a.officialCardId)-Number(b.officialCardId)||key(a).localeCompare(key(b)));
 fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
 const tmp=output+'.tmp-'+process.pid;
 try{fs.writeFileSync(tmp,JSON.stringify(rows,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,output);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
let imported=0,duplicates=0;
// Exclusive lock prevents concurrent writers from interleaving records or compaction.
let lockFd=null;
if(checkpoint){
 try{lockFd=fs.openSync(lock,'wx');fs.writeSync(lockFd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})+'\n');}
 catch(e){if(e.code==='EEXIST')throw Error('EFFECT_IMPORT_ALREADY_RUNNING');throw e;}
}
const checkpointFd=checkpoint?fs.openSync(journal,'a'):null;
const lines=fs.readFileSync(input,'utf8').split(/\r?\n/);
for(let i=0;i<lines.length;i++){
 if(!lines[i].trim())continue;
 let row;try{row=JSON.parse(lines[i]);}catch(e){errors.push('INVALID_NDJSON:'+String(i+1));if(checkpoint)break;continue;}
 try{
  if(accept(row,i+1)){
   if(checkpoint){fs.writeSync(checkpointFd,JSON.stringify(byKey.get(key(row)))+'\n');fs.fsyncSync(checkpointFd);}
   imported++;
  }else duplicates++;
 }catch(e){errors.push(e.message);if(checkpoint)break;}
}
if(checkpointFd!==null)fs.closeSync(checkpointFd);
// Compact once per batch rather than rewriting the entire registry for every row.
// On validation failure retain the journal for inspection and crash recovery.
if(!errors.length){persist();if(checkpoint&&fs.existsSync(journal))fs.unlinkSync(journal);}
if(lockFd!==null){fs.closeSync(lockFd);fs.unlinkSync(lock);}
if(errors.length){console.error('EFFECT_IMPORT_BLOCKED:',JSON.stringify({errors:errors.slice(0,50),count:errors.length}));process.exitCode=2;}
else{
 console.log('EFFECT_IMPORT_OK:',JSON.stringify({previous:existing.length,recovered,imported,duplicates,total:byKey.size,output,checkpoint}));
}
