'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const out=process.argv[2]||'reports/ij-effect-coverage.json';
const context={window:{}};
for(const file of ['deck-code-import','saved-decks'])vm.runInNewContext(fs.readFileSync('ui/'+file+'.js','utf8'),context);
const {PokecaDeckCodeImport:importer,PokecaSavedDecks:saved}=context.window;
const classification=read('data/deck-building/catalog.json');
const cards=importer.catalogFrom(read('data/official-image-registry.json'),read('data/reference-effects/catalog.json'),classification);
const compiled=read('data/effect-extensions/compiled.json');
const plans=saved.plansFrom(read('data/reference-effects/plans.json'),compiled);
const intake=read('data/official-effect-intake/checkpoint.json');
const ingested=new Map([...intake.records,...read('data/effect-extensions/intake.json').records].map(row=>[row.officialCardId,row]));
const blockers=new Map([...intake.blocked,...compiled.blocked].map(row=>[row.officialCardId,row]));
const executionFile=process.argv.slice(3).find(arg=>!arg.startsWith('--'));
const executions=executionFile?new Map(Object.entries(read(executionFile))):new Map();
const audit=saved.auditIJCoverage(cards,plans);
const report={schemaVersion:2,scope:'I_J_EXACT_PRINTS',completionGate:'BATTLE_EXECUTION_PASS_REQUIRED',audit,counts:{I:{},J:{}},playability:{I:{total:0,playable:0,incomplete:0},J:{total:0,playable:0,incomplete:0}},records:[]};
for(const [id,card] of cards){
  const mark=card.regulationMark;
  if(!Object.hasOwn(audit,mark))continue;
  const mismatch=saved.connectionError(id,card,plans.get(id));
  const blocker=blockers.get(id)?.reason;
  const source=ingested.get(id);
  const proof=source?.source?.path||blockers.get(id)?.evidencePath;
  let status='CONNECTED_UNTESTED',reason;
  if(!mismatch&&executions.has(id))status=executions.get(id)==='PASS'?'EXECUTION_PASS':'EXECUTION_FAIL';
  if(mismatch){
    reason=mismatch==='PRINT_IDENTITY_CONFLICT'?mismatch:blocker||mismatch;
    status=mismatch==='PRINT_IDENTITY_CONFLICT'?'IDENTITY_CONFLICT':
      /^UNSUPPORTED_.*EFFECT_PATTERN$/.test(blocker||'')?'MECHANIC_REQUIRED':
      source&&!blocker?'ENGINE_CONNECTION_REQUIRED':
      (proof?'EVIDENCE_UNVERIFIED':'EVIDENCE_MISSING');
  }
  report.counts[mark][status]=(report.counts[mark][status]||0)+1;
  report.playability[mark].total++;
  report.playability[mark][status==='EXECUTION_PASS'?'playable':'incomplete']++;
  report.records.push({id,name:card.name,mark,category:card.category,status,...(reason?{reason}:{}),...(proof?{proof}:{})});
}
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({audit,counts:report.counts,playability:report.playability}));
// --require-playable is the single end-to-end release gate; do not use for diagnostic-only CI.
if(process.argv.includes('--require-playable') && Object.values(report.playability).some(v=>v.incomplete)) {
  console.error('BATTLE_PLAYABILITY_INCOMPLETE: cards without verified battle execution remain');
  process.exitCode=1;
}
