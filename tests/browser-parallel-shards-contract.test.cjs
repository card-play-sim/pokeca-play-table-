'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const workflow=fs.readFileSync('.github/workflows/g-base-008-ui-contract.yml','utf8');
const browser=fs.readFileSync('tests/test_control_013_browser.py','utf8');
const start=workflow.indexOf('  chromium-suites:\n');
const finish=workflow.indexOf('  installed-pwa-upgrade:\n');
assert(start>=0&&finish>start,'all candidates must use the parallel browser job');
const section=workflow.slice(start,finish);
const tests=[
 'test_shared_operation_browser.py',
 'test_control_014_browser.py',
 'test_control_013_browser.py',
 'test_control_010_browser.py',
 'test_control_009_browser.py',
 'test_control_008_extensions_browser.py',
 'test_control_006_browser.py',
 'test_ui_control_008_browser.py',
 'test_control_002_browser.py',
 'test_g_base_008_browser.py',
 'test_reference_match_browser.py',
 'test_published_pwa_browser.py',
 'test_release_delivery_browser.py'
];
for(const script of tests){
 const count=section.split('python tests/'+script).length-1;
 assert.equal(count,1,'every historic Chromium regression must run exactly once per partition: '+script);
}
assert.match(section,/matrix:\s*shard:\s*\[0, 1, 2, 3, 4, 5, 6, 7\]/);
assert.match(section,/shard" -lt 4/);
assert.match(section,/chromium-gameplay:\s*needs: \[chromium-suites\]/);
assert.match(section,/test "\$RESULT" = "success"/);
assert.match(section,/candidate-gameplay-evidence-shard-/);
assert.match(browser,/POKECA_BROWSER_SHARD_COUNT/);
assert.match(browser,/POKECA_BROWSER_SHARD_INDEX/);
assert.match(browser,/enumerate\(fixtures\) if index%shard_count==shard_index/);
for(let count=1;count<=16;count++)for(const size of [0,1,8,75,166,5073]){
 const seen=new Set();
 for(let shard=0;shard<count;shard++)for(let i=0;i<size;i++)if(i%count===shard){
  assert(!seen.has(i),'overlapping official effect slot');seen.add(i);
 }
 assert.equal(seen.size,size,'coverage cannot be dropped from any batch size');
}
console.log('PASS: all thirteen browser suites preserved; every indexed slot executed once');
