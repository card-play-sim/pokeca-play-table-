'use strict';
// Source/UI privacy contract for the source-verified opponent-hand inspection
// mechanic. The opponent's ordinary hand must remain facedown.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('ui/mobile.js','utf8');
const runtime=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
const planner=fs.readFileSync('engine/reference-effect-plans.cjs','utf8');
assert.match(planner,/ATTACK_REVEAL_OPPONENT_HAND/);
assert.match(runtime,/case 'ATTACK_REVEAL_OPPONENT_HAND'/);
assert.match(runtime,/privateTo:actor/);
assert.match(runtime,/fromZone:'hand'/);
assert.match(ui,/showVerifiedOpponentHandReveal\(playerId,previousHistoryLength\)/);
assert.match(ui,/entry\.player==='you'&&entry\.details\?\.command==='REVEAL'/);
assert.match(ui,/entry\.details\.privateTo==='you'&&entry\.details\.fromZone==='hand'/);
assert.match(ui,/cards=opponent\?\.hand\.filter\(card=>ids\.includes\(idOf\(card\)\)\)/);
assert.match(ui,/cards\.length!==ids\.length/);
assert.match(ui,/openSheet\('相手の手札を確認',html\)/);
assert.match(ui,/Array\.from\(\{length:Math\.min\(opp\.handCount,14\)\},\(\)=>'<i class="card-back"><\/i>'\)/);
console.log('PASS: private opponent-hand reveal only after verified effect, facedown by default');
