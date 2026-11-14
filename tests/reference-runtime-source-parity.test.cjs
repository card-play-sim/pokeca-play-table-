'use strict';
// Prevent generated bundle fixes being erased by a future source rebuild.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
const bundle=fs.readFileSync('ui/engine.bundle.js','utf8');
const start=bundle.indexOf('"pokeca_reference_effect_runtime":function(require,module,exports){');
assert(start>=0,'reference runtime bundle module missing');
const end=bundle.indexOf('},"pokeca_reference_validation_adapter":function',start);
assert(end>start,'reference runtime module boundary missing');
const embedded=bundle.slice(start,end);
const contract=[
 "case 'HAND_LIMIT_DRAW_ATTACK':",
 "case 'HAND_LIMIT_DRAW_ABILITY':",
 "case 'COIN_FAILURE_DAMAGE':",
 "if(bench&&enabledAbilities(g,mon).some(a=>a.plan.mechanic==='BENCH_DAMAGE_PROTECTION'))return 0;",
 "if(m==='COLORLESS_MULTI_ENERGY')for(let i=0;i<r.mainPlan.units;i++)",
 "const passive=new Set(['SKYLINE','FAIRY_ZONE','BENCH_NON_RULE_PROTECTION','BENCH_DAMAGE_PROTECTION']);",
 "if(bench&&!record(mon).facts.rulePokemon&&field(other).some",
 "if(m==='SWITCH_SELF_ATTACK')add('targetIds'",
 "if(m==='ACTIVE_AND_BENCH_DAMAGE')add('targetIds'",
 "if(m==='ATTACK_DAMAGE_MOVE_ENERGY'&&p.bench.length)",
 "if(m==='DECK_ENERGY_TO_GRASS_BENCH'){",
 "case 'SWITCH_SELF_ATTACK':",
 "case 'ACTIVE_AND_BENCH_DAMAGE':",
 "case 'ATTACK_DAMAGE_MOVE_ENERGY':",
 "case 'DECK_ENERGY_TO_GRASS_BENCH':",
 "assert(x===undefined||Array.isArray(x),'INVALID_REFERENCE_SELECTION_TYPE:'+key);"
];
for(const token of contract){
 assert(source.includes(token),'canonical source lacks '+token);
 assert(embedded.includes(token),'generated bundle lacks '+token);
}
console.log('PASS canonical runtime and generated bundle share all new effect mechanics');
