#!/usr/bin/env node
'use strict';
// Official detail-page image evidence collector. Never fabricates an image URL.
// Usage: node scripts/collect-official-image-evidence.cjs candidates.json evidence.json
const fs=require('node:fs');
const {setTimeout:delay}=require('node:timers/promises');
const origin='https://www.pokemon-card.com';
function parseDetail(html,id,name){
  const text=String(html);
  const urls=[...text.matchAll(/(?:https?:\/\/www\.pokemon-card\.com)?\/assets\/images\/card_images\/large\/[A-Za-z0-9_.%/-]+\.(?:jpg|png|webp)/gi)]
    .map(x=>x[0].startsWith('http')?x[0]:origin+x[0]);
  const matches=[...new Set(urls.filter(u=>new RegExp('/0*'+id+'_[A-Za-z0-9_]+\\.(?:jpg|png|webp)
  // Exact ID embedded in official image filename is required; ambiguous images are held.
  if(matches.length!==1)return {status:'HOLD',reason:matches.length?'AMBIGUOUS_IMAGE':'NO_ID_MATCHED_IMAGE'};
  // A name must be visible in official detail HTML, not inferred from candidate data.
  if(!text.includes(name))return {status:'HOLD',reason:'CARD_NAME_NOT_IN_DETAIL'};
  return {status:'CANDIDATE',imageSourceUrl:matches[0]};
}
async function collect(candidates,fetcher=fetch){
  const cards=[],holds=[];
  const seen=new Set();
  for(const card of candidates){
    const id=String(card.officialCardId||''),name=card.name;
    if(!/^\d+$/.test(id)||typeof name!=='string'||!name.trim()||seen.has(id)){holds.push({officialCardId:id,reason:'INVALID_OR_DUPLICATE_ID'});continue}
    seen.add(id);
    const officialPageUrl=origin+'/card-search/details.php/card/'+id+'/regu/XY';
    try{
      const response=await fetcher(officialPageUrl,{redirect:'error',headers:{'Accept':'text/html'}});
      if(!response.ok||!String(response.headers.get('content-type')).includes('text/html'))throw Error('HTTP_OR_CONTENT_TYPE_'+response.status);
      const html=await response.text();
      const found=parseDetail(html,id,name);
      if(found.status==='CANDIDATE')cards.push({officialCardId:id,name,imageSourceUrl:found.imageSourceUrl,officialPageUrl,verified:false,reviewStatus:'PENDING_OFFICIAL_EVIDENCE_REVIEW'});
      else holds.push({officialCardId:id,name,reason:found.reason});
    }catch(e){holds.push({officialCardId:id,name,reason:'FETCH_ERROR_'+String(e.message).slice(0,80)})}
    await delay(3000);
  }
  return {schemaVersion:1,status:'CANDIDATES_ONLY_NOT_APPROVED',cards,holds};
}
async function main(){
  if(process.argv.length!==4)throw Error('usage: node collect-official-image-evidence.cjs candidates.json evidence.json');
  const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  if(!Array.isArray(source.candidates))throw Error('candidates array required');
  const result=await collect(source.candidates);
  fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({candidates:result.cards.length,hold:result.holds.length}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={parseDetail,collect};
,'i').test(u)))];
  // Exact ID embedded in official image filename is required; ambiguous images are held.
  if(matches.length!==1)return {status:'HOLD',reason:matches.length?'AMBIGUOUS_IMAGE':'NO_ID_MATCHED_IMAGE'};
  // A name must be visible in official detail HTML, not inferred from candidate data.
  if(!text.includes(name))return {status:'HOLD',reason:'CARD_NAME_NOT_IN_DETAIL'};
  return {status:'CANDIDATE',imageSourceUrl:matches[0]};
}
async function collect(candidates,fetcher=fetch){
  const cards=[],holds=[];
  const seen=new Set();
  for(const card of candidates){
    const id=String(card.officialCardId||''),name=card.name;
    if(!/^\d+$/.test(id)||typeof name!=='string'||!name.trim()||seen.has(id)){holds.push({officialCardId:id,reason:'INVALID_OR_DUPLICATE_ID'});continue}
    seen.add(id);
    const officialPageUrl=origin+'/card-search/details.php/card/'+id+'/regu/XY';
    try{
      const response=await fetcher(officialPageUrl,{redirect:'error',headers:{'Accept':'text/html'}});
      if(!response.ok||!String(response.headers.get('content-type')).includes('text/html'))throw Error('HTTP_OR_CONTENT_TYPE_'+response.status);
      const html=await response.text();
      const found=parseDetail(html,id,name);
      if(found.status==='CANDIDATE')cards.push({officialCardId:id,name,imageSourceUrl:found.imageSourceUrl,officialPageUrl,verified:false,reviewStatus:'PENDING_OFFICIAL_EVIDENCE_REVIEW'});
      else holds.push({officialCardId:id,name,reason:found.reason});
    }catch(e){holds.push({officialCardId:id,name,reason:'FETCH_ERROR_'+String(e.message).slice(0,80)})}
    await delay(3000);
  }
  return {schemaVersion:1,status:'CANDIDATES_ONLY_NOT_APPROVED',cards,holds};
}
async function main(){
  if(process.argv.length!==4)throw Error('usage: node collect-official-image-evidence.cjs candidates.json evidence.json');
  const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  if(!Array.isArray(source.candidates))throw Error('candidates array required');
  const result=await collect(source.candidates);
  fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({candidates:result.cards.length,hold:result.holds.length}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={parseDetail,collect};
,'i').test(u)))];
  // Exact ID embedded in official image filename is required; ambiguous images are held.
  if(matches.length!==1)return {status:'HOLD',reason:matches.length?'AMBIGUOUS_IMAGE':'NO_ID_MATCHED_IMAGE'};
  // A name must be visible in official detail HTML, not inferred from candidate data.
  if(!text.includes(name))return {status:'HOLD',reason:'CARD_NAME_NOT_IN_DETAIL'};
  return {status:'CANDIDATE',imageSourceUrl:matches[0]};
}
async function collect(candidates,fetcher=fetch){
  const cards=[],holds=[];
  const seen=new Set();
  for(const card of candidates){
    const id=String(card.officialCardId||''),name=card.name;
    if(!/^\d+$/.test(id)||typeof name!=='string'||!name.trim()||seen.has(id)){holds.push({officialCardId:id,reason:'INVALID_OR_DUPLICATE_ID'});continue}
    seen.add(id);
    const officialPageUrl=origin+'/card-search/details.php/card/'+id+'/regu/XY';
    try{
      const response=await fetcher(officialPageUrl,{redirect:'error',headers:{'Accept':'text/html'}});
      if(!response.ok||!String(response.headers.get('content-type')).includes('text/html'))throw Error('HTTP_OR_CONTENT_TYPE_'+response.status);
      const html=await response.text();
      const found=parseDetail(html,id,name);
      if(found.status==='CANDIDATE')cards.push({officialCardId:id,name,imageSourceUrl:found.imageSourceUrl,officialPageUrl,verified:false,reviewStatus:'PENDING_OFFICIAL_EVIDENCE_REVIEW'});
      else holds.push({officialCardId:id,name,reason:found.reason});
    }catch(e){holds.push({officialCardId:id,name,reason:'FETCH_ERROR_'+String(e.message).slice(0,80)})}
    await delay(3000);
  }
  return {schemaVersion:1,status:'CANDIDATES_ONLY_NOT_APPROVED',cards,holds};
}
async function main(){
  if(process.argv.length!==4)throw Error('usage: node collect-official-image-evidence.cjs candidates.json evidence.json');
  const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  if(!Array.isArray(source.candidates))throw Error('candidates array required');
  const result=await collect(source.candidates);
  fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({candidates:result.cards.length,hold:result.holds.length}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={parseDetail,collect};
,'i').test(u)))];
  // Exact ID embedded in official image filename is required; ambiguous images are held.
  if(matches.length!==1)return {status:'HOLD',reason:matches.length?'AMBIGUOUS_IMAGE':'NO_ID_MATCHED_IMAGE'};
  // A name must be visible in official detail HTML, not inferred from candidate data.
  if(!text.includes(name))return {status:'HOLD',reason:'CARD_NAME_NOT_IN_DETAIL'};
  return {status:'CANDIDATE',imageSourceUrl:matches[0]};
}
async function collect(candidates,fetcher=fetch){
  const cards=[],holds=[];
  const seen=new Set();
  for(const card of candidates){
    const id=String(card.officialCardId||''),name=card.name;
    if(!/^\d+$/.test(id)||typeof name!=='string'||!name.trim()||seen.has(id)){holds.push({officialCardId:id,reason:'INVALID_OR_DUPLICATE_ID'});continue}
    seen.add(id);
    const officialPageUrl=origin+'/card-search/details.php/card/'+id+'/regu/XY';
    try{
      const response=await fetcher(officialPageUrl,{redirect:'error',headers:{'Accept':'text/html'}});
      if(!response.ok||!String(response.headers.get('content-type')).includes('text/html'))throw Error('HTTP_OR_CONTENT_TYPE_'+response.status);
      const html=await response.text();
      const found=parseDetail(html,id,name);
      if(found.status==='CANDIDATE')cards.push({officialCardId:id,name,imageSourceUrl:found.imageSourceUrl,officialPageUrl,verified:false,reviewStatus:'PENDING_OFFICIAL_EVIDENCE_REVIEW'});
      else holds.push({officialCardId:id,name,reason:found.reason});
    }catch(e){holds.push({officialCardId:id,name,reason:'FETCH_ERROR_'+String(e.message).slice(0,80)})}
    await delay(3000);
  }
  return {schemaVersion:1,status:'CANDIDATES_ONLY_NOT_APPROVED',cards,holds};
}
async function main(){
  if(process.argv.length!==4)throw Error('usage: node collect-official-image-evidence.cjs candidates.json evidence.json');
  const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  if(!Array.isArray(source.candidates))throw Error('candidates array required');
  const result=await collect(source.candidates);
  fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({candidates:result.cards.length,hold:result.holds.length}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={parseDetail,collect};
