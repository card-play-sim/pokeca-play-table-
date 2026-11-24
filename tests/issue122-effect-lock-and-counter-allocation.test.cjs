'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {parse} = require('../scripts/parse-official-pokemon-energy.cjs');
const {compile} = require('../engine/reference-effect-plans.cjs');
const sha = html => crypto.createHash('sha256').update(html).digest('hex');

function officialPrint(id) {
 const evidence=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));
 assert.equal(sha(evidence.html),evidence.htmlSha256,'official HTML digest for '+id);
 const parsed=parse(evidence.html);
 return {officialCardId:id,...parsed};
}
function compiled(row) {return compile({records:[row]}).records[0];}

const fire=officialPrint('45158'); // Official printed ex, 260-damage "れっかばくしん"
const attack=compiled(fire).attacks.find(a=>a.name==='れっかばくしん');
assert(attack,'official named attack');
assert.equal(attack.damage,'260');
assert.deepEqual(attack.plan,{
 mechanic:'ATTACK_LOCK_UNTIL_SWITCH',
 commands:['DAMAGE','ADD_STATE'],
 attackName:'れっかばくしん'
});
// Text alone must not authorize this effect for a DIFFERENT named attack.
const forged={...fire,attacks:fire.attacks.map(a=>a.name==='れっかばくしん'?{...a,name:'別のワザ'}:a)};
assert.equal(compiled(forged).attacks.find(a=>a.name==='別のワザ').plan,null);
const modified={...fire,attacks:fire.attacks.map(a=>a.name==='れっかばくしん'?{...a,text:a.text.replace('バトル場をはなれるまで','次の自分の番')}:a)};
assert.equal(compiled(modified).attacks.find(a=>a.name==='れっかばくしん').plan,null);

// Generalized bench counter allocations use the ACTUAL printed number;
// this official print calls for TWO counters, not the earlier hardcoded six.
const shadow=officialPrint('47494');
const phantom=compiled(shadow).attacks.find(a=>a.name==='たたりとばす');
assert(phantom,'official 90-damage printed attack');
assert.equal(phantom.damage,'90');
assert.equal(phantom.plan.mechanic,'PHANTOM');
assert.equal(phantom.plan.counterCount,2);
console.log('PASS official until-switch attack lock, fail-closed tamper, and two-counter bench attack');
