#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const registryPath=path.join(root,'data/official-image-registry.json');
const candidatePath=path.join(root,'data/official-image-candidates-reviewed.json');
const outputPath=path.join(root,'data/official-image-registry-audit.json');
const prefix='https://www.pokemon-card.com/assets/images/card_images/';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function validate(c,source){
  if(!c||typeof c!=='object'||Array.isArray(c))throw Error(source+': invalid entry');
  const id=String(c.officialCardId??'');
  const name=c.name, url=c.imageSourceUrl;
  if(!/^\d+$/.test(id)||typeof name!=='string'||!name.trim()||typeof url!=='string'||!url.startsWith(prefix)||!/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(url))throw Error(source+': invalid official evidence '+id);
  return {officialCardId:id,name,imageSourceUrl:url};
}
const registry=read(registryPath);
const candidates=read(candidatePath);
if(!Array.isArray(registry.cards)||!Array.isArray(candidates.cards))throw Error('Expected cards arrays');
const existing=new Map();
for(const raw of registry.cards){
  const c=validate(raw,'registry'),old=existing.get(c.officialCardId);
  if(old&&(old.name!==c.name||old.imageSourceUrl!==c.imageSourceUrl))throw Error('Registry conflict '+c.officialCardId);
  existing.set(c.officialCardId,c);
}
const seen=new Map();let added=0;
for(const raw of candidates.cards){
  const c=validate(raw,'reviewed candidates');
  if(typeof raw.officialCardPageUrl!=='string'||!/^https:\/\/www\.pokemon-card\.com\/card-search\/details\.php(?:\/card\/\d+|\?card_id=\d+)$/.test(raw.officialCardPageUrl))throw Error('Missing official card page evidence '+c.officialCardId);
  const pageUrl=new URL(raw.officialCardPageUrl);const pageId=pageUrl.searchParams.get('card_id')||pageUrl.pathname.match(/\/card\/(\d+)$/)?.[1];
  if(pageId!==c.officialCardId)throw Error('Card page ID mismatch '+c.officialCardId);
  const prev=seen.get(c.officialCardId)||existing.get(c.officialCardId);
  if(prev&&(prev.name!==c.name||prev.imageSourceUrl!==c.imageSourceUrl))throw Error('Image identity conflict '+c.officialCardId);
  seen.set(c.officialCardId,c);
  if(!existing.has(c.officialCardId)){existing.set(c.officialCardId,c);added++;}
}
registry.cards=[...existing.values()];
fs.writeFileSync(registryPath,JSON.stringify(registry,null,2)+'\n');
fs.writeFileSync(outputPath,JSON.stringify({registered:registry.cards.length,added,reviewed:candidates.cards.length,unverifiedRemoteImageLoads:true,generatedAt:new Date().toISOString()},null,2)+'\n');
console.log('Image registry: '+registry.cards.length+' records, '+added+' added. Browser image loads not yet verified.');
