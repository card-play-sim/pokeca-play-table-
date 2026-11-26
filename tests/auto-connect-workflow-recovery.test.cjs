'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {selectIds}=require('../scripts/list-card-auto-connect-ids.cjs');
const catalog={records:[
 {officialCardId:'45001',regulationMark:'H',legality:'printed-hij'},
 {officialCardId:'50001',regulationMark:'J',legality:'printed-hij'},
 {officialCardId:'46001',regulationMark:'I',legality:'printed-hij'},
 {officialCardId:'50002',regulationMark:'J',legality:'printed-hij'},
 {officialCardId:'46001',regulationMark:'I',legality:'printed-hij'},
 {officialCardId:'50003',regulationMark:'J',legality:'printed-hij'},
 {officialCardId:'49abc',regulationMark:'J',legality:'printed-hij'},
 {officialCardId:'123',regulationMark:'J',legality:'printed-hij'},
 {officialCardId:'40001',regulationMark:'G',legality:'printed-hij'},
 {officialCardId:'50006',regulationMark:'J',legality:'unverified'}
]};
const selected=selectIds(catalog,new Set(['50002']));
assert.deepEqual(selected.ids,['50001','50003','46001','45001']);
assert.deepEqual(selected.invalid.map(x=>x.officialCardId),['49abc','123']);
assert(selected.ids.every(id=>/^[1-9][0-9]{3,7}$/.test(id)));
const workflow=fs.readFileSync('.github/workflows/continue-official-effects.yml','utf8');
assert.match(workflow,/issues: write/,'workflow must have permission to write a durable candidate handoff');
assert.match(workflow,/AUTO_CONNECT_CANDIDATE_READY/,'candidate must be handed off even if GitHub Actions PR creation is disabled');
assert.match(workflow,/gh api "repos\/\$GITHUB_REPOSITORY\/issues\/122\/comments"/,'fallback must use the existing issue');
assert.match(workflow,/if gh pr create --base main/,'PR create failure must not abort the candidate handoff');
assert.match(workflow,/node tests\/auto-connect-workflow-recovery.test.cjs/,'workflow must run this regression before official intake');
console.log('PASS: J/I-first validated official IDs and safe PR-disabled candidate handoff');
