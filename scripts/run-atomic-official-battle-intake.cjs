'use strict';
// The official page, its parsed effects, common plans, real engine execution,
// print-specific release and regression checks are ONE repeatable work unit.
// A fetch/compile success alone never finishes a card.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const work='work/card-auto-connect';
const idFile='/tmp/official-update-ids.json';
function commands({limit,base}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
    throw Error('INVALID_ATOMIC_BATCH_LIMIT');
  if (!/^[a-f0-9]{40}$/.test(base)) throw Error('INVALID_ATOMIC_BASE_SHA');
  return [
    ['SELECT_EXACT_OFFICIAL_PRINTS','node',['scripts/list-card-auto-connect-ids.cjs',idFile]],
    // Automatically repair outdated derived facts using the already saved,
    // hash-verified official HTML, before compiling or retrying the same cards.
    // The refresh helper never modifies any previously compiled print.
    ['VERIFY_OFFICIAL_FACT_REPAIR_CONTRACT','node',['tests/issue122-official-facts-refresh.test.cjs']],
    ['REPAIR_UNCOMPILED_FACTS_FROM_OFFICIAL_EVIDENCE','node',['scripts/refresh-uncompiled-official-facts.cjs','--apply']],
    ['FETCH_PARSE_AND_COMPILE_WITH_SHARED_ENGINE','python',[
      'scripts/continue-official-effect-intake.py','--limit',String(limit),
      '--adopt','--retry-transient','--ids',idFile,'--classification-only']],
    ['EXECUTE_ALL_CARD_EFFECTS_IN_REAL_ENGINE','node',[
      'scripts/stage-card-auto-connect.cjs',base,work]],
    // Restore the prior compiled artifact, not the official source evidence.
    // The rebuilt artifact contains only runtime-qualified new printings.
    ['RESTORE_BASE_RELEASE','git',['restore','--source=HEAD','--','data/effect-extensions/compiled.json']],
    ['COMPILE_ONLY_ENGINE_QUALIFIED_PRINTS','node',['scripts/build-effect-extensions.cjs']],
    ['BUNDLE_ACTUAL_SHARED_RUNTIME','node',['scripts/sync-reference-effects.cjs']],
    ['REPORT_EXACT_PRINT_COVERAGE','node',['scripts/report-ij-effect-coverage.cjs',
      'reports/ij-effect-coverage.json','reports/ij-effect-executions.json']],
    ['BUILD_PUBLIC_RELEASE','node',['scripts/build-pwa-release.cjs']],
    ['CREATE_REAL_BATTLE_VERIFICATION_FIXTURES','node',['scripts/build-intake-verification-fixtures.cjs']],
    // A fetched card that has no mechanic is not completed. It remains in the
    // SAME work ledger, with an exact-source shared-mechanic implementation group.
    ['RETAIN_UNRESOLVED_CARDS_IN_ATOMIC_WORK_UNIT','node',[
      'scripts/atomic-battle-connection-ledger.cjs',idFile,
      path.join(work,'candidate.json'),
      'reports/official-effect-continuation/atomic-battle-connection.json']],
    ...[
      'tests/control-013-continuation.test.cjs',
      'tests/control-014-shared-effects.test.cjs',
      'tests/control-014-official-parser.test.cjs',
      'tests/control-008-extensions.test.cjs',
      'tests/control-009-expansion.test.cjs',
      'tests/control-010-effects.test.cjs',
      'tests/control-011-engine-batch.test.cjs',
      'tests/atomic-official-to-battle.test.cjs'
    ].map(test=>['FULL_REGRESSION:'+test,'node',[test]]),
    ['CHECK_SHARED_RUNTIME_BUNDLE','node',['scripts/sync-reference-effects.cjs','--check']],
    ['CHECK_PUBLISHED_PWA_BUNDLE','node',['scripts/build-pwa-release.cjs','--check']]
  ];
}
function run(command,args,env) {
  const result=spawnSync(command,args,{stdio:'inherit',env});
  if (result.error) throw result.error;
  if (result.status!==0) throw Error('ATOMIC_BATTLE_STEP_FAILED '+command+' '+args.join(' ')+' EXIT '+result.status);
}
function main() {
  const limit=Number(process.env.INTAKE_LIMIT || '400');
  const rev=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
  if (rev.status!==0) throw Error('REPOSITORY_COMMIT_REQUIRED');
  const base=rev.stdout.trim();
  const steps=commands({limit,base});
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({scope:'ONE_OFFICIAL_CARD_TO_BATTLE_WORK_UNIT',
      steps:steps.map(([name,command,args])=>({name,command,args}))},null,2));
    return;
  }
  for (const [name,command,args] of steps) {
    console.log('ATOMIC_BATTLE_STEP_START '+name);
    const env={...process.env};
    if(name==='CREATE_REAL_BATTLE_VERIFICATION_FIXTURES') {
      env.POKECA_INTAKE_RELEASE_BASE=base;
      env.POKECA_INTAKE_PREFIX=work+'/browser';
    }
    if(name==='EXECUTE_ALL_CARD_EFFECTS_IN_REAL_ENGINE'&&env.POKECA_INTAKE_REQUESTED_TARGETS){
      const fs=require('node:fs');
      const requested=env.POKECA_INTAKE_REQUESTED_TARGETS.split(',');
      if(new Set(requested).size!==requested.length||requested.some(id=>!/^[1-9][0-9]{0,7}$/.test(id)))throw Error('INVALID_REQUESTED_TARGETS');
      const compiled='data/effect-extensions/compiled.json';
      const prior=spawnSync('git',['show',base+':'+compiled],{encoding:'utf8',maxBuffer:64*1024*1024});
      if(prior.status!==0)throw Error('BASE_COMPILED_UNAVAILABLE');
      const old=new Set(JSON.parse(prior.stdout).records.map(r=>String(r.officialCardId)));
      const available=new Set(JSON.parse(fs.readFileSync(compiled,'utf8')).records.map(r=>String(r.officialCardId)).filter(id=>!old.has(id)));
      const selected=requested.filter(id=>available.has(id));
      const unresolved=requested.filter(id=>!old.has(id)&&!available.has(id));
      fs.mkdirSync(work,{recursive:true});
      fs.writeFileSync(work+'/requested-scope.json',JSON.stringify({base,requested,selected,unresolved,alreadyPublished:requested.filter(id=>old.has(id))},null,2));
      console.log('EXACT_SCOPE_CLASSIFICATION '+JSON.stringify({selected,unresolved}));
      if(!selected.length)throw Error('NO_REQUESTED_TARGET_COMPILED');
      env.POKECA_INTAKE_EXACT_TARGETS=selected.join(',');
    }
    run(command,args,env);
    console.log('ATOMIC_BATTLE_STEP_PASS '+name);
  }
  console.log('ATOMIC_BATTLE_INTAKE_COMPLETE: verified release candidate and unresolved mechanic work remain linked; published gameplay pending');
}
if(require.main===module)main();
module.exports={commands};
