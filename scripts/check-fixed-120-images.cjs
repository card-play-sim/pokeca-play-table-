#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const decks=JSON.parse(fs.readFileSync(path.join(root,'data/fixed-test-decks.json'),'utf8')).decks;
const registry=JSON.parse(fs.readFileSync(path.join(root,'data/official-image-registry.json'),'utf8')).cards;
const map=new Map(registry.map(c=>[String(c.officialCardId),c]));
const names=new Map();
for(const deck of decks)for(const card of deck.cards){const x=names.get(card.name)||{name:card.name,count:0,ids:new Set(),unconfirmed:0};x.count+=card.count;if(card.officialCardId==null)x.unconfirmed+=card.count;else x.ids.add(String(card.officialCardId));names.set(card.name,x);}
const results=[...names.values()].map(x=>{const ids=[...x.ids],matched=ids.filter(id=>map.get(id)?.name===x.name);return {name:x.name,count:x.count,officialPrintIds:ids,matchedOfficialPrintIds:matched,unconfirmedCount:x.unconfirmed,status:x.unconfirmed?'IDENTITY_UNCONFIRMED':matched.length===ids.length?'REGISTRY_READY':'IMAGE_REFERENCE_MISSING'};});
const total=decks.reduce((n,d)=>n+d.cards.reduce((m,c)=>m+c.count,0),0);
const ready=results.filter(x=>x.status==='REGISTRY_READY').length;
const report={totalCards:total,uniqueNames:results.length,registeredOfficialPrints:registry.length,readyNames:ready,blockedNames:results.length-ready,remoteImageLoadVerified:false,androidChromeVerified:false,pass:false,registryCoveragePass:total===120&&results.length===45&&ready===45,results};
console.log(JSON.stringify({...report,results:undefined},null,2));
if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2)+'\n');
if(!report.pass){console.error('FAIL: 120 official card images are not verified in Android Chrome; identity and image registry must be completed.');process.exitCode=1;}
