#!/usr/bin/env node
'use strict';
// Name search is reference discovery, never evidence of a deck's selected print.
const fs=require('node:fs'),path=require('node:path');
const rules=require('../ui/official-image-validation.js');
function audit(manifest,registry,searches,formal){
 const byId=rules.index(registry.cards),byName=new Map();
 for(const deck of manifest.decks)for(const card of deck.cards){
  const row=byName.get(card.name)||{name:card.name,count:0,deckEntries:[]};
  row.count+=card.count;row.deckEntries.push({deckId:deck.id,count:card.count,officialCardId:card.officialCardId,set:card.set??null,cardNumber:card.cardNumber??null,identityStatus:card.identityStatus});byName.set(card.name,row);
 }
 const rows=[...byName.values()].map(row=>{
  const search=searches.find(s=>s.name===row.name),references=registry.cards.filter(r=>r.name===row.name);
  const found=search?.response?.cardList?.filter(c=>c.cardNameAltText===row.name)||[];
  const adopted=row.deckEntries.every(c=>c.identityStatus==='CONFIRMED'&&c.officialCardId!=null&&c.set&&c.cardNumber&&rules.matches(byId.get(String(c.officialCardId)),{...c,name:row.name}));
  return {...row,status:adopted?'CONFIRMED':'HOLD_DECK_PRINT_SOURCE_MISSING',sourceNameMatched:found.length>0,
   officialSearch:search?{url:search.officialSearchUrl,scope:search.response.regulation,firstPageExactIds:found.map(c=>c.cardID),pages:search.response.maxPage,paginationComplete:search.response.maxPage===1}:null,
   formalExtractCandidateIds:formal.candidates.find(c=>c.name===row.name)?.officialCardIds||[],
   verifiedReferencePrints:references.filter(r=>r.set&&r.cardNumber&&r.detailSha256).map(r=>({officialCardId:r.officialCardId,set:r.set,cardNumber:r.cardNumber,imageSourceUrl:r.imageSourceUrl,officialPageUrl:r.officialPageUrl,detailSha256:r.detailSha256})),
   reason:adopted?null:'A name-only deck row does not identify its print; search results and equivalent card text cannot select an edition.'};
 });
 const total=rows.reduce((n,r)=>n+r.count,0),confirmed=rows.filter(r=>r.status==='CONFIRMED').reduce((n,r)=>n+r.count,0);
 return {schemaVersion:1,totalCards:total,uniqueNames:rows.length,confirmedCopies:confirmed,pendingCopies:total-confirmed,pass:total===120&&rows.length===45&&confirmed===120,
  formalDatabase:{originalAvailable:false,expectedRecords:1945,availableSource:'data/fixed-deck-formal-1945-pokemon-candidates.json (candidate extract only)',modified:false},
  sourceLimitation:'The original ZIP/catalog and an edition-specific deck export, set/number list or deck-code binding are absent from the available workspace and connected repositories.',rows};
}
if(require.main===module){
 const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
 const searches=fs.readdirSync(path.join(root,'data/fixed-deck-search-evidence')).filter(f=>f.endsWith('.json')).map(f=>read('data/fixed-deck-search-evidence/'+f));
 const report=audit(read('data/fixed-test-decks.json'),read('data/official-image-registry.json'),searches,read('data/fixed-deck-formal-1945-pokemon-candidates.json'));
 fs.writeFileSync(path.join(root,'data/fixed-120-print-resolution.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({confirmed:report.confirmedCopies,pending:report.pendingCopies,pass:report.pass}));if(!report.pass)process.exitCode=2;
}
module.exports={audit};
