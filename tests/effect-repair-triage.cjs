'use strict';
// Produce bounded, reviewable repair guidance from regression diagnostics.
// Never generate patches, change approved card data, or claim a verified effect.
const fs=require('node:fs');
const path=require('node:path');
const source=process.argv[2]||'test-results/cross-category-effects.json';
const target='test-results/effect-repair-triage.json';
const allowed={
  REFERENCE_IDENTITY:{owner:'card-reference-integration',next:'Verify saved official evidence and exact print tuple; do not adopt a print automatically.',scope:['data/fixed-test-decks.json','reference catalog']},
  UNCONNECTED_EFFECT:{owner:'shared-effect-command-integration',next:'Locate missing verified Effect Command or Rule Engine connection; keep unknown prints fail-closed.',scope:['effect command bridge','reference runtime']},
  EFFECT_ASSERTION:{owner:'shared-rule-engine',next:'Reproduce the failing scenario and inspect common rule order, state transitions, and action legality.',scope:['shared effect executor','rule engine','regression fixtures']},
  RUNNER_OR_UNKNOWN:{owner:'test-infrastructure',next:'Inspect runner error, dependencies and full CI logs before touching effect code.',scope:['test runner','CI configuration']}
};
const report=JSON.parse(fs.readFileSync(source,'utf8'));
if(report.schemaVersion!==1||!Array.isArray(report.results)||report.results.length===0||
 report.results.some(x=>!x||typeof x.id!=='string'||!['PASS','FAIL'].includes(x.status))||
 (report.success===false&&!report.results.some(x=>x.status==='FAIL'))||
 (report.success===true&&report.results.some(x=>x.status==='FAIL')))
 throw Error('Invalid or inconsistent diagnostics: fail closed');
const expectedSuites=new Set(['reference-identity','effect-execution']);
const observed=report.results.map(x=>x.id);
if(observed.length!==expectedSuites.size||new Set(observed).size!==observed.length||
 observed.some(id=>!expectedSuites.has(id))||
 report.success!==report.results.every(x=>x.status==='PASS'))
 throw Error('Missing, duplicated or inconsistent effect suites: fail closed');
const failures=report.results.filter(x=>x.status==='FAIL');
const groups={};
for(const failure of failures){
 const category=allowed[failure.failureCategory]?failure.failureCategory:'RUNNER_OR_UNKNOWN';
 const group=groups[category]||(groups[category]={category,...allowed[category],suiteIds:[],excerpts:[]});
 group.suiteIds.push(failure.id);
 if(failure.excerpt)group.excerpts.push(String(failure.excerpt).slice(-1500));
}
const triage={schemaVersion:1,kind:'effect-repair-triage',source,
 safeToAutoMerge:false,officialCardDataEditable:false,
 status:failures.length?'REVIEW_REQUIRED':'NO_FAILURES',
 groups:Object.values(groups)};
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify(triage,null,2)+'\n');
console.log('Triage: '+target+' ('+triage.status+')');
