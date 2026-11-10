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
const referenceIds=new Set();
const provenanceKinds={};
const evidenceProblems=[];
for(const record of catalog.records){
 const id=String(record.officialCardId);
 assert(/^\d+$/.test(id),'invalid reference official ID');
 assert(!referenceIds.has(id),'duplicate reference official ID: '+id);
 referenceIds.add(id);
 assert(/^https:\/\/www\.pokemon-card\.com\/card-search\/details\.php\/card\/\d+(?:\/|$)/.test(record.officialPageUrl),'invalid official page URL: '+id);
 const src=record.source||{};
 provenanceKinds[src.kind||'MISSING']=(provenanceKinds[src.kind||'MISSING']||0)+1;
 if(!src.path||!(/^[a-f0-9]{64}$/).test(src.sha256||''))
  evidenceProblems.push({officialCardId:id,name:record.deckName,problem:'MISSING_SOURCE_PATH_OR_HASH'});
 for(const effect of [...(record.attacks||[]),...(record.abilities||[]),record.mainPlan].filter(Boolean)){
  const plan=effect.plan||(effect.mechanic?effect:null);
  if(plan)assert(typeof plan.mechanic==='string'&&plan.mechanic.length>0&&
   Array.isArray(plan.commands)&&plan.commands.length>0&&plan.commands.every(cmd=>typeof cmd==='string'&&cmd.length>0),
   'invalid effect command contract for '+id);
 }
}
assert.equal(referenceIds.size,coverage.prints,'reference print coverage mismatch');
const allPrintGaps=catalog.records.flatMap(record=>{
 const gaps=[...(record.attacks||[]),...(record.abilities||[])].filter(effect=>!effect.plan).map(effect=>effect.name);
 if(record.category!=='pokemon'&&!record.mainPlan)gaps.push('[main card effect]');
 return gaps.length?[{name:record.deckName,officialCardId:record.officialCardId,
  category:record.category,defaultReference:String(catalog.defaultValidationReferences[record.deckName])===String(record.officialCardId),unconnected:gaps}]:[];
});
const report={schemaVersion:1,kind:'fixed-deck-effect-coverage',scope:'reference-only-not-official-adoption',
 physicalCards:entries.reduce((sum,c)=>sum+c.count,0),uniqueNames:unique.length,
 categories:counts,referencePrints:coverage.prints,officialPrintsAdopted:0,
 namesWithUnconnectedEffects:blocked.length,blocked,
 referencePrintsWithUnconnectedEffects:allPrintGaps.length,allPrintGaps,
 provenanceKinds,evidenceProblems};
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/fixed-deck-effect-coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({physicalCards:report.physicalCards,uniqueNames:report.uniqueNames,
 referencePrints:report.referencePrints,unconnectedNames:blocked.length,categories:counts}));
assert.equal(evidenceProblems.length,0,'missing source evidence metadata');
assert(allPrintGaps.length<=11,'new unconnected reference effects exceed known baseline of 11');
if(allPrintGaps.length)console.log('Unconnected non-default reference effects retained as BLOCKED, not silently passed');
