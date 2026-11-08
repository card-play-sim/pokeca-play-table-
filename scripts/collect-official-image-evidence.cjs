#!/usr/bin/env node
'use strict';
// Continue the existing collector API. Official detail references, never images.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const origin='https://www.pokemon-card.com';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function parseDetail(html,id,name,expected){
 return JSON.parse(execFileSync('python3',[path.join(__dirname,'../tools/parse-official-image.py')],{input:JSON.stringify({html,id,name,expected}),maxBuffer:5000000}).toString());
}
function atomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const text=JSON.stringify(value,null,2)+'\n',tmp=file+'.tmp';
 const fd=fs.openSync(tmp,'w');try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 if(JSON.stringify(JSON.parse(fs.readFileSync(tmp)))!==JSON.stringify(value))throw Error('READBACK');
 fs.renameSync(tmp,file);
 const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 if(JSON.stringify(JSON.parse(fs.readFileSync(file)))!==JSON.stringify(value))throw Error('READBACK');
}
function pageURL(card){
 const id=String(card.officialCardId||'');
 const value=card.officialDetailsUrl||card.officialPageUrl||origin+'/card-search/details.php/card/'+id+'/regu/XY';
 const u=new URL(value);
 if(u.origin!==origin||u.search||u.hash||u.username||u.password||!new RegExp('^/card-search/details\\.php/card/'+id+'(?:/regu/XY)?/?$').test(u.pathname))throw Error('PAGE_ID_MISMATCH');
 return value;
}
async function collect(candidates,fetcher=fetch,{state=null,interval=3000,maxNew=50}={}){
 const cards=[],holds=[],seen=new Map();let fetched=0,resumed=0,stopped=false;
 // Validate the entire candidate batch before making requests or touching state.
 for(const card of candidates){
  const id=String(card.officialCardId||'');
  if(!/^\d+$/.test(id)||typeof card.name!=='string'||!card.name.trim())throw Error('INVALID_ID_OR_NAME');
  pageURL(card);
  if(seen.has(id)&&JSON.stringify(seen.get(id))!==JSON.stringify(card))throw Error('CANDIDATE_CONFLICT_'+id);
  seen.set(id,card);
 }
 for(const [id,card] of seen){
  const officialPageUrl=pageURL(card),file=state&&path.join(state,id+'.json');
  if(file&&fs.existsSync(file)){
   const saved=JSON.parse(fs.readFileSync(file));
   if(JSON.stringify(saved.candidate)!==JSON.stringify(card)||saved.recordSha256!==hash(JSON.stringify(saved.record)))throw Error('CHECKPOINT_CONFLICT_'+id);
   if(saved.html&&saved.detailSha256!==hash(saved.html))throw Error('CHECKPOINT_HTML_CORRUPT_'+id);
   if(saved.result.status==='CANDIDATE'&&JSON.stringify(parseDetail(saved.html,id,card.name,card))!==JSON.stringify(saved.result))throw Error('CHECKPOINT_PARSE_MISMATCH_'+id);
   (saved.result.status==='CANDIDATE'?cards:holds).push(saved.result.status==='CANDIDATE'?saved.record:saved.result);resumed++;continue;
  }
  if(stopped||fetched>=maxNew){holds.push({officialCardId:id,name:card.name,reason:stopped?'SAFE_STOP':'DEFERRED',status:'HOLD'});continue;}
  if(fetched)await delay(interval);
  let result,record,html='';
  try{
   fetched++;
   const response=await fetcher(officialPageUrl,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'text/html','User-Agent':'PokecaOfficialImageEvidence/1.0'}});
   if(!response.ok||!String(response.headers.get('content-type')).includes('text/html'))throw Error('HTTP_OR_CONTENT_TYPE_'+response.status);
   const reader=response.body?.getReader();
   if(reader){let bytes=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4000000){await reader.cancel();throw Error('RESPONSE_SIZE_LIMIT');}chunks.push(value);}html=Buffer.concat(chunks).toString('utf8');}
   else html=await response.text();
   if(Buffer.byteLength(html)>4000000)throw Error('RESPONSE_SIZE_LIMIT');
   if(/captcha|access denied|access restricted/i.test(html))throw Error('ACCESS_CHALLENGE');
   result=parseDetail(html,id,card.name,card);
   record={...result,officialPageUrl,verified:false,reviewStatus:'PENDING_OFFICIAL_EVIDENCE_REVIEW',detailSha256:hash(html),printExpected:!!(card.cardNumber&&card.set),deckPrintAdopted:false};
   if(state)atomic(file,{candidate:card,html,detailSha256:hash(html),result,record,recordSha256:hash(JSON.stringify(record))});
  }catch(e){result={officialCardId:id,name:card.name,status:'HOLD',reason:'FETCH_ERROR_'+String(e.message).slice(0,120)};stopped=true;}
  if(result.status==='CANDIDATE')cards.push(record);else holds.push(result);
 }
 return {schemaVersion:1,status:'CANDIDATES_ONLY_NOT_APPROVED',cards,holds,requestsAttempted:fetched,resumed};
}
async function main(){
 if(process.argv.length!==4)throw Error('usage: node collect-official-image-evidence.cjs candidates.json evidence.json');
 const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 if(!Array.isArray(source.candidates))throw Error('candidates array required');
 const result=await collect(source.candidates,fetch,{state:process.argv[3]+'.records'});atomic(process.argv[3],result);
 console.log(JSON.stringify({candidates:result.cards.length,hold:result.holds.length,requests:result.requestsAttempted,resumed:result.resumed}));
 if(result.holds.length)process.exitCode=2;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={parseDetail,collect,atomic,hash,pageURL};
