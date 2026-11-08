#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const rules=require('../ui/official-image-validation.js');
function mergeReviewed(registry,candidates){
  if(!Array.isArray(candidates?.cards))throw Error('Expected cards arrays');
  const existing=rules.index(registry.cards);let added=0;
  for(const raw of candidates.cards){
    const c=rules.validate(raw);
    if(!c.officialCardPageUrl&&!c.officialPageUrl)throw Error('Missing official card page evidence '+c.officialCardId);
    const old=existing.get(c.officialCardId);
    existing.set(c.officialCardId,old?rules.merge(old,c):c);
    if(!old)added++;
  }
  return {registry:{...registry,cards:[...existing.values()]},added};
}
function main(){
  const root=path.resolve(__dirname,'..'),file=path.join(root,'data/official-image-registry.json');
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
  const candidates=read(path.join(root,'data/official-image-candidates-reviewed.json'));
  const result=mergeReviewed(read(file),candidates);
  // Validate the complete batch before writing any output.
  fs.writeFileSync(file,JSON.stringify(result.registry,null,2)+'\n');
  fs.writeFileSync(path.join(root,'data/official-image-registry-audit.json'),JSON.stringify({registered:result.registry.cards.length,added:result.added,reviewed:candidates.cards.length,unverifiedRemoteImageLoads:true,generatedAt:new Date().toISOString()},null,2)+'\n');
  console.log('Image registry: '+result.registry.cards.length+' records, '+result.added+' added. Browser image loads not yet verified.');
}
if(require.main===module)main();
module.exports={mergeReviewed};
