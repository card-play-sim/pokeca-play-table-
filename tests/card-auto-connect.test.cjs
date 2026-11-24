'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const B=require('../scripts/lib/shared-effect-batch.cjs');
const {requiredSlots,allExecuted}=require('../scripts/stage-card-auto-connect.cjs');
const attack={name:'ワザ',text:'公式テキスト'};
const ability={name:'特性',text:'もう一つの公式テキスト'};
const record={officialCardId:'12345',category:'pokemon',attacks:[attack],abilities:[ability]};
const slots=requiredSlots(record), results=new Map([[B.slot(slots[0]),'SUCCEEDED']]);
assert(!allExecuted(slots,results));
results.set(B.slot(slots[1]),'FAILED');
assert(!allExecuted(slots,results));
results.set(B.slot(slots[1]),'SUCCEEDED');
assert(allExecuted(slots,results));
assert(!allExecuted(requiredSlots({...record,attacks:[{...attack,text:''}]}),results));
assert(!allExecuted([],results));
const worker = require('../scripts/lib/shared-effect-engine-worker.cjs');
const printedRecord = require('../data/effect-extensions/compiled.json').records
  .find(row => row.officialCardId === '44454');
const printedSlot = requiredSlots(printedRecord).find(slot => slot.printedDamage === '20');
assert.equal(worker.verifyPrintedDamage(printedSlot).status, 'SUCCEEDED');
assert.equal(worker.verifyPrintedDamage({...printedSlot, printedDamage:'30'}).status, 'BLOCKED');
assert(!allExecuted([{...printedSlot, printedDamage:undefined}],new Map([[B.slot(printedSlot),'SUCCEEDED']])));
const {compile} = require('../engine/reference-effect-plans.cjs');
const [coinProof] = require('../data/effect-extensions/intake.json').records
  .filter(row => row.attacks.some(effect => /コインを1回投げオモテなら、\d+ダメージ追加。/.test(effect.text)));
const coinAttack = coinProof.attacks.find(effect => /コインを1回投げオモテなら、\d+ダメージ追加。/.test(effect.text));
const makePlan = attack => compile({records:[{...coinProof,attacks:[attack]}]}).records[0].attacks[0].plan;
const coinPlan = makePlan(coinAttack);
assert.equal(coinPlan.mechanic,'COIN_BONUS_DAMAGE');
assert.equal(coinPlan.base,Number.parseInt(coinAttack.damage,10));
assert.equal(makePlan({...coinAttack,damage:'20×'}),null);
assert.equal(makePlan({...coinAttack,text:coinAttack.text+'自分の山札を1枚引く。'}),null);
const workflow=fs.readFileSync('.github/workflows/continue-official-effects.yml','utf8');
assert.match(workflow,/comment\.user\.login == github\.repository_owner/);
assert.match(workflow,/comment\.body == '\/card-auto-connect'/);
// The default source is main; only the named isolated Work replay may
// checkout its immutable triggering commit. No arbitrary dispatch input.
const checkoutRef=workflow.match(/^\s*ref:\s*(.+)$/m)?.[1].trim();
const workRef="work/issue122-next-782-replay";
const isolatedRef="$"+"{{ github.ref_name == '"+workRef+"' && github.sha || 'main' }}";
assert(checkoutRef==='main'||checkoutRef===isolatedRef,"unsafe automatic intake checkout source");
if(checkoutRef===isolatedRef){
 assert.match(workflow,/branches: \[main, work\/issue122-next-782-replay\]/);
 assert.match(workflow,/git checkout -B "\$INTAKE_BRANCH" origin\/main/);
 assert.match(workflow,/git push -u origin "\$INTAKE_BRANCH"/);
 assert.doesNotMatch(workflow,/git push[^\n]*\b(?:HEAD:main|origin main)\b/);
}
console.log('Automatic update gate rejects incomplete print execution and restricts the connector trigger.');
