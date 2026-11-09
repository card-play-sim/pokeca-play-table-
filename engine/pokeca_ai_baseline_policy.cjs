'use strict';
// Rank only canonical legal actions. Missing print/effect/energy data is never inferred.
const basicTypes=new Set(['草','炎','水','雷','超','闘','悪','鋼']);
function attachmentScore(action,observation){
 const actor=observation?.pendingPrizeSelection?.playerId||observation?.turnPlayer;
 const player=observation?.players?.find(p=>p.id===actor),card=player?.hand?.[action.cardIndex];
 if(!card||card.isSpecial||card.special||card.cardType==='SPECIAL_ENERGY'||!basicTypes.has(card.energyType))return 0;
 const target=action.target==='active'?player.active:player.bench?.[action.target];
 if(!target)return 0;
 const energies=Array.isArray(target.energyCards)?target.energyCards.filter(c=>!c.isSpecial&&!c.special&&c.cardType!=='SPECIAL_ENERGY'&&basicTypes.has(c.energyType)).map(c=>c.energyType):[];
 let best=0;
 for(const attack of target.attacks||[]){
  if(!Array.isArray(attack.cost)||!attack.cost.every(c=>basicTypes.has(c)||c==='C'||c==='無色'))continue;
  const required={};for(const type of attack.cost)if(basicTypes.has(type))required[type]=(required[type]||0)+1;
  const missing=pool=>Object.entries(required).reduce((n,[type,count])=>n+Math.max(0,count-pool.filter(t=>t===type).length),0);
  const deficit=pool=>Math.max(missing(pool),attack.cost.length-pool.length);
  const before=deficit(energies),after=deficit([...energies,card.energyType]);
  const colorNeeded=(required[card.energyType]||0)>energies.filter(t=>t===card.energyType).length;
  if(after<before)best=Math.max(best,100+(action.target==='active'?20:0)+(colorNeeded?10:0)-after);
 }
 return best;
}
function chooseBaseline({legalActions,observation}){
 if(!Array.isArray(legalActions)||!legalActions.length)throw Error('No legal AI candidates: cannot invent PASS or end_turn');
 // Use an available attack before evolving away from it or drawing into deck-out.
 const attack=legalActions.find(a=>a.type==='attack_turn');if(attack)return attack;
 const priority=['bench_basic','evolve','attach_energy','play_item','play_supporter','play_stadium','use_ability','end_turn'];
 for(const type of priority){
  const candidates=legalActions.filter(a=>a.type===type);if(!candidates.length)continue;
  if(type!=='attach_energy')return candidates[0];
  return candidates.reduce((best,a)=>attachmentScore(a,observation)>attachmentScore(best,observation)?a:best);
 }
 return legalActions[0];
}
module.exports={chooseBaseline};
