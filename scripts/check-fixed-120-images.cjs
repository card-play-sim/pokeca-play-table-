#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const rules=require('../ui/official-image-validation.js');
const root=path.resolve(__dirname,'..');
// Offline registration coverage only. This never claims browser/device success.
function audit(source,data){
  const map=rules.index(data.cards),names=new Map();
  if(!Array.isArray(source?.decks)||source.decks.length!==2)throw Error('FIXED_DECK_SCHEMA');
  const deckTotals=[];
  for(const deck of source.decks){
    let total=0;
    for(const card of deck.cards){
      if(!Number.isInteger(card.count)||card.count<=0||typeof card.name!=='string'||!card.name.trim())throw Error('FIXED_CARD_SCHEMA');
      total+=card.count;
      const x=names.get(card.name)||{name:card.name,count:0,ids:new Set(),matched:new Set(),unconfirmed:0,missing:0};
      x.count+=card.count;
      if(card.officialCardId==null||card.identityStatus!=='CONFIRMED'||!card.set||!card.cardNumber)x.unconfirmed+=card.count;
      else{
        const id=String(card.officialCardId);x.ids.add(id);
        if(rules.matches(map.get(id),card))x.matched.add(id);else x.missing+=card.count;
      }
      names.set(card.name,x);
    }
    deckTotals.push(total);
  }
  const results=[...names.values()].map(x=>({name:x.name,count:x.count,officialPrintIds:[...x.ids],matchedOfficialPrintIds:[...x.matched],unconfirmedCount:x.unconfirmed,missingReferenceCount:x.missing,status:x.unconfirmed?'IDENTITY_UNCONFIRMED':x.missing?'IMAGE_REFERENCE_MISSING':'REGISTRY_READY'}));
  const total=deckTotals.reduce((a,b)=>a+b,0),ready=results.filter(x=>x.status==='REGISTRY_READY').length;
  const pass=deckTotals.every(n=>n===60)&&total===120&&results.length===45&&ready===45;
  return {inspection:'STATIC_REGISTRY_COVERAGE',totalCards:total,uniqueNames:results.length,registeredOfficialPrints:map.size,readyNames:ready,blockedNames:results.length-ready,remoteImageLoadVerified:false,androidChromeVerified:false,imageDisplayStatus:'NOT_VERIFIED',productionPass:false,pass,registryCoveragePass:pass,results};
}
if(require.main===module){
  const report=audit(JSON.parse(fs.readFileSync(path.join(root,'data/fixed-test-decks.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'data/official-image-registry.json'),'utf8')));
  console.log(JSON.stringify({...report,results:undefined},null,2));
  if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2)+'\n');
  if(!report.pass){console.error('FAIL: static registry coverage incomplete; browser image display is a separate inspection.');process.exitCode=1;}
}
module.exports={audit};
