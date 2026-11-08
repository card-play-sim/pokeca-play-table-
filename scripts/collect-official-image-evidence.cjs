#!/usr/bin/env node
'use strict';
// Official HTML evidence only. Never request or store image bytes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const rules=require('../ui/official-image-validation.js');
const origin='https://www.pokemon-card.com';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function parseDetail(html,id,name,expected){
 return JSON.parse(execFileSync('python3',[path.join(__dirname,'../tools/parse-official-image.py')],{input:JSON.stringify({html,id,name,expected}),maxBuffer:5000000}).toString());
}
function atomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const text=JSON.stringify(value,null,2)+'\n',tmp=file+'.tmp';
 let owned=false;
 try{
  const fd=fs.openSync(tmp,'wx');owned=true;try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  if(fs.readFileSync(tmp,'utf8')!==text)throw Error('READBACK');
  fs.renameSync(tmp,file);
  const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
  if(fs.readFileSync(file,'utf8')!==text)throw Error('READBACK');
 }finally{if(owned&&fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
function pageURL(card){
 const id=String(card.officialCardId||'');
 const value=card.officialDetailsUrl||card.officialPageUrl||card.officialCardPageUrl||origin+'/card-search/details.php/card/'+id+'/regu/XY';
 const u=new URL(value);
 if(u.origin!==origin||u.search||u.hash||u.username||u.password||!new RegExp('^/card-search/details\\.php/card/'+id+'(?:/regu/XY)?/?$').test(u.pathname))throw Error('PAGE_ID_MISMATCH');
 return value;
}
function searchURL(value){
 const u=new URL(value);
 if(u.origin!==origin||u.hash||u.username||u.password||!/^\/card-search\/(?:index\.php)?$/.test(u.pathname))throw Error('SEARCH_URL_INVALID');
 return value;
}
function parseSearch(html,id){
 return JSON.parse(execFileSync('python3',[path.join(__dirname,'../tools/parse-official-image.py')],{input:JSON.stringify({mode:'search',html,id}),maxBuffer:5000000}).toString());
}
// Reparse saved HTML, not just its self-reported hashes, on every replay.
function replay(saved,card){
 const id=String(card.officialCardId);
 if(JSON.stringify(saved.candidate)!==JSON.stringify(card)||saved.recordSha256!==hash(JSON.stringify(saved.record)))throw Error('CHECKPOINT_CONFLICT_'+id);
 if(typeof saved.html!=='string'||saved.detailSha256!==hash(saved.html)||saved.record.detailSha256!==saved.detailSha256)throw Error('CHECKPOINT_HTML_CORRUPT_'+id);
 const parsed=parseDetail(saved.html,id,card.name,card);
 if(JSON.stringify(parsed)!==JSON.stringify(saved.result))throw Error('CHECKPOINT_PARSE_MISMATCH_'+id);
 if(parsed.status==='CANDIDATE'){
  rules.validate({...parsed,officialPageUrl:pageURL(card)});
  if(!rules.matches(parsed,card)||!rules.matches(parsed,saved.record)||saved.record.officialPageUrl!==pageURL(card))throw Error('CHECKPOINT_RECORD_MISMATCH_'+id);
 }
 if(card.officialSearchUrl){
  if(saved.searchUrl!==searchURL(card.officialSearchUrl)||typeof saved.searchHtml!=='string'||hash(saved.searchHtml)!==saved.searchSha256||!parseSearch(saved.searchHtml,id).found)throw Error('CHECKPOINT_SEARCH_MISMATCH_'+id);
 }
 return saved;
}
async function collect(candidates,fetcher=fetch,{state=null,interval=3000,maxNew=50,refresh=false,onRecord=async()=>{},onHold=async()=>{}}={}){
 if(!Number.isInteger(maxNew)||maxNew<1||maxNew>1000||!Number.isFinite(interval)||interval<0)throw Error('COLLECTION_LIMITS');
 const cards=[],holds=[],seen=new Map();let fetched=0,resumed=0,stopped=false;
 for(const card of candidates){
  const id=String(card.officialCardId||'');
  if(!/^\d+$/.test(id)||typeof card.name!=='string'||!card.name.trim())throw Error('INVALID_ID_OR_NAME');
  pageURL(card);if(card.officialSearchUrl)searchURL(card.officialSearchUrl);
  if(seen.has(id)&&JSON.stringify(seen.get(id))!==JSON.stringify(card))throw Error('CANDIDATE_CONFLICT_'+id);
  seen.set(id,card);
 }
 async function hold(value){holds.push(value);await onHold(value);}
 async function htmlAt(url){
  if(fetched)await delay(interval);fetched++;
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'text/html','User-Agent':'PokecaOfficialImageEvidence/2.0'}});
  if(!response.ok||!String(response.headers.get('content-type')).includes('text/html'))throw Error('HTTP_OR_CONTENT_TYPE_'+response.status);
  const reader=response.body?.getReader();let html;
  if(reader){let bytes=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4000000){await reader.cancel();throw Error('RESPONSE_SIZE_LIMIT');}chunks.push(value);}html=Buffer.concat(chunks).toString('utf8');}
  else html=await response.text();
  if(Buffer.byteLength(html)>4000000)throw Error('RESPONSE_SIZE_LIMIT');
  if(/captcha|access denied|access restricted/i.test(html))throw Error('ACCESS_CHALLENGE');
  return html;
 }
 for(const [id,card] of seen){
  const officialPageUrl=pageURL(card),file=state&&path.join(state,id+'.json');
  if(stopped){await hold({officialCardId:id,name:card.name,reason:'SAFE_STOP',status:'HOLD'});continue;}
  if(file&&fs.existsSync(file)&&!refresh){
   const saved=replay(JSON.parse(fs.readFileSync(file)),card);resumed++;
   if(saved.result.status==='CANDIDATE'){await onRecord(saved.record,saved);cards.push(saved.record);}
   else await hold({...saved.result,officialCardId:id,name:card.name});
   continue;
  }
  const needed=card.officialSearchUrl?2:1;
  if(fetched+needed>maxNew){await hold({officialCardId:id,name:card.name,reason:'DEFERRED',status:'HOLD'});continue;}
  if(file&&fs.existsSync(file)){
   const previous=replay(JSON.parse(fs.readFileSync(file)),card);
   const archive=path.join(state,'history',id+'-'+hash(JSON.stringify(previous))+'.json');
   if(fs.existsSync(archive)){if(JSON.stringify(JSON.parse(fs.readFileSync(archive)))!==JSON.stringify(previous))throw Error('CHECKPOINT_HISTORY_CONFLICT_'+id);}
   else atomic(archive,previous);
  }
  let saved;
  try{
   let searchHtml,searchSha256;
   if(card.officialSearchUrl){searchHtml=await htmlAt(searchURL(card.officialSearchUrl));searchSha256=hash(searchHtml);if(!parseSearch(searchHtml,id).found)throw Error('SEARCH_ID_NOT_OBSERVED');}
   const html=await htmlAt(officialPageUrl),result=parseDetail(html,id,card.name,card);
   if(result.status==='CANDIDATE'){
    rules.validate({...result,officialPageUrl});
    if(!rules.matches(result,card))throw Error('IMAGE_REFERENCE_MISMATCH');
   }
   const record={...result,officialPageUrl,verified:false,reviewStatus:'PENDING_OFFICIAL_EVIDENCE_REVIEW',detailSha256:hash(html),printExpected:!!(card.cardNumber&&card.set),deckPrintAdopted:false};
   saved={candidate:card,html,detailSha256:hash(html),result,record,recordSha256:hash(JSON.stringify(record)),...(card.officialSearchUrl?{searchHtml,searchSha256,searchUrl:card.officialSearchUrl}:{})};
  }catch(e){await hold({officialCardId:id,name:card.name,status:'HOLD',reason:'FETCH_ERROR_'+String(e.message).slice(0,120)});stopped=true;continue;}
  // Disk/readback failures and registration conflicts propagate; no next request is allowed.
  if(file){atomic(file,saved);saved=replay(JSON.parse(fs.readFileSync(file)),card);}
  else replay(saved,card);
  if(saved.result.status==='CANDIDATE'){await onRecord(saved.record,saved);cards.push(saved.record);}
  else await hold({...saved.result,officialCardId:id,name:card.name});
 }
 return {schemaVersion:2,status:holds.length?'BLOCKED':'REFERENCES_VERIFIED_NOT_DECK_ADOPTED',cards,holds,requestsAttempted:fetched,resumed};
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
module.exports={parseDetail,parseSearch,collect,atomic,hash,pageURL,replay};
