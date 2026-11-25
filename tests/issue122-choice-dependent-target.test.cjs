'use strict';
const assert=require('node:assert/strict'),S=require('../engine/pokeca_selection_constraints.cjs');
const mode={key:'mode',kind:'CARD',min:1,max:1,candidates:[{id:'boost'},{id:'switch'}]};
const bench={key:'ownBench',kind:'CARD',min:0,max:1,candidates:[{id:'a'},{id:'b'}],dependencies:[{kind:'countWhenSelected',key:'mode',value:'switch',count:1}]};
for(const [value,count] of [['boost',0],['switch',1]]){
 const resolved=S.resolve(bench,[mode,bench],{mode:[value]});
 assert.equal(resolved.min,count);assert.equal(resolved.max,count);
}
assert.throws(()=>S.resolve(bench,[mode,bench],{mode:['forged']}),/INVALID_DEPENDENT_SELECTION/);
assert.throws(()=>S.resolve({...bench,candidates:[]},[mode,bench],{mode:['switch']}),/IMPOSSIBLE_SELECTION_COUNT/);
console.log('PASS exact mode-dependent target count');
