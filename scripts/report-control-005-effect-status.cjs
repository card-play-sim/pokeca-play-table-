'use strict';
// Reference execution and adopted-print verification are deliberately separate.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const c={window:{},performance,console,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),c);
const S=vm.runInNewContext(fs.readFileSync('tests/fixtures/control-005-scenarios.js','utf8'),{console});
const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json')),inventory=S.inventory(c.window.Pokeca,manifest);
const evidence=JSON.parse(fs.readFileSync('test-results/control-005-node.json'));
const effects=inventory.map(row=>{
 const cases=evidence.results.filter(r=>r.effectId===row.effectId),causes=[];
 if(row.locations.some(l=>!l.officialCardId||l.identityStatus!=='CONFIRMED'))causes.push('DECK_PRINT_BINDING_UNCONFIRMED');
 const textEvidenceKind=row.text?'OFFICIAL_EFFECT_TEXT':row.plan?.mechanic==='VANILLA_DAMAGE'&&/^\d+$/.test(row.damage||'')?'PRINTED_DAMAGE_WITHOUT_EFFECT_BODY':row.plan?.mechanic==='BASIC_ENERGY'?'BASIC_ENERGY_WITHOUT_EFFECT_BODY':'MISSING_EFFECT_TEXT';
 if(!row.source||!row.officialPageUrl||textEvidenceKind==='MISSING_EFFECT_TEXT')causes.push('OFFICIAL_TEXT_PROVENANCE_INCOMPLETE');
 for(const x of cases.filter(r=>r.status==='BLOCKED'))causes.push(x.cause.blocked);
 // Controlled primary-operation tests do not prove complete passive/trigger/AI/DOM coverage.
 const remaining=['CONTINUOUS_AND_TRIGGER_LIFECYCLE_COVERAGE_PENDING','PUBLIC_DOM_PER_EFFECT_COVERAGE_PENDING','AI_UI_PARITY_PER_EFFECT_PENDING'];
 const failed=cases.some(r=>r.status==='FAILED');
 // Execution is independent of provenance: an unconfirmed print does not
 // erase a passing controlled reference run, and a missing run is not PASS.
 const executionStatus=failed?'FAILED':!cases.length?'NOT_TESTED':cases.some(r=>r.status==='BLOCKED')?'BLOCKED':cases.every(r=>r.status==='VERIFIED'||r.status==='PASS')?'PASSED':'INCOMPLETE';
 return {...row,executionStatus,textEvidenceKind,officialTextSha256:crypto.createHash('sha256').update(row.text||'').digest('hex'),status:failed?'FAILED':causes.length?'BLOCKED':'NOT_IMPLEMENTED',causes:[...new Set(causes)],remaining,referenceExecution:{scope:'controlled-primary-operation-only',cases},physicalAndroidVerified:false};
});
const counts=Object.fromEntries(['VERIFIED','FAILED','BLOCKED','NOT_IMPLEMENTED'].map(k=>[k,effects.filter(e=>e.status===k).length]));
// Distinguish print-identity blockers from effect execution failures. A preview
// image or name match must never be promoted into an adopted official print.
const executionCounts=Object.fromEntries(['PASSED','FAILED','BLOCKED','NOT_TESTED','INCOMPLETE'].map(k=>[k,effects.filter(e=>e.executionStatus===k).length]));
const blockerCounts={};
for(const effect of effects)for(const cause of effect.causes)blockerCounts[cause]=(blockerCounts[cause]||0)+1;
const unconfirmedPrintCopies=manifest.decks.reduce((total,deck)=>total+deck.cards.reduce((n,card)=>n+((card.identityStatus==='CONFIRMED'&&card.officialCardId&&card.set&&card.cardNumber)?0:card.count),0),0);
const report={executionCounts,blockerCounts,unconfirmedPrintCopies,schemaVersion:1,scope:'fixed-120-effects',complete:counts.VERIFIED===effects.length,physicalCards:manifest.decks.reduce((n,d)=>n+d.cards.reduce((a,c)=>a+c.count,0),0),names:new Set(effects.map(e=>e.cardName)).size,effectSlots:effects.length,counts,protectedFiles:{'data/fixed-test-decks.json':crypto.createHash('sha256').update(fs.readFileSync('data/fixed-test-decks.json')).digest('hex')},effects};
fs.writeFileSync('test-results/control-005-effect-status.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({physicalCards:report.physicalCards,names:report.names,effectSlots:report.effectSlots,counts,executionCounts,blockerCounts,unconfirmedPrintCopies,complete:report.complete}));
if(counts.FAILED)process.exitCode=1;
