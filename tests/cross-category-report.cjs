'use strict';
// Collect stable, machine-readable outcomes for the cross-category regression suite.
// Exit nonzero if either test fails. Never auto-modify card data or approve a print.
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const suites = [
  {id:'reference-identity', file:'tests/cross-category-effect-gate.test.cjs'},
  {id:'effect-execution', file:'tests/reference-effects.test.cjs'}
];
const results = suites.map(({id,file})=>{
  const p = spawnSync(process.execPath,[file],{encoding:'utf8',maxBuffer:8*1024*1024});
  const output = [p.stdout||'',p.stderr||''].join('\n');
  const failed = p.status !== 0 || p.error;
  const category = !failed ? 'PASS'
    : /UNCONNECTED_EFFECT|unconnected effect/i.test(output) ? 'UNCONNECTED_EFFECT'
    : /reference|print|identity|adopt/i.test(output) ? 'REFERENCE_IDENTITY'
    : /AssertionError|ERR_ASSERTION/i.test(output) ? 'EFFECT_ASSERTION'
    : 'RUNNER_OR_UNKNOWN';
  process.stdout.write(output);
  return {id,file,status:failed?'FAIL':'PASS',failureCategory:category,
    exitCode:p.status,signal:p.signal||null,error:p.error?.message||null,
    excerpt:failed?output.slice(-6000):null};
});
const report={schemaVersion:1,kind:'cross-category-effect-regression',
  success:results.every(r=>r.status==='PASS'),results};
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync(path.join('test-results','cross-category-effects.json'),JSON.stringify(report,null,2)+'\n');
console.log('Report: test-results/cross-category-effects.json');
if(!report.success)process.exitCode=1;
