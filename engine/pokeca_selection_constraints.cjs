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
// Resolve dependent choices against earlier engine-declared candidate lists only.
function resolve(request,requests,selections={}){
 const out=JSON.parse(JSON.stringify(request));
 for(const rule of out.dependencies||[]){
  const prior=requests.slice(0,requests.findIndex(r=>r.key===request.key)).find(r=>r.key===rule.key);
  if(!prior)throw Error('INVALID_SELECTION_DEPENDENCY');
  const ids=selections[rule.key]||[],chosen=prior.candidates.filter(c=>ids.includes(id(c)));
  if(rule.kind==='subset')out.candidates=out.candidates.filter(c=>ids.includes(id(c)));
  else if(rule.kind==='countFromSelection')out.min=out.max=ids.length>=rule.threshold?rule.count:0;
  else if(rule.kind==='excludeSelectedField')out.candidates=out.candidates.filter(c=>!chosen.some(source=>source[rule.field]===id(c)));
  else if(rule.kind==='maxFromSelection')out.max=Math.min(out.max,...chosen.map(c=>Math.floor(Number(c[rule.field]||0)/rule.divisor)));
  else throw Error('UNKNOWN_SELECTION_DEPENDENCY');
 }
 return out;
}
module.exports={allows,resolve};
