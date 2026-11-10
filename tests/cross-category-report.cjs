'use strict';
// Collect stable, machine-readable outcomes for the cross-category regression suite.
// Exit nonzero if either test fails. Never auto-modify card data or approve a print.
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const timeoutMs=Number(process.env.EFFECT_SUITE_TIMEOUT_MS||120000);
if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>600000) throw Error('Invalid EFFECT_SUITE_TIMEOUT_MS');
const suites = [
  {id:'reference-identity', file:'tests/cross-category-effect-gate.test.cjs'},
  {id:'effect-execution', file:'tests/reference-effects.test.cjs'}
];
const results = suites.map(({id,file})=>{
  const p = spawnSync(process.execPath,[file],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:timeoutMs});
  const output = [p.stdout||'',p.stderr||''].join('\n');
  const failed = p.status !== 0 || Boolean(p.error);
  const category = !failed ? 'PASS'
    : /UNCONNECTED_EFFECT|unconnected effect/i.test(output) ? 'UNCONNECTED_EFFECT'
    : /AssertionError|ERR_ASSERTION/i.test(output) ? 'EFFECT_ASSERTION'
    : /unverified print|unapproved printing|identityStatus|officialCardId|reference is not traceable|no default reference|adoptedDeckPrints/i.test(output) ? 'REFERENCE_IDENTITY'
    : 'RUNNER_OR_UNKNOWN';
  process.stdout.write(output);
  return {id,file,status:failed?'FAIL':'PASS',failureCategory:category,timeoutMs,
    exitCode:p.status,signal:p.signal||null,error:p.error?.message||null,
    excerpt:failed?output.slice(-6000):null};
});
const report={schemaVersion:1,kind:'cross-category-effect-regression',
  success:results.every(r=>r.status==='PASS'),results};
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync(path.join('test-results','cross-category-effects.json'),JSON.stringify(report,null,2)+'\n');
console.log('Report: test-results/cross-category-effects.json');
if(!report.success)process.exitCode=1;
