'use strict';
// Inventory ALL default fixed-deck reference effects, not just hand-picked scenarios.
// This is a diagnostic report, never an approval of a print or effect.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const context={window:{},console,performance,setTimeout,Math};
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),context);
const engine=context.window.Pokeca;
const catalog=engine.getReferenceEffectCatalog();
const coverage=engine.getReferenceEffectCoverage();
const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json','utf8'));
const entries=manifest.decks.flatMap(d=>d.cards);
const unique=[...new Set(entries.map(x=>x.name))].sort();
assert.equal(catalog.adoptedDeckPrints,0,'unverified references must not be adopted');
assert.equal(unique.length,45);
const byName=new Map(coverage.defaults.map(x=>[x.name,x]));
assert.equal(byName.size,unique.length,'coverage must contain every fixed-deck name exactly once');
const counts={};
const blocked=[];
for(const name of unique){
 const item=entries.find(x=>x.name===name);
 const info=byName.get(name);
 assert(info,'missing effect coverage for '+name);
 assert.equal(String(info.officialCardId),String(catalog.defaultValidationReferences[name]),'coverage print mismatch: '+name);
 assert.equal(info.deckPrintAdopted,false,'unexpected print adoption: '+name);
 assert.equal(item.identityStatus,'UNCONFIRMED','unapproved identity: '+name);
 assert.equal(item.officialCardId,null,'unapproved official ID: '+name);
 assert(catalog.records.some(r=>r.deckName===name&&String(r.officialCardId)===String(info.officialCardId)),'untraceable reference: '+name);
 counts[item.category]=(counts[item.category]||0)+1;
 const problems=[...(info.unconnected||[])];
 if(info.mainConnected===false)problems.push('[main card effect]');
 if(problems.length)blocked.push({name,category:item.category,referenceOfficialCardId:info.officialCardId,unconnected:problems});
}
assert.equal(entries.reduce((sum,c)=>sum+c.count,0),120);
const report={schemaVersion:1,kind:'fixed-deck-effect-coverage',scope:'reference-only-not-official-adoption',
 physicalCards:entries.reduce((sum,c)=>sum+c.count,0),uniqueNames:unique.length,
 categories:counts,referencePrints:coverage.prints,officialPrintsAdopted:0,
 namesWithUnconnectedEffects:blocked.length,blocked};
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/fixed-deck-effect-coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({physicalCards:report.physicalCards,uniqueNames:report.uniqueNames,
 referencePrints:report.referencePrints,unconnectedNames:blocked.length,categories:counts}));
if(blocked.length)console.log('Unconnected reference effects retained as BLOCKED, not silently passed');
