'use strict';
// Print-scoped extensions of the canonical gateway. Adoption remains a separate concern.
const catalog=require('./pokeca_reference_effect_data');
const Selection=require('./pokeca_selection_constraints');
const fullCatalog=require('./pokeca_effect_extensions').catalog(catalog);
const records=new Map(fullCatalog.records.map(r=>[r.officialCardId,r]));
const copy=x=>JSON.parse(JSON.stringify(x)),id=c=>c?.id||c?.cardId;
const basicTypes=['草','炎','水','雷','超','闘','悪','鋼'];
const unresolved=new Set();
const passive=new Set(['PASSIVE_ACTIVE_HIT_RETALIATION','PASSIVE_IGNORE_ACTIVE_DEFENSE','PASSIVE_FULL_HP_SURVIVAL','SKYLINE','FAIRY_ZONE','BENCH_NON_RULE_PROTECTION','BENCH_DAMAGE_PROTECTION','PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION','PASSIVE_ROCKET_TEAM_ATTACK_GATE','ACTIVE_OPPONENT_ABILITY_SUPPRESSION','PASSIVE_TYPED_ATTACK_IMMUNITY','PASSIVE_NAMED_PRIZE_DISCOUNT','PASSIVE_CONTEXT_COST_DISCOUNT','PASSIVE_TEAM_ATTACK_BOOST']);
const functions=()=>({Effects:require('./pokeca_effect_service'),Core:require('./pokeca_engine_core')});
function current(card){return card?.evolutionCards?.length?card.evolutionCards.at(-1):card;}
function record(card){
 const print=current(card),ref=print?.validationReference;
 if(!ref)return null;
 const r=records.get(String(ref.officialCardId));
 if(!r||r.name!==ref.officialName||r.deckName!==print.name||r.set!==ref.set||r.cardNumber!==ref.cardNumber||ref.sourceSha256!==r.source.sha256||ref.imageSourceUrl!==r.imageSourceUrl)throw Error('REFERENCE_PRINT_CONFLICT:'+print.name);
 if(print.officialCardId!=null||print.catalogCardId!=null||ref.adopted!==false)throw Error('REFERENCE_CANNOT_ADOPT_PRINT');
 return r;
}
function player(game,actor){const p=game.players.find(p=>p.id===actor);if(!p)throw Error('PLAYER_MISSING');return p;}
const opponent=(g,a)=>g.players.find(p=>p.id!==a);
const field=p=>[p.active,...p.bench].filter(Boolean);
function inPlay(g){return g.players.flatMap(p=>field(p).map(c=>({player:p,card:c})));}
function find(g,ident){return inPlay(g).find(x=>id(x.card)===ident);}
function blocked(card,effect,reason='IMPLEMENTATION_OR_OFFICIAL_RULING_REQUIRED'){
 const r=record(card);return {code:'UNCONNECTED_EFFECT',cardName:card?.name||'',officialCardId:r?.officialCardId||null,effectName:effect?.name||effect?.mechanic||'',reason};
}
function stop(card,effect,reason){throw Error('UNCONNECTED_EFFECT:'+JSON.stringify(blocked(card,effect,reason)));}
function assert(ok,message){if(!ok)throw Error(message);}
function connected(plan){return !!plan&&!unresolved.has(plan.mechanic);}
function event(g,a,command,details={}){g.history.push({turnNumber:g.turnNumber,player:a,type:'effect_command',details:{command,...copy(details)}});}
function emit(g,a,plan,extra={}){for(const command of plan.commands)event(g,a,command,{reference:true,...extra});}
function command(g,a,cmd,context={}){functions().Effects.apply(g,cmd,{playerId:a,sourceType:'POKEMON',actionType:'ATTACK',...context});}
function stadium(g){return record(g.stadium)?.mainPlan?.mechanic;}
function toolEnabled(g){return stadium(g)!=='JAMMING';}
function abilityEnabled(g,card,ability=null){
 const r=record(card),s=stadium(g);
 if(s==='WATCHTOWER'&&r?.facts.types?.includes('無色')||s==='SUPPRESS_RULE_ABILITIES'&&r?.facts.rulePokemon)return false;
 const owner=inPlay(g).find(entry=>entry.card===card);
 if(owner?.player.active===card){
  const adversary=opponent(g,owner.player.id).active,source=record(adversary);
  const suppressorEnabled=source&&!(s==='WATCHTOWER'&&source.facts.types?.includes('無色')||s==='SUPPRESS_RULE_ABILITIES'&&source.facts.rulePokemon);
  if(suppressorEnabled)for(const a of source.abilities){
   if(a.plan?.mechanic==='ACTIVE_OPPONENT_ABILITY_SUPPRESSION'&&connected(a.plan)&&ability?.name!==a.plan.exceptAbilityName)return false;
  }
 }
 return true;
}
function maxHpBonus(g,card){
 if(!toolEnabled(g))return 0;
 return (card.tools||[]).reduce((sum,tool)=>{const plan=record(tool)?.mainPlan;
  if(plan?.mechanic==='HERO_CAPE')return sum+100;
  if(plan?.mechanic==='CONDITIONAL_MAX_HP'&&(!plan.basicOnly||record(card).facts.basic))return sum+plan.amount;
  return sum;
 },0);
}
function basicEnergy(c){return c?.kind==='energy'&&!c.isSpecial&&basicTypes.includes(c.energyType);}
function energyUnits(mon){
 const out=[];
 for(const c of mon.energyCards||[]){
  const r=record(c),m=r?.mainPlan?.mechanic;
  if(m==='ROCKET_ENERGY'){if(record(mon)?.name.startsWith('ロケット団の'))out.push(['超','悪'],['超','悪']);}
  else if(m==='COLORLESS_MULTI_ENERGY')for(let i=0;i<r.mainPlan.units;i++)out.push(['無色']);
  else if(m==='IGNITION')for(let i=0;i<(record(mon)?.facts.stage>0?3:1);i++)out.push(['無色']);
  else if(basicEnergy(c))out.push([c.energyType]);
 }
 return out;
}
function pays(mon,cost){
 if(!Array.isArray(cost)||!cost.every(t=>[...basicTypes,'無色'].includes(t)))return false;
 const units=energyUnits(mon),typed=cost.filter(t=>t!=='無色');
 function match(i,pool){if(i===typed.length)return pool.length>=cost.length-typed.length;for(let j=0;j<pool.length;j++)if(pool[j].includes(typed[i])&&match(i+1,pool.filter((_,k)=>k!==j)))return true;return false;}
 return match(0,units);
}
function cost(g,mon,attack){
 const c=[...attack.cost],owner=inPlay(g).find(x=>x.card===mon)?.player;
 if(stadium(g)==='NIGHT_MINE'&&record(mon).facts.teraBenchProtection)c.push('無色');
 if(!owner)return c;
 const other=opponent(g,owner.id);
 let discount=0;
 if(toolEnabled(g)&&owner.prizes>other.prizes)for(const t of mon.tools||[]){
  const p=record(t)?.mainPlan;if(p?.mechanic==='TOOL_PRIZE_COST_DISCOUNT')discount+=p.amount;
 }
 for(const a of enabledAbilities(g,mon))if(a.plan.mechanic==='PASSIVE_NAMED_PRIZE_DISCOUNT'&&a.plan.attackName===attack.name)discount+=6-other.prizes;
 for(const a of enabledAbilities(g,mon))if(a.plan.mechanic==='PASSIVE_CONTEXT_COST_DISCOUNT'){
  const p=a.plan;
  if(p.mode==='discardName')discount+=owner.discard.filter(x=>record(x)?.name===p.name).length;
  else if(p.mode==='opponentBench')discount+=other.bench.length;
  else if(p.mode==='opponentHandExact'&&other.hand.length===p.count)discount+=c.length;
  else if(p.mode==='ownAllNames'&&p.names.every(name=>field(owner).some(x=>record(x)?.name===name)))discount+=c.length;
 }
 while(discount-->0){const i=c.indexOf('無色');if(i<0)break;c.splice(i,1);}
 return c;
}
// Optional deterministic match-owned random stream. Persist referenceRngState
// with the game snapshot; do not consume the AI policy's random stream.
function referenceRandom(g){
 if(g.referenceRngState===undefined)return Math.random();
 assert(Number.isInteger(g.referenceRngState)&&g.referenceRngState>=0&&g.referenceRngState<=0xffffffff,'INVALID_REFERENCE_RNG_STATE');
 g.referenceRngState=(Math.imul(g.referenceRngState,1664525)+1013904223)>>>0;
 return g.referenceRngState/4294967296;
}
function shuffle(g,p){
 if(g.referenceEffectPreview){event(g,p.id,'SHUFFLE_DECK');return;}
 for(let i=p.deck.length-1;i>0;i--){const n=referenceRandom(g);assert(n>=0&&n<1,'INVALID_RNG');const j=Math.floor(n*(i+1));[p.deck[i],p.deck[j]]=[p.deck[j],p.deck[i]];}
 event(g,p.id,'SHUFFLE_DECK');
}
function draw(g,p,n){const before=g.history.length;command(g,p.id,{command:'DRAW',amount:n});for(const e of g.history.slice(before))e.details.privateTo=p.id;}
function resetHand(g,p,n,bottomOnly=false){
 const cards=p.hand.splice(0);
 if(bottomOnly){for(let i=cards.length-1;i>0;i--){const j=g.referenceEffectPreview?i:Math.floor(referenceRandom(g)*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}p.deck.push(...cards);}
 else {p.deck.push(...cards);shuffle(g,p);}
 event(g,p.id,'RETURN_TO_DECK',{cardIds:cards.map(id),bottomOnly});draw(g,p,typeof n==='function'?n():n);
}
function wasKnockedOut(g,actor){return g.history.some(e=>e.turnNumber===g.turnNumber-1&&e.type==='knockout'&&e.details?.targetPlayerId===actor);}
function enabledAbilities(g,card){return record(card)?.abilities.filter(a=>connected(a.plan)&&abilityEnabled(g,card,a))||[];}
function used(p,card,a){return !!p.turnLimits?.abilityUses?.[id(card)+':'+a.effectId];}
function mark(p,card,a){p.turnLimits||={};p.turnLimits.abilityUses||={};p.turnLimits.abilityUses[id(card)+':'+a.effectId]=true;}
function unconnectedAutomatic(g){
 for(const {card} of inPlay(g))for(const a of record(card)?.abilities||[])if(!a.plan&&/いるかぎり|ダメージを受けたとき/.test(a.text)&&abilityEnabled(g,card,a))return blocked(card,a,'UNCONNECTED_AUTOMATIC_ABILITY');
 return null;
}
function refresh(g){
 if(!g.referenceEffectValidation)return;
 for(const {card} of inPlay(g)){
  const r=record(card);assert(r,'REFERENCE_MISSING_IN_PLAY');
  card.hp=r.facts.hp+maxHpBonus(g,card);card.prizeCount=r.facts.prizeCount;
  card.retreatCost=r.facts.retreatCost;
 }
 for(const p of g.players){
  if(field(p).some(c=>enabledAbilities(g,c).some(a=>a.plan.mechanic==='SKYLINE')))for(const c of field(p))if(record(c).facts.basic)c.retreatCost=0;
  // Continuous retreat modifiers are recomputed after each action.
  if(toolEnabled(g))for(const c of field(p)){
   const discount=(c.tools||[]).reduce((total,tool)=>{
    const plan=record(tool)?.mainPlan;
    return total+(plan?.mechanic==='TOOL_RETREAT_DISCOUNT_TWO'?plan.amount:plan?.mechanic==='TOOL_LOW_HP_RETREAT_DISCOUNT'?(c.hp-c.damage<=plan.threshold?c.retreatCost:plan.amount):0);
   },0);
   c.retreatCost=Math.max(0,c.retreatCost-discount);
  }
  for(const c of field(p)){
   for(const e of [...(c.energyCards||[])])if(record(e)?.mainPlan?.mechanic==='ROCKET_ENERGY'&&!record(c).name.startsWith('ロケット団の')){
    c.energyCards.splice(c.energyCards.indexOf(e),1);p.discard.push(e);event(g,p.id,'DISCARD',{cardIds:[id(e)]});
   }
   c.energies=energyUnits(c).map(unit=>unit[0]);
  }
 }
}
function reduced(card){const out=copy(card);if(out.evolutionCards?.length){const base=out.validationBase;assert(base,'EVOLUTION_BASE_METADATA_MISSING');Object.assign(out,copy(base));}for(const k of ['damage','energies','energyCards','tools','evolutionCards','statusCondition','referenceProtection','referenceBasicDamageProtection','referenceCannotAttackTurn','referenceNamedAttackLock','referenceCannotRetreatTurn','referenceDamageReduction','referenceOutgoingDamagePenalty','referenceAttackLockUntilSwitch','enteredTurn','evolvedTurn','entryWindow','referenceEvolutionWindow','referenceNoWeaknessTurn','validationBase'])delete out[k];return out;}
function returnStack(g,p,mon,zone){
 const stack=[reduced(mon),...(mon.evolutionCards||[]).map(reduced),...(mon.energyCards||[]),...(mon.tools||[])];
 if(p.active===mon)p.active=null;else p.bench.splice(p.bench.indexOf(mon),1);
 p[zone].push(...stack);event(g,p.id,zone==='hand'?'RETURN_TO_HAND':'RETURN_TO_DECK',{cardIds:stack.map(id)});
 if(!p.active&&p.bench.length===1)promoteReferenceBench(g,p,0);
 if(!p.active&&!p.bench.length){g.status='finished';g.winner=opponent(g,p.id).id;}
 if(!p.active&&p.bench.length>1)g.pendingReferenceChoice={kind:'PROMOTE',playerId:p.id,options:p.bench.map(id)};
}
function promoteReferenceBench(g,p,index){
 p.active=p.bench.splice(index,1)[0];
 // Record a real bench-to-Active transition on the same turn it happens.
 if(record(p.active).attacks.some(attack=>attack.plan?.predicate==='becameActive'))
  event(g,p.id,'SWITCH',{activeInstanceId:id(p.active)});
}
function clearActiveEffects(c){if(!c)return;c.statusCondition=null;delete c.statusConditionInfo;delete c.referenceProtection;delete c.referenceBasicDamageProtection;delete c.referenceCannotAttackTurn;delete c.referenceNamedAttackLock;delete c.referenceCannotRetreatTurn;delete c.referenceDamageReduction;delete c.referenceOutgoingDamagePenalty;delete c.referenceAttackLockUntilSwitch;delete c.referenceNoWeaknessTurn;delete c.referenceEvolutionWindow;}
function switchMon(g,p,target){const index=p.bench.findIndex(c=>id(c)===target);assert(p.active&&index>=0,'INVALID_BENCH_CHOICE');clearActiveEffects(p.active);[p.active,p.bench[index]]=[p.bench[index],p.active];event(g,p.id,'SWITCH',{activeInstanceId:id(p.active)});}
function damages(g,actor,mon,amount,{bench=false,ignore=false,skipWeakness=false,skipResistance=false}={}){
 const own=player(g,actor),other=opponent(g,actor),source=own.active;
 if(amount===0)return 0;
 // Supporter bonus applies only to attack damage dealt to the opponent's Active Pokemon ex.
 // Add it BEFORE weakness/resistance and special-energy penalties, and expire by turn number.
 if(!bench&&find(g,id(mon))?.player.id===other.id&&record(mon)?.name.endsWith('ex')&&own.referenceExDamageBoost?.turn===g.turnNumber)amount+=own.referenceExDamageBoost.amount;
 if(!bench&&find(g,id(mon))?.player.id===other.id){
  const isEx=record(mon).name.endsWith('ex');
  if(isEx&&toolEnabled(g))for(const t of source.tools||[]){
   const plan=record(t)?.mainPlan;
   if(plan?.mechanic==='TOOL_EX_ATTACK_BOOST'&&(!plan.nonRuleOnly||!record(source).facts.rulePokemon))amount+=plan.amount;
  }
  if(own.referenceExVDamageBoost?.turn===g.turnNumber&&(isEx||/V(?:MAX|STAR|-UNION)?$/.test(record(mon).name)))amount+=own.referenceExVDamageBoost.amount;
 }
 if(!bench&&find(g,id(mon))?.player.id===other.id)amount+=(own.referenceTypedDamageBoosts||[]).filter(boost=>boost.turn===g.turnNumber&&record(source).facts.types.includes(boost.type)).reduce((sum,boost)=>sum+boost.amount,0);
 if(!bench&&other.active===mon){
  const attacker=record(source),defender=record(mon),nonStack=new Set();
  for(const holder of field(own))for(const a of enabledAbilities(g,holder)){
   const p=a.plan;if(p.mechanic!=='PASSIVE_TEAM_ATTACK_BOOST')continue;
   if(p.team&&!attacker.name.startsWith(p.team+'の'))continue;
   if(p.types.length&&!p.types.some(t=>attacker.facts.types.includes(t)))continue;
   if(p.evolvedSource&&attacker.facts.stage===0||p.evolvedTarget&&defender.facts.stage===0)continue;
   if(p.nonStack&&nonStack.has(a.name))continue;
   if(p.nonStack)nonStack.add(a.name);
   amount+=p.amount;
  }
 }
 const energyPenalty=(source.energyCards||[]).reduce((sum,c)=>sum+(record(c)?.mainPlan?.mechanic==='COLORLESS_MULTI_ENERGY'?record(c).mainPlan.damagePenalty:0),0);
 const outgoing=source.referenceOutgoingDamagePenalty;
 const penalty=energyPenalty+(outgoing?.turn===g.turnNumber?outgoing.amount:0);
 if(find(g,id(mon))?.player.id!==actor)amount=Math.max(0,amount-penalty);
 if(!ignore){
  if(bench&&enabledAbilities(g,mon).some(a=>a.plan.mechanic==='BENCH_DAMAGE_PROTECTION'))return 0;
  if(bench&&record(mon).facts.teraBenchProtection)return 0;
  if(bench&&!record(mon).facts.rulePokemon&&field(other).some(c=>enabledAbilities(g,c).some(a=>a.plan.mechanic==='BENCH_NON_RULE_PROTECTION')))return 0;
  if(mon.referenceProtection?.opponentTurn===g.turnNumber)return 0;
  if(find(g,id(mon))?.player.id===other.id&&enabledAbilities(g,mon).some(a=>a.plan.mechanic==='PASSIVE_TYPED_ATTACK_IMMUNITY'&&(a.plan.attacker==='ex'?record(source).name.endsWith('ex'):record(source).abilities.some(x=>abilityEnabled(g,source,x)))))return 0;
  if(find(g,id(mon))?.player.id===other.id&&mon.referenceBasicDamageProtection?.turn===g.turnNumber&&record(source).facts.basic&&(!mon.referenceBasicDamageProtection.exceptType||!record(source).facts.types.includes(mon.referenceBasicDamageProtection.exceptType)))return 0;
 }
 if(!bench){
  const r=record(mon),types=record(source).facts.types||[];
  let weakness=r.facts.weakness,resistance=r.facts.resistance;
  if(!ignore&&types.includes('超')&&record(mon).facts.types?.includes('竜')&&field(own).some(c=>enabledAbilities(g,c).some(a=>a.plan.mechanic==='FAIRY_ZONE')))weakness={types:['超'],value:'×2'};
  if(!ignore&&mon.referenceNoWeaknessTurn===g.turnNumber)weakness=null;
  if(!skipWeakness&&weakness?.types.some(t=>types.includes(t))){assert(weakness.value==='×2','UNSUPPORTED_WEAKNESS');amount*=2;}
  if(!skipResistance&&resistance?.types.some(t=>types.includes(t))){const n=Number(resistance.value.replace('－','-'));assert(Number.isFinite(n),'UNSUPPORTED_RESISTANCE');amount=Math.max(0,amount+n);}
 }
 if(!ignore&&find(g,id(mon))?.player.id===other.id){
  // Printed continuous abilities reduce damage taken from an attack after
  // weakness/resistance. Suppressed abilities do not apply.
  const reduction=enabledAbilities(g,mon)
   .filter(a=>a.plan.mechanic==='PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION')
   .reduce((sum,a)=>sum+a.plan.amount,0);
  amount=Math.max(0,amount-reduction);
  const teamReduction=(other.referenceTeamDamageReductions||[]).filter(x=>x.turn===g.turnNumber&&(!x.type||record(mon).facts.types.includes(x.type))).reduce((sum,x)=>sum+x.amount,0);
  amount=Math.max(0,amount-teamReduction);
  if(mon.referenceDamageReduction?.turn===g.turnNumber)
   amount=Math.max(0,amount-mon.referenceDamageReduction.amount);
 }
 if(ignore&&!skipWeakness&&typesConflictForIgnore(g,own,mon,source))stop(mon,{name:'弱点変更との相互作用'},'OFFICIAL_WEAKNESS_MODIFICATION_RULING_REQUIRED');
 return amount;
}
function typesConflictForIgnore(g,own,mon,source){return record(source).facts.types.includes('超')&&record(mon).facts.types.includes('竜')&&field(own).some(c=>enabledAbilities(g,c).some(a=>a.plan.mechanic==='FAIRY_ZONE'));}
function damage(g,actor,mon,amount,options={}){
 const attacker=player(g,actor).active,defender=find(g,id(mon));
 // Only the opponent's Active Pokémon and only this attack's damage.
 // Do not bypass protection on the bench or on the attacker's own Pokémon.
 const bypass=defender?.player.id!==actor&&defender?.player.active===mon&&!options.bench&&enabledAbilities(g,attacker).some(a=>a.plan.mechanic==='PASSIVE_IGNORE_ACTIVE_DEFENSE');
 if(bypass)options={...options,ignore:true};
 const value=damages(g,actor,mon,amount,options);
 const survival=!options.ignore&&defender?.player.id!==actor&&mon.damage===0&&value>=mon.hp&&enabledAbilities(g,mon).find(a=>a.plan.mechanic==='PASSIVE_FULL_HP_SURVIVAL');
 command(g,actor,{command:'DAMAGE',amount:value},{targetIds:[id(mon)]});
 // Survival is not damage reduction: retain the actual attack DAMAGE event
 // and leave exactly 10 HP before the normal knockout/prize resolution.
 if(survival&&mon.damage>=mon.hp){
  mon.damage=mon.hp-survival.plan.remainingHp;
  event(g,defender.player.id,'ADD_STATE',{mechanic:'PASSIVE_FULL_HP_SURVIVAL',targetInstanceId:id(mon),remainingHp:survival.plan.remainingHp,effectId:survival.effectId});
 }
 if(value>0&&defender?.player.id!==actor&&defender?.player.active===mon){
  for(const a of enabledAbilities(g,mon).filter(a=>a.plan.mechanic==='PASSIVE_ACTIVE_HIT_RETALIATION')){
   g.referenceReactions||=[];
   g.referenceReactions.push({kind:'ACTIVE_HIT_RETALIATION',playerId:defender.player.id,attackerId:id(attacker),effectId:a.effectId,status:a.plan.status,counterCount:a.plan.counterCount});
  }
 }
 if(value>0&&!options.bench&&defender?.player.active===mon&&toolEnabled(g)&&(mon.tools||[]).some(t=>record(t)?.mainPlan?.mechanic==='CIRCULATOR')){
  g.referenceReactions||=[];g.referenceReactions.push({kind:'CIRCULATOR',playerId:defender.player.id,attackerId:id(attacker),sourceOfficialCardId:record(mon.tools.find(t=>record(t)?.mainPlan?.mechanic==='CIRCULATOR')).officialCardId});
 }
 return value;
}
function counters(g,actor,mon,count,{attack=false,sourceType='POKEMON'}={}){if(attack&&mon.referenceProtection?.opponentTurn===g.turnNumber){event(g,actor,'PLACE_DAMAGE_COUNTERS',{prevented:true,targetInstanceId:id(mon)});return;}command(g,actor,{command:'PLACE_DAMAGE_COUNTERS',counterCount:count},{targetIds:[id(mon)],sourceType,actionType:attack?'ATTACK':sourceType==='STADIUM'?'TRAINER':'ABILITY'});}
function coin(g,actor){if(g.referenceEffectPreview)return false;const n=referenceRandom(g);assert(Number.isFinite(n)&&n>=0&&n<1,'INVALID_RNG');const heads=n<.5;event(g,actor,'COIN_FLIP',{heads});return heads;}
function requirePlan(card,effect){if(!connected(effect?.plan))stop(card,effect);return effect.plan;}
function itemLocked(g,actor){return !!g.referenceItemLock?.some(x=>x.playerId===actor&&x.turnNumber===g.turnNumber);}
function canHealOrClearStatus(card){return card.damage>0||!!card.statusCondition;}
function isMegaEvolutionEx(card){return card.kind==='pokemon'&&String(record(card).rulesText).includes('メガシンカexがきぜつしたとき');}
function attackSearchCandidate(c,plan){
 const r=record(c),typed=c.kind==='pokemon'&&r?.facts.types?.includes(plan.type);
 if(plan.mechanic==='SEARCH_BASIC_TO_BENCH_ATTACK')return c.kind==='pokemon'&&r?.facts.basic&&(!plan.type||typed);
 switch(plan.filter){
  case 'any':return true;
  case 'basicEnergy':return basicEnergy(c);
  case 'typedBasicEnergy':return basicEnergy(c)&&c.energyType===plan.type;
  case 'typedPokemon':return typed;
  case 'typedPokemonOrBasicEnergy':return typed||basicEnergy(c)&&c.energyType===plan.type;
  case 'typedPokemonOrStadium':return typed||r?.category==='stadium';
  default:return r?.category===plan.filter;
 }
}
function nonRuleRecovery(c){return c.kind==='pokemon'?!record(c).facts.rulePokemon:basicEnergy(c);}
function lowHpHeal(c,plan){return c.damage>0&&c.hp-c.damage>0&&c.hp-c.damage<=plan.threshold;}
function typedRecoveryCandidate(c,plan){return c.kind==='pokemon'?record(c).facts.types.includes(plan.type):basicEnergy(c)&&c.energyType===plan.type;}
// The same scope defines the private picker and its resolution.
const topDeckEffects={
 ACTIVE_TOP_SUPPORTER_SEARCH:{limit:6,remainder:'shuffle',reveal:true,cardType:'SUPPORTER'},
 RECON:{limit:2,remainder:'bottom',reveal:false},
 TOP_SUPPORTER_SEARCH:{limit:7,remainder:'shuffle',reveal:true,cardType:'SUPPORTER'}
};
const deckWindow=(deck,scope)=>scope?deck.slice(0,scope.limit):deck;
function typedEvolutionOrTera(c,plan){
 if(c.kind!=='pokemon')return false;
 const facts=record(c).facts;
 return plan.mechanic==='TRAINER_SEARCH_TERA'?facts.teraBenchProtection===true:facts.stage>0&&facts.types.includes(plan.type);
}
function massRouteTargets(p,card,plan){
 return (plan.target==='self'?[card]:plan.target==='bench'?p.bench:field(p)).filter(c=>c&&(!plan.holderType||record(c).facts.types.includes(plan.holderType))&&(!plan.team||record(c).name.startsWith(plan.team+'の')));
}
function massRouteEnergy(p,plan){
 return p[plan.zone].filter(c=>basicEnergy(c)&&(!plan.type||c.energyType===plan.type));
}
function massTransferCandidate(c,plan){
 const r=record(c);
 if(plan.category==='pokemonOrBasicEnergy')return basicEnergy(c)?(!plan.energyType||c.energyType===plan.energyType):r?.category==='pokemon'&&(!plan.type||r.facts.types.includes(plan.type))&&(!Number.isInteger(plan.stage)||r.facts.stage===plan.stage)&&(!plan.team||r.name.startsWith(plan.team+'の'));
 if(plan.nameExact&&r?.name!==plan.nameExact)return false;
 if(plan.retreatCost!==undefined&&r?.facts?.retreatCost!==plan.retreatCost)return false;
 if(plan.resistanceType&&!r?.facts?.resistance?.types?.includes(plan.resistanceType))return false;
 if(plan.category==='any')return !!r;
 if(plan.nameContains&&(!r||!r.name.includes(plan.nameContains)))return false;
 if(plan.category==='categorySet')return plan.categories.includes(r?.category);
 if(plan.energyTypes&&(!basicEnergy(c)||!plan.energyTypes.includes(c.energyType)))return false;
 if(plan.category==='basicEnergy')return basicEnergy(c)&&(!plan.type||c.energyType===plan.type);
 if(plan.category==='trainer')return ['item','supporter','tool','stadium'].includes(r?.category);
 if(r?.category!==plan.category)return false;
 if(plan.type&&!r.facts.types?.includes(plan.type))return false;
 if(plan.stage==='evolved'&&!(r.facts.stage>0))return false;
 if(Number.isInteger(plan.stage)&&r.facts.stage!==plan.stage)return false;
 if(plan.team&&!r.name.startsWith(plan.team+'の'))return false;
 return true;
}
function scopeHealTargets(p,o,plan){
 const targets=plan.scope==='both'?[...field(p),...field(o)]:plan.scope==='active'?[p.active]:plan.scope==='bench'?p.bench:field(p).filter(c=>record(c).facts.basic);
 return targets.filter(c=>c&&(!plan.type||record(c).facts.types.includes(plan.type)));
}
function handFlowAvailable(p,o,plan){
 if(plan.mode==='resetOpponent')return o.hand.length+o.deck.length>0;
 if(plan.mode==='bothDraw')return p.deck.length+o.deck.length>0;
 if(plan.mode==='revealCount')return p.deck.length>0&&o.hand.some(c=>c.kind==='pokemon');
 if(plan.mode==='resetBothCoin')return p.hand.length+p.deck.length+o.hand.length+o.deck.length>0;
 if(plan.mode==='rocketLimit')return p.deck.length>0&&p.hand.length<(field(p).every(c=>record(c).name.startsWith('ロケット団の'))?plan.bonus:plan.amount);
 return true;
}
function energyCountPool(p,card,plan){
 if(plan.zone==='hand')return p.hand.filter(c=>c.kind==='energy'&&(!plan.basic||basicEnergy(c))&&(!plan.type||c.energyType===plan.type));
 const holders=plan.zone==='self'?[card]:plan.zone==='bench'?p.bench:field(p);
 return holders.flatMap(mon=>mon.energyCards.filter(c=>(!plan.basic||basicEnergy(c))&&(!plan.type||energyUnits({...mon,energyCards:[c]}).some(unit=>unit.includes(plan.type)))));
}
function massHealTargets(p,plan){
 return (plan.target==='active'?[p.active]:field(p)).filter(c=>c&&(!plan.type||record(c).facts.types.includes(plan.type)));
}
function enteredActiveThisTurn(g,owner,card){
 return g.history.some(e=>e.turnNumber===g.turnNumber&&e.player===owner.id&&e.details?.command==='SWITCH'&&e.details.activeInstanceId===id(card));
}
function attackGuardApplies(g,p,o,plan){
 switch(plan.predicate){
  case 'opponentEx':return record(o.active).name.endsWith('ex');
  case 'ownBenchedNames':return plan.names.every(name=>p.bench.some(c=>record(c).name===name));
  case 'opponentDamaged':return o.active.damage>0;
  case 'opponentStatus':return o.active.statusCondition===plan.status;
  case 'opponentPrizeCounts':return plan.prizes.includes(o.prizes);
  case 'handCountsEqual':return p.hand.length===o.hand.length;
  case 'ownHandCount':return p.hand.length===plan.threshold;
  case 'stadium':return Boolean(g.stadium);
  default:throw Error('UNRECOGNIZED_ATTACK_GUARD');
 }
}
function discardCurrentStadium(g,actor){
 const stadium=g.stadium;
 player(g,g.stadiumOwner).discard.push(stadium);
 g.stadium=null;g.stadiumOwner=null;
 event(g,actor,'DISCARD',{cardIds:[id(stadium)],fromZone:'stadium'});
}
function boardBonusApplies(g,p,o,plan){
 const facts=record(o.active).facts;
 switch(plan.predicate){
  case 'healedThisTurn':return g.history.some(e=>e.turnNumber===g.turnNumber&&e.details?.command==='HEAL'&&e.details.targetInstanceId===id(p.active)&&e.details.amount>0);
  case 'evolvedFromThisTurn':return p.active.evolvedTurn===g.turnNumber&&(p.active.evolutionCards?.at(-2)?.validationReference?.officialName||p.active.validationBase?.validationReference?.officialName)===plan.name;
  case 'becameActive':return enteredActiveThisTurn(g,p,p.active);
  case 'sharedFieldType':return field(p).some(own=>field(o).some(other=>record(own).facts.types.some(type=>record(other).facts.types.includes(type))));
  case 'ownNamedEnergy':return p.active.energyCards.some(c=>record(c)?.category==='energy'&&record(c).name===plan.name);
  case 'stadiumPresent':return Boolean(g.stadium);
  case 'ownHandEmpty':return p.hand.length===0;
  case 'ownPrizesExact':return p.prizes===plan.threshold;
  case 'opponentPrizesExact':return o.prizes===plan.threshold;
  case 'ownDeckAtMost':return p.deck.length<=plan.threshold;
  case 'allDamagedBench':return p.bench.length>0&&p.bench.every(c=>c.damage>0);
  case 'ownBenchNamed':return p.bench.some(c=>record(c).name===plan.name);
  case 'ownBenchContains':return p.bench.some(c=>record(c).name.includes(plan.name));
  case 'ownStadium':return !!g.stadium&&g.stadiumOwner===p.id;
  case 'stadiumContains':return !!g.stadium&&record(g.stadium).name.includes(plan.name);
  case 'opponentType':return facts.types.includes(plan.type);
  case 'opponentResistance':return !!facts.resistance?.types.includes(plan.type);
  case 'opponentTera':return facts.teraBenchProtection===true;
  case 'ownSpecialEnergy':return p.active.energyCards.some(c=>c.isSpecial);
  default:throw Error('UNKNOWN_BOARD_BONUS_PREDICATE');
 }
}
function massContext(plan,p,o){
 if(plan.predicate==='equalHand')return p.hand.length===o.hand.length;
 if(plan.predicate==='opponentBench')return o.bench.length>=plan.threshold;
 if(plan.predicate==='ownTypedBench')return p.bench.some(c=>record(c).facts.types.includes(plan.type)&&(plan.stage===null||record(c).facts.stage===plan.stage));
 return plan.statuses.includes((plan.predicate==='ownStatus'?p.active:o.active).statusCondition);
}
function mixedTopCategory(c,plan){
 if(plan.mechanic==='TRAINER_TOP_TYPED_SEARCH'){
  if(c.kind==='pokemon'&&record(c).facts.types.includes(plan.type))return 'pokemon';
  if(basicEnergy(c)&&c.energyType===plan.type)return 'energy';
 }else {
  if(c.kind==='pokemon')return 'pokemon';
  if(['item','supporter','tool','stadium'].includes(record(c)?.category))return 'trainer';
 }
 return null;
}
function inspectedHandCandidate(c,plan){
 const category=record(c)?.category;
 return plan.filter==='any'||plan.filter==='itemTool'&&['item','tool'].includes(category)||plan.filter===category;
}
function attachedMovePool(p,o,card,plan){
 const sources=plan.source==='self'?[card]:plan.source==='opponentActive'?[o.active]:plan.source==='opponentField'?field(o):plan.source==='ownBench'?p.bench:field(p);
 const targets=plan.target==='self'?[card]:plan.target==='ownActive'?[p.active]:plan.target==='ownBench'?p.bench:plan.target==='opponentBench'?o.bench:plan.target==='opponentOther'?field(o):field(p);
 const pool=sources.filter(c=>c&&targets.some(t=>t&&t!==c)).flatMap(c=>(c.energyCards||[]).filter(e=>!plan.basic||basicEnergy(e)).map(e=>({...e,containerId:id(c),moveUnits:energyUnits({...c,energyCards:[e]}).filter(u=>!plan.type||u.includes(plan.type)).length}))).filter(e=>e.moveUnits>0);
 return {pool,targets:targets.filter(Boolean)};
}
function selectedAttachmentUnits(card,energy,plan){
 const units=energyUnits({...card,energyCards:[energy]});
 return plan.type?units.filter(types=>types.includes(plan.type)).length:units.length;
}
function requests(g,actor,card,effect){
 const p=player(g,actor),o=opponent(g,actor),m=effect.plan?.mechanic,out=[];
 const add=(key,kind,candidates,min,max,extra={})=>out.push({key,kind,min,max,candidates:copy(candidates),...extra});
 const own=field(p),opp=field(o),cardRequest=(key,list,min,max)=>add(key,'CARD',list.map(c=>{const r=record(c);return r?.category==='pokemon'?{...c,basic:r.facts.basic,stage:r.facts.stage}:c;}),min,max);
 const deckRequest=(key,list,min,max,scope)=>{
  cardRequest(key,list,min,max);
  if(actor==='you')out.at(-1).inspection={privateTo:actor,cards:copy(deckWindow(p.deck,scope))};
 };
 if(['BENCH_COUNTER_DAMAGE','BENCH_EX_DAMAGE'].includes(m))add('targetIds','POKEMON',o.bench.filter(c=>m!=='BENCH_EX_DAMAGE'||record(c).facts.rulePokemon).map(c=>({instanceId:id(c),name:c.name})),1,1);
 if(m==='ANY_DAMAGE')add('targetIds','POKEMON',opp.map(c=>({instanceId:id(c),name:c.name})),1,1);
 if(m==='MASS_BOARD_BONUS'&&effect.plan.optional)
  add('stadiumBonus','CARD',g.stadium?[{id:'discard-stadium',name:'スタジアムをトラッシュして追加ダメージ'}]:[],0,g.stadium?1:0);
 if(m==='ATTACK_OPTIONAL_RECOIL_BONUS')add('recoilBonus','CARD',[{id:'accept-recoil',name:'追加ダメージを与え、自分にもダメージ'}],0,1);
 if(m==='SWITCH_SELF_ATTACK')add('targetIds','POKEMON',p.bench.map(c=>({instanceId:id(c),name:c.name})),effect.plan.optional?0:Math.min(1,p.bench.length),Math.min(1,p.bench.length));
 if(m==='ATTACK_SWITCH_THEN_DAMAGE'){
  const bench=o.active.referenceProtection?.opponentTurn===g.turnNumber?[]:o.bench;
  add('targetIds','POKEMON',bench.map(c=>({instanceId:id(c),name:c.name})),Math.min(1,bench.length),Math.min(1,bench.length));
 }
 if(['ACTIVE_AND_BENCH_DAMAGE','ATTACK_SPLASH_DAMAGE'].includes(m))add('targetIds','POKEMON',o.bench.map(c=>({instanceId:id(c),name:c.name})),Math.min(1,o.bench.length),Math.min(1,o.bench.length));
 if(m==='ATTACK_ACCELERATE_BASIC_ENERGY'){
  const plan=effect.plan,targets=(plan.target==='self'?[card]:plan.target==='bench'?p.bench:own).filter(c=>!plan.holderType||record(c).facts.types.includes(plan.holderType));
  const pool=targets.length?p[plan.zone].filter(c=>basicEnergy(c)&&(!plan.type||c.energyType===plan.type)):[];
  const count=Math.min(plan.limit,pool.length);
  if(plan.zone==='deck')deckRequest('energy',pool,0,count);
  else cardRequest('energy',pool,0,count);
  if(plan.target!=='self'){
   cardRequest('attachTo',targets,0,Math.min(1,targets.length));
   out.at(-1).dependencies=[{kind:'countFromSelection',key:'energy',threshold:1,count:1}];
  }
 }
 if(m==='MASS_ATTACHED_ENERGY_MOVE'){
  const plan=effect.plan,{pool,targets}=attachedMovePool(p,o,card,plan);
  const max=Math.min(plan.count??pool.length,pool.length),min=plan.count===null?max:plan.optional?0:Math.min(1,max);
  cardRequest('energy',pool,min,max);
  if(!['self','ownActive'].includes(plan.target)){
   for(let i=0;i<(plan.multi?max:1);i++){
    cardRequest('moveTo'+i,targets,0,Math.min(1,targets.length));
    out.at(-1).dependencies=[{kind:'countFromSelection',key:'energy',threshold:i+1,count:1},...(['ownOther','opponentOther'].includes(plan.target)?[{kind:'excludeSelectedField',key:'energy',field:'containerId'}]:[])];
   }
  }
 }
 if(m==='ATTACK_BASIC_ENERGY_MOVE'){
  const pool=(card.energyCards||[]).filter(basicEnergy),count=p.bench.length&&pool.length?1:0;
  cardRequest('energy',pool,count,count);cardRequest('attachTo',p.bench,count,count);
 }
 if(m==='ATTACK_DAMAGE_MOVE_ENERGY'&&p.bench.length){cardRequest('energy',card.energyCards||[],1,1);cardRequest('attachTo',p.bench,1,1);}
 if(m==='DISCARD_ONE_SELF_ENERGY_ATTACK')cardRequest('energy',card.energyCards||[],1,1);
 if(['ATTACK_DISCARD_MULTIPLE_SELF_ENERGY','ATTACK_RETURN_SELF_ENERGY'].includes(m)||m==='ATTACK_SPREAD_DAMAGE'&&Number.isInteger(effect.plan.discardAttached)){
  // Printed Energy "個" can be supplied by one physical multi-unit Energy card.
  const eligible=(card.energyCards||[]).filter(energy=>
    selectedAttachmentUnits(card,energy,effect.plan)>0);
  cardRequest('energy',eligible,Math.min(1,eligible.length),
    Math.min((m==='ATTACK_SPREAD_DAMAGE'?effect.plan.discardAttached:effect.plan.count),eligible.length));
 }
 if(['ATTACK_DISCARD_DEFENDER_ENERGY','ATTACK_COIN_DISCARD_DEFENDER_ENERGY'].includes(m)){
  const eligible=(o.active.energyCards||[]).filter(energy=>!effect.plan.specialOnly||energy.isSpecial);
  const count=Math.min(1,eligible.length);
  cardRequest('energy',eligible,count,count);
 }
 if(m==='ABILITY_TYPED_COST_DRAW_LIMIT'){
  const plan=effect.plan,pool=(plan.zone==='attached'?card.energyCards:p.hand).filter(c=>basicEnergy(c)&&c.energyType===plan.type);
  cardRequest('discard',pool,1,1);
 }
 if(m==='SUPPORTER_NON_RULE_DISCARD_DRAW'){
  const pool=p.hand.filter(c=>c.kind==='pokemon'&&!record(c).facts.rulePokemon);
  cardRequest('discard',pool,1,Math.min(effect.plan.limit,pool.length));
 }
 if(m==='ABILITY_DISCARD_DRAW')cardRequest('discard',p.hand,effect.plan.cost,effect.plan.cost);
 if(m==='ABILITY_ATTACH_SELF_DRAW')cardRequest('energy',p.hand.filter(c=>basicEnergy(c)&&c.energyType===effect.plan.type),1,1);
 if(m==='ATTACK_ATTACH_BASIC_FROM_HAND'){
  const eligible=p.hand.filter(basicEnergy),count=Math.min(1,eligible.length);
  cardRequest('energy',eligible,count,count);
  if(effect.plan.target==='own')cardRequest('attachTo',own,count,count);
 }
 if(m==='MASS_ENERGY_COUNT_DISCARD'){
  const pool=energyCountPool(p,card,effect.plan),max=Math.min(effect.plan.limit,pool.length);
  if(!effect.plan.all)cardRequest('energy',pool,0,max);
 }
 if(m==='ATTACK_DISCARD_FIELD_BASIC'){
  const eligible=own.flatMap(mon=>(mon.energyCards||[]).filter(basicEnergy));
  cardRequest('energy',eligible,0,eligible.length);
 }
 if(m==='MASS_HAND_ACQUISITION'&&effect.plan.mode!=='bottom'){
  const plan=effect.plan,limit=Math.min(plan.amount,p.deck.length);
  add('acquire','CARD',[...(limit?[{id:'do',name:plan.mode==='search'?'山札を探す':'山札を引く',max:limit}]:[]),{id:'skip',name:'使わない',max:0}],1,1);
  if(plan.mode==='search'&&limit){
   deckRequest('cards',p.deck,0,limit);
   out.at(-1).dependencies=[plan.exact?{kind:'countWhenSelected',key:'acquire',value:'do',count:1}:{kind:'maxFromSelection',key:'acquire',field:'max',divisor:1}];
  }
 }
 if(m==='ATTACK_OPTIONAL_DRAW_TO_LIMIT'&&p.hand.length<effect.plan.limit&&p.deck.length){
  add('drawChoice','CARD',[{id:'draw',name:'山札を引く'},{id:'skip',name:'引かない'}],1,1);
 }
 if(m==='ATTACK_HEAL_OWN_TARGET')cardRequest('healTarget',own,1,1);
 if(m==='ATTACK_DISABLE_SELECTED_MOVE'){
  const attacks=record(o.active).attacks.map(attack=>({id:attack.effectId,name:attack.name}));
  const count=Math.min(1,attacks.length);
  add('attackChoice','CARD',attacks,count,count);
 }
 if(m==='INSPECTED_OPPONENT_HAND_TRANSFER'){
  const plan=effect.plan,pool=o.hand.filter(c=>inspectedHandCandidate(c,plan));
  const count=plan.all?pool.length:Math.min(plan.limit,pool.length);
  cardRequest('opponentCards',pool,plan.optional?0:count,count);
  if(actor==='you')out.at(-1).inspection={privateTo:actor,cards:copy(o.hand)};
 }
 if(m==='MASS_EFFECT_SEQUENCE'){
  const first=effect.plan.steps[0];
  if(first.op==='discardOwnHand'){const n=Math.min(first.amount,p.hand.length);cardRequest('sequenceDiscard',p.hand,n,n);}
  if(first.op==='blindDiscardOpponent'){const n=Math.min(first.amount,o.hand.length);add('sequenceBlind','CARD',o.hand.map((_,i)=>({id:'hand-slot-'+i,name:'相手の手札 '+(i+1)})),n,n);}
 }
 if(m==='ATTACK_BLIND_HAND_CHOICE'){
  const count=Math.min(effect.plan.amount,o.hand.length);
  add('blindHand','CARD',o.hand.map((_,i)=>({id:'hand-slot-'+i,name:'相手の手札 '+(i+1)})),count,count);
 }
 if(m==='ATTACK_MOVE_BENCH_COUNTERS'){
  const sources=counterMoveSources(p,effect.plan),count=sources.length?1:0;
  cardRequest('counterSource',sources,count,count);
  if(!effect.plan.targetActive)
   add('targetIds','POKEMON',opp.map(c=>({instanceId:id(c),name:c.name})),count,count);
 }
 if(m==='ATTACK_SPREAD_DAMAGE'&&effect.plan.count!==null){
  const targets=spreadTargets(effect.plan,p,o);
  const count=Math.min(effect.plan.count,targets.length);
  add('targetIds','POKEMON',targets.map(mon=>({instanceId:id(mon),name:mon.name})),count,count);
 }
 if(m==='ATTACK_OPTIONAL_ENERGY_BONUS'){
  const plan=effect.plan,pool=(card.energyCards||[]).filter(c=>plan.all||energyUnits({...card,energyCards:[c]}).some(unit=>unit.includes(plan.type)));
  if(plan.all)add('mode','CARD',[{id:'base',name:'追加ダメージなし'},...(pool.length?[{id:'bonus',name:'エネルギーをすべて移動して追加ダメージ'}]:[])],1,1);
  else cardRequest('energy',pool,0,Math.min(1,pool.length));
 }
 if(m==='ATTACK_DISCARD_BENCH_ENERGY_BONUS'){
  const attached=p.bench.flatMap(mon=>mon.energyCards||[]);
  cardRequest('energy',attached,0,Math.min(effect.plan.maxDiscard,attached.length));
 }
 if(m==='DECK_ENERGY_TO_GRASS_BENCH'){
  const energies=p.deck.filter(c=>c.kind==='energy'),targets=p.bench.filter(c=>record(c).facts.types.includes('草'));
  const count=energies.length&&targets.length?1:0;
  deckRequest('energy',energies,count,count);cardRequest('attachTo',targets,count,count);
 }
 if(m==='PHANTOM'&&o.bench.length){
  const count=effect.plan.counterCount??6;
  add('allocation','COUNTERS',o.bench.map(c=>({id:id(c),name:c.name,damage:c.damage||0,hp:c.hp})),count,count);
 }
 if(m==='ATTACK_NAMED_DISCARD_BENCH'){
  const candidates=p.discard.filter(c=>c.kind==='pokemon'&&record(c)?.facts.basic&&record(c).name===effect.plan.name);
  cardRequest('cards',candidates,0,Math.min(effect.plan.limit,5-p.bench.length,candidates.length));
 }
 if(m==='SEARCH_BASIC_TO_BENCH_ATTACK'){
  const candidates=p.deck.filter(c=>attackSearchCandidate(c,effect.plan));
  deckRequest('cards',candidates,0,Math.min(effect.plan.limit,5-p.bench.length,candidates.length));
 }
 if(m==='SEARCH_REVEAL_TO_HAND_ATTACK'){
  const candidates=p.deck.filter(c=>attackSearchCandidate(c,effect.plan));
  if(effect.plan.optional&&candidates.length)
   add('searchMode','CARD',[{id:'search',name:'山札から選ぶ'},{id:'skip',name:'選ばない'}],1,1);
  deckRequest('cards',candidates,0,Math.min(effect.plan.limit,candidates.length));
  if(effect.plan.optional&&candidates.length)
   out.at(-1).dependencies=[{kind:'requiresSelection',key:'searchMode',value:'search'}];
 }
 if(m==='ATTACK_RECYCLE_BASIC_ENERGY'&&effect.plan.counters){
  const count=p.discard.some(c=>basicEnergy(c)&&c.energyType===effect.plan.type)?1:0;
  add('targetIds','POKEMON',opp.map(c=>({instanceId:id(c),name:c.name})),count,count);
 }
 if(m==='HUNT')deckRequest('cards',p.deck,0,2);
 if(m==='ADRENA_BRAIN'){
  add('source','CARD',own.filter(c=>(c.damage||0)>0).map(c=>({id:id(c),name:c.name,damage:c.damage||0})),1,1);
  add('target','CARD',opp.map(c=>({id:id(c),name:c.name})),1,1);
  add('count','COUNT',[],1,3,{dependencies:[{kind:'maxFromSelection',key:'source',field:'damage',divisor:10}]});
 }
 if(m==='TRAINER_TOP_SELECT_DISCARD'){
  const plan=effect.plan,window=deckWindow(p.deck,plan),count=Math.min(plan.amount,window.length);
  deckRequest('cards',window,count,count,plan);
 }
 if(['TRAINER_TOP_TYPED_SEARCH','TRAINER_TOP_POKEMON_TRAINER'].includes(m)){
  const plan=effect.plan,eligible=deckWindow(p.deck,plan).filter(c=>mixedTopCategory(c,plan));
  const distinct=m==='TRAINER_TOP_POKEMON_TRAINER';
  const limit=distinct?new Set(eligible.map(c=>mixedTopCategory(c,plan))).size:Math.min(plan.amount,eligible.length);
  deckRequest('cards',eligible,0,limit,plan);
  if(distinct){
   out.at(-1).candidates=out.at(-1).candidates.map(c=>({...c,searchCategory:mixedTopCategory(c,plan)}));
   out.at(-1).constraints=[{kind:'distinct',field:'searchCategory',error:'TOP_SEARCH_DUPLICATE_CATEGORY'}];
  }
 }
 if(topDeckEffects[m]){
  const scope=topDeckEffects[m],window=deckWindow(p.deck,scope);
  const eligible=scope.cardType?window.filter(c=>c.cardType===scope.cardType):window;
  deckRequest('cards',eligible,scope.cardType?0:Math.min(1,eligible.length),Math.min(1,eligible.length),scope);
 }
 if(['ULTRA_BALL','CYRANO','HILDA','BROCK','MEOWTH_ENTRY','POKEPAD','POFFIN','AKAMATSU'].includes(m)){
  let candidates=p.deck.filter(c=>m==='CYRANO'?c.kind==='pokemon'&&record(c).name.endsWith('ex'):m==='MEOWTH_ENTRY'?c.cardType==='SUPPORTER':m==='POKEPAD'?c.kind==='pokemon'&&!record(c).facts.rulePokemon:m==='POFFIN'?c.kind==='pokemon'&&record(c).facts.basic&&record(c).facts.hp<=70:m==='AKAMATSU'?basicEnergy(c):m==='HILDA'?c.kind==='energy'||c.kind==='pokemon'&&!record(c).facts.basic:c.kind==='pokemon');
  if(m==='ULTRA_BALL')cardRequest('discard',p.hand.filter(c=>id(c)!==id(card)),2,2);
  const max=m==='CYRANO'?3:['HILDA','BROCK','POFFIN','AKAMATSU'].includes(m)?2:1;
  deckRequest('cards',candidates,0,m==='POFFIN'?Math.min(max,5-p.bench.length):max);
  const rules={HILDA:{kind:'distinct',field:'kind',error:'HILDA_CATEGORY_SELECTION'},AKAMATSU:{kind:'distinct',field:'energyType',error:'AKAMATSU_DIFFERENT_TYPES'},BROCK:{kind:'maxWhen',field:'basic',equals:false,max:1,error:'BROCK_EVOLUTION_OR_BASIC'}};
  if(rules[m])out.at(-1).constraints=[rules[m]];
  if(m==='AKAMATSU'){
   cardRequest('toHand',candidates,0,1);out.at(-1).dependencies=[{kind:'subset',key:'cards'},{kind:'countFromSelection',key:'cards',threshold:1,count:1}];cardRequest('attachTo',own.map(c=>({id:id(c),name:c.name})),0,1);out.at(-1).dependencies=[{kind:'countFromSelection',key:'cards',threshold:2,count:1}];
  }
 }
 if(m==='SUPPORTER_SEARCH_BY_STAGE'){
  const candidates=p.deck.filter(c=>c.kind==='pokemon'&&[0,1,2].includes(record(c).facts.stage));
  deckRequest('cards',candidates,0,new Set(candidates.map(c=>record(c).facts.stage)).size);
  out.at(-1).constraints=[{kind:'distinct',field:'stage',error:'DECK_SEARCH_DUPLICATE_STAGE'}];
 }
 if(m==='MASS_ENERGY_ROUTE'){
  const plan=effect.plan,targets=massRouteTargets(p,card,plan),pool=targets.length?massRouteEnergy(p,plan):[],max=Math.min(plan.limit,pool.length,plan.oneEach?targets.length:Infinity),min=plan.zone==='deck'?0:plan.allHolders?max:Math.min(1,max);
  if(plan.zone==='deck')deckRequest('energy',pool,min,max);
  else cardRequest('energy',pool,min,max);
  if(plan.target!=='self'){
   for(let i=0;i<(plan.multi?max:1);i++){
    cardRequest('attachTo'+i,targets,0,Math.min(1,targets.length));
    out.at(-1).dependencies=[...Array.from({length:plan.oneEach?i:0},(_,n)=>({kind:'excludeSelectedField',key:'attachTo'+n,field:'id'})),{kind:'countFromSelection',key:'energy',threshold:i+1,count:1}];
   }
  }
 }
 if(m==='SUPPORTER_MEGA_HEAL_RETURN_ENERGY')cardRequest('cards',own.filter(c=>isMegaEvolutionEx(c)&&c.damage>0),1,1);
 if(m==='MASS_ZONE_TRANSFER'){
  const plan=effect.plan,pool=p[plan.zone].filter(c=>massTransferCandidate(c,plan));
  const group=c=>plan.distinctBy==='category'?record(c).category:c.energyType;
  const max=Math.min(plan.limit,plan.distinctBy?new Set(pool.map(group)).size:pool.length);
  if(plan.zone==='deck')deckRequest('cards',pool,0,max);
  else cardRequest('cards',pool,Math.min(1,max),max);
  if(plan.distinctBy){
   const request=out.at(-1),groups=new Map(pool.map(c=>[id(c),group(c)]));
   request.candidates=request.candidates.map(c=>({...c,searchGroup:groups.get(id(c))}));
   request.constraints=[{kind:'distinct',field:'searchGroup',error:'MASS_SEARCH_DUPLICATE_GROUP'}];
  }
 }
 if(m==='MASS_HEAL_SCOPE'&&effect.plan.choice){
  const pool=scopeHealTargets(p,o,effect.plan).filter(c=>c.damage>0);
  cardRequest('cards',pool,Math.min(1,pool.length),Math.min(1,pool.length));
 }
 if(m==='MASS_HEAL_OWN'&&effect.plan.target==='choice'){
  const pool=massHealTargets(p,effect.plan).filter(c=>c.damage>0),min=Math.min(1,pool.length);
  cardRequest('cards',pool,min,min);
 }
 if(m==='ABILITY_EVOLVE_MULTI_COUNTERS'){
  const count=Math.min(effect.plan.count,opp.length);cardRequest('target',opp,count,count);
 }
 if(m==='ATTACK_OPTIONAL_RETURN_POKEMON')add('mode','CARD',[{id:'stay',name:'場に残す'},{id:'return',name:'手札にもどす'}],1,1);
 if(m==='MASS_COUNTER_GRAMMAR'){
  const plan=effect.plan;
  if(plan.mode==='allocation')add('allocation','COUNTERS',opp.map(c=>({id:id(c),name:c.name,damage:c.damage||0,hp:c.hp})),plan.amount,plan.amount);
  else if(plan.scope==='choice'){const count=Math.min(plan.count,opp.length);cardRequest('target',opp,count,count);}
 }
 if(m==='MASS_PLACE_COUNTERS'&&['choice','benchChoice'].includes(effect.plan.target)){
  const pool=effect.plan.target==='benchChoice'?o.bench:opp;
  const count=Math.min(1,pool.length);cardRequest('target',pool,count,count);
 }
 if(m==='ABILITY_TYPED_COST_COUNTER'){
  cardRequest('discard',p.hand.filter(c=>basicEnergy(c)&&c.energyType===effect.plan.type),1,1);
  cardRequest('target',opp,1,1);
 }
 if(m==='TRAINER_SWITCH_OR_EX_V_BOOST'){
  add('mode','CARD',[{id:'boost',name:'ダメージを+30'},{id:'switch',name:'バトル場とベンチを入れ替える'}].filter(c=>c.id==='boost'||p.bench.length),1,1);
  cardRequest('ownBench',p.bench,0,Math.min(1,p.bench.length));
  if(p.bench.length)out.at(-1).dependencies=[{kind:'countWhenSelected',key:'mode',value:'switch',count:1}];
 }
 if(m==='ABILITY_SWITCH_OWN')cardRequest('ownBench',p.bench,1,1);
 if(['ABILITY_SEARCH_TYPED_EVOLUTION','TRAINER_SEARCH_TERA'].includes(m)){
  const pool=p.deck.filter(c=>typedEvolutionOrTera(c,effect.plan));
  deckRequest('cards',pool,0,Math.min(effect.plan.limit,pool.length));
 }
 if(m==='TRAINER_SWITCH_BOTH'){
  cardRequest('opponentBench',o.bench,1,1);
  if(p.bench.length)cardRequest('ownBench',p.bench,1,1);
 }
 if(m==='SUPPORTER_ROCKET_SWITCH_BOTH'){
  cardRequest('ownBench',p.bench.filter(c=>record(c).name.startsWith('ロケット団の')),1,1);
  if(o.bench.length)cardRequest('opponentBench',o.bench,1,1);
 }
 if(m==='SUPPORTER_BASIC_SWITCH_CONFUSE')cardRequest('opponentBench',o.bench.filter(c=>record(c).facts.basic),1,1);
 if(m==='SUPPORTER_SWITCH_EX_HEAL')cardRequest('ownBench',p.bench,1,1);
 if(m==='SUPPORTER_SWITCH_THEN_DRAW_TO_LIMIT')cardRequest('ownBench',p.bench,1,1);
 if(m==='DISCARD_TO_SEARCH_DISTINCT_CATEGORIES'){
  const plan=effect.plan,candidates=p.deck.filter(c=>plan.categories.includes(record(c)?.category));
  const category=c=>record(c).category;
  cardRequest('discard',p.hand.filter(c=>id(c)!==id(card)),plan.cost,plan.cost);
  deckRequest('cards',candidates,0,new Set(candidates.map(category)).size);
  const request=out.at(-1);
  request.candidates=request.candidates.map(c=>({...c,searchCategory:category(c)}));
  request.constraints=[{kind:'distinct',field:'searchCategory',error:'DECK_SEARCH_DUPLICATE_CATEGORY'}];
 }
 if(m==='SEARCH_MEGA_EVOLUTION_EX')deckRequest('cards',p.deck.filter(isMegaEvolutionEx),0,1);
 if(m==='DISCARD_ONE_DRAW_OPP_BENCH')cardRequest('discard',p.hand.filter(c=>id(c)!==id(card)),1,1);
 if(m==='SUPPORTER_DISCARD_ONE_DRAW_TO_SIX')cardRequest('discard',p.hand.filter(c=>id(c)!==id(card)),1,1);
 if(m==='RECYCLE_BASIC_ENERGY')cardRequest('cards',p.discard.filter(basicEnergy),1,Math.min(effect.plan.amount,p.discard.filter(basicEnergy).length));
 if(m==='HEAL_AND_CLEAR_STATUS')cardRequest('cards',own.filter(canHealOrClearStatus),1,1);
 if(m==='RECOVER_NON_RULE_AND_ENERGY'){const pool=p.discard.filter(nonRuleRecovery);cardRequest('cards',pool,1,Math.min(effect.plan.amount,pool.length));}
 if(m==='HEAL_LOW_HP_FULL')cardRequest('cards',own.filter(c=>lowHpHeal(c,effect.plan)),1,1);
 if(m==='ATTACK_PRIZE_BONUS_DISCARD'){const pool=card.energyCards||[];const count=Math.min(1,pool.length);cardRequest('energy',pool,count,count);}
 if(m==='RECOVER_TYPED_DISCARD'){const pool=p.discard.filter(c=>typedRecoveryCandidate(c,effect.plan));cardRequest('cards',pool,1,Math.min(effect.plan.amount,pool.length));}
 if(m==='RECOVER_BASIC_ENERGY')cardRequest('cards',p.discard.filter(basicEnergy),1,Math.min(effect.plan.amount,p.discard.filter(basicEnergy).length));
 if(m==='STRETCHER')cardRequest('cards',p.discard.filter(c=>c.kind==='pokemon'||basicEnergy(c)),1,1);
 if(['SWITCH','BOSS'].includes(m))cardRequest('bench',m==='SWITCH'?p.bench:o.bench,1,1);
 if(m==='ENERGY_SWITCH'){
  cardRequest('energy',own.flatMap(c=>(c.energyCards||[]).filter(basicEnergy).map(e=>({...e,containerId:id(c)}))),1,1);cardRequest('attachTo',own.map(c=>({id:id(c),name:c.name})),1,1);out.at(-1).dependencies=[{kind:'excludeSelectedField',key:'energy',field:'containerId'}];
 }
 if(m==='HEAL_DAMAGE')cardRequest('cards',own.filter(c=>(c.damage||0)>0),1,1);
 if(m==='COIN_FORCE_SWITCH')cardRequest('bench',o.bench,1,1);
 if(m==='TRAINER_DISCARD_SPECIAL_ENERGY')cardRequest('energy',opp.flatMap(c=>(c.energyCards||[]).filter(e=>e.isSpecial)),1,1);
 if(m==='HAMMER'){const energies=opp.flatMap(c=>c.energyCards||[]);cardRequest('energy',energies,energies.length?1:0,1);}
 if(m==='ROSA'){
  cardRequest('cards',p.discard.filter(basicEnergy),0,2);cardRequest('attachTo',own.filter(c=>record(c).facts.stage===2).map(c=>({id:id(c),name:c.name})),1,1);
 }
 return out;
}
function selected(action,key){
 const x=action.selections?.[key];
 assert(x===undefined||Array.isArray(x),'INVALID_REFERENCE_SELECTION_TYPE:'+key);
 return x||[];
}
function verifyRequests(g,actor,card,effect,action){
 const req=requests(g,actor,card,effect);
 if(effect.plan.mechanic==='ENERGY_SWITCH'){const source=field(player(g,actor)).find(c=>(c.energyCards||[]).some(e=>id(e)===selected(action,'energy')[0]));assert(!source||id(source)!==selected(action,'attachTo')[0],'ENERGY_SWITCH_SAME_POKEMON');}
 for(const original of req){
  const r=Selection.resolve(original,req,action.selections);
  if(r.kind==='COUNTERS'){
   const allocation=action.selections?.allocation;assert(allocation&&typeof allocation==='object'&&!Array.isArray(allocation),'COUNTER_ALLOCATION_REQUIRED');
   const entries=Object.entries(allocation);assert(entries.every(([key,n])=>r.candidates.some(c=>c.id===key)&&Number.isInteger(n)&&n>=0)&&entries.reduce((s,[,n])=>s+n,0)===r.min&&r.min===r.max,'INVALID_COUNTER_ALLOCATION');continue;
  }
  if(r.kind==='COUNT'){const n=action.selections?.count;assert(Number.isInteger(n)&&n>=r.min&&n<=r.max,'INVALID_COUNTER_COUNT');continue;}
  const ids=r.kind==='POKEMON'?(action.targetIds||[]):selected(action,r.key);
  assert(ids.length>=r.min&&ids.length<=r.max&&new Set(ids).size===ids.length&&ids.every(i=>r.candidates.some(c=>(c.id||c.instanceId)===i)),'INVALID_REFERENCE_SELECTION:'+r.key);
  for(const rule of r.constraints||[])assert(Selection.allows(r.candidates,ids,[rule]),rule.error||'INVALID_SELECTION_CONSTRAINT');
 }
 if(effect.plan.mechanic==='TRAINER_SWITCH_OR_EX_V_BOOST'){
  const mode=selected(action,'mode')[0],bench=selected(action,'ownBench');
  assert(bench.length===(mode==='switch'?1:0),'SUPPORTER_MODE_TARGET_MISMATCH');
 }
 const m=effect.plan.mechanic,p=player(g,actor),cards=selected(action,'cards').map(i=>p.deck.find(c=>id(c)===i));
 if(m==='MASS_ATTACHED_ENERGY_MOVE'){
  const plan=effect.plan,{pool}=attachedMovePool(p,opponent(g,actor),card,plan),chosen=selected(action,'energy').map(i=>pool.find(e=>id(e)===i));
  assert(chosen.every(Boolean),'INVALID_MOVE_ENERGY');
  if(plan.count===null)assert(chosen.length===pool.length,'ALL_MOVE_ENERGY_REQUIRED');
  else if(chosen.length||!plan.optional){
   const supplied=chosen.reduce((n,e)=>n+e.moveUnits,0),required=Math.min(plan.count,pool.reduce((n,e)=>n+e.moveUnits,0));
   if(!plan.upTo)assert(supplied>=required,'INSUFFICIENT_MOVE_ENERGY_UNITS');
   assert(chosen.every(e=>supplied-e.moveUnits<required),'REDUNDANT_MOVE_ENERGY');
  }
 }
 if(['ATTACK_DISCARD_MULTIPLE_SELF_ENERGY','ATTACK_RETURN_SELF_ENERGY'].includes(m)||m==='ATTACK_SPREAD_DAMAGE'&&Number.isInteger(effect.plan.discardAttached)){
  // The selection specifies physical cards, but the printed quantity counts
  // their provided Energy units (including multi-unit special Energy).
  const contribution=energy=>selectedAttachmentUnits(card,energy,effect.plan);
  const available=(card.energyCards||[]).filter(energy=>contribution(energy)>0);
  const choice=selected(action,'energy').map(ident=>available.find(e=>id(e)===ident));
  assert(choice.every(Boolean),'INVALID_SELF_ENERGY_SELECTION');
  const target=Math.min((m==='ATTACK_SPREAD_DAMAGE'?effect.plan.discardAttached:effect.plan.count),available.reduce((n,e)=>n+contribution(e),0));
  const selectedUnits=choice.reduce((n,e)=>n+contribution(e),0);
  assert(selectedUnits>=target,'INSUFFICIENT_SELECTED_ENERGY_UNITS');
  assert(choice.every(e=>selectedUnits-contribution(e)<target),
    'REDUNDANT_SELF_ENERGY_DISCARD_SELECTION');
 }
 if(m==='AKAMATSU'){
  const hand=selected(action,'toHand'),target=selected(action,'attachTo');assert(hand.length===Math.min(1,cards.length)&&hand.every(i=>cards.some(c=>id(c)===i)),'AKAMATSU_HAND_CHOICE');assert(target.length===(cards.length>1?1:0),'AKAMATSU_ATTACH_CHOICE');
 }
 if(m==='ENERGY_SWITCH'){const source=field(p).find(c=>(c.energyCards||[]).some(e=>id(e)===selected(action,'energy')[0]));assert(source&&id(source)!==selected(action,'attachTo')[0],'ENERGY_SWITCH_SAME_POKEMON');}
 if(m==='ADRENA_BRAIN')assert((find(g,selected(action,'source')[0]).card.damage||0)>=action.selections.count*10,'NOT_ENOUGH_DAMAGE_COUNTERS');
}
// Activation origins come from verified text of an already compiled ability.
// Never infer executable effects from a card name or an uncompiled description.
function abilityOrigin(a){
 const text=String(a.text||'').replace(/\s+/g,'');
 if(text.startsWith('このポケモンは、ベンチにいるかぎり'))return {zones:['BENCH'],entry:false};
 if(text.includes('このカードが手札にあり'))return {zones:['HAND'],entry:false};
 if(text.includes('このカードを手札からベンチに出したとき'))return {zones:['BENCH'],entry:true};
 if(a.plan?.mechanic==='ACTIVE_OPPONENT_ABILITY_SUPPRESSION')return {zones:['ACTIVE'],entry:false};
 if(text.startsWith('このポケモンがバトル場にいるなら'))return {zones:['ACTIVE'],entry:false};
 return {zones:['ACTIVE','BENCH'],entry:false};
}
function abilityZone(p,card){return p.hand.includes(card)?'HAND':p.active===card?'ACTIVE':p.bench.includes(card)?'BENCH':null;}
function abilityCheck(g,actor,card,a,action){
 const p=player(g,actor),m=a.plan.mechanic;
 const origin=abilityOrigin(a),zone=abilityZone(p,card);
 assert(origin.zones.includes(zone),'ABILITY_SOURCE_ZONE:'+origin.zones.join('|'));
 assert(!origin.entry||card.entryWindow===g.referenceActionSequence,'BENCH_ENTRY_WINDOW_REQUIRED');
 if(a.plan.origin==='evolve')assert(card.referenceEvolutionWindow===g.referenceActionSequence,'EVOLUTION_ENTRY_WINDOW_REQUIRED');
 if(a.plan.requiresTera)assert(field(p).some(c=>record(c).facts.teraBenchProtection===true),'TERA_POKEMON_REQUIRED');
 if(m==='MASS_EFFECT_SEQUENCE'&&a.plan.steps.every(s=>s.op==='healSelf'))assert(card.damage>0,'ABILITY_HEAL_UNAVAILABLE');
 assert(zone==='HAND'||abilityEnabled(g,card,a),'ABILITY_SUPPRESSED');
 assert(!passive.has(m),'CONTINUOUS_ABILITY_NOT_DECLARABLE');assert(a.plan.repeated===true||!used(p,card,a),'ABILITY_ALREADY_USED');
 if(m==='HAND_LIMIT_DRAW_ABILITY')assert(p.hand.length<a.plan.limit&&p.deck.length>0,'HAND_LIMIT_DRAW_UNAVAILABLE');
 if(m==='ACTIVE_TOP_SUPPORTER_SEARCH')assert(p.deck.length>0,'ABILITY_SEARCH_DECK_EMPTY');
 if(m==='MASS_ATTACHED_ENERGY_MOVE')assert(attachedMovePool(p,opponent(g,actor),card,a.plan).pool.length>0,'NO_ATTACHED_ENERGY_MOVE');
 if(m==='MASS_ENERGY_ROUTE')assert(massRouteTargets(p,card,a.plan).length&&(a.plan.zone==='deck'?p.deck.length>0:massRouteEnergy(p,a.plan).length>0),'NO_MASS_ENERGY_ROUTE');
 if(m==='MASS_ZONE_TRANSFER')assert(a.plan.zone==='deck'?p.deck.length>0:p.discard.some(c=>massTransferCandidate(c,a.plan)),'NO_MASS_TRANSFER_SOURCE');
 if(m==='MASS_HEAL_SCOPE')assert(scopeHealTargets(p,opponent(g,actor),a.plan).some(c=>c.damage>0),'NO_SCOPE_HEAL_TARGET');
 if(m==='MASS_HAND_FLOW')assert(handFlowAvailable(p,opponent(g,actor),a.plan),'NO_HAND_FLOW_CHANGE');
 if(m==='MASS_HEAL_OWN')assert(massHealTargets(p,a.plan).some(c=>c.damage>0),'NO_MASS_HEAL_TARGET');
 if(m==='MASS_PRIZE_DRAW')assert(p.deck.length>0,'ABILITY_DRAW_DECK_EMPTY');
 if(m==='ABILITY_SWITCH_OWN')assert(p.bench.length>0,'NO_OWN_BENCH');
 if(m==='ABILITY_SEARCH_TYPED_EVOLUTION')assert(p.deck.length>0,'ABILITY_SEARCH_DECK_EMPTY');
 if(m==='ABILITY_DRAW_CARDS')assert(p.deck.length>0,'ABILITY_DRAW_DECK_EMPTY');
 if(m==='ABILITY_TYPED_COST_COUNTER')assert(p.active===card&&p.hand.some(c=>basicEnergy(c)&&c.energyType===a.plan.type),'COUNTER_COST_OR_ACTIVE_REQUIRED');
 if(m==='ABILITY_TYPED_COST_DRAW_LIMIT'){
  const plan=a.plan;
  assert((plan.zone==='attached'?card.energyCards:p.hand).some(c=>basicEnergy(c)&&c.energyType===plan.type),'TYPED_DRAW_COST_MISSING');
  assert(!plan.partnerName||field(p).some(c=>record(c).name===plan.partnerName),'TYPED_DRAW_PARTNER_REQUIRED');
  assert(!plan.sharedUseName||!p.turnLimits?.abilityNames?.[plan.sharedUseName],'SHARED_TYPED_DRAW_ALREADY_USED');
  assert(p.deck.length>0&&(plan.amount||p.hand.length-(plan.zone==='hand'?1:0)<plan.limit),'TYPED_DRAW_NOT_AVAILABLE');
 }
 if(m==='ABILITY_DISCARD_DRAW')assert(p.hand.length>=a.plan.cost&&p.deck.length>0,'ABILITY_DISCARD_DRAW_UNAVAILABLE');
 if(m==='ABILITY_ATTACH_SELF_DRAW')assert(p.hand.some(c=>basicEnergy(c)&&c.energyType===a.plan.type),'ABILITY_TYPED_ENERGY_REQUIRED');
 if(m==='ABILITY_HEAL_SELF')assert((card.damage||0)>0,'ABILITY_HEAL_UNAVAILABLE');
 if(m==='DASH')assert(p.active===card&&!p.turnLimits?.abilityNames?.DASH,'DASH_ACTIVE_AND_SHARED_LIMIT');
 if(m==='REVERSAL_DRAW')assert(wasKnockedOut(g,actor)&&!p.turnLimits?.abilityNames?.REVERSAL_DRAW,'PREVIOUS_OPPONENT_KNOCKOUT_REQUIRED');
 if(m==='MEOWTH_ENTRY')assert(card.entryWindow===g.referenceActionSequence&&!p.turnLimits?.abilityNames?.MEOWTH_ENTRY,'BENCH_ENTRY_WINDOW_REQUIRED');
 if(m==='ADRENA_BRAIN')assert(energyUnits(card).some(u=>u.includes('悪')),'DARK_ENERGY_REQUIRED');
 if(m==='EXCITE_DIVE'){assert(p.bench.length<5,'BENCH_FULL');assert(field(p).some(c=>record(c).facts.prizeCount===3&&record(c).facts.types.includes('無色')),'COLORLESS_MEGA_IN_PLAY_REQUIRED');}
 verifyRequests(g,actor,card,a,action);
}
function handles(action){return ['attack_turn','effect_attack','attack','use_ability','play_item','play_supporter','play_stadium','attach_tool','attach_energy','retreat','resolve_reference_choice'].includes(action.type);}
function referenceChoiceAction(choice,value){
 const action={type:'resolve_reference_choice'};
 if(choice.kind==='MULLIGAN')return {...action,drawCount:value};
 if(choice.kind==='CIRCULATOR')return {...action,...value};
 if(choice.kind==='DECK_POKEMON_SEARCH')return {...action,deckCardId:value};
 return {...action,benchInstanceId:value};
}
function preflight(g,actor,action){
 if(!g.referenceEffectValidation)return null;
 try{
  if(g.referenceRngState!==undefined)assert(Number.isInteger(g.referenceRngState)&&g.referenceRngState>=0&&g.referenceRngState<=0xffffffff,'INVALID_REFERENCE_RNG_STATE');
  if(g.pendingReferenceChoice&&action.type!=='take_prizes'){
   const choice=g.pendingReferenceChoice;
   assert(action.type==='resolve_reference_choice'&&choice.playerId===actor,'REFERENCE_CHOICE_REQUIRED');
   const matching=choice.options.some(value=>{
    const expected=referenceChoiceAction(choice,value);
    return Object.keys(expected).every(key=>expected[key]===action[key]);
   });
   assert(matching,'INVALID_REFERENCE_CHOICE');
   return {handled:true,errors:[]};
  }
  const automatic=unconnectedAutomatic(g);if(automatic)throw Error('UNCONNECTED_EFFECT:'+JSON.stringify(automatic));
  const p=player(g,actor),o=opponent(g,actor);
  if(!handles(action))return {handled:false,errors:[]};
  assert(g.status==='active'&&g.phase==='main'&&g.turnPlayer===actor&&!g.attackUsed,'REFERENCE_ACTION_NOT_ALLOWED');
  if(action.type==='attack'||action.type==='effect_attack')throw Error('REFERENCE_ATTACK_TURN_ACTION_REQUIRED');
  if(action.type==='attack_turn'){
   const mon=p.active,r=record(mon),a=r?.attacks[action.attackIndex];assert(mon&&a,'ATTACK_MISSING');requirePlan(mon,a);
   assert(g.turnNumber!==1,'FIRST_PLAYER_FIRST_TURN_ATTACK');assert(!(a.plan.noSecondPlayerFirstTurn&&g.turnNumber===2),'SECOND_PLAYER_FIRST_TURN_ATTACK_RESTRICTED');assert(mon.referenceCannotAttackTurn!==g.turnNumber,'ATTACK_DISABLED_THIS_TURN');assert(!(mon.referenceNamedAttackLock?.turn===g.turnNumber&&mon.referenceNamedAttackLock.attackName===a.name),'NAMED_ATTACK_LOCKED_THIS_TURN');assert(mon.referenceAttackLockUntilSwitch?.attackName!==a.name,'ATTACK_LOCKED_UNTIL_SWITCH');
   assert(!['ASLEEP','PARALYZED'].includes(mon.statusCondition),'ATTACK_BLOCKED_BY_STATUS');
   if(!a.cost.every(t=>[...basicTypes,'無色'].includes(t)))stop(mon,a,'UNREVIEWED_ENERGY_SYMBOL');
   // Continuous Rocket Team ability: include the attacking Pokemon itself.
   // Suppressed abilities must not block a legitimate attack.
   for(const ability of enabledAbilities(g,mon)){
    if(ability.plan.mechanic==='PASSIVE_ROCKET_TEAM_ATTACK_GATE'){
     const available=field(p).filter(c=>record(c).name.startsWith('ロケット団の')).length;
     assert(available>=ability.plan.required,'ROCKET_TEAM_ATTACK_REQUIREMENT');
    }
   }
   assert(pays(mon,cost(g,mon,a)),'INSUFFICIENT_VERIFIED_ENERGY');verifyRequests(g,actor,mon,a,action);

  }else if(action.type==='use_ability'){
   const mon=[...field(p),...p.hand].find(c=>id(c)===action.sourceInstanceId),a=record(mon)?.abilities.find(a=>a.effectId===action.abilityId);assert(mon&&a,'ABILITY_MISSING');requirePlan(mon,a);abilityCheck(g,actor,mon,a,action);
  }else if(action.type==='attach_energy'){
   const card=p.hand[action.cardIndex],mon=action.target==='active'?p.active:p.bench[action.target],r=record(card);assert(card?.kind==='energy'&&mon&&!p.normalEnergyAttached,'ENERGY_ATTACHMENT_NOT_ALLOWED');
   if(!connected(r?.mainPlan))stop(card,{name:r?.name||card.name},'SPECIAL_ENERGY_EFFECT_NOT_CONNECTED');if(r.mainPlan.mechanic==='ROCKET_ENERGY')assert(record(mon).name.startsWith('ロケット団の'),'ROCKET_POKEMON_ONLY');
  }else if(action.type==='retreat'){
   assert(p.active&&p.bench.some(c=>id(c)===action.benchInstanceId)&&!g.retreatUsed,'RETREAT_NOT_ALLOWED');
   assert(p.active.referenceCannotRetreatTurn!==g.turnNumber,'RETREAT_DISABLED_THIS_TURN');
   assert(!['ASLEEP','PARALYZED'].includes(p.active.statusCondition),'STATUS_PREVENTS_RETREAT');
   const energies=action.energyIds||[],available=(p.active.energyCards||[]).filter(c=>energies.includes(id(c)));
   assert(new Set(energies).size===energies.length&&available.length===energies.length,'RETREAT_ENERGY_IDS');
   const count=energyUnits({...p.active,energyCards:available}).length;assert(count>=p.active.retreatCost&&(p.active.retreatCost>0||energies.length===0),'RETREAT_PAYMENT');
   for(let i=0;i<available.length;i++)assert(energyUnits({...p.active,energyCards:available.filter((_,j)=>i!==j)}).length<p.active.retreatCost,'RETREAT_EXCESS_PAYMENT');
  }else {
   const card=p.hand.find(c=>id(c)===action.cardId),r=record(card);assert(card&&r,'HAND_CARD_MISSING');requirePlan(card,{name:r.name,plan:r.mainPlan});
   if(action.type==='attach_tool')assert(card.kind==='tool'&&field(p).some(c=>id(c)===action.targetInstanceId&&!(c.tools||[]).length),'TOOL_ATTACHMENT_NOT_ALLOWED');
   if(action.type==='play_item')assert(card.cardType==='ITEM'&&!itemLocked(g,actor),'ITEM_NOT_ALLOWED');
   if(action.type==='play_supporter')assert(card.cardType==='SUPPORTER'&&(g.turnNumber!==1||r.mainPlan.mechanic==='SUPPORTER_FIRST_TURN_DISCARD_HAND_DRAW')&&!p.turnLimits?.supporterUsed,'SUPPORTER_NOT_ALLOWED');
   if(action.type==='play_stadium')assert(card.kind==='stadium'&&g.stadiumPlayedTurn!==g.turnNumber&&g.stadium?.name!==card.name,'STADIUM_NOT_ALLOWED');
   const m=r.mainPlan.mechanic;
   if(m==='SUPPORTER_DISCARD_ONE_DRAW_TO_SIX')
    assert(p.hand.some(c=>id(c)!==id(card)),'SUPPORTER_DISCARD_COST_REQUIRED');
   if(m==='DISCARD_TO_SEARCH_DISTINCT_CATEGORIES'){
    assert(p.hand.length-1>=r.mainPlan.cost,'HAND_DISCARD_COST_REQUIRED');
    assert(p.deck.length>0,'NO_DECK_SEARCH_POSSIBLE');
   }
   if(m==='MASS_ATTACHED_ENERGY_MOVE')assert(attachedMovePool(p,o,card,r.mainPlan).pool.length>0,'NO_ATTACHED_ENERGY_MOVE');
   if(m==='MASS_ENERGY_ROUTE'){
    assert(massRouteTargets(p,card,r.mainPlan).length&&(r.mainPlan.zone==='deck'?p.deck.length>0:massRouteEnergy(p,r.mainPlan).length>0),'NO_MASS_ENERGY_ROUTE');
    if(r.mainPlan.requiresTera)assert(field(p).some(c=>record(c).facts.teraBenchProtection===true),'TERA_POKEMON_REQUIRED');
   }
   if(m==='SUPPORTER_MEGA_HEAL_RETURN_ENERGY')assert(field(p).some(c=>isMegaEvolutionEx(c)&&c.damage>0),'NO_DAMAGED_MEGA_EVOLUTION_EX');
   if(m==='MASS_ZONE_TRANSFER')assert(r.mainPlan.zone==='deck'?p.deck.length>0:p.discard.some(c=>massTransferCandidate(c,r.mainPlan)),'NO_MASS_TRANSFER_SOURCE');
   if(m==='MASS_HEAL_SCOPE')assert(scopeHealTargets(p,o,r.mainPlan).some(c=>c.damage>0),'NO_SCOPE_HEAL_TARGET');
   if(m==='MASS_HAND_FLOW')assert(handFlowAvailable(p,o,r.mainPlan),'NO_HAND_FLOW_CHANGE');
   if(m==='MASS_HEAL_OWN')assert(massHealTargets(p,r.mainPlan).some(c=>c.damage>0),'NO_MASS_HEAL_TARGET');
   if(m==='MASS_PRIZE_DRAW')assert(p.deck.length>0,'DRAW_DECK_EMPTY');
   if(m==='TRAINER_SEARCH_TERA')assert(p.deck.length>0,'NO_DECK_SEARCH_POSSIBLE');
   if(m==='TRAINER_DISCARD_SPECIAL_ENERGY')assert(field(o).some(c=>(c.energyCards||[]).some(e=>e.isSpecial)),'NO_OPPONENT_SPECIAL_ENERGY');
   if(m==='TRAINER_SWITCH_BOTH')assert(o.bench.length>0,'NO_OPPONENT_BENCH');
   if(m==='SUPPORTER_ROCKET_SWITCH_BOTH')assert(record(p.active).name.startsWith('ロケット団の')&&p.bench.some(c=>record(c).name.startsWith('ロケット団の')),'ROCKET_SWITCH_REQUIREMENT');
   if(m==='SUPPORTER_BASIC_SWITCH_CONFUSE')assert(o.bench.some(c=>record(c).facts.basic),'NO_OPPONENT_BASIC_BENCH');
   if(m==='SUPPORTER_SWITCH_EX_HEAL')assert(p.bench.length>0,'NO_OWN_BENCH');
   if(m==='SUPPORTER_SWITCH_THEN_DRAW_TO_LIMIT')assert(p.bench.length>0,'NO_OWN_BENCH');
   if(m==='SUPPORTER_SEARCH_BY_STAGE')assert(p.deck.length>0,'NO_DECK_SEARCH_POSSIBLE');
   if(m==='INSPECTED_OPPONENT_HAND_TRANSFER')assert(o.hand.length>0,'NO_OPPONENT_HAND_TO_INSPECT');
   if(m==='SUPPORTER_NON_RULE_DISCARD_DRAW')assert(p.deck.length>0&&p.hand.some(c=>c.kind==='pokemon'&&!record(c).facts.rulePokemon),'NO_NON_RULE_DRAW_COST');
   if(m==='DISCARD_ONE_DRAW_OPP_BENCH')assert(p.hand.some(c=>id(c)!==id(card)),'SUPPORTER_DISCARD_COST_REQUIRED');
   if(m==='HEAL_ACTIVE_DAMAGE')assert(p.active&&(p.active.damage||0)>0,'NO_DAMAGED_ACTIVE_POKEMON');
   if(m==='HEAL_AND_CLEAR_STATUS')assert(field(p).some(canHealOrClearStatus),'NO_HEAL_OR_STATUS_TARGET');
   if(m==='RECYCLE_BASIC_ENERGY')assert(p.discard.some(basicEnergy),'NO_RECOVERABLE_BASIC_ENERGY');
   if(['DISCARD_DECK_TOP','SEARCH_MEGA_EVOLUTION_EX','COIN_SEARCH_POKEMON'].includes(m))assert(p.deck.length>0,'NO_DECK_SEARCH_POSSIBLE');
   if(['TRAINER_TOP_SELECT_DISCARD','TRAINER_TOP_TYPED_SEARCH','TRAINER_TOP_POKEMON_TRAINER'].includes(m))assert(p.deck.length>0,'TOP_SEARCH_DECK_EMPTY');
   if(m==='RECOVER_NON_RULE_AND_ENERGY')assert(p.discard.some(nonRuleRecovery),'NO_RECOVERABLE_NON_RULE_CARD');
   if(m==='HEAL_LOW_HP_FULL')assert(field(p).some(c=>lowHpHeal(c,r.mainPlan)),'NO_LOW_HP_HEAL_TARGET');
   if(m==='RECOVER_TYPED_DISCARD')assert(p.discard.some(c=>typedRecoveryCandidate(c,r.mainPlan)),'NO_RECOVERABLE_TYPED_CARD');if(m==='RECOVER_BASIC_ENERGY')assert(p.discard.some(basicEnergy),'NO_RECOVERABLE_BASIC_ENERGY');if(m==='DISCARD_HAND_DRAW')assert(p.deck.length>0||p.hand.some(c=>id(c)!==id(card)),'NO_DISCARD_OR_DRAW_POSSIBLE');if(m==='HEAL_DAMAGE')assert(field(p).some(c=>c.damage>0),'NO_DAMAGED_POKEMON');if(m==='COIN_FORCE_SWITCH')assert(o.bench.length>0,'NO_OPPONENT_BENCH');if(m==='HAMMER')assert(field(o).some(c=>c.energyCards.length),'NO_OPPONENT_ENERGY');if(m==='REPELLENT')assert(o.bench.length>0,'NO_OPPONENT_BENCH');if(m==='POFFIN')assert(p.bench.length<5,'BENCH_FULL');if(['ULTRA_BALL','CYRANO','HILDA','BROCK','POKEPAD','POFFIN','AKAMATSU','TOP_SUPPORTER_SEARCH'].includes(m))assert(p.deck.length>0,'NO_DECK_SEARCH_POSSIBLE');if(m==='RED_CARD')assert(o.prizes<=3,'OPPONENT_PRIZES_MUST_BE_THREE_OR_LESS');
   if(m==='UNFAIR')assert(wasKnockedOut(g,actor),'PREVIOUS_OPPONENT_KNOCKOUT_REQUIRED');
   if(m==='ROSA')assert(p.prizes>o.prizes,'MORE_REMAINING_PRIZES_REQUIRED');
   if(['play_item','play_supporter'].includes(action.type))verifyRequests(g,actor,card,{plan:r.mainPlan},action);
  }
  return {handled:true,errors:[]};
 }catch(e){return {handled:handles(action),errors:[e.message]};}
}
function bench(g,p,card,fromHand){
 const index=(fromHand?p.hand:p.deck).findIndex(c=>id(c)===id(card));assert(index>=0&&p.bench.length<5,'BENCH_SOURCE');
 (fromHand?p.hand:p.deck).splice(index,1);Object.assign(card,{cardId:id(card),damage:0,energies:[],energyCards:[],enteredTurn:g.turnNumber});p.bench.push(card);onBench(g,p,card,fromHand);
}
function onBench(g,p,card,fromHand){
 for(const key of Object.keys(p.turnLimits?.abilityUses||{}))if(key.startsWith(id(card)+':'))delete p.turnLimits.abilityUses[key];
 card.entryWindow=fromHand?g.referenceActionSequence+1:-1;
 if(stadium(g)==='RUINS'&&record(card).facts.basic&&!record(card).facts.types.includes('悪'))counters(g,p.id,card,2,{sourceType:'STADIUM'});
}
function moveChosen(g,p,zone,ids,destination,reveal=true){
 const moved=[];for(const ident of ids){const i=p[zone].findIndex(c=>id(c)===ident);assert(i>=0,'SELECTED_CARD_MISSING');const c=p[zone].splice(i,1)[0];p[destination].push(c);moved.push(c);}
 if(reveal)event(g,p.id,'REVEAL',{cardIds:ids,toPlayer:opponent(g,p.id).id});event(g,p.id,destination==='hand'?'ADD_TO_HAND':destination==='discard'?'DISCARD':'RETURN_TO_DECK',{cardIds:ids,fromZone:zone,...(!reveal?{privateTo:p.id}:{})});return moved;
}
function discardHandAndDraw(g,actor,p,amount){
 const cards=p.hand.splice(0);
 p.discard.push(...cards);
 event(g,actor,'DISCARD',{cardIds:cards.map(id)});
 draw(g,p,amount);
}
function searchSelectedDeck(g,actor,owner,selectedIds,{destination='hand',reveal=true}={}){
 assert(Array.isArray(selectedIds)&&new Set(selectedIds).size===selectedIds.length,'DECK_SEARCH_DUPLICATE_SELECTION');
 const selected=selectedIds.map(ident=>owner.deck.find(c=>id(c)===ident));
 assert(selected.every(Boolean),'DECK_SEARCH_SELECTION_CHANGED');
 if(destination==='hand')moveChosen(g,owner,'deck',selectedIds,'hand',reveal);
 else if(destination==='bench')for(const card of selected)bench(g,owner,card,false);
 else throw Error('DECK_SEARCH_DESTINATION_INVALID');
 event(g,actor,'SEARCH_DECK',{selectedCount:selectedIds.length,destination,privateTo:owner.id});
 shuffle(g,owner);
}
function inspectDeckTopToHand(g,p,scope,chosenIds){
 assert(chosenIds.length<=1,'DECK_INSPECTION_SELECTION_COUNT_INVALID');
 const top=p.deck.splice(0,scope.limit);
 const chosen=top.find(c=>id(c)===chosenIds[0]);
 assert(!chosenIds.length||chosen,'DECK_INSPECTION_SELECTION_CHANGED');
 if(chosen)p.hand.push(chosen);
 p.deck.push(...top.filter(c=>c!==chosen));
 if(chosen&&scope.reveal)event(g,p.id,'REVEAL',{cardIds:[id(chosen)],toPlayer:opponent(g,p.id).id});
 event(g,p.id,'ADD_TO_HAND',{cardIds:chosen?[id(chosen)]:[],...(!scope.reveal?{privateTo:p.id}:{}),fromZone:'deck'});
 if(scope.remainder==='shuffle')shuffle(g,p);
}
function resolveMixedTop(g,actor,p,plan,chosenIds){
 const top=p.deck.splice(0,plan.limit);
 const chosen=chosenIds.map(ident=>top.find(c=>id(c)===ident));
 assert(chosen.every(c=>c&&mixedTopCategory(c,plan)),'TOP_SEARCH_SELECTION_CHANGED');
 p.hand.push(...chosen);
 p.deck.push(...top.filter(c=>!chosenIds.includes(id(c))));
 event(g,actor,'SEARCH_DECK',{selectedCount:chosenIds.length,inspectedCount:top.length,privateTo:actor});
 if(chosen.length)event(g,actor,'REVEAL',{cardIds:chosenIds,toPlayer:opponent(g,actor).id});
 event(g,actor,'ADD_TO_HAND',{cardIds:chosenIds,fromZone:'deck'});
 shuffle(g,p);
}
function finishAttack(g,actor){
 g.attackUsed=true;g.referenceAttackTurnPending=actor;
 // A return-to-zone attack must promote its own replacement before resolving
 // the defender's knockout (official Speed Break ruling). Preserve that choice
 // instead of allowing Core.resolveKnockouts to overwrite it.
 if(g.pendingReferenceChoice?.kind==='PROMOTE'&&g.pendingReferenceChoice.playerId===actor&&!player(g,actor).active){g.referenceAttackAwaitingPromotion=true;return;}
 delete g.referenceAttackAwaitingPromotion;
 while(g.referenceReactions?.length){
  const reaction=g.referenceReactions.shift(),attacker=find(g,reaction.attackerId);if(!attacker)continue;
  if(reaction.kind==='ACTIVE_HIT_RETALIATION'){
   if(reaction.status){
    if(attacker.player.active!==attacker.card)continue;
    attacker.card.statusCondition=reaction.status;
    event(g,reaction.playerId,'STATUS_CONDITION',{status:reaction.status,targetInstanceId:id(attacker.card),effectId:reaction.effectId,mechanic:'PASSIVE_ACTIVE_HIT_RETALIATION'});
   }else{
    counters(g,reaction.playerId,attacker.card,reaction.counterCount);
    event(g,reaction.playerId,'ADD_STATE',{mechanic:'PASSIVE_ACTIVE_HIT_RETALIATION',targetInstanceId:id(attacker.card),counterCount:reaction.counterCount,effectId:reaction.effectId});
   }
   continue;
  }
  const choices=attacker.card.energyCards.flatMap(e=>attacker.player.bench.filter(c=>c!==attacker.card).map(c=>({energyId:id(e),benchInstanceId:id(c)})));
  if(choices.length){g.pendingReferenceChoice={...reaction,options:choices};return;}
 }
 delete g.referenceReactions;
 functions().Core.resolveKnockouts(g,actor);
 if(g.status==='finished'){delete g.referenceAttackTurnPending;delete g.pendingReferenceChoice;return;}
 if(!g.pendingPrizeSelection&&!g.pendingReferenceChoice){delete g.referenceAttackTurnPending;functions().Core.endTurn(g,actor);}
}
function chooseBenchSwitch(g,actor,owner,selectedId){
 assert(owner&&owner.active,'SWITCH_ACTIVE_REQUIRED');
 assert(owner.bench.some(c=>id(c)===selectedId),'SWITCH_BENCH_TARGET_INVALID');
 switchMon(g,owner,selectedId);
 event(g,actor,'SELECT_BENCH_SWITCH',{playerId:owner.id,benchInstanceId:selectedId});
}
function moveDamageCounters(g,actor,source,target,count,{attack=false,max=3}={}){
 assert(source&&target&&source!==target,'COUNTER_MOVE_TARGET_INVALID');
 assert(Number.isInteger(count)&&count>=1&&count<=max,'COUNTER_MOVE_COUNT_INVALID');
 assert((source.damage||0)>=count*10,'COUNTER_MOVE_SOURCE_INSUFFICIENT');
 if(attack&&target.referenceProtection?.opponentTurn===g.turnNumber)return;
 source.damage-=count*10;
 counters(g,actor,target,count,{attack});
 event(g,actor,'MOVE_DAMAGE_COUNTERS',{sourceInstanceId:id(source),targetInstanceId:id(target),counterCount:count});
}
function moveAttachedEnergy(g,actor,source,target,energyId){
 assert(source&&target&&source!==target,'ENERGY_MOVE_TARGET_INVALID');
 const attached=source.energyCards||[],index=attached.findIndex(e=>id(e)===energyId);
 assert(index>=0,'ENERGY_MOVE_SOURCE_CHANGED');
 target.energyCards||=[];
 const [energy]=attached.splice(index,1);
 target.energyCards.push(energy);
 event(g,actor,'MOVE_ENERGY',{energyId:id(energy),sourceInstanceId:id(source),targetInstanceId:id(target)});
}
function heal(g,actor,mon,requested){assert(mon&&find(g,id(mon))?.player.id===actor&&Number.isSafeInteger(requested)&&requested>0,'INVALID_HEAL_TARGET');const amount=Math.min(mon.damage||0,requested);mon.damage-=amount;event(g,actor,'HEAL',{targetInstanceId:id(mon),amount});return amount;}
function attackBonusApplies(predicate,own,defender){
 const print=record(defender);
 switch(predicate){
  case 'opponentEx':return print.name.endsWith('ex');
  case 'opponentExOrV':return print.name.endsWith('ex')||/V(?:MAX|STAR|-UNION)?$/.test(print.name);
  case 'opponentEvolved':return print.facts.stage>0;
  case 'opponentDamaged':return defender.damage>0;
  case 'ownBenchDamaged':return own.bench.some(card=>card.damage>0);
  default:throw Error('UNKNOWN_ATTACK_BONUS_PREDICATE');
 }
}
function attackMetric(plan,own,other){
 if(plan.metric==='opponentCounters')return (other.active.damage||0)/10;
 if(plan.metric==='ownCounters')return (own.active.damage||0)/10;
 if(plan.metric==='ownHand')return own.hand.length;
 if(plan.metric==='opponentHand')return other.hand.length;
 if(plan.metric==='opponentHandTrainerCount')return other.hand.filter(c=>['item','supporter','tool','stadium'].includes(record(c)?.category)).length;
 if(plan.metric==='ownPrizesTaken')return 6-own.prizes;
 if(plan.metric==='ownBasicCount')return field(own).filter(c=>record(c).facts.basic).length;
 if(plan.metric==='opponentBasicCount')return field(other).filter(c=>record(c).facts.basic).length;
 if(plan.metric==='ownStageOneCount')return field(own).filter(c=>record(c).facts.stage===1).length;
 if(plan.metric==='ownEvolvedCount')return field(own).filter(c=>record(c).facts.stage>0).length;
 if(plan.metric==='opponentEvolvedCount')return field(other).filter(c=>record(c).facts.stage>0).length;
 if(plan.metric==='ownBenchStageTwoCount')return own.bench.filter(c=>record(c).facts.stage===2).length;
 if(plan.metric==='ownDamagedBenchCount')return own.bench.filter(c=>c.damage>0).length;
 if(plan.metric==='opponentTeamCounters')return field(other).reduce((n,c)=>n+(c.damage||0)/10,0);
 if(plan.metric==='ownDiscardNamedCard')return own.discard.filter(c=>record(c)?.name===plan.name).length;
 if(plan.metric==='ownDiscardSupporterContains')return own.discard.filter(c=>record(c)?.category==='supporter'&&record(c).name.includes(plan.name)).length;
 if(plan.metric==='ownNamedOrExCount')return field(own).filter(c=>[plan.name,plan.name+'ex'].includes(record(c).name)).length;
 if(plan.metric==='bothNameContainsCount')return [...field(own),...field(other)].filter(c=>[plan.name,plan.secondName].some(n=>record(c).name.includes(n))).length;
 if(plan.metric==='ownBenchNamedCount')return own.bench.filter(c=>record(c).name===plan.name).length;
 if(plan.metric==='ownBenchTypedCounters')return own.bench.filter(c=>record(c).facts.types.includes(plan.type)).reduce((n,c)=>n+(c.damage||0)/10,0);
 if(plan.metric==='ownBenchNamedCounters')return own.bench.filter(c=>record(c).name===plan.name).reduce((n,c)=>n+(c.damage||0)/10,0);
 if(plan.metric==='ownAttachedBasicCards')return own.active.energyCards.filter(basicEnergy).length;
 if(plan.metric==='ownAttachedSpecialCards')return own.active.energyCards.filter(c=>c.isSpecial).length;
 if(plan.metric==='opponentAttachedSpecialCards')return field(other).flatMap(c=>c.energyCards).filter(c=>c.isSpecial).length;
 if(plan.metric==='ownDistinctBasicTypes')return new Set(field(own).flatMap(c=>c.energyCards).filter(basicEnergy).map(c=>c.energyType)).size;
 if(plan.metric==='ownTypedPokemonCount')return field(own).filter(c=>record(c).facts.types.includes(plan.type)).length;
 if(plan.metric==='ownPokemon')return field(own).length;
 if(plan.metric==='opponentPrizesTaken')return 6-other.prizes;
 if(plan.metric==='opponentRetreat')return other.active.retreatCost;
 if(plan.metric==='ownDiscardEnergy')return own.discard.filter(card=>card.kind==='energy').length;
 if(plan.metric==='opponentDiscardBasic')return other.discard.filter(basicEnergy).length;
 if(plan.metric==='opponentDiscardItem')return other.discard.filter(c=>record(c)?.category==='item').length;
 if(plan.metric==='opponentExVCount')return field(other).filter(c=>/ex$|V(?:MAX|STAR|-UNION)?$/.test(record(c).name)).length;
 if(plan.metric==='ownDamagedCount')return field(own).filter(c=>c.damage>0).length;
 if(plan.metric==='opponentAbilityCount')return field(other).filter(c=>record(c).abilities.length>0).length;
 if(plan.metric==='ownNamedAttackCount')return field(own).filter(c=>record(c).attacks.some(a=>a.name===plan.name)).length;
 if(plan.metric==='ownTeamNameCount')return field(own).filter(c=>record(c).name.startsWith(plan.name+'の')).length;
 if(plan.metric==='ownDiscardTypedPokemon')return own.discard.filter(c=>c.kind==='pokemon'&&record(c).facts.types.includes(plan.type)).length;
 if(plan.metric==='ownDiscardNamedAttack')return own.discard.filter(c=>c.kind==='pokemon'&&record(c).attacks.some(a=>a.name===plan.name)).length;
 const holders={ownEnergy:[own.active],ownTeamEnergy:field(own),opponentEnergy:[other.active],opponentTeamEnergy:field(other),bothActiveEnergy:[own.active,other.active],bothTeamEnergy:[...field(own),...field(other)]}[plan.metric];
 assert(holders,'UNKNOWN_ATTACK_DAMAGE_METRIC');
 return holders.flatMap(energyUnits).filter(unit=>!plan.type||unit.includes(plan.type)||Boolean(plan.secondType&&unit.includes(plan.secondType))).length;
}
function contextBonus(g,effect,own,other){
 const p=effect.plan,source=own.active,defender=other.active;
 switch(p.predicate){
  case 'opponentPoisoned':return defender.statusCondition==='POISONED';
  case 'ownPoisoned':return source.statusCondition==='POISONED';
  case 'ownDamaged':return source.damage>0;
  case 'ownTool':return source.tools.length>0;
  case 'opponentTool':return defender.tools.length>0;
  case 'ownMorePrizes':return own.prizes>other.prizes;
  case 'opponentPrizes':return other.prizes<=p.threshold;
  case 'opponentHand':return other.hand.length<=p.threshold;
  case 'opponentStage':return record(defender).facts.stage===p.threshold;
  case 'extraEnergy':return pays(source,[...cost(g,source,effect),...Array(p.threshold).fill('無色')]);
  case 'ownEnergyType':return energyUnits(source).some(unit=>unit.includes(p.type));
  default:throw Error('UNKNOWN_ATTACK_CONTEXT_BONUS');
 }
}
function counterMoveSources(own,plan){
 return own.bench.filter(c=>c.damage>0&&(!plan.team||record(c).name.startsWith(plan.team+'の')));
}
function spreadTargets(plan,own,other){
 const pool=plan.scope==='ownBench'?own.bench:plan.scope==='bothBench'?[...own.bench,...other.bench]:plan.scope==='opponentBench'?other.bench:field(other);
 return pool.filter(mon=>{
  if(plan.requiresDamage||plan.filter==='damaged')return mon.damage>0;
  if(plan.filter==='ex'||plan.filter==='exV'){const name=record(mon)?.name||'';return name.endsWith('ex')||plan.filter==='exV'&&/V(?:MAX|STAR|-UNION)?$/.test(name);}
  return true;
 });
}
function resolveBlindHand(g,actor,opposing,slots,destination){
 const hidden=opposing.hand.map(id);
 for(let i=hidden.length-1;i>0;i--){
  const j=g.referenceEffectPreview?i:Math.floor(referenceRandom(g)*(i+1));
  [hidden[i],hidden[j]]=[hidden[j],hidden[i]];
 }
 const chosen=slots.map(slot=>hidden[Number(slot.slice('hand-slot-'.length))]);
 if(!chosen.length)return;
 if(destination==='deck'){
  event(g,actor,'REVEAL',{cardIds:chosen,fromZone:'hand',privateTo:actor});
  moveChosen(g,opposing,'hand',chosen,'deck',false);
  shuffle(g,opposing);
 }else moveChosen(g,opposing,'hand',chosen,'discard',false);
}
function discardSelectedAttachment(g,actor,owner,eligible,selection){
 for(const ident of selection){
  const mon=eligible.find(card=>card.energyCards.some(energy=>id(energy)===ident));
  const index=mon?.energyCards.findIndex(energy=>id(energy)===ident)??-1;
  assert(index>=0,'SELECTED_ATTACHMENT_CHANGED');
  owner.discard.push(mon.energyCards.splice(index,1)[0]);
  event(g,actor,'DISCARD',{cardIds:[ident],sourceInstanceId:id(mon),fromZone:'attached'});
 }
}
function applyPlan(g,actor,card,effect,action){
 const p=player(g,actor),o=opponent(g,actor),plan=effect.plan,m=plan.mechanic,ids=key=>selected(action,key),target=()=>find(g,action.targetIds?.[0])?.card;
 // Confusion is an attack-wide rule, not a property of one damage mechanic.
 // Apply it before dispatching any attack Effect Command, including switching
 // and energy movement attacks. Abilities and Trainers never flip here.
 if(action.type==='attack_turn'&&card.statusCondition==='CONFUSED'&&!coin(g,actor)){
  counters(g,actor,card,3);
  event(g,actor,'CONFUSION_ATTACK_FAILED',{targetInstanceId:id(card)});
  return;
 }
 switch(m){
  case 'ATTACK_NAMED_DISCARD_BENCH':{
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   const chosen=ids('cards');
   assert(chosen.length<=Math.min(plan.limit,5-p.bench.length)&&new Set(chosen).size===chosen.length,'DISCARD_BENCH_SELECTION');
   for(const ident of chosen){
    const index=p.discard.findIndex(c=>id(c)===ident&&c.kind==='pokemon'&&record(c)?.facts.basic&&record(c).name===plan.name);
    assert(index>=0,'DISCARD_BENCH_WRONG_PRINT');
    const mon=p.discard.splice(index,1)[0];
    Object.assign(mon,{cardId:id(mon),damage:0,energies:[],energyCards:[],tools:[],enteredTurn:g.turnNumber});
    p.bench.push(mon);onBench(g,p,mon,false);
    event(g,actor,'BENCH_FROM_ZONE',{cardIds:[ident],fromZone:'discard',targetInstanceId:ident});
   }
   break;
  }
  case 'ABILITY_EVOLVE_MULTI_COUNTERS':{
   const selected=ids('target'),targets=field(o);
   assert(selected.length===Math.min(plan.count,targets.length)&&new Set(selected).size===selected.length,'EVOLVE_COUNTER_SELECTION');
   for(const ident of selected){
    const target=targets.find(mon=>id(mon)===ident);assert(target,'EVOLVE_COUNTER_TARGET');
    counters(g,actor,target,plan.amount);
   }
   break;
  }
  case 'ATTACK_OPTIONAL_RETURN_POKEMON':{
   damage(g,actor,o.active,Number(effect.damage)||0);
   if(ids('mode')[0]==='return'){
    const attached=[...(card.energyCards||[]),...(card.tools||[])];
    card.energyCards=[];card.energies=[];card.tools=[];
    p.discard.push(...attached);
    if(attached.length)event(g,actor,'DISCARD',{cardIds:attached.map(id),sourceInstanceId:id(card),fromZone:'attached'});
    returnStack(g,p,card,'hand');
   }
   break;
  }
  case 'TRAINER_SWITCH_OR_EX_V_BOOST':
   if(ids('mode')[0]==='switch')chooseBenchSwitch(g,actor,p,ids('ownBench')[0]);
   else p.referenceExVDamageBoost={turn:g.turnNumber,amount:plan.amount};
   break;
  case 'MASS_EFFECT_SEQUENCE':{
   const defender=o.active,amount=action.type==='attack_turn'&&Number(effect.damage)>0?damage(g,actor,defender,Number(effect.damage)):0;
   for(const step of plan.steps){
    const target=step.side==='opponent'?defender:card;
    const protectedTarget=step.side==='opponent'&&action.type==='attack_turn'&&defender.referenceProtection?.opponentTurn===g.turnNumber;
    switch(step.op){
     case 'discardOwnHand':moveChosen(g,p,'hand',ids('sequenceDiscard'),'discard',false);break;
     case 'blindDiscardOpponent':if(!protectedTarget)resolveBlindHand(g,actor,o,ids('sequenceBlind'),'discard');break;
     case 'draw':draw(g,p,step.amount);break;
     case 'drawIfHand':if(p.hand.length>=step.threshold)draw(g,p,step.amount);break;
     case 'revealHand':event(g,actor,'REVEAL',{cardIds:o.hand.map(id),fromZone:'hand',privateTo:actor});break;
     case 'peekTop':event(g,actor,'REVEAL',{cardIds:o.deck.slice(0,step.amount).map(id),fromZone:'deck',privateTo:actor});break;
     case 'mill':{const side=step.side==='opponent'?o:p,discarded=side.deck.splice(0,step.amount);side.discard.push(...discarded);event(g,actor,'DISCARD',{cardIds:discarded.map(id),fromZone:'deck',playerId:side.id});break;}
     case 'healSelf':if(card.damage>0)heal(g,actor,card,step.amount);break;
     case 'drain':if(amount>0&&card.damage>0)heal(g,actor,card,amount);break;
     case 'status':if(!protectedTarget){target.statusCondition=step.status;event(g,actor,'STATUS_CONDITION',{status:step.status,targetInstanceId:id(target)});}break;
     case 'retreatLock':if(!protectedTarget)target.referenceCannotRetreatTurn=g.turnNumber+step.offset;break;
     case 'attackLock':card.referenceCannotAttackTurn=g.turnNumber+step.offset;break;
     case 'reduce':card.referenceDamageReduction={turn:g.turnNumber+1,amount:step.amount};break;
     case 'discardAttached':discardSelectedAttachment(g,actor,p,[card],card.energyCards.map(id));break;
     case 'itemLock':g.referenceItemLock||=[];g.referenceItemLock.push({playerId:o.id,turnNumber:g.turnNumber+1});break;
     case 'noWeakness':card.referenceNoWeaknessTurn=g.turnNumber+1;break;
     default:throw Error('UNKNOWN_SEQUENCE_STEP');
    }
   }
   break;
  }
  case 'MASS_ENERGY_ROUTE':{
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   const energy=ids('energy'),targets=massRouteTargets(p,card,plan),healed=new Set();
   for(const [i,ident] of energy.entries()){
    const target=plan.target==='self'?card:targets.find(c=>id(c)===ids('attachTo'+(plan.multi?i:0))[0]);
    const index=p[plan.zone].findIndex(c=>id(c)===ident&&basicEnergy(c)&&(!plan.type||c.energyType===plan.type));
    assert(target&&index>=0,'MASS_ENERGY_ROUTE_CHANGED');
    target.energyCards.push(p[plan.zone].splice(index,1)[0]);
    event(g,actor,'ATTACH_ENERGY',{energyId:ident,targetInstanceId:id(target),fromZone:plan.zone});
    healed.add(target);
   }
   if(plan.zone==='deck'){event(g,actor,'SEARCH_DECK',{selectedCount:energy.length,destination:'attached',privateTo:actor});shuffle(g,p);}
   if(plan.heal)for(const target of healed)if(target.damage>0)heal(g,actor,target,plan.heal==='all'?target.damage:plan.heal);
   if(plan.poisonActive&&healed.has(p.active)){p.active.statusCondition='POISONED';event(g,actor,'STATUS_CONDITION',{status:'POISONED',targetInstanceId:id(p.active)});}
   break;
  }
  case 'SUPPORTER_MEGA_HEAL_RETURN_ENERGY':{
   const target=field(p).find(c=>id(c)===ids('cards')[0]);
   assert(target&&isMegaEvolutionEx(target)&&target.damage>0,'MEGA_HEAL_TARGET_CHANGED');
   heal(g,actor,target,target.damage);
   const returned=target.energyCards.splice(0);p.hand.push(...returned);
   event(g,actor,'RETURN_TO_HAND',{cardIds:returned.map(id),fromZone:'attached',targetInstanceId:id(target)});
   break;
  }
  case 'MASS_CONTEXT_BONUS':damage(g,actor,o.active,plan.base+(massContext(plan,p,o)?plan.bonus:0));break;
  case 'MASS_ZONE_TRANSFER':
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(plan.zone==='deck')searchSelectedDeck(g,actor,p,ids('cards'));
   else {moveChosen(g,p,'discard',ids('cards'),plan.destination);if(plan.destination==='deck')shuffle(g,p);}
   break;
  case 'MASS_HAND_FLOW':
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(plan.mode==='resetOpponent')resetHand(g,o,plan.amount,plan.bottom);
   if(plan.mode==='bothDraw'){draw(g,p,plan.amount);draw(g,o,plan.amount);}
   if(plan.mode==='resetOwnMatch')resetHand(g,p,o.hand.length);
   if(plan.mode==='revealCount'){event(g,actor,'REVEAL',{cardIds:o.hand.map(id),fromZone:'hand',privateTo:actor});draw(g,p,o.hand.filter(c=>c.kind==='pokemon').length);}
   if(plan.mode==='rocketLimit')draw(g,p,Math.max(0,(field(p).every(c=>record(c).name.startsWith('ロケット団の'))?plan.bonus:plan.amount)-p.hand.length));
   if(plan.mode==='resetBothCoin'){
    // Both hands are returned before either player flips or draws.
    for(const side of [p,o]){
     const cards=side.hand.splice(0);
     for(let i=cards.length-1;i>0;i--){const j=g.referenceEffectPreview?i:Math.floor(referenceRandom(g)*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
     side.deck.push(...cards);event(g,side.id,'RETURN_TO_DECK',{cardIds:cards.map(id),bottomOnly:true});
    }
    for(const side of [p,o])draw(g,side,coin(g,side.id)?plan.amount:plan.tails);
   }
   break;
  case 'MASS_HEAL_SCOPE':
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   for(const mon of scopeHealTargets(p,o,plan))if(mon.damage>0&&(!plan.choice||ids('cards').includes(id(mon))))heal(g,find(g,id(mon)).player.id,mon,plan.amount==='all'?mon.damage:plan.amount);
   break;
  case 'MASS_HEAL_OWN':
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   for(const mon of massHealTargets(p,plan))if(mon.damage>0&&(plan.target!=='choice'||ids('cards').includes(id(mon))))heal(g,actor,mon,plan.amount==='all'?mon.damage:plan.amount);
   break;
  case 'MASS_PRIZE_DRAW':
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   draw(g,p,plan.amount+(o.prizes<=plan.threshold?plan.extra:0));break;
  case 'MASS_COUNTER_GRAMMAR':{
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   const targets=plan.scope==='active'?[o.active]:plan.scope==='bench'?o.bench:plan.scope==='choice'?field(o).filter(c=>ids('target').includes(id(c))):field(o);
   for(const mon of targets){
    const count=plan.mode==='remaining'?Math.max(0,(mon.hp-mon.damage-plan.remaining)/10):plan.mode==='allocation'?(action.selections?.allocation?.[id(mon)]||0):plan.mode==='hand'?p.hand.length*plan.unit:plan.mode==='multiply'?(mon.damage||0)/10*plan.unit:plan.amount;
    assert(Number.isInteger(count)&&count>=0,'INVALID_COUNTER_GRAMMAR_QUANTITY');
    if(count)counters(g,actor,mon,count,{attack:true});
   }
   break;
  }
  case 'MASS_PLACE_COUNTERS':{
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   const targets=plan.target==='active'?[o.active]:plan.target==='damagedOpponent'?field(o).filter(c=>c.damage>0):plan.target==='bothAbility'?[...field(p),...field(o)].filter(c=>record(c).abilities.length>0):field(o).filter(c=>plan.target==='all'||ids('target').includes(id(c)));
   for(const mon of targets)counters(g,actor,mon,plan.amount,{attack:action.type==='attack_turn'});
   break;
  }
  case 'ABILITY_TYPED_COST_COUNTER':{
   const index=p.hand.findIndex(c=>id(c)===ids('discard')[0]&&basicEnergy(c)&&c.energyType===plan.type);
   assert(index>=0,'COUNTER_COST_CHANGED');
   const target=field(o).find(c=>id(c)===ids('target')[0]);assert(target,'COUNTER_TARGET_CHANGED');
   const energy=p.hand.splice(index,1)[0];p.discard.push(energy);
   event(g,actor,'DISCARD',{cardIds:[id(energy)],fromZone:'hand',sourceInstanceId:id(card)});
   counters(g,actor,target,plan.amount);break;
  }
  case 'INSPECTED_OPPONENT_HAND_TRANSFER':{
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(action.type==='attack_turn'&&o.active.referenceProtection?.opponentTurn===g.turnNumber)break;
   event(g,actor,'REVEAL',{cardIds:o.hand.map(id),fromZone:'hand',privateTo:actor});
   const chosen=ids('opponentCards'),moved=[];
   for(const ident of chosen){
    const index=o.hand.findIndex(c=>id(c)===ident&&inspectedHandCandidate(c,plan));
    assert(index>=0,'INSPECTED_HAND_SELECTION_CHANGED');moved.push(o.hand.splice(index,1)[0]);
   }
   if(plan.destination==='discard')o.discard.push(...moved);else o.deck.push(...moved);
   event(g,actor,plan.destination==='discard'?'DISCARD':'RETURN_TO_DECK',{cardIds:chosen,fromZone:'hand',...(plan.destination==='bottom'?{position:'bottom',privateTo:actor}:{})});
   break;
  }
  case 'ATTACK_BLIND_HAND_CHOICE':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(o.active.referenceProtection?.opponentTurn!==g.turnNumber)
    resolveBlindHand(g,actor,o,ids('blindHand'),plan.destination);
   break;
  case 'ATTACK_MOVE_BENCH_COUNTERS':{
   const source=counterMoveSources(p,plan).find(c=>id(c)===ids('counterSource')[0]);
   const defender=plan.targetActive?o.active:target();
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(source&&defender){
    const count=source.damage/10;
    moveDamageCounters(g,actor,source,defender,count,{attack:true,max:count});
   }
   break;
  }
  case 'ATTACK_SPREAD_DAMAGE':{
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(plan.discardAttached!==undefined){
    const chosen=plan.discardAttached==='all'?(card.energyCards||[]).map(id):ids('energy');
    discardSelectedAttachment(g,actor,p,[card],chosen);
   }
   const targets=spreadTargets(plan,p,o);
   const amount=plan.prizeUnit===undefined?plan.amount:(6-o.prizes)*plan.prizeUnit;
   for(const mon of targets)
    if(plan.count===null||action.targetIds?.includes(id(mon)))damage(g,actor,mon,plan.counterUnit?mon.damage/10*plan.counterUnit:amount,
      {bench:mon!==o.active,ignore:plan.ignoreDefense,skipWeakness:plan.ignoreDefense||plan.skipWeakness,skipResistance:plan.ignoreDefense||plan.skipResistance});
   break;
  }
  case 'CONTEXT_ATTACK_BONUS':
   damage(g,actor,o.active,plan.base+(contextBonus(g,effect,p,o)?plan.bonus:0));
   break;
  case 'ATTACK_PRIZE_BONUS_RECOIL':
   assert(Number.isInteger(o.prizes)&&o.prizes>=0&&o.prizes<=6,'INVALID_OPPONENT_PRIZE_STATE');
   damage(g,actor,o.active,plan.base+(6-o.prizes)*plan.unit);
   command(g,actor,{command:'DAMAGE',amount:plan.recoil},{targetIds:[id(card)]});
   break;
  case 'MASS_ENERGY_COUNT_DISCARD':{
   const pool=energyCountPool(p,card,plan),chosen=plan.all?pool.map(id):ids('energy');
   assert(chosen.length<=plan.limit&&chosen.every(ident=>pool.some(c=>id(c)===ident)),'ENERGY_COUNT_DISCARD_CHANGED');
   if(plan.zone==='hand'){
    for(const ident of chosen){const index=p.hand.findIndex(c=>id(c)===ident);p.discard.push(p.hand.splice(index,1)[0]);event(g,actor,'DISCARD',{cardIds:[ident],fromZone:'hand'});}
   }else discardSelectedAttachment(g,actor,p,field(p),chosen);
   damage(g,actor,o.active,plan.base+chosen.length*plan.unit);break;
  }
  case 'ATTACK_DISCARD_FIELD_BASIC': {
   const energy=ids('energy');
   discardSelectedAttachment(g,actor,p,field(p),energy);
   damage(g,actor,o.active,energy.length*plan.unit);
   break;
  }
  case 'MASS_HAND_ACQUISITION':{
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(plan.mode==='bottom'){
    const n=Math.min(p.deck.length,plan.amount);
    if(n){p.deck.unshift(...p.deck.splice(p.deck.length-n,n).reverse());draw(g,p,n);}
   }else if(ids('acquire')[0]==='do'){
    if(plan.mode==='search')searchSelectedDeck(g,actor,p,ids('cards'),{reveal:false});
    else draw(g,p,Math.min(plan.amount,p.deck.length));
   }
   break;
  }
  case 'ATTACK_OPTIONAL_DRAW_TO_LIMIT':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(ids('drawChoice')[0]==='draw')draw(g,p,Math.max(0,plan.limit-p.hand.length));
   break;
  case 'ATTACK_BASIC_DAMAGE_PROTECTION':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   card.referenceBasicDamageProtection={turn:g.turnNumber+1,exceptType:plan.exceptType};
   break;
  case 'ATTACK_DISCARD_TOOL_BEFORE_DAMAGE':{
   const defender=o.active;
   if(defender.referenceProtection?.opponentTurn!==g.turnNumber){
    const tools=(defender.tools||[]).splice(0);
    o.discard.push(...tools);
    if(tools.length)event(g,actor,'DISCARD',{cardIds:tools.map(id),sourceInstanceId:id(defender),fromZone:'attached'});
    refresh(g);
   }
   damage(g,actor,defender,Number(effect.damage));
   break;
  }
  case 'ATTACK_EVOLUTION_BONUS_DISCARD':{
   const evolved=record(o.active).facts.stage>0;
   damage(g,actor,o.active,plan.base+(evolved?plan.bonus:0));
   if(evolved)discardSelectedAttachment(g,actor,p,[card],(card.energyCards||[]).map(id));
   break;
  }
  case 'ATTACK_PRIZE_BONUS_DISCARD':
   damage(g,actor,o.active,plan.base+(6-o.prizes)*plan.unit);
   discardSelectedAttachment(g,actor,p,[card],ids('energy'));
   break;
  case 'ATTACK_DISCARD_DEFENDER_ENERGY':
  case 'ATTACK_COIN_DISCARD_DEFENDER_ENERGY':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if((m!=='ATTACK_COIN_DISCARD_DEFENDER_ENERGY'||coin(g,actor))&&
      o.active.referenceProtection?.opponentTurn!==g.turnNumber)
    discardSelectedAttachment(g,actor,o,[o.active],ids('energy'));
   break;
  case 'ATTACK_HEAL_OWN_TARGET':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   heal(g,actor,find(g,ids('healTarget')[0])?.card,plan.amount);
   break;
  case 'ATTACK_SPLASH_OWN_BENCH':
   damage(g,actor,o.active,Number(effect.damage));
   for(const bench of p.bench)damage(g,actor,bench,plan.benchDamage,{bench:true});
   break;
  case 'ATTACK_DISABLE_SELECTED_MOVE': {
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   const move=record(o.active).attacks.find(attack=>attack.effectId===ids('attackChoice')[0]);
   if(move&&o.active.referenceProtection?.opponentTurn!==g.turnNumber)
    o.active.referenceNamedAttackLock={turn:g.turnNumber+1,attackName:move.name};
   break;
  }
  case 'ATTACK_ATTACH_BASIC_FROM_HAND': {
   const energyId=ids('energy')[0];
   if(energyId){
    const index=p.hand.findIndex(c=>id(c)===energyId&&basicEnergy(c));
    const target=plan.target==='self'?card:field(p).find(c=>id(c)===ids('attachTo')[0]);
    assert(index>=0&&target,'HAND_BASIC_ENERGY_ATTACHMENT_CHANGED');
    const energy=p.hand.splice(index,1)[0];
    target.energyCards||=[];target.energyCards.push(energy);
    event(g,actor,'ATTACH_ENERGY',{energyId,targetInstanceId:id(target),fromZone:'hand',sourceOfficialCardId:record(card).officialCardId});
   }
   break;
  }
  case 'ATTACK_LOCK_UNTIL_SWITCH':
   damage(g,actor,o.active,Number(effect.damage));
   card.referenceAttackLockUntilSwitch={attackName:plan.attackName};
   break;
  case 'CONDITIONAL_ATTACK_BONUS':
   damage(g,actor,o.active,plan.base+(attackBonusApplies(plan.predicate,p,o.active)?plan.bonus:0));
   break;
  case 'ATTACK_ATTACHED_ENERGY_COINS':{
   let heads=0;
   for(const unit of energyUnits(card))if(coin(g,actor))heads++;
   damage(g,actor,o.active,heads*plan.unit);
   break;
  }
  case 'MASS_COIN_OUTCOME':{
   let heads=0;
   for(let i=0;i<plan.flips;i++)if(coin(g,actor))heads++;
   const met=plan.when==='all'?heads===plan.flips:plan.when==='none'?heads===0:heads>=plan.threshold;
   const target=o.active,protectedTarget=target.referenceProtection?.opponentTurn===g.turnNumber;
   const amount=plan.failOnTails&&!met?0:plan.base+(plan.unit||0)*heads+(met?(plan.bonus||0):0);
   damage(g,actor,target,amount);
   if(met){
    if(plan.status&&!protectedTarget){target.statusCondition=plan.status;event(g,actor,'STATUS_CONDITION',{status:plan.status,targetInstanceId:id(target)});}
    if(plan.recoil)command(g,actor,{command:'DAMAGE',amount:plan.recoil},{targetIds:[id(card)]});
    if(plan.heal)heal(g,actor,card,plan.heal);
    if(plan.mill){const discarded=o.deck.splice(0,heads);o.discard.push(...discarded);event(g,actor,'DISCARD',{cardIds:discarded.map(id),fromZone:'deck',playerId:o.id});}
    if(plan.lock==='selfAttack')card.referenceCannotAttackTurn=g.turnNumber+2;
    if(plan.lock==='opponentAttack'&&!protectedTarget)target.referenceCannotAttackTurn=g.turnNumber+1;
    if(plan.lock==='opponentRetreat'&&!protectedTarget)target.referenceCannotRetreatTurn=g.turnNumber+1;
    if(plan.protect)card.referenceProtection={opponentTurn:g.turnNumber+1};
   }
   break;
  }
  case 'ATTACK_GUARDED_DAMAGE':{
   if(!attackGuardApplies(g,p,o,plan)){
    event(g,actor,'ATTACK_FAILED',{effectId:effect.effectId,predicate:plan.predicate});
    break;
   }
   if(plan.discardStadium)discardCurrentStadium(g,actor);
   damage(g,actor,o.active,Number(effect.damage),{skipWeakness:plan.skipWeakness,skipResistance:plan.skipResistance});
   break;
  }
  case 'MASS_BOARD_BONUS':{
   const applies=boardBonusApplies(g,p,o,plan)&&(!plan.optional||ids('stadiumBonus').length>0);
   if(applies&&plan.discardStadium&&plan.optional)discardCurrentStadium(g,actor);
   damage(g,actor,o.active,plan.base+(applies?plan.bonus:0));
   if(applies&&plan.discardStadium&&!plan.optional)discardCurrentStadium(g,actor);
   break;
  }
  case 'ATTACK_OPTIONAL_RECOIL_BONUS':{
   const accepted=ids('recoilBonus').length>0;
   damage(g,actor,o.active,plan.base+(accepted?plan.bonus:0));
   if(accepted)command(g,actor,{command:'DAMAGE',amount:plan.recoil},{targetIds:[id(card)]});
   break;
  }
  case 'SCALED_ATTACK_DAMAGE':
   if(plan.metric==='opponentHandTrainerCount')event(g,actor,'REVEAL',{cardIds:o.hand.map(id),fromZone:'hand',privateTo:actor});
   damage(g,actor,o.active,Math.max(0,plan.base+(plan.subtract?-1:1)*plan.unit*attackMetric(plan,p,o)));
   break;
  case 'ATTACK_RESET_HAND':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   resetHand(g,p,plan.amount);
   break;
  case 'MASS_MILL_COUNT_DAMAGE':{
   let count=0;
   for(const side of plan.scope==='both'?[p,o]:[p]){
    const discarded=side.deck.splice(0,plan.limit);
    side.discard.push(...discarded);
    count+=discarded.filter(c=>plan.filter==='typedBasic'?basicEnergy(c)&&c.energyType===plan.type:plan.filter==='energy'?c.kind==='energy':plan.filter==='trainer'?['item','supporter','tool','stadium'].includes(record(c)?.category):c.kind==='pokemon'&&record(c).name.startsWith(plan.team+'の')).length;
    event(g,actor,'DISCARD',{cardIds:discarded.map(id),fromZone:'deck',playerId:side.id});
   }
   damage(g,actor,o.active,plan.base+plan.unit*count);
   break;
  }
  case 'ATTACK_DISCARD_OWN_DECK_TOP':{
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   const cards=p.deck.splice(0,plan.amount);
   p.discard.push(...cards);
   event(g,actor,'DISCARD',{cardIds:cards.map(id),fromZone:'deck'});
   break;
  }
  case 'ATTACK_RECYCLE_BASIC_ENERGY':{
   const cards=p.discard.filter(c=>basicEnergy(c)&&c.energyType===plan.type),amount=cards.length*plan.unit;
   if(cards.length)event(g,actor,'REVEAL',{cardIds:cards.map(id),fromZone:'discard',toPlayer:o.id});
   if(plan.counters){
    if(amount)counters(g,actor,target(),amount,{attack:true});
   }else damage(g,actor,o.active,amount);
   if(cards.length){
    moveChosen(g,p,'discard',cards.map(id),'deck',false);
    shuffle(g,p);
   }
   break;
  }
  case 'ATTACK_DISCARD_OPPONENT_ATTACHMENTS':{
   const targets=field(o);
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   for(const mon of targets){
    if(mon.referenceProtection?.opponentTurn===g.turnNumber)continue;
    const energies=mon.energyCards.filter(c=>c.isSpecial);
    const tools=plan.tools?mon.tools.splice(0):[];
    mon.energyCards=mon.energyCards.filter(c=>!c.isSpecial);
    const cards=[...energies,...tools];
    o.discard.push(...cards);
    if(cards.length)event(g,actor,'DISCARD',{cardIds:cards.map(id),sourceInstanceId:id(mon),fromZone:'attached'});
   }
   break;
  }
  case 'ATTACK_WEAKEN_DEFENDER':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(o.active.referenceProtection?.opponentTurn!==g.turnNumber)
    o.active.referenceOutgoingDamagePenalty={turn:g.turnNumber+1,amount:plan.amount};
   break;
  case 'ATTACK_DISABLE_DEFENDER':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(o.active.referenceProtection?.opponentTurn!==g.turnNumber)
    o.active.referenceCannotAttackTurn=g.turnNumber+1;
   break;
  case 'RECOIL_DAMAGE':case 'HEAL_SELF_ATTACK':case 'COIN_UNTIL_TAILS_DAMAGE':case 'FIXED_COIN_HITS':case 'VANILLA_DAMAGE':case 'ATTACK_APPLY_STATUS':case 'ATTACK_HEAL_TEAM':case 'ATTACK_TAKEN_PRIZES_DAMAGE':case 'ATTACK_NAMED_NEXT_TURN_LOCK':case 'ATTACK_STATUS_BONUS_DAMAGE':case 'ATTACK_UNDAMAGED_BONUS':case 'ATTACK_ATTACHED_TOOL_COUNT':case 'ATTACK_DISCARD_STADIUM':case 'FULL_BENCH_REQUIRED_DAMAGE':case 'BENCH_COUNT_DAMAGE':case 'SELF_COUNTER_DAMAGE':case 'COIN_FAILURE_DAMAGE':case 'COIN_BONUS_DAMAGE':case 'COIN_PARALYZE_ATTACK':case 'DISCARD_ALL_SELF_ENERGY_ATTACK':case 'DISCARD_ONE_SELF_ENERGY_ATTACK':case 'ATTACK_DISCARD_MULTIPLE_SELF_ENERGY':case 'ATTACK_DRAW':case 'COMBO':case 'NO_NEXT_ATTACK':case 'RETREAT_LOCK_ATTACK':case 'ATTACK_DAMAGE_REDUCTION':case 'ATTACK_REVEAL_OPPONENT_HAND':case 'MOON_RONDO':case 'CONFUSION':case 'BENCH_COUNTER_DAMAGE':case 'BENCH_EX_DAMAGE':case 'RETURN_SELF_HAND':case 'SEARCH_REVEAL_TO_HAND_ATTACK':case 'SEARCH_BASIC_TO_BENCH_ATTACK':case 'HUNT':case 'PHANTOM':case 'ITEM_LOCK':case 'ANY_DAMAGE':case 'EX_COUNT_DAMAGE':case 'COIN_PROTECT':case 'IGNORE_DEFENDER_EFFECTS':{
   let amount=Number.parseInt(effect.damage,10)||0,mon=o.active,options={};
   if(m==='FIXED_COIN_HITS'){amount=plan.base||0;for(let i=0;i<plan.flips;i++)if(coin(g,actor))amount+=plan.unit;}
   if(m==='COIN_FAILURE_DAMAGE')amount=coin(g,actor)?amount:0;
   if(m==='COIN_BONUS_DAMAGE')amount=plan.base+(coin(g,actor)?plan.bonus:0);
   if(m==='BENCH_COUNT_DAMAGE')amount=plan.base+plan.unit*(plan.side==='own'?p:o).bench.length;
   if(m==='SELF_COUNTER_DAMAGE')amount=plan.base+(card.damage||0)/10*plan.perCounter;
   if(m==='ATTACK_TAKEN_PRIZES_DAMAGE'){
    assert(Number.isInteger(o.prizes)&&o.prizes>=0&&o.prizes<=6,'INVALID_OPPONENT_PRIZE_STATE');
    amount=plan.unit*(6-o.prizes);
   }
   if(m==='ATTACK_STATUS_BONUS_DAMAGE')amount=plan.base+(o.active.statusCondition?plan.bonus:0);
   if(m==='ATTACK_UNDAMAGED_BONUS')amount=plan.base+((card.damage||0)===0?plan.bonus:0);
   if(m==='ATTACK_ATTACHED_TOOL_COUNT'){
    const pokemon=plan.bothSides?[...field(p),...field(o)]:field(p);
    amount=plan.unit*pokemon.reduce((total,c)=>total+(c.tools||[]).length,0);
   }
   if(m==='COMBO'||m==='COIN_UNTIL_TAILS_DAMAGE'){
    amount=m==='COMBO'?Number.parseInt(effect.damage,10):plan.base;
    const unit=m==='COMBO'?50:plan.unit;
    let heads=0;
    while(coin(g,actor)){amount+=unit;assert(++heads<1000,'COIN_SEQUENCE_LIMIT_SAFE_STOP');}
   }
   if(m==='MOON_RONDO')amount=Number.parseInt(effect.damage,10)+20*(p.bench.length+o.bench.length);
   if(m==='EX_COUNT_DAMAGE')amount=60*field(o).filter(c=>record(c).facts.prizeCount>=2).length;
   if(['BENCH_COUNTER_DAMAGE','BENCH_EX_DAMAGE','ANY_DAMAGE'].includes(m)){mon=target();assert(mon,'TARGET_REQUIRED');options.bench=o.active!==mon;amount=m==='BENCH_COUNTER_DAMAGE'?(mon.damage||0)*2:m==='BENCH_EX_DAMAGE'?60:plan.amount??100;}
   if(m==='IGNORE_DEFENDER_EFFECTS')options.ignore=true;
   if(m==='FULL_BENCH_REQUIRED_DAMAGE'&&(plan.requiresStadium?!g.stadium:p.bench.length<plan.minimum))break;
   damage(g,actor,mon,amount,options);
   if(m==='RECOIL_DAMAGE')command(g,actor,{command:'DAMAGE',amount:plan.amount},{targetIds:[id(card)]});
   if(m==='HEAL_SELF_ATTACK')heal(g,actor,card,plan.amount);
   if(m==='ATTACK_HEAL_TEAM')for(const own of field(p))heal(g,actor,own,plan.amount);
   if(m==='ATTACK_APPLY_STATUS'&&o.active===mon){
    mon.statusCondition=plan.status;
    event(g,actor,'STATUS_CONDITION',{status:plan.status,targetInstanceId:id(mon)});
   }
   if(m==='ATTACK_DRAW')draw(g,p,plan.draw);
   if(m==='ATTACK_DISCARD_STADIUM'&&g.stadium){
    const stadiumCard=g.stadium;
    player(g,g.stadiumOwner).discard.push(stadiumCard);
    g.stadium=null;
    g.stadiumOwner=null;
    event(g,actor,'DISCARD',{cardIds:[id(stadiumCard)],fromZone:'stadium'});
   }
   if(m==='ATTACK_REVEAL_OPPONENT_HAND')
    event(g,actor,'REVEAL',{cardIds:o.hand.map(id),fromZone:'hand',privateTo:actor});
   if(m==='NO_NEXT_ATTACK')card.referenceCannotAttackTurn=g.turnNumber+2;
   if(m==='ATTACK_NAMED_NEXT_TURN_LOCK')card.referenceNamedAttackLock={turn:g.turnNumber+2,attackName:plan.attackName};
   if(m==='RETREAT_LOCK_ATTACK')mon.referenceCannotRetreatTurn=g.turnNumber+1;
   if(m==='ATTACK_DAMAGE_REDUCTION')card.referenceDamageReduction={turn:g.turnNumber+1,amount:plan.amount};
   if(m==='COIN_PARALYZE_ATTACK'&&coin(g,actor)){o.active.statusCondition='PARALYZED';event(g,actor,'STATUS_CONDITION',{status:'PARALYZED',targetInstanceId:id(o.active)});}
   if(m==='DISCARD_ALL_SELF_ENERGY_ATTACK'){
    const discarded=(card.energyCards||[]).splice(0);
    p.discard.push(...discarded);
    event(g,actor,'DISCARD',{cardIds:discarded.map(id),sourceInstanceId:id(card)});
   }
   if(m==='ATTACK_DISCARD_MULTIPLE_SELF_ENERGY'){
    const chosen=ids('energy'),attached=card.energyCards||[];
    assert(Number.isInteger(plan.count)&&plan.count>=(plan.type?1:2)&&plan.count<=9,
      'INVALID_PRINTED_SELF_ENERGY_DISCARD_COUNT');
    const contribution=energy=>selectedAttachmentUnits(card,energy,plan);
    const target=Math.min(plan.count,attached.reduce((sum,e)=>sum+contribution(e),0));
    const selectedEnergy=chosen.map(ident=>attached.find(e=>id(e)===ident));
    assert(selectedEnergy.every(e=>e&&contribution(e)>0)&&
      selectedEnergy.reduce((sum,e)=>sum+contribution(e),0)>=target,
      'PRINTED_SELF_ENERGY_DISCARD_COUNT_CHANGED');
    for(const ident of chosen){
     const index=attached.findIndex(energy=>id(energy)===ident);
     assert(index>=0,'SELF_ENERGY_DISCARD_TARGET_CHANGED');
     const [discarded]=attached.splice(index,1);
     p.discard.push(discarded);
     event(g,actor,'DISCARD',{cardIds:[id(discarded)],sourceInstanceId:id(card)});
    }
   }
   if(m==='DISCARD_ONE_SELF_ENERGY_ATTACK'){
    const attached=card.energyCards,energyIndex=attached.findIndex(energy=>id(energy)===ids('energy')[0]);
    assert(energyIndex>=0,'SELF_ENERGY_DISCARD_TARGET_CHANGED');
    const [discarded]=attached.splice(energyIndex,1);
    p.discard.push(discarded);
    event(g,actor,'DISCARD',{cardIds:[id(discarded)],sourceInstanceId:id(card)});
   }
   if(m==='CONFUSION'){o.active.statusCondition='CONFUSED';event(g,actor,'STATUS_CONDITION',{status:'CONFUSED',targetInstanceId:id(o.active)});}
   if(m==='ITEM_LOCK'){g.referenceItemLock||=[];g.referenceItemLock.push({playerId:o.id,turnNumber:g.turnNumber+1});}
   if(m==='RETURN_SELF_HAND')returnStack(g,p,card,'hand');
   if(m==='SEARCH_BASIC_TO_BENCH_ATTACK')searchSelectedDeck(g,actor,p,ids('cards'),{destination:'bench'});
   if(m==='SEARCH_REVEAL_TO_HAND_ATTACK'&&(!plan.optional||ids('searchMode')[0]==='search'))
    searchSelectedDeck(g,actor,p,ids('cards'),{reveal:plan.reveal!==false});
   if(m==='HUNT')searchSelectedDeck(g,actor,p,ids('cards'),{reveal:false});
   if(m==='PHANTOM')for(const [ident,count] of Object.entries(action.selections?.allocation||{}))counters(g,actor,find(g,ident).card,count,{attack:true});
   if(m==='COIN_PROTECT'&&coin(g,actor))card.referenceProtection={opponentTurn:g.turnNumber+1};
   break;
  }
  case 'ACTIVE_AND_BENCH_DAMAGE':damage(g,actor,o.active,Number.parseInt(effect.damage,10)||0);if(action.targetIds?.length)damage(g,actor,target(),Number.parseInt(effect.damage,10)||0,{bench:true});break;
  case 'ATTACK_SPLASH_DAMAGE':
   damage(g,actor,o.active,Number(effect.damage)||0);
   if(action.targetIds?.length)damage(g,actor,target(),plan.benchDamage,{bench:true});
   break;
  case 'ATTACK_IGNORE_DAMAGE_RULES':damage(g,actor,o.active,Number(effect.damage)||0,plan);break;
  case 'ATTACK_OPTIONAL_ENERGY_BONUS':{
   const chosen=plan.all?(ids('mode')[0]==='bonus'?(card.energyCards||[]).map(id):[]):ids('energy');
   const moved=[];
   for(const ident of chosen){
    const index=card.energyCards.findIndex(c=>id(c)===ident&&(plan.all||energyUnits({...card,energyCards:[c]}).some(unit=>unit.includes(plan.type))));
    assert(index>=0,'OPTIONAL_ENERGY_COST_CHANGED');moved.push(card.energyCards.splice(index,1)[0]);
   }
   if(moved.length){
    p[plan.destination].push(...moved);
    event(g,actor,plan.destination==='discard'?'DISCARD':plan.destination==='hand'?'RETURN_TO_HAND':'RETURN_TO_DECK',{cardIds:chosen,fromZone:'attached',sourceInstanceId:id(card)});
    if(plan.destination==='deck')shuffle(g,p);
   }
   damage(g,actor,o.active,plan.base+(moved.length?plan.bonus:0));break;
  }
  case 'ATTACK_DISCARD_BENCH_ENERGY_BONUS':{
    const chosen=ids('energy');
    assert(chosen.length<=plan.maxDiscard,'BENCH_ENERGY_TOO_MANY');
    for(const energyId of chosen){
     const source=p.bench.find(mon=>(mon.energyCards||[]).some(e=>id(e)===energyId));
     assert(source,'BENCH_ENERGY_SELECTION_CHANGED');
     const i=source.energyCards.findIndex(e=>id(e)===energyId);
     const [discarded]=source.energyCards.splice(i,1);
     p.discard.push(discarded);
     event(g,actor,'DISCARD',{cardIds:[energyId],sourceInstanceId:id(source),fromZone:'attached'});
    }
    damage(g,actor,o.active,plan.base+chosen.length*plan.unit);
    break;
   }
   case 'ATTACK_DISCARD_OPPONENT_DECK_TOP':{
   damage(g,actor,o.active,Number(effect.damage)||0);
   const moved=o.deck.splice(0,plan.amount);
   o.discard.push(...moved);
   event(g,actor,'DISCARD',{cardIds:moved.map(id),fromZone:'deck',owner:o.id});
   break;
  }
  case 'ATTACK_DISCARD_HAND_DRAW':damage(g,actor,o.active,Number(effect.damage)||0);
   discardHandAndDraw(g,actor,p,plan.amount);break;
  case 'ATTACK_ACCELERATE_BASIC_ENERGY':{
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   const energy=ids('energy'),target=plan.target==='self'?card:find(g,ids('attachTo')[0])?.card;
   if(energy.length){
    assert(target&&field(p).includes(target)&&(plan.target!=='bench'||p.bench.includes(target))&&(!plan.holderType||record(target).facts.types.includes(plan.holderType)),'ACCELERATION_TARGET_CHANGED');
    for(const ident of energy){
     const index=p[plan.zone].findIndex(c=>id(c)===ident&&basicEnergy(c)&&(!plan.type||c.energyType===plan.type));
     assert(index>=0,'ACCELERATION_ENERGY_CHANGED');
     target.energyCards.push(p[plan.zone].splice(index,1)[0]);
     event(g,actor,'ATTACH_ENERGY',{energyId:ident,targetInstanceId:id(target),fromZone:plan.zone});
    }
   }
   if(plan.zone==='deck'){event(g,actor,'SEARCH_DECK',{selectedCount:energy.length,destination:'attached',privateTo:actor});shuffle(g,p);}
   break;
  }
  case 'DECK_ENERGY_TO_GRASS_BENCH':{
   if(ids('energy').length){const energyId=ids('energy')[0],benchId=ids('attachTo')[0];
    const target=p.bench.find(c=>id(c)===benchId&&record(c).facts.types.includes('草'));
    const index=p.deck.findIndex(c=>id(c)===energyId&&c.kind==='energy');
    assert(target&&index>=0,'DECK_ENERGY_SELECTION_CHANGED');
    target.energyCards||=[];target.energyCards.push(p.deck.splice(index,1)[0]);
    event(g,actor,'ATTACH_ENERGY',{energyId,targetInstanceId:benchId,fromZone:'deck'});
   }
   shuffle(g,p);break;
  }
  case 'MASS_ATTACHED_ENERGY_MOVE':{
   if(action.type==='attack_turn'&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(plan.source.startsWith('opponent')&&o.active.referenceProtection?.opponentTurn===g.turnNumber)break;
   const {pool,targets}=attachedMovePool(p,o,card,plan);
   for(const [i,ident] of ids('energy').entries()){
    const entry=pool.find(c=>id(c)===ident),source=find(g,entry?.containerId)?.card;
    const target=plan.target==='self'?card:plan.target==='ownActive'?p.active:targets.find(c=>id(c)===ids('moveTo'+(plan.multi?i:0))[0]);
    assert(source&&target&&source!==target,'ATTACHED_ENERGY_MOVE_CHANGED');
    moveAttachedEnergy(g,actor,source,target,ident);
   }
   break;
  }
  case 'ATTACK_BASIC_ENERGY_MOVE':{
   damage(g,actor,o.active,Number(effect.damage)||0);
   const energy=ids('energy')[0],to=ids('attachTo')[0];
   if(energy){assert(card.energyCards.some(c=>id(c)===energy&&basicEnergy(c)),'BASIC_MOVE_WRONG_ENERGY');moveAttachedEnergy(g,actor,card,p.bench.find(c=>id(c)===to),energy);}
   break;
  }
  case 'ATTACK_DAMAGE_MOVE_ENERGY':{
   damage(g,actor,o.active,Number.parseInt(effect.damage,10)||0);
   if(p.bench.length){const energyId=ids('energy')[0],benchId=ids('attachTo')[0];
    const target=p.bench.find(c=>id(c)===benchId),index=card.energyCards.findIndex(e=>id(e)===energyId);
    assert(target&&index>=0,'ENERGY_MOVE_SELECTION_CHANGED');
    moveAttachedEnergy(g,actor,card,target,energyId);
   }
   break;
  }
  case 'SWITCH_SELF_ATTACK':
   if(plan.optional&&Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   if(action.targetIds?.length)switchMon(g,p,action.targetIds[0]);
   break;
  case 'ATTACK_SWITCH_THEN_DAMAGE':
   if(action.targetIds?.length){
    chooseBenchSwitch(g,actor,o,action.targetIds[0]);
    damage(g,actor,o.active,plan.amount);
   }
   break;
  case 'ATTACK_RETURN_SELF_ENERGY':
   if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));
   for(const ident of ids('energy')){
    const index=card.energyCards.findIndex(energy=>id(energy)===ident);
    assert(index>=0,'SELF_ENERGY_RETURN_TARGET_CHANGED');
    p.hand.push(card.energyCards.splice(index,1)[0]);
    event(g,actor,'RETURN_TO_HAND',{cardIds:[ident],sourceInstanceId:id(card),fromZone:'attached'});
   }
   break;
  case 'HAND_LIMIT_DRAW_ATTACK':if(Number(effect.damage)>0)damage(g,actor,o.active,Number(effect.damage));draw(g,p,Math.max(0,plan.limit-p.hand.length));break;
  case 'HAND_LIMIT_DRAW_ABILITY':draw(g,p,Math.max(0,plan.limit-p.hand.length));break;
  case 'ABILITY_SWITCH_OWN':chooseBenchSwitch(g,actor,p,ids('ownBench')[0]);break;
  case 'ABILITY_SEARCH_TYPED_EVOLUTION':case 'TRAINER_SEARCH_TERA':searchSelectedDeck(g,actor,p,ids('cards'));break;
  case 'TRAINER_TEAM_DAMAGE_REDUCTION':
   p.referenceTeamDamageReductions=(p.referenceTeamDamageReductions||[]).filter(x=>x.turn===g.turnNumber+1);
   p.referenceTeamDamageReductions.push({turn:g.turnNumber+1,type:plan.type,amount:plan.amount});
   break;
  case 'TRAINER_TYPED_DAMAGE_BOOST':
   p.referenceTypedDamageBoosts||=[];
   p.referenceTypedDamageBoosts=p.referenceTypedDamageBoosts.filter(boost=>boost.turn===g.turnNumber);
   p.referenceTypedDamageBoosts.push({turn:g.turnNumber,type:plan.type,amount:plan.amount});
   break;
  case 'ABILITY_DRAW_CARDS':draw(g,p,plan.amount);break;
  case 'ABILITY_TYPED_COST_DRAW_LIMIT':{
   const pool=plan.zone==='attached'?card.energyCards:p.hand,ident=ids('discard')[0];
   const index=pool.findIndex(c=>id(c)===ident&&basicEnergy(c)&&c.energyType===plan.type);
   assert(index>=0,'TYPED_DRAW_COST_CHANGED');
   p.discard.push(pool.splice(index,1)[0]);
   event(g,actor,'DISCARD',{cardIds:[ident],fromZone:plan.zone,sourceInstanceId:id(card)});
   draw(g,p,plan.amount??Math.max(0,plan.limit-p.hand.length));
   if(plan.sharedUseName){p.turnLimits.abilityNames||={};p.turnLimits.abilityNames[plan.sharedUseName]=true;}
   break;
  }
  case 'SUPPORTER_NON_RULE_DISCARD_DRAW':{
   const chosen=ids('discard');
   for(const ident of chosen){
    const index=p.hand.findIndex(c=>id(c)===ident&&c.kind==='pokemon'&&!record(c).facts.rulePokemon);
    assert(index>=0,'NON_RULE_DRAW_COST_CHANGED');p.discard.push(p.hand.splice(index,1)[0]);
   }
   event(g,actor,'DISCARD',{cardIds:chosen,fromZone:'hand'});draw(g,p,chosen.length*plan.unit);break;
  }
  case 'ABILITY_DISCARD_DRAW':{
   const chosen=ids('discard');
   for(const ident of chosen){
    const index=p.hand.findIndex(c=>id(c)===ident);
    assert(index>=0,'ABILITY_DISCARD_COST_CHANGED');
    p.discard.push(p.hand.splice(index,1)[0]);
   }
   event(g,actor,'DISCARD',{cardIds:chosen,fromZone:'hand',sourceInstanceId:id(card)});
   draw(g,p,plan.amount);break;
  }
  case 'ABILITY_ATTACH_SELF_DRAW':{
   const index=p.hand.findIndex(c=>id(c)===ids('energy')[0]&&basicEnergy(c)&&c.energyType===plan.type);
   assert(index>=0,'ABILITY_TYPED_ENERGY_CHANGED');
   const energy=p.hand.splice(index,1)[0];
   card.energyCards||=[];card.energyCards.push(energy);
   event(g,actor,'ATTACH_ENERGY',{energyId:id(energy),targetInstanceId:id(card),fromZone:'hand',sourceOfficialCardId:record(card).officialCardId});
   if(p.deck.length)draw(g,p,plan.amount);
   break;
  }
  case 'ABILITY_HEAL_SELF':heal(g,actor,card,plan.amount);break;
  case 'DASH':draw(g,p,2);p.turnLimits.abilityNames||={};p.turnLimits.abilityNames.DASH=true;break;
  case 'REVERSAL_DRAW':draw(g,p,3);p.turnLimits.abilityNames||={};p.turnLimits.abilityNames.REVERSAL_DRAW=true;break;
  case 'EXCITE_DIVE':bench(g,p,card,true);break;
  case 'ADRENA_BRAIN':{
   const source=find(g,ids('source')[0]).card,to=find(g,ids('target')[0]).card,count=action.selections.count;moveDamageCounters(g,actor,source,to,count);break;
  }
  case 'ACTIVE_TOP_SUPPORTER_SEARCH':case 'RECON':case 'TOP_SUPPORTER_SEARCH':inspectDeckTopToHand(g,p,topDeckEffects[m],ids('cards'));break;
  case 'RUN_AWAY_DRAW':draw(g,p,3);returnStack(g,p,card,'deck');shuffle(g,p);break;
  case 'MEOWTH_ENTRY':searchSelectedDeck(g,actor,p,ids('cards'));p.turnLimits.abilityNames||={};p.turnLimits.abilityNames.MEOWTH_ENTRY=true;break;
  case 'TRAINER_SWITCH_BOTH':
   chooseBenchSwitch(g,actor,o,ids('opponentBench')[0]);
   if(p.bench.length)chooseBenchSwitch(g,actor,p,ids('ownBench')[0]);
   break;
  case 'SUPPORTER_ROCKET_SWITCH_BOTH':
   chooseBenchSwitch(g,actor,p,ids('ownBench')[0]);
   if(o.bench.length)chooseBenchSwitch(g,actor,o,ids('opponentBench')[0]);
   break;
  case 'SUPPORTER_BASIC_SWITCH_CONFUSE':
   chooseBenchSwitch(g,actor,o,ids('opponentBench')[0]);
   o.active.statusCondition='CONFUSED';
   event(g,actor,'STATUS_CONDITION',{targetInstanceId:id(o.active),status:'CONFUSED'});
   break;
  case 'SUPPORTER_SWITCH_EX_HEAL':{
   const previous=p.active;
   chooseBenchSwitch(g,actor,p,ids('ownBench')[0]);
   if(record(previous).name.endsWith('ex')&&previous.damage>0)heal(g,actor,previous,Math.min(previous.damage,plan.amount));
   break;
  }
  case 'SUPPORTER_SWITCH_THEN_DRAW_TO_LIMIT':
   chooseBenchSwitch(g,actor,p,ids('ownBench')[0]);
   draw(g,p,Math.max(0,plan.limit-p.hand.length));
   break;
  case 'SUPPORTER_SEARCH_BY_STAGE':
   searchSelectedDeck(g,actor,p,ids('cards'));
   break;
  case 'DISCARD_TO_SEARCH_DISTINCT_CATEGORIES':
  case 'ULTRA_BALL':moveChosen(g,p,'hand',ids('discard'),'discard',false);searchSelectedDeck(g,actor,p,ids('cards'));break;
  case 'CYRANO':case 'HILDA':case 'BROCK':case 'POKEPAD':searchSelectedDeck(g,actor,p,ids('cards'));break;
  case 'POFFIN':searchSelectedDeck(g,actor,p,ids('cards'),{destination:'bench'});break;
  case 'STRETCHER':moveChosen(g,p,'discard',ids('cards'),'hand');break;
  case 'ENERGY_SWITCH':{
   const source=field(p).find(c=>(c.energyCards||[]).some(e=>id(e)===ids('energy')[0])),to=find(g,ids('attachTo')[0]).card;assert(source!==to,'ENERGY_SWITCH_SAME_POKEMON');moveAttachedEnergy(g,actor,source,to,ids('energy')[0]);break;
  }
  case 'BOOST_EX_DAMAGE_THIS_TURN':p.referenceExDamageBoost={turn:g.turnNumber,amount:plan.amount};break;
  case 'DISCARD_ONE_DRAW_OPP_BENCH':{
   const discardId=ids('discard')[0],index=p.hand.findIndex(c=>id(c)===discardId);
   assert(index>=0,'SUPPORTER_DISCARD_COST_MISSING');
   p.discard.push(p.hand.splice(index,1)[0]);
   event(g,actor,'DISCARD',{cardIds:[discardId],fromZone:'hand',privateTo:actor});
   if(o.bench.length>0)draw(g,p,o.bench.length);
   break;
  }
  case 'SUPPORTER_DISCARD_ONE_DRAW_TO_SIX':{
   const discardId=ids('discard')[0],index=p.hand.findIndex(c=>id(c)===discardId);
   assert(index>=0,'SUPPORTER_DISCARD_COST_MISSING');
   p.discard.push(p.hand.splice(index,1)[0]);
   event(g,actor,'DISCARD',{cardIds:[discardId],fromZone:'hand',privateTo:actor});
   const count=Math.max(0,plan.limit-p.hand.length);
   if(count>0)draw(g,p,count);
   break;
  }
  case 'RETURN_HAND_PRIZE_DRAW':resetHand(g,p,o.prizes<=plan.threshold?plan.bonus:plan.normal);break;
  case 'RETURN_HAND_COIN_DRAW':resetHand(g,p,()=>coin(g,actor)?plan.heads:plan.tails);break;
  case 'COIN_DRAW_CARDS':draw(g,p,coin(g,actor)?plan.heads:plan.tails);break;
  case 'COIN_SEARCH_POKEMON':{
   if(!coin(g,actor))return;
   // Official FAQ 7589 and 9139: shuffle after a search with no pick.
   const options=p.deck.filter(candidate=>candidate.kind==='pokemon').map(id);
   if(options.length)g.pendingReferenceChoice={kind:'DECK_POKEMON_SEARCH',playerId:actor,options:[...options,null]};
   else finishCoinPokemonSearch(g,p,null);
   return;
  }
  case 'HEAL_ACTIVE_DAMAGE':heal(g,actor,p.active,plan.amount);break;
  case 'DRAW_CARDS':draw(g,p,plan.amount);break;
  case 'DISCARD_HAND_DRAW':case 'SUPPORTER_FIRST_TURN_DISCARD_HAND_DRAW':discardHandAndDraw(g,actor,p,plan.amount);break;
  case 'TRAINER_TOP_SELECT_DISCARD':{
   const top=deckWindow(p.deck,plan),selected=ids('cards');
   assert(selected.length===Math.min(plan.amount,top.length)&&new Set(selected).size===selected.length&&selected.every(ident=>top.some(c=>id(c)===ident)),'TOP_DISCARD_SELECTION_CHANGED');
   p.deck.splice(0,top.length);
   const chosen=selected.map(ident=>top.find(c=>id(c)===ident)),rest=top.filter(c=>!selected.includes(id(c)));
   p.hand.push(...chosen);p.discard.push(...rest);
   event(g,actor,'SEARCH_DECK',{selectedCount:selected.length,inspectedCount:top.length,privateTo:actor});
   event(g,actor,'ADD_TO_HAND',{cardIds:selected,fromZone:'deck',privateTo:actor});
   event(g,actor,'DISCARD',{cardIds:rest.map(id),fromZone:'deck'});
   break;
  }
  case 'TRAINER_TOP_TYPED_SEARCH':case 'TRAINER_TOP_POKEMON_TRAINER':resolveMixedTop(g,actor,p,plan,ids('cards'));break;
  case 'RECOVER_NON_RULE_AND_ENERGY':moveChosen(g,p,'discard',ids('cards'),'hand');break;
  case 'HEAL_LOW_HP_FULL':{
   const mon=find(g,ids('cards')[0])?.card;
   assert(mon&&lowHpHeal(mon,plan),'LOW_HP_TARGET_CHANGED');
   heal(g,actor,mon,mon.damage);break;
  }
  case 'RECOVER_TYPED_DISCARD':moveChosen(g,p,'discard',ids('cards'),'hand');break;
  case 'RECOVER_BASIC_ENERGY':moveChosen(g,p,'discard',ids('cards'),'hand');break;
  case 'HEAL_AND_CLEAR_STATUS':{
   const target=find(g,ids('cards')[0]).card;
   heal(g,actor,target,plan.amount);
   if(target.statusCondition){
    const previous=target.statusCondition;
    target.statusCondition=null;
    delete target.statusConditionInfo;
    event(g,actor,'STATUS_CONDITION',{targetInstanceId:id(target),status:null,previous});
   }
   break;
  }
  case 'DISCARD_DECK_TOP':{
   const moved=p.deck.splice(0,plan.amount);
   p.discard.push(...moved);
   event(g,actor,'DISCARD',{cardIds:moved.map(id),fromZone:'deck'});
   break;
  }
  case 'RECYCLE_BASIC_ENERGY':moveChosen(g,p,'discard',ids('cards'),'deck');shuffle(g,p);break;
  case 'SEARCH_MEGA_EVOLUTION_EX':searchSelectedDeck(g,actor,p,ids('cards'));break;
  case 'HEAL_DAMAGE':{const mon=find(g,ids('cards')[0]);assert(mon?.player===p&&Number.isSafeInteger(plan.amount)&&plan.amount>0,'INVALID_HEAL_TARGET');heal(g,actor,mon.card,plan.amount);break;}
  case 'COIN_FORCE_SWITCH':if(coin(g,actor))chooseBenchSwitch(g,actor,o,ids('bench')[0]);break;
  case 'SWITCH':chooseBenchSwitch(g,actor,p,ids('bench')[0]);break;
  case 'BOSS':chooseBenchSwitch(g,actor,o,ids('bench')[0]);break;
  case 'REPELLENT':assert(o.bench.length>0,'NO_OPPONENT_BENCH');g.pendingReferenceChoice={kind:'SWITCH',playerId:o.id,options:o.bench.map(id)};break;
  case 'RED_CARD':resetHand(g,o,3,true);break;
  case 'LILLIE':resetHand(g,p,p.prizes===6?8:6);break;
  case 'JUDGE':{const a=p.hand.splice(0),b=o.hand.splice(0);p.deck.push(...a);o.deck.push(...b);shuffle(g,p);shuffle(g,o);draw(g,p,4);draw(g,o,4);break;}
  case 'UNFAIR':{const a=p.hand.splice(0),b=o.hand.splice(0);p.deck.push(...a);o.deck.push(...b);shuffle(g,p);shuffle(g,o);draw(g,p,5);draw(g,o,2);break;}
  case 'AKAMATSU':{
   const hand=ids('toHand');moveChosen(g,p,'deck',hand,'hand');for(const ident of ids('cards').filter(i=>!hand.includes(i))){const index=p.deck.findIndex(c=>id(c)===ident);event(g,p.id,'REVEAL',{cardIds:[ident],toPlayer:o.id});find(g,ids('attachTo')[0]).card.energyCards.push(p.deck.splice(index,1)[0]);}shuffle(g,p);break;
  }
  case 'ROSA':for(const ident of ids('cards')){const i=p.discard.findIndex(c=>id(c)===ident);find(g,ids('attachTo')[0]).card.energyCards.push(p.discard.splice(i,1)[0]);}break;
  case 'TRAINER_DISCARD_SPECIAL_ENERGY':discardSelectedAttachment(g,actor,o,field(o),ids('energy'));break;
  case 'HAMMER':if(coin(g,actor)){const e=ids('energy')[0];if(e){const mon=field(o).find(c=>c.energyCards.some(c=>id(c)===e));o.discard.push(mon.energyCards.splice(mon.energyCards.findIndex(c=>id(c)===e),1)[0]);}}break;
  default:throw Error('UNCONNECTED_EFFECT:'+m);
 }
 emit(g,actor,plan,{sourceOfficialCardId:record(card).officialCardId,effectId:effect.effectId||record(card).officialCardId});
}
function finishCoinPokemonSearch(g,p,cardId){
 if(cardId!==null){
  assert(p.deck.some(c=>id(c)===cardId&&c.kind==='pokemon'),'DECK_POKEMON_SEARCH_TARGET_CHANGED');
  searchSelectedDeck(g,p.id,p,[cardId]);
 }else{
  event(g,p.id,'SEARCH_DECK',{selectedCount:0,destination:'hand',privateTo:p.id});
  shuffle(g,p);
 }
}
function execute(g,actor,action){
 const check=preflight(g,actor,action);assert(check?.handled&&!check.errors.length,check?.errors.join(';')||'NOT_REFERENCE_ACTION');
 const p=player(g,actor);p.turnLimits||={supporterUsed:false,abilityUses:{}};
 if(action.type==='resolve_reference_choice'){
  const choice=g.pendingReferenceChoice;
  if(choice.kind==='CIRCULATOR'){
   const attacker=find(g,choice.attackerId),target=attacker.player.bench.find(c=>id(c)===action.benchInstanceId);assert(target,'CIRCULATOR_TARGET_CHANGED');
   const i=attacker.card.energyCards.findIndex(e=>id(e)===action.energyId);assert(i>=0,'CIRCULATOR_ENERGY_CHANGED');target.energyCards.push(attacker.card.energyCards.splice(i,1)[0]);event(g,actor,'MOVE_ENERGY',{energyId:action.energyId,targetInstanceId:id(target),effect:'CIRCULATOR',sourceOfficialCardId:choice.sourceOfficialCardId});
  }
  else if(g.pendingReferenceChoice.kind==='MULLIGAN'){draw(g,p,action.drawCount);}
  else if(g.pendingReferenceChoice.kind==='PROMOTE'){
   promoteReferenceBench(g,p,p.bench.findIndex(c=>id(c)===action.benchInstanceId));
  }
  else if(choice.kind==='DECK_POKEMON_SEARCH')finishCoinPokemonSearch(g,p,action.deckCardId);
  else switchMon(g,p,action.benchInstanceId);
  delete g.pendingReferenceChoice;
  if(choice.kind==='CIRCULATOR'||choice.kind==='PROMOTE'&&g.referenceAttackAwaitingPromotion)finishAttack(g,g.referenceAttackTurnPending);
 }else if(action.type==='attach_energy'){
  const card=p.hand.splice(action.cardIndex,1)[0],mon=action.target==='active'?p.active:p.bench[action.target];mon.energyCards.push(card);p.normalEnergyAttached=true;event(g,actor,'ATTACH_ENERGY',{cardId:id(card),targetInstanceId:id(mon)});
 }else if(action.type==='retreat'){
  for(const ident of action.energyIds||[]){const i=p.active.energyCards.findIndex(c=>id(c)===ident);p.discard.push(p.active.energyCards.splice(i,1)[0]);}switchMon(g,p,action.benchInstanceId);g.retreatUsed=true;
 }else if(action.type==='attack_turn'){
  const card=p.active,effect=record(card).attacks[action.attackIndex];applyPlan(g,actor,card,effect,action);g.history.push({turnNumber:g.turnNumber,player:actor,type:'attack',details:{effectId:effect.effectId,referenceOfficialCardId:record(card).officialCardId}});refresh(g);finishAttack(g,actor);
 }else if(action.type==='use_ability'){
  const card=[...field(p),...p.hand].find(c=>id(c)===action.sourceInstanceId),effect=record(card).abilities.find(a=>a.effectId===action.abilityId);applyPlan(g,actor,card,effect,action);if(!effect.plan.repeated)mark(p,card,effect);g.history.push({turnNumber:g.turnNumber,player:actor,type:'ability_used',details:{effectId:effect.effectId}});functions().Core.resolveKnockouts(g,actor);
 }else{
  const i=p.hand.findIndex(c=>id(c)===action.cardId),card=p.hand.splice(i,1)[0],r=record(card);
  if(action.type==='attach_tool'){find(g,action.targetInstanceId).card.tools=[card];emit(g,actor,r.mainPlan,{sourceOfficialCardId:r.officialCardId});g.history.push({turnNumber:g.turnNumber,player:actor,type:'attach_tool',details:{cardId:id(card),targetInstanceId:action.targetInstanceId}});}
  else if(action.type==='play_stadium'){
   if(g.stadium)player(g,g.stadiumOwner).discard.push(g.stadium);g.stadium=card;g.stadiumOwner=actor;g.stadiumPlayedTurn=g.turnNumber;g.stadiumPlayedBy=actor;emit(g,actor,r.mainPlan,{sourceOfficialCardId:r.officialCardId});g.history.push({turnNumber:g.turnNumber,player:actor,type:'stadium_played',details:{cardId:id(card),cardName:card.name}});
  }else {p.discard.push(card);if(action.type==='play_supporter'){p.turnLimits||={};p.turnLimits.supporterUsed=true;}applyPlan(g,actor,card,{plan:r.mainPlan},action);}
  refresh(g);functions().Core.resolveKnockouts(g,actor);
 }
 return {referenceEffect:true,adoptedPrint:false};
}
function afterAction(g,before,actor,action){
 if(!g.referenceEffectValidation)return;
 g.referenceActionSequence=(g.referenceActionSequence||0)+1;
 if(['bench_basic','play_active_basic'].includes(action.type)){
  const c=field(player(g,actor)).find(c=>id(c)===action.cardId);if(c&&action.type==='bench_basic'){onBench(g,player(g,actor),c,true);c.entryWindow=g.referenceActionSequence;}
 }
 if(action.type==='evolve'){
  const c=find(g,action.targetInstanceId)?.card;if(c){c.referenceEvolutionWindow=g.referenceActionSequence;c.validationBase||=reduced(current(find(before,action.targetInstanceId).card));for(const k of ['referenceProtection','referenceBasicDamageProtection','referenceCannotAttackTurn','referenceNamedAttackLock','referenceCannotRetreatTurn','referenceDamageReduction','referenceOutgoingDamagePenalty','referenceAttackLockUntilSwitch','referenceNoWeaknessTurn'])delete c[k];}
 }
 if(g.status==='finished'){delete g.pendingReferenceChoice;delete g.referenceAttackTurnPending;delete g.referenceAttackAwaitingPromotion;}
 if(g.referenceAttackTurnPending&&!g.pendingReferenceChoice&&!g.pendingPrizeSelection&&g.status==='active'){
  const a=g.referenceAttackTurnPending;delete g.referenceAttackTurnPending;functions().Core.endTurn(g,a);
 }
 refresh(g);
 if(['bench_basic','evolve','play_active_basic'].includes(action.type))functions().Core.resolveKnockouts(g,actor);
}
function onEndTurn(g,actor){
 if(!g.referenceEffectValidation)return;
 for(const c of field(player(g,actor)))for(const energy of [...c.energyCards])if(record(energy)?.mainPlan?.mechanic==='IGNITION'){
  c.energyCards.splice(c.energyCards.indexOf(energy),1);player(g,actor).discard.push(energy);event(g,actor,'DISCARD',{cardIds:[id(energy)]});
 }
}
// Produce complete effect-specific choices only; the existing inspector checks every candidate.
function abilityActions(g,actor,card){return (record(card)?.abilities||[]).filter(a=>!passive.has(a.plan?.mechanic)).map(a=>({kind:'ability',label:a.name,action:{type:'use_ability',sourceInstanceId:id(card),abilityId:a.effectId},requests:requests(g,actor,card,a),referenceEffect:a}));}
function pokemonActions(g,actor,ident){
 const p=player(g,actor),mon=field(p).find(c=>id(c)===ident);if(!mon)return [];
 const out=abilityActions(g,actor,mon);
 if(p.active===mon){
  record(mon).attacks.forEach((a,index)=>out.push({kind:'attack',label:a.name,damage:Number.parseInt(a.damage,10)||0,action:{type:'attack_turn',attackIndex:index},requests:requests(g,actor,mon,a),referenceEffect:a}));
  for(const target of p.bench){
   if(mon.referenceCannotRetreatTurn===g.turnNumber)break;
   const cards=mon.energyCards||[],required=mon.retreatCost;
   // Search by number of physical cards; a special energy can provide several units.
   // A payment is valid only if removing any one selected card makes it insufficient.
   let choices=required===0?[]:null;
   if(required>0){
    // Retreat costs are colorless units. Selecting highest-yield physical
    // energy cards first minimizes the number discarded without exponential
    // subset enumeration. Preserve attachment order for equal-yield cards.
    const ranked=cards.map((energy,index)=>({
     energy,index,units:energyUnits({...mon,energyCards:[energy]}).length
    })).filter(entry=>entry.units>0).sort((a,b)=>b.units-a.units||a.index-b.index);
    const payment=[];let supplied=0;
    for(const entry of ranked){
     if(supplied>=required)break;
     payment.push(entry.energy);supplied+=entry.units;
    }
    if(supplied>=required)choices=payment.map(id);
   }
   if(choices!==null)out.push({kind:'retreat',label:'にげる → '+target.name,action:{type:'retreat',benchInstanceId:id(target),energyIds:choices},requests:[]});
  }
 }
 return out;
}
function handOptions(g,actor,ident){
 const p=player(g,actor),card=p.hand.find(c=>id(c)===ident);if(!card)return [];
 const out=[];
 if(card.kind==='pokemon'){
  if(card.basic){out.push({key:'bench',label:'ベンチに出す',action:{type:'bench_basic',cardId:ident}});out.push({key:'active',label:'バトル場に出す',action:{type:'play_active_basic',cardId:ident}});}
  else for(const c of field(p))out.push({key:id(c),label:'進化する',action:{type:'evolve',cardId:ident,targetInstanceId:id(c)}});
  for(const a of abilityActions(g,actor,card))if(abilityOrigin(a.referenceEffect).zones.includes('HAND'))out.push({...a,key:'hand-ability:'+a.action.abilityId});
 }
 if(['trainer','stadium'].includes(card.kind)){
  const type=card.kind==='stadium'?'play_stadium':card.cardType==='SUPPORTER'?'play_supporter':'play_item',effect={plan:record(card).mainPlan};
  out.push({key:card.kind==='stadium'?'stadium':'trainer',label:'カードを使う',action:{type,cardId:ident},requests:requests(g,actor,card,effect)});
 }
 for(const c of field(p)){
  if(card.kind==='tool')out.push({key:id(c),label:'どうぐをつける',action:{type:'attach_tool',cardId:ident,targetInstanceId:id(c)}});
  if(card.kind==='energy')out.push({key:id(c),label:'エネルギーをつける',action:{type:'attach_energy',cardIndex:p.hand.indexOf(card),target:p.active===c?'active':p.bench.indexOf(c)}});
 }
 return out;
}
function completeAction(g,actor,option){
 const action=copy(option.action),p=player(g,actor);
 for(const original of option.requests||[]){
  const r=Selection.resolve(original,option.requests,action.selections);
  if(r.kind==='POKEMON')action.targetIds=r.candidates.slice(0,r.min).map(c=>c.instanceId);
  else if(r.kind==='COUNTERS'){action.selections||={};action.selections.allocation=r.candidates.length?{[r.candidates[0].id]:r.min}:{};}
  else if(r.kind==='COUNT'){action.selections||={};const source=find(g,action.selections.source?.[0])?.card;action.selections.count=Math.min(r.max,Math.floor((source?.damage||0)/10));}
  else {
   action.selections||={};
   const eligible=[];
   for(const candidate of r.candidates){
    if(eligible.length>=r.max)break;
    const next=[...eligible,id(candidate)];
    if(Selection.allows(r.candidates,next,r.constraints))eligible.push(id(candidate));
   }
   action.selections[r.key]=eligible;
  }
 }
 const card=action.cardId?p.hand.find(c=>id(c)===action.cardId):action.sourceInstanceId?[...field(p),...p.hand].find(c=>id(c)===action.sourceInstanceId):p.active;
 const effect=action.type==='attack_turn'?record(card)?.attacks[action.attackIndex]:action.type==='use_ability'?record(card)?.abilities.find(a=>a.effectId===action.abilityId):{plan:record(card)?.mainPlan};
 const m=effect?.plan?.mechanic;
 if(m==='SWITCH_SELF_ATTACK'&&effect.plan.optional&&p.bench.length)action.targetIds=[id(p.bench[0])];
 if(m==='MASS_ATTACHED_ENERGY_MOVE'&&effect.plan.count!==null){
  const plan=effect.plan,{pool,targets}=attachedMovePool(p,opponent(g,actor),card,plan);
  const chosen=[];let covered=0;
  for(const c of [...pool].sort((a,b)=>b.moveUnits-a.moveUnits)){if(covered>=plan.count)break;chosen.push(c);covered+=c.moveUnits;}
  action.selections||={};action.selections.energy=chosen.map(id);
  if(!['self','ownActive'].includes(plan.target)){
   const target=targets.find(t=>!chosen.some(c=>c.containerId===id(t)));
   for(let i=0;i<(plan.multi?Math.min(plan.count,pool.length):1);i++)action.selections['moveTo'+i]=chosen.length>i&&target?[id(target)]:[];
  }
 }
 if(m==='TRAINER_SWITCH_OR_EX_V_BOOST'&&action.selections.mode[0]==='boost')action.selections.ownBench=[];
 if(['ATTACK_DISCARD_MULTIPLE_SELF_ENERGY','ATTACK_RETURN_SELF_ENERGY'].includes(m)||m==='ATTACK_SPREAD_DAMAGE'&&Number.isInteger(effect.plan.discardAttached)){
  const entries=(card.energyCards||[]).map((energy,index)=>({
    energy,index,units:selectedAttachmentUnits(card,energy,effect.plan)
  })).filter(e=>e.units>0).sort((a,b)=>b.units-a.units||a.index-b.index);
  const chosen=[];let covered=0;
  for(const entry of entries){
   if(covered>=(m==='ATTACK_SPREAD_DAMAGE'?effect.plan.discardAttached:effect.plan.count))break;
   chosen.push(entry.energy);covered+=entry.units;
  }
  action.selections||={};
  action.selections.energy=chosen.map(id);
 }
 if(m==='AKAMATSU'){
  const candidates=requests(g,actor,card,effect).find(r=>r.key==='cards').candidates,types=new Set(),chosen=candidates.filter(c=>{if(types.has(c.energyType))return false;types.add(c.energyType);return true;}).slice(0,2);
  action.selections.cards=chosen.map(id);action.selections.toHand=chosen.slice(0,1).map(id);action.selections.attachTo=chosen.length>1?[id(p.active)]:[];
 }
 if(m==='HILDA'){const candidates=requests(g,actor,card,effect).find(r=>r.key==='cards').candidates;action.selections.cards=[candidates.find(c=>c.kind==='pokemon'&&!record(c).facts.basic),candidates.find(c=>c.kind==='energy')].filter(Boolean).map(id);}
 if(m==='BROCK'){const candidates=requests(g,actor,card,effect).find(r=>r.key==='cards').candidates,basics=candidates.filter(c=>record(c).facts.basic).slice(0,2);action.selections.cards=basics.length?basics.map(id):candidates.slice(0,1).map(id);}
 if(m==='ENERGY_SWITCH'){
  const source=field(p).find(c=>(c.energyCards||[]).some(e=>id(e)===action.selections.energy[0]));action.selections.attachTo=field(p).filter(c=>c!==source).slice(0,1).map(id);
 }
 return action;
}
function blockers(g,actor){
 const automatic=unconnectedAutomatic(g);if(automatic)return [automatic];
 const p=player(g,actor),out=[];
 for(const c of [...field(p),...p.hand]){
  const r=record(c);if(!r){out.push(blocked(c,{name:'参照情報'},'MISSING_PRINT_REFERENCE'));continue;}
  if(p.hand.includes(c)&&c.kind!=='pokemon'&&!connected(r.mainPlan))out.push(blocked(c,{name:r.name}));
  if(c===p.active)for(const a of r.attacks)if(!connected(a.plan)&&pays(c,a.cost))out.push(blocked(c,a));
 }
 return out;
}
function validateGame(g){
 if(g.referenceEffectValidation&&g.referenceRngState!==undefined)assert(Number.isInteger(g.referenceRngState)&&g.referenceRngState>=0&&g.referenceRngState<=0xffffffff,'INVALID_REFERENCE_RNG_STATE');
 const cards=g.players.flatMap(p=>[p.active,...p.bench,...p.hand,...p.deck,...p.discard,...(p.prizeCards||[])].filter(Boolean));
 if(g.stadium)cards.push(g.stadium);
 const nested=cards.flatMap(c=>[c,...(c.evolutionCards||[]),...(c.energyCards||[]),...(c.tools||[])]);
 if(!g.referenceEffectValidation){assert(!nested.some(c=>c.validationReference),'REFERENCE_MODE_REQUIRED');return;}
 assert(g.referenceEffectValidation.adoptedPrints===0,'REFERENCE_ADOPTION_FORBIDDEN');
 const choice=g.pendingReferenceChoice;
 if(choice?.kind==='DECK_POKEMON_SEARCH'){
  const owner=player(g,choice.playerId);
  const options=owner.deck.filter(card=>card.kind==='pokemon').map(id);
  assert(choice.playerId===g.turnPlayer&&options.length>0&&JSON.stringify(choice.options)===JSON.stringify([...options,null]),
   'INVALID_DECK_POKEMON_SEARCH_STATE');
 }
 for(const c of nested){const r=record(c);assert(r,'REFERENCE_SOURCE_REQUIRED');assert(c.officialCardId==null&&c.catalogCardId==null,'REFERENCE_ADOPTION_FORBIDDEN');}
 for(const {card} of inPlay(g)){
  const r=record(card);
  assert(card.hp===r.facts.hp+maxHpBonus(g,card),'REFERENCE_HP_CONFLICT');
  assert(card.basic===r.facts.basic&&card.stage===r.facts.stage,'REFERENCE_STAGE_CONFLICT');
 }
}
function projectView(view,viewer){
 if(!view.referenceEffectValidation)return view;
 const choice=view.pendingReferenceChoice;
 if(choice?.kind==='DECK_POKEMON_SEARCH'&&choice.playerId!==viewer)view.pendingReferenceChoice={kind:choice.kind,playerId:choice.playerId};
 for(const p of view.players)if(p.prizeSlots)p.prizeSlots=p.prizeSlots.map(x=>x?true:null);
 for(const e of view.history){
  if(e.details?.privateTo&&e.details.privateTo!==viewer)e.details={command:e.details.command,privateTo:e.details.privateTo,redacted:true};
  if(e.type==='draw'&&e.details?.playerId!==viewer)e.details={playerId:e.details?.playerId,count:e.details?.count,redacted:true};
 }
 return view;
}
function plannedCommands(g,actor,action){
 if(!g.referenceEffectValidation)return [];
 const p=player(g,actor),card=action.cardId?p.hand.find(c=>id(c)===action.cardId):action.sourceInstanceId?[...field(p),...p.hand].find(c=>id(c)===action.sourceInstanceId):p.active;
 const r=record(card);if(!r)return [];
 const effect=action.type==='attack_turn'?r.attacks[action.attackIndex]:action.type==='use_ability'?r.abilities.find(a=>a.effectId===action.abilityId):{name:r.name,text:r.text,plan:r.mainPlan};
 if(!connected(effect?.plan))return [];
 return effect.plan.commands.map((command,i)=>({order:i+1,command,mechanic:effect.plan.mechanic,referenceOfficialCardId:r.officialCardId,sourceText:effect.text||r.text}));
}
function statuses(g){
 if(!g.referenceEffectValidation)return [];
 const out=[];
 for(const {player:p,card} of inPlay(g)){
  const r=record(card),add=(suffix,label,effect,duration)=>out.push({id:'reference-'+id(card)+'-'+suffix,short:label,label,scope:'POKEMON',targetInstanceId:id(card),playerId:p.id,sourceCard:r.name,sourceEffect:effect,start:'公式参照版の効果解決時',duration,removal:'ベンチへの移動・進化・期限終了など、エンジンの条件に従う',condition:'参照ID '+r.officialCardId,description:label});
  if(card.referenceProtection&&g.turnNumber<=card.referenceProtection.opponentTurn)add('protection','ワザのダメージ・効果を受けない','あなをほる','次の相手の番の終わりまで');
  if(card.referenceBasicDamageProtection&&g.turnNumber<=card.referenceBasicDamageProtection.turn)add('basic-protection',card.referenceBasicDamageProtection.exceptType?card.referenceBasicDamageProtection.exceptType+'以外のたねポケモンのワザのダメージを受けない':'たねポケモンのワザのダメージを受けない','前の番のワザ','次の相手の番の終わりまで');
  if(card.referenceDamageReduction?.turn===g.turnNumber)add('attack-damage-reduction','受けるワザのダメージ −'+card.referenceDamageReduction.amount,'前の番のワザ','この番の終わりまで');
  if(card.referenceCannotRetreatTurn===g.turnNumber)add('retreat-lock','この番はにげられない','相手のワザ','この番の終わりまで');
  if(card.referenceCannotAttackTurn&&g.turnNumber<=card.referenceCannotAttackTurn)add('attack-lock','次の自分の番はワザ使用不可','むげんのやいば','次の自分の番の終わりまで');
 }
 for(const state of g.referenceItemLock||[])if(g.turnNumber===state.turnNumber)out.push({id:'reference-item-lock-'+state.playerId,short:'グッズ不可',label:'グッズ使用不可',scope:'PLAYER',playerId:state.playerId,sourceCard:'スボミー',sourceEffect:'むずむずかふん',start:'前の番のワザ解決時',duration:'この番の終わりまで',removal:'期限終了',condition:'このプレイヤーの番',description:'手札からグッズを出して使えない'});
 const name={WATCHTOWER:'無色ポケモンの特性なし',NIGHT_MINE:'テラスタルのワザの無色コスト＋1',RUINS:'悪以外のたねをベンチに出すとダメカン2個',JAMMING:'どうぐの効果なし',SUPPRESS_RULE_ABILITIES:'ルールを持つポケモンの特性なし'}[stadium(g)];
 if(name)out.push({id:'reference-stadium',short:name,label:name,scope:'FIELD',sourceCard:g.stadium.name,sourceEffect:'スタジアム',start:'スタジアムが場に出たとき',duration:'このスタジアムが場にあるかぎり',removal:'場を離れたとき',condition:'公式参照版',description:name});
 return out;
}
function cardInfo(g,actor,ident){
 const p=player(g,actor),card=[...field(p),...p.hand,...p.discard].find(c=>id(c)===ident),r=record(card);if(!r)return null;
 const entries=[...r.attacks.map(e=>({...e,type:'ATTACK'})),...r.abilities.map(e=>({...e,type:'ABILITY'})),...(r.category!=='pokemon'?[{name:r.name,text:r.text,plan:r.mainPlan,type:'CARD'}]:[])].map(e=>({id:e.effectId||r.officialCardId,name:e.name,type:e.type,officialText:e.text,damage:e.damage??null,cost:e.cost||[],active:e.type==='ABILITY'&&passive.has(e.plan?.mechanic)?abilityOrigin(e).zones.includes(abilityZone(p,card))&&abilityEnabled(g,card,e):null,inactiveReasons:e.type==='ABILITY'&&passive.has(e.plan?.mechanic)&&(!field(p).includes(card)||!abilityEnabled(g,card,e))?[field(p).includes(card)?'特性無効化中':'場にいません']:[],description:e.text||'印刷されたダメージ',condition:'印刷版 '+r.officialCardId+' / '+r.set+' / '+(r.cardNumber||'番号無印字'),usage:'公式テキストと合法手判定に従う',removal:'公式テキストと期限の判定に従う',resolution:connected(e.plan)?e.plan.commands.join(' → '):'未接続・使用時に停止'}));
 for(const entry of entries.filter(e=>e.type==='ABILITY'&&e.active===false&&!e.inactiveReasons.length))entry.inactiveReasons=['ABILITY_SOURCE_ZONE:'+abilityOrigin(r.abilities.find(a=>a.effectId===entry.id)).zones.join('|')];
 for(const entry of entries.filter(e=>e.type==='ABILITY'&&e.active===null)){
  const effect=r.abilities.find(a=>a.effectId===entry.id),option=abilityActions(g,actor,card).find(o=>o.action.abilityId===entry.id);
  entry.activationOrigin=abilityOrigin(effect);
  const action=completeAction(g,actor,option),check=preflight(g,actor,action);
  entry.actionAvailable=check.errors.length===0;entry.inactiveReasons=check.errors;
 }
 return {instanceId:ident,entries,referenceOfficialCardId:r.officialCardId,officialPageUrl:r.officialPageUrl,deckPrintAdopted:false};
}
function coverage(){return {prints:catalog.records.length,defaults:Object.entries(catalog.defaultValidationReferences).map(([name,ident])=>{const r=records.get(ident);return {name,officialCardId:ident,deckPrintAdopted:false,unconnected:[...r.attacks,...r.abilities].filter(e=>!connected(e.plan)).map(e=>e.name),mainConnected:r.category==='pokemon'||connected(r.mainPlan)};})};}
module.exports={reduced,promoteReferenceBench,catalog,fullCatalog,referenceRecord:ident=>records.get(String(ident)),record,connected,preflight,handles,execute,refresh,afterAction,onEndTurn,pokemonActions,handOptions,completeAction,blockers,coverage,validateGame,projectView,plannedCommands,statuses,cardInfo,energyUnits,damage,damages,referenceChoiceAction};
