'use strict';
// Shared declarative selection legality. No card names, effect text or state mutation.
const id=c=>c.id||c.instanceId;
function allows(candidates,ids,rules=[]){
 if(new Set(ids).size!==ids.length)return false;
 const chosen=ids.map(value=>candidates.find(c=>id(c)===value));if(chosen.some(c=>!c))return false;
 return rules.every(rule=>{
  if(rule.kind==='distinct')return new Set(chosen.map(c=>c[rule.field])).size===chosen.length;
  if(rule.kind==='maxWhen')return !chosen.some(c=>c[rule.field]===rule.equals)||chosen.length<=rule.max;
  return false; // Unknown semantics must fail closed.
 });
}
module.exports={allows};
