#!/usr/bin/env node
'use strict';
// Collect official image references from official detail pages for already-known print IDs.
// This never guesses a card ID, invents a filename, or changes the formal card database.
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const registry=JSON.parse(fs.readFileSync(path.join(root,'data/official-image-registry.json'),'utf8'));
const fixed=JSON.parse(fs.readFileSync(path.join(root,'data/fixed-test-decks.json'),'utf8'));
const names=new Set(fixed.decks.flatMap(d=>d.cards.map(c=>c.name)));
const cards=registry.cards.filter(c=>names.has(c.name));
const out={schemaVersion:1,source:'official_detail_page',cards:[],rejected:[]};
const decode=s=>s.replace(/&amp;/g,'&');
for(const c of cards){
  const id=String(c.officialCardId);
  const page='https://www.pokemon-card.com/card-search/details.php/card/'+id;
  try{
    const response=await fetch(page,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const html=await response.text();
    const urls=[...new Set([...html.matchAll(/(?:https?:\\/\\/www\\.pokemon-card\\.com)?\\/assets\\/images\\/card_images\\/(?:large|small)\\/[^"'\\s<>]+?\\.(?:jpg|jpeg|png|webp)/gi)].map(m=>decode(m[0]).replace(/^\\//,'https://www.pokemon-card.com/')))];
    const exact=urls.filter(u=>u.includes(id.padStart(6,'0')+'_')||u.includes('/'+id+'_'));
    if(!exact.includes(c.imageSourceUrl))throw Error('Registry URL not evidenced in official detail HTML');
    out.cards.push({officialCardId:id,name:c.name,officialCardPageUrl:page,imageSourceUrl:c.imageSourceUrl,evidence:'EXACT_URL_IN_OFFICIAL_HTML'});
  }catch(e){out.rejected.push({officialCardId:id,name:c.name,reason:String(e)});}
}
fs.writeFileSync(path.join(root,'data/official-image-page-evidence.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({checked:cards.length,verified:out.cards.length,rejected:out.rejected.length}));
if(out.rejected.length)process.exitCode=1;
