'use strict';
// Shared declarative selection legality. No card names, effect text or state mutation.
const id=c=>c?.id||c?.instanceId;
function allows(candidates,ids,rules=[]){
 if(!Array.isArray(candidates)||!Array.isArray(ids)||!Array.isArray(rules))return false;
 if(ids.some(value=>value===null||value===undefined)||new Set(ids).size!==ids.length)return false;
 const chosen=ids.map(value=>candidates.find(c=>id(c)===value));if(chosen.some(c=>!c))return false;
 return rules.every(rule=>{
  if(!rule||typeof rule!=='object')return false;
  if(rule.kind==='distinct')return new Set(chosen.map(c=>c[rule.field])).size===chosen.length;
  if(rule.kind==='maxWhen')return Number.isInteger(rule.max)&&rule.max>=0&&(!chosen.some(c=>c[rule.field]===rule.equals)||chosen.length<=rule.max);
  return false; // Unknown semantics must fail closed.
 });
}
// Resolve dependent choices against earlier engine-declared candidate lists only.
function resolve(request,requests,selections={}){
 const out=JSON.parse(JSON.stringify(request));
 const requestIndex=requests.findIndex(r=>r.key===request.key);
 if(requestIndex<0)throw Error('UNKNOWN_SELECTION_REQUEST');
 for(const rule of out.dependencies||[]){
  const prior=requests.slice(0,requestIndex).find(r=>r.key===rule.key);
  if(!prior)throw Error('INVALID_SELECTION_DEPENDENCY');
  const ids=selections[rule.key]||[];
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(value=>!prior.candidates.some(c=>id(c)===value)))throw Error('INVALID_DEPENDENT_SELECTION');
  const chosen=prior.candidates.filter(c=>ids.includes(id(c)));
  if(rule.kind==='subset')out.candidates=out.candidates.filter(c=>ids.includes(id(c)));
  else if(rule.kind==='countFromSelection'){
   if(!Number.isInteger(rule.threshold)||rule.threshold<0||!Number.isInteger(rule.count)||rule.count<0)throw Error('INVALID_SELECTION_COUNT_RULE');
   const count=ids.length>=rule.threshold?rule.count:0;
   if(count>out.candidates.length)throw Error('IMPOSSIBLE_SELECTION_COUNT');
   out.min=out.max=count;
  }
  else if(rule.kind==='excludeSelectedField')out.candidates=out.candidates.filter(c=>!chosen.some(source=>source[rule.field]===id(c)));
  else if(rule.kind==='maxFromSelection'){
   if(!Number.isFinite(rule.divisor)||rule.divisor<=0)throw Error('INVALID_SELECTION_DIVISOR');
   if(chosen.length){
    const limits=chosen.map(c=>Number(c[rule.field]));
    if(limits.some(n=>!Number.isFinite(n)||n<0))throw Error('INVALID_SELECTION_LIMIT');
    out.max=Math.min(out.max,...limits.map(n=>Math.floor(n/rule.divisor)));
   }
  }
  else throw Error('UNKNOWN_SELECTION_DEPENDENCY');
 }
 return out;
}
module.exports={allows,resolve};
