'use strict';
// Print-scoped extensions of the canonical gateway. Adoption remains a separate concern.
const catalog=require('./pokeca_reference_effect_data');
const records=new Map(catalog.records.map(r=>[r.officialCardId,r]));
const copy=x=>JSON.parse(JSON.stringify(x)),id=c=>c?.id||c?.cardId;
const basicTypes=['草','炎','水','雷','超','闘','悪','鋼'];
const unresolved=new Set();
const passive=new Set(['SKYLINE','FAIRY_ZONE','BENCH_NON_RULE_PROTECTION']);
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
function abilityEnabled(g,card){return !(stadium(g)==='WATCHTOWER'&&record(card)?.facts.types?.includes('無色'));}
function basicEnergy(c){return c?.kind==='energy'&&!c.isSpecial&&basicTypes.includes(c.energyType);}
function energyUnits(mon){
 const out=[];
 for(const c of mon.energyCards||[]){
  const r=record(c),m=r?.mainPlan?.mechanic;
  if(m==='ROCKET_ENERGY'){if(record(mon)?.name.startsWith('ロケット団の'))out.push(['超','悪'],['超','悪']);}
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
function cost(g,mon,attack){const c=[...attack.cost];if(stadium(g)==='NIGHT_MINE'&&record(mon).facts.teraBenchProtection)c.push('無色');return c;}
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
 event(g,p.id,'RETURN_TO_DECK',{cardIds:cards.map(id),bottomOnly});draw(g,p,n);
}
function wasKnockedOut(g,actor){return g.history.some(e=>e.turnNumber===g.turnNumber-1&&e.type==='knockout'&&e.details?.targetPlayerId===actor);}
function enabledAbilities(g,card){return abilityEnabled(g,card)?record(card)?.abilities.filter(a=>connected(a.plan))||[]:[];}
function used(p,card,a){return !!p.turnLimits?.abilityUses?.[id(card)+':'+a.effectId];}
function mark(p,card,a){p.turnLimits||={};p.turnLimits.abilityUses||={};p.turnLimits.abilityUses[id(card)+':'+a.effectId]=true;}
function unconnectedAutomatic(g){
 for(const {card} of inPlay(g))for(const a of record(card)?.abilities||[])if(!a.plan&&/いるかぎり|ダメージを受けたとき/.test(a.text)&&abilityEnabled(g,card))return blocked(card,a,'UNCONNECTED_AUTOMATIC_ABILITY');
 return null;
}
function refresh(g){
 if(!g.referenceEffectValidation)return;
 for(const {card} of inPlay(g)){
  const r=record(card);assert(r,'REFERENCE_MISSING_IN_PLAY');
  const cape=toolEnabled(g)&&(card.tools||[]).some(t=>record(t)?.mainPlan?.mechanic==='HERO_CAPE');
  card.hp=r.facts.hp+(cape?100:0);card.prizeCount=r.facts.prizeCount;
  card.retreatCost=r.facts.retreatCost;
 }
 for(const p of g.players){
  if(field(p).some(c=>enabledAbilities(g,c).some(a=>a.plan.mechanic==='SKYLINE')))for(const c of field(p))if(record(c).facts.basic)c.retreatCost=0;
  for(const c of field(p)){
   for(const e of [...(c.energyCards||[])])if(record(e)?.mainPlan?.mechanic==='ROCKET_ENERGY'&&!record(c).name.startsWith('ロケット団の')){
    c.energyCards.splice(c.energyCards.indexOf(e),1);p.discard.push(e);event(g,p.id,'DISCARD',{cardIds:[id(e)]});
   }
   c.energies=energyUnits(c).map(unit=>unit[0]);
  }
 }
}
function reduced(card){const out=copy(card);if(out.evolutionCards?.length){const base=out.validationBase;assert(base,'EVOLUTION_BASE_METADATA_MISSING');Object.assign(out,copy(base));}for(const k of ['damage','energies','energyCards','tools','evolutionCards','statusCondition','referenceProtection','referenceCannotAttackTurn','enteredTurn','evolvedTurn','entryWindow','validationBase'])delete out[k];return out;}
function returnStack(g,p,mon,zone){
 const stack=[reduced(mon),...(mon.evolutionCards||[]).map(reduced),...(mon.energyCards||[]),...(mon.tools||[])];
 if(p.active===mon)p.active=null;else p.bench.splice(p.bench.indexOf(mon),1);
 p[zone].push(...stack);event(g,p.id,zone==='hand'?'RETURN_TO_HAND':'RETURN_TO_DECK',{cardIds:stack.map(id)});
 if(!p.active&&p.bench.length===1)p.active=p.bench.shift();
 if(!p.active&&!p.bench.length){g.status='finished';g.winner=opponent(g,p.id).id;}
 if(!p.active&&p.bench.length>1)g.pendingReferenceChoice={kind:'PROMOTE',playerId:p.id,options:p.bench.map(id)};
}
function clearActiveEffects(c){if(!c)return;c.statusCondition=null;delete c.statusConditionInfo;delete c.referenceProtection;delete c.referenceCannotAttackTurn;}
function switchMon(g,p,target){const index=p.bench.findIndex(c=>id(c)===target);assert(p.active&&index>=0,'INVALID_BENCH_CHOICE');clearActiveEffects(p.active);[p.active,p.bench[index]]=[p.bench[index],p.active];event(g,p.id,'SWITCH',{activeInstanceId:id(p.active)});}
function damages(g,actor,mon,amount,{bench=false,ignore=false}={}){
 const own=player(g,actor),other=opponent(g,actor),source=own.active;
 if(amount===0)return 0;
 if(!ignore){
  if(bench&&record(mon).facts.teraBenchProtection)return 0;
  if(bench&&!record(mon).facts.rulePokemon&&field(other).some(c=>enabledAbilities(g,c).some(a=>a.plan.mechanic==='BENCH_NON_RULE_PROTECTION')))return 0;
  if(mon.referenceProtection?.opponentTurn===g.turnNumber)return 0;
 }
 if(!bench){
  const r=record(mon),types=record(source).facts.types||[];
  let weakness=r.facts.weakness,resistance=r.facts.resistance;
  if(!ignore&&types.includes('超')&&record(mon).facts.types?.includes('竜')&&field(own).some(c=>enabledAbilities(g,c).some(a=>a.plan.mechanic==='FAIRY_ZONE')))weakness={types:['超'],value:'×2'};
  if(weakness?.types.some(t=>types.includes(t))){assert(weakness.value==='×2','UNSUPPORTED_WEAKNESS');amount*=2;}
  if(resistance?.types.some(t=>types.includes(t))){const n=Number(resistance.value.replace('－','-'));assert(Number.isFinite(n),'UNSUPPORTED_RESISTANCE');amount=Math.max(0,amount+n);}
 }
 if(ignore&&typesConflictForIgnore(g,own,mon,source))stop(mon,{name:'弱点変更との相互作用'},'OFFICIAL_WEAKNESS_MODIFICATION_RULING_REQUIRED');
 return amount;
}
function typesConflictForIgnore(g,own,mon,source){return record(source).facts.types.includes('超')&&record(mon).facts.types.includes('竜')&&field(own).some(c=>enabledAbilities(g,c).some(a=>a.plan.mechanic==='FAIRY_ZONE'));}
function damage(g,actor,mon,amount,options={}){
 const value=damages(g,actor,mon,amount,options),attacker=player(g,actor).active,defender=find(g,id(mon));
 command(g,actor,{command:'DAMAGE',amount:value},{targetIds:[id(mon)]});
 if(value>0&&!options.bench&&defender?.player.active===mon&&toolEnabled(g)&&(mon.tools||[]).some(t=>record(t)?.mainPlan?.mechanic==='CIRCULATOR')){
  g.referenceReactions||=[];g.referenceReactions.push({kind:'CIRCULATOR',playerId:defender.player.id,attackerId:id(attacker),sourceOfficialCardId:record(mon.tools.find(t=>record(t)?.mainPlan?.mechanic==='CIRCULATOR')).officialCardId});
 }
}
function counters(g,actor,mon,count,{attack=false,sourceType='POKEMON'}={}){if(attack&&mon.referenceProtection?.opponentTurn===g.turnNumber){event(g,actor,'PLACE_DAMAGE_COUNTERS',{prevented:true,targetInstanceId:id(mon)});return;}command(g,actor,{command:'PLACE_DAMAGE_COUNTERS',counterCount:count},{targetIds:[id(mon)],sourceType,actionType:attack?'ATTACK':sourceType==='STADIUM'?'TRAINER':'ABILITY'});}
function coin(g,actor){if(g.referenceEffectPreview)return false;const n=referenceRandom(g);assert(Number.isFinite(n)&&n>=0&&n<1,'INVALID_RNG');const heads=n<.5;event(g,actor,'COIN_FLIP',{heads});return heads;}
function requirePlan(card,effect){if(!connected(effect?.plan))stop(card,effect);return effect.plan;}
function itemLocked(g,actor){return !!g.referenceItemLock?.some(x=>x.playerId===actor&&x.turnNumber===g.turnNumber);}
function requests(g,actor,card,effect){
 const p=player(g,actor),o=opponent(g,actor),m=effect.plan?.mechanic,out=[];
 const add=(key,kind,candidates,min,max,extra={})=>out.push({key,kind,min,max,candidates:copy(candidates),...extra});
 const own=field(p),opp=field(o),cardRequest=(key,list,min,max)=>add(key,'CARD',list,min,max);
 if(['BENCH_COUNTER_DAMAGE','BENCH_EX_DAMAGE'].includes(m))add('targetIds','POKEMON',o.bench.filter(c=>m!=='BENCH_EX_DAMAGE'||record(c).facts.rulePokemon).map(c=>({instanceId:id(c),name:c.name})),1,1);
 if(m==='ANY_DAMAGE')add('targetIds','POKEMON',opp.map(c=>({instanceId:id(c),name:c.name})),1,1);
 if(m==='SWITCH_SELF_ATTACK')add('targetIds','POKEMON',p.bench.map(c=>({instanceId:id(c),name:c.name})),Math.min(1,p.bench.length),Math.min(1,p.bench.length));
 if(m==='ACTIVE_AND_BENCH_DAMAGE')add('targetIds','POKEMON',o.bench.map(c=>({instanceId:id(c),name:c.name})),Math.min(1,o.bench.length),Math.min(1,o.bench.length));
 if(m==='ATTACK_DAMAGE_MOVE_ENERGY'&&p.bench.length){cardRequest('energy',card.energyCards||[],1,1);cardRequest('attachTo',p.bench,1,1);}
 if(m==='DECK_ENERGY_TO_GRASS_BENCH'){
  const energies=p.deck.filter(c=>c.kind==='energy'),targets=p.bench.filter(c=>record(c).facts.types.includes('草'));
  const count=energies.length&&targets.length?1:0;
  cardRequest('energy',energies,count,count);cardRequest('attachTo',targets,count,count);
 }
 if(m==='PHANTOM'&&o.bench.length)add('allocation','COUNTERS',o.bench.map(c=>({id:id(c),name:c.name,damage:c.damage||0,hp:c.hp})),6,6);
 if(m==='HUNT')cardRequest('cards',p.deck,0,2);
 if(m==='ADRENA_BRAIN'){
  add('source','CARD',own.filter(c=>(c.damage||0)>0).map(c=>({id:id(c),name:c.name,damage:c.damage||0})),1,1);
  add('target','CARD',opp.map(c=>({id:id(c),name:c.name})),1,1);
  add('count','COUNT',[],0,3);
 }
 if(m==='RECON')cardRequest('cards',p.deck.slice(0,2),Math.min(1,p.deck.length),Math.min(1,p.deck.length));
 if(['ULTRA_BALL','CYRANO','HILDA','BROCK','MEOWTH_ENTRY','POKEPAD','POFFIN','AKAMATSU'].includes(m)){
  let candidates=p.deck.filter(c=>m==='CYRANO'?c.kind==='pokemon'&&record(c).facts.prizeCount>=2:m==='MEOWTH_ENTRY'?c.cardType==='SUPPORTER':m==='POKEPAD'?c.kind==='pokemon'&&!record(c).facts.rulePokemon:m==='POFFIN'?c.kind==='pokemon'&&record(c).facts.basic&&record(c).facts.hp<=70:m==='AKAMATSU'?basicEnergy(c):m==='HILDA'?c.kind==='energy'||c.kind==='pokemon'&&!record(c).facts.basic:c.kind==='pokemon');
  if(m==='ULTRA_BALL')cardRequest('discard',p.hand.filter(c=>id(c)!==id(card)),2,2);
  const max=m==='CYRANO'?3:['HILDA','BROCK','POFFIN','AKAMATSU'].includes(m)?2:1;
  cardRequest('cards',candidates,0,m==='POFFIN'?Math.min(max,5-p.bench.length):max);
  if(m==='AKAMATSU'){
   cardRequest('toHand',candidates,0,1);cardRequest('attachTo',own.map(c=>({id:id(c),name:c.name})),0,1);
  }
 }
 if(m==='STRETCHER')cardRequest('cards',p.discard.filter(c=>c.kind==='pokemon'||basicEnergy(c)),1,1);
 if(['SWITCH','BOSS'].includes(m))cardRequest('bench',m==='SWITCH'?p.bench:o.bench,1,1);
 if(m==='ENERGY_SWITCH'){
  cardRequest('energy',own.flatMap(c=>(c.energyCards||[]).filter(basicEnergy)),1,1);cardRequest('attachTo',own.map(c=>({id:id(c),name:c.name})),1,1);
 }
 if(m==='HAMMER'){const energies=opp.flatMap(c=>c.energyCards||[]);cardRequest('energy',energies,energies.length?1:0,1);}
 if(m==='ROSA'){
  cardRequest('cards',p.discard.filter(basicEnergy),0,2);cardRequest('attachTo',own.filter(c=>record(c).facts.stage===2).map(c=>({id:id(c),name:c.name})),1,1);
 }
 return out;
}
function selected(action,key){const x=action.selections?.[key];return Array.isArray(x)?x:[];}
function verifyRequests(g,actor,card,effect,action){
 const req=requests(g,actor,card,effect);
 for(const r of req){
  if(r.kind==='COUNTERS'){
   const allocation=action.selections?.allocation;assert(allocation&&typeof allocation==='object'&&!Array.isArray(allocation),'COUNTER_ALLOCATION_REQUIRED');
   const entries=Object.entries(allocation);assert(entries.every(([key,n])=>r.candidates.some(c=>c.id===key)&&Number.isInteger(n)&&n>=0)&&entries.reduce((s,[,n])=>s+n,0)===6,'INVALID_COUNTER_ALLOCATION');continue;
  }
  if(r.kind==='COUNT'){const n=action.selections?.count;assert(Number.isInteger(n)&&n>=r.min&&n<=r.max,'INVALID_COUNTER_COUNT');continue;}
  const ids=r.kind==='POKEMON'?(action.targetIds||[]):selected(action,r.key);
  assert(ids.length>=r.min&&ids.length<=r.max&&new Set(ids).size===ids.length&&ids.every(i=>r.candidates.some(c=>(c.id||c.instanceId)===i)),'INVALID_REFERENCE_SELECTION:'+r.key);
 }
 const m=effect.plan.mechanic,p=player(g,actor),cards=selected(action,'cards').map(i=>p.deck.find(c=>id(c)===i));
 if(m==='HILDA')assert(cards.filter(c=>c.kind==='energy').length<=1&&cards.filter(c=>c.kind==='pokemon').length<=1,'HILDA_CATEGORY_SELECTION');
 if(m==='BROCK')assert(cards.every(c=>record(c).facts.basic)||cards.length<=1,'BROCK_EVOLUTION_OR_BASIC');
 if(m==='AKAMATSU'){
  assert(new Set(cards.map(c=>c.energyType)).size===cards.length,'AKAMATSU_DIFFERENT_TYPES');
  const hand=selected(action,'toHand'),target=selected(action,'attachTo');assert(hand.length===Math.min(1,cards.length)&&hand.every(i=>cards.some(c=>id(c)===i)),'AKAMATSU_HAND_CHOICE');assert(target.length===(cards.length>1?1:0),'AKAMATSU_ATTACH_CHOICE');
 }
 if(m==='ENERGY_SWITCH'){const source=field(p).find(c=>(c.energyCards||[]).some(e=>id(e)===selected(action,'energy')[0]));assert(source&&id(source)!==selected(action,'attachTo')[0],'ENERGY_SWITCH_SAME_POKEMON');}
 if(m==='ADRENA_BRAIN')assert((find(g,selected(action,'source')[0]).card.damage||0)>=action.selections.count*10,'NOT_ENOUGH_DAMAGE_COUNTERS');
}
function abilityCheck(g,actor,card,a,action){
 const p=player(g,actor),m=a.plan.mechanic;
 assert(abilityEnabled(g,card)||m==='EXCITE_DIVE'&&p.hand.some(c=>id(c)===id(card)),'ABILITY_SUPPRESSED');
 assert(!passive.has(m),'CONTINUOUS_ABILITY_NOT_DECLARABLE');assert(!used(p,card,a),'ABILITY_ALREADY_USED');
 if(m==='DASH')assert(p.active===card&&!p.turnLimits?.abilityNames?.DASH,'DASH_ACTIVE_AND_SHARED_LIMIT');
 if(m==='REVERSAL_DRAW')assert(wasKnockedOut(g,actor)&&!p.turnLimits?.abilityNames?.REVERSAL_DRAW,'PREVIOUS_OPPONENT_KNOCKOUT_REQUIRED');
 if(m==='MEOWTH_ENTRY')assert(card.entryWindow===g.referenceActionSequence&&!p.turnLimits?.abilityNames?.MEOWTH_ENTRY,'BENCH_ENTRY_WINDOW_REQUIRED');
 if(m==='ADRENA_BRAIN')assert(energyUnits(card).some(u=>u.includes('悪')),'DARK_ENERGY_REQUIRED');
 if(m==='EXCITE_DIVE')assert(p.hand.some(c=>id(c)===id(card))&&p.bench.length<5&&field(p).some(c=>record(c).facts.prizeCount===3&&record(c).facts.types.includes('無色')),'COLORLESS_MEGA_IN_PLAY_REQUIRED');
 verifyRequests(g,actor,card,a,action);
}
function handles(action){return ['attack_turn','effect_attack','attack','use_ability','play_item','play_supporter','play_stadium','attach_tool','attach_energy','retreat','resolve_reference_choice'].includes(action.type);}
function preflight(g,actor,action){
 if(!g.referenceEffectValidation)return null;
 try{
  if(g.referenceRngState!==undefined)assert(Number.isInteger(g.referenceRngState)&&g.referenceRngState>=0&&g.referenceRngState<=0xffffffff,'INVALID_REFERENCE_RNG_STATE');
  if(g.pendingReferenceChoice&&action.type!=='take_prizes'){assert(action.type==='resolve_reference_choice'&&g.pendingReferenceChoice.playerId===actor,'REFERENCE_CHOICE_REQUIRED');assert(g.pendingReferenceChoice.kind==='CIRCULATOR'?g.pendingReferenceChoice.options.some(o=>o.energyId===action.energyId&&o.benchInstanceId===action.benchInstanceId):g.pendingReferenceChoice.options.includes(g.pendingReferenceChoice.kind==='MULLIGAN'?action.drawCount:action.benchInstanceId),'INVALID_REFERENCE_CHOICE');return {handled:true,errors:[]};}
  const automatic=unconnectedAutomatic(g);if(automatic)throw Error('UNCONNECTED_EFFECT:'+JSON.stringify(automatic));
  const p=player(g,actor),o=opponent(g,actor);
  if(!handles(action))return {handled:false,errors:[]};
  assert(g.status==='active'&&g.phase==='main'&&g.turnPlayer===actor&&!g.attackUsed,'REFERENCE_ACTION_NOT_ALLOWED');
  if(action.type==='attack'||action.type==='effect_attack')throw Error('REFERENCE_ATTACK_TURN_ACTION_REQUIRED');
  if(action.type==='attack_turn'){
   const mon=p.active,r=record(mon),a=r?.attacks[action.attackIndex];assert(mon&&a,'ATTACK_MISSING');requirePlan(mon,a);
   assert(g.turnNumber!==1,'FIRST_PLAYER_FIRST_TURN_ATTACK');assert(mon.referenceCannotAttackTurn!==g.turnNumber,'ATTACK_DISABLED_THIS_TURN');
   assert(!['ASLEEP','PARALYZED','POISONED','BURNED'].includes(mon.statusCondition),'UNCONNECTED_STATUS_RULE');
   if(!a.cost.every(t=>[...basicTypes,'無色'].includes(t)))stop(mon,a,'UNREVIEWED_ENERGY_SYMBOL');
   assert(pays(mon,cost(g,mon,a)),'INSUFFICIENT_VERIFIED_ENERGY');verifyRequests(g,actor,mon,a,action);

  }else if(action.type==='use_ability'){
   const mon=[...field(p),...p.hand].find(c=>id(c)===action.sourceInstanceId),a=record(mon)?.abilities.find(a=>a.effectId===action.abilityId);assert(mon&&a,'ABILITY_MISSING');requirePlan(mon,a);abilityCheck(g,actor,mon,a,action);
  }else if(action.type==='attach_energy'){
   const card=p.hand[action.cardIndex],mon=action.target==='active'?p.active:p.bench[action.target],r=record(card);assert(card?.kind==='energy'&&mon&&!p.normalEnergyAttached,'ENERGY_ATTACHMENT_NOT_ALLOWED');
   if(!connected(r?.mainPlan))stop(card,{name:r?.name||card.name},'SPECIAL_ENERGY_EFFECT_NOT_CONNECTED');if(r.mainPlan.mechanic==='ROCKET_ENERGY')assert(record(mon).name.startsWith('ロケット団の'),'ROCKET_POKEMON_ONLY');
  }else if(action.type==='retreat'){
   assert(p.active&&p.bench.some(c=>id(c)===action.benchInstanceId)&&!g.retreatUsed,'RETREAT_NOT_ALLOWED');
   assert(!['ASLEEP','PARALYZED'].includes(p.active.statusCondition),'STATUS_PREVENTS_RETREAT');
   const energies=action.energyIds||[],available=(p.active.energyCards||[]).filter(c=>energies.includes(id(c)));
   assert(new Set(energies).size===energies.length&&available.length===energies.length,'RETREAT_ENERGY_IDS');
   const count=energyUnits({...p.active,energyCards:available}).length;assert(count>=p.active.retreatCost&&(p.active.retreatCost>0||energies.length===0),'RETREAT_PAYMENT');
   for(let i=0;i<available.length;i++)assert(energyUnits({...p.active,energyCards:available.filter((_,j)=>i!==j)}).length<p.active.retreatCost,'RETREAT_EXCESS_PAYMENT');
  }else {
   const card=p.hand.find(c=>id(c)===action.cardId),r=record(card);assert(card&&r,'HAND_CARD_MISSING');requirePlan(card,{name:r.name,plan:r.mainPlan});
   if(action.type==='attach_tool')assert(card.kind==='tool'&&field(p).some(c=>id(c)===action.targetInstanceId&&!(c.tools||[]).length),'TOOL_ATTACHMENT_NOT_ALLOWED');
   if(action.type==='play_item')assert(card.cardType==='ITEM'&&!itemLocked(g,actor),'ITEM_NOT_ALLOWED');
   if(action.type==='play_supporter')assert(card.cardType==='SUPPORTER'&&g.turnNumber!==1&&!p.turnLimits?.supporterUsed,'SUPPORTER_NOT_ALLOWED');
   if(action.type==='play_stadium')assert(card.kind==='stadium'&&g.stadiumPlayedTurn!==g.turnNumber&&g.stadium?.name!==card.name,'STADIUM_NOT_ALLOWED');
   const m=r.mainPlan.mechanic;if(m==='HAMMER')assert(field(o).some(c=>c.energyCards.length),'NO_OPPONENT_ENERGY');if(m==='POFFIN')assert(p.bench.length<5,'BENCH_FULL');if(['ULTRA_BALL','CYRANO','HILDA','BROCK','POKEPAD','POFFIN','AKAMATSU'].includes(m))assert(p.deck.length>0,'NO_DECK_SEARCH_POSSIBLE');if(m==='RED_CARD')assert(o.prizes<=3,'OPPONENT_PRIZES_MUST_BE_THREE_OR_LESS');
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
 if(reveal)event(g,p.id,'REVEAL',{cardIds:ids,toPlayer:opponent(g,p.id).id});event(g,p.id,destination==='hand'?'ADD_TO_HAND':'RETURN_TO_DECK',{cardIds:ids,fromZone:zone,...(!reveal?{privateTo:p.id}:{})});return moved;
}
function finishAttack(g,actor){
 g.attackUsed=true;g.referenceAttackTurnPending=actor;
 while(g.referenceReactions?.length){
  const reaction=g.referenceReactions.shift(),attacker=find(g,reaction.attackerId);if(!attacker)continue;
  const choices=attacker.card.energyCards.flatMap(e=>attacker.player.bench.filter(c=>c!==attacker.card).map(c=>({energyId:id(e),benchInstanceId:id(c)})));
  if(choices.length){g.pendingReferenceChoice={...reaction,options:choices};return;}
 }
 delete g.referenceReactions;
 functions().Core.resolveKnockouts(g,actor);
 if(g.status==='finished'){delete g.referenceAttackTurnPending;delete g.pendingReferenceChoice;return;}
 if(!g.pendingPrizeSelection&&!g.pendingReferenceChoice){delete g.referenceAttackTurnPending;functions().Core.endTurn(g,actor);}
}
function applyPlan(g,actor,card,effect,action){
 const p=player(g,actor),o=opponent(g,actor),plan=effect.plan,m=plan.mechanic,ids=key=>selected(action,key),target=()=>find(g,action.targetIds?.[0])?.card;
 switch(m){
  case 'VANILLA_DAMAGE':case 'ATTACK_DRAW':case 'COMBO':case 'NO_NEXT_ATTACK':case 'MOON_RONDO':case 'CONFUSION':case 'BENCH_COUNTER_DAMAGE':case 'BENCH_EX_DAMAGE':case 'RETURN_SELF_HAND':case 'HUNT':case 'PHANTOM':case 'ITEM_LOCK':case 'ANY_DAMAGE':case 'EX_COUNT_DAMAGE':case 'COIN_PROTECT':case 'IGNORE_DEFENDER_EFFECTS':{
   if(card.statusCondition==='CONFUSED'&&!coin(g,actor)){counters(g,actor,card,3);break;}
   let amount=Number.parseInt(effect.damage,10)||0,mon=o.active,options={};
   if(m==='COMBO'){amount=Number.parseInt(effect.damage,10);let flips=0;while(coin(g,actor)){amount+=50;assert(++flips<1000,'COIN_SEQUENCE_LIMIT_SAFE_STOP');}}
   if(m==='MOON_RONDO')amount=Number.parseInt(effect.damage,10)+20*(p.bench.length+o.bench.length);
   if(m==='EX_COUNT_DAMAGE')amount=60*field(o).filter(c=>record(c).facts.prizeCount>=2).length;
   if(['BENCH_COUNTER_DAMAGE','BENCH_EX_DAMAGE','ANY_DAMAGE'].includes(m)){mon=target();assert(mon,'TARGET_REQUIRED');options.bench=o.active!==mon;amount=m==='BENCH_COUNTER_DAMAGE'?(mon.damage||0)*2:m==='BENCH_EX_DAMAGE'?60:100;}
   if(m==='IGNORE_DEFENDER_EFFECTS')options.ignore=true;
   damage(g,actor,mon,amount,options);
   if(m==='ATTACK_DRAW')draw(g,p,plan.draw);
   if(m==='NO_NEXT_ATTACK')card.referenceCannotAttackTurn=g.turnNumber+2;
   if(m==='CONFUSION'){o.active.statusCondition='CONFUSED';event(g,actor,'STATUS_CONDITION',{status:'CONFUSED',targetInstanceId:id(o.active)});}
   if(m==='ITEM_LOCK'){g.referenceItemLock||=[];g.referenceItemLock.push({playerId:o.id,turnNumber:g.turnNumber+1});}
   if(m==='RETURN_SELF_HAND')returnStack(g,p,card,'hand');
   if(m==='HUNT'){moveChosen(g,p,'deck',ids('cards'),'hand',false);shuffle(g,p);}
   if(m==='PHANTOM')for(const [ident,count] of Object.entries(action.selections?.allocation||{}))counters(g,actor,find(g,ident).card,count,{attack:true});
   if(m==='COIN_PROTECT'&&coin(g,actor))card.referenceProtection={opponentTurn:g.turnNumber+1};
   break;
  }
  case 'ACTIVE_AND_BENCH_DAMAGE':damage(g,actor,o.active,Number.parseInt(effect.damage,10)||0);if(action.targetIds?.length)damage(g,actor,target(),Number.parseInt(effect.damage,10)||0,{bench:true});break;
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
  case 'ATTACK_DAMAGE_MOVE_ENERGY':{
   damage(g,actor,o.active,Number.parseInt(effect.damage,10)||0);
   if(p.bench.length){const energyId=ids('energy')[0],benchId=ids('attachTo')[0];
    const target=p.bench.find(c=>id(c)===benchId),index=card.energyCards.findIndex(e=>id(e)===energyId);
    assert(target&&index>=0,'ENERGY_MOVE_SELECTION_CHANGED');
    target.energyCards.push(card.energyCards.splice(index,1)[0]);
    event(g,actor,'MOVE_ENERGY',{energyId,targetInstanceId:benchId});
   }
   break;
  }
  case 'SWITCH_SELF_ATTACK':if(action.targetIds?.length)switchMon(g,p,action.targetIds[0]);break;
  case 'DASH':draw(g,p,2);p.turnLimits.abilityNames||={};p.turnLimits.abilityNames.DASH=true;break;
  case 'REVERSAL_DRAW':draw(g,p,3);p.turnLimits.abilityNames||={};p.turnLimits.abilityNames.REVERSAL_DRAW=true;break;
  case 'EXCITE_DIVE':bench(g,p,card,true);break;
  case 'ADRENA_BRAIN':{
   const source=find(g,ids('source')[0]).card,to=find(g,ids('target')[0]).card,count=action.selections.count;source.damage-=count*10;counters(g,actor,to,count);break;
  }
  case 'RECON':{
   const top=p.deck.splice(0,2),chosen=top.find(c=>id(c)===ids('cards')[0]);if(chosen)p.hand.push(chosen);p.deck.push(...top.filter(c=>c!==chosen));event(g,actor,'ADD_TO_HAND',{cardIds:chosen?[id(chosen)]:[],privateTo:actor});break;
  }
  case 'RUN_AWAY_DRAW':draw(g,p,3);returnStack(g,p,card,'deck');shuffle(g,p);break;
  case 'MEOWTH_ENTRY':moveChosen(g,p,'deck',ids('cards'),'hand');shuffle(g,p);p.turnLimits.abilityNames||={};p.turnLimits.abilityNames.MEOWTH_ENTRY=true;break;
  case 'ULTRA_BALL':moveChosen(g,p,'hand',ids('discard'),'discard',false);moveChosen(g,p,'deck',ids('cards'),'hand');shuffle(g,p);break;
  case 'CYRANO':case 'HILDA':case 'BROCK':case 'POKEPAD':moveChosen(g,p,'deck',ids('cards'),'hand');shuffle(g,p);break;
  case 'POFFIN':for(const ident of ids('cards'))bench(g,p,p.deck.find(c=>id(c)===ident),false);shuffle(g,p);break;
  case 'STRETCHER':moveChosen(g,p,'discard',ids('cards'),'hand');break;
  case 'ENERGY_SWITCH':{
   const source=field(p).find(c=>(c.energyCards||[]).some(e=>id(e)===ids('energy')[0])),to=find(g,ids('attachTo')[0]).card;assert(source!==to,'ENERGY_SWITCH_SAME_POKEMON');to.energyCards.push(source.energyCards.splice(source.energyCards.findIndex(e=>id(e)===ids('energy')[0]),1)[0]);break;
  }
  case 'SWITCH':switchMon(g,p,ids('bench')[0]);break;
  case 'BOSS':switchMon(g,o,ids('bench')[0]);break;
  case 'REPELLENT':assert(o.bench.length>0,'NO_OPPONENT_BENCH');g.pendingReferenceChoice={kind:'SWITCH',playerId:o.id,options:o.bench.map(id)};break;
  case 'RED_CARD':resetHand(g,o,3,true);break;
  case 'LILLIE':resetHand(g,p,p.prizes===6?8:6);break;
  case 'JUDGE':{const a=p.hand.splice(0),b=o.hand.splice(0);p.deck.push(...a);o.deck.push(...b);shuffle(g,p);shuffle(g,o);draw(g,p,4);draw(g,o,4);break;}
  case 'UNFAIR':{const a=p.hand.splice(0),b=o.hand.splice(0);p.deck.push(...a);o.deck.push(...b);shuffle(g,p);shuffle(g,o);draw(g,p,5);draw(g,o,2);break;}
  case 'AKAMATSU':{
   const hand=ids('toHand');moveChosen(g,p,'deck',hand,'hand');for(const ident of ids('cards').filter(i=>!hand.includes(i))){const index=p.deck.findIndex(c=>id(c)===ident);find(g,ids('attachTo')[0]).card.energyCards.push(p.deck.splice(index,1)[0]);}shuffle(g,p);break;
  }
  case 'ROSA':for(const ident of ids('cards')){const i=p.discard.findIndex(c=>id(c)===ident);find(g,ids('attachTo')[0]).card.energyCards.push(p.discard.splice(i,1)[0]);}break;
  case 'HAMMER':if(coin(g,actor)){const e=ids('energy')[0];if(e){const mon=field(o).find(c=>c.energyCards.some(c=>id(c)===e));o.discard.push(mon.energyCards.splice(mon.energyCards.findIndex(c=>id(c)===e),1)[0]);}}break;
  default:throw Error('UNCONNECTED_EFFECT:'+m);
 }
 emit(g,actor,plan,{sourceOfficialCardId:record(card).officialCardId,effectId:effect.effectId||record(card).officialCardId});
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
  else if(g.pendingReferenceChoice.kind==='PROMOTE'){const i=p.bench.findIndex(c=>id(c)===action.benchInstanceId);p.active=p.bench.splice(i,1)[0];}
  else switchMon(g,p,action.benchInstanceId);
  delete g.pendingReferenceChoice;
  if(choice.kind==='CIRCULATOR')finishAttack(g,g.referenceAttackTurnPending);
 }else if(action.type==='attach_energy'){
  const card=p.hand.splice(action.cardIndex,1)[0],mon=action.target==='active'?p.active:p.bench[action.target];mon.energyCards.push(card);p.normalEnergyAttached=true;event(g,actor,'ATTACH_ENERGY',{cardId:id(card),targetInstanceId:id(mon)});
 }else if(action.type==='retreat'){
  for(const ident of action.energyIds||[]){const i=p.active.energyCards.findIndex(c=>id(c)===ident);p.discard.push(p.active.energyCards.splice(i,1)[0]);}switchMon(g,p,action.benchInstanceId);g.retreatUsed=true;
 }else if(action.type==='attack_turn'){
  const card=p.active,effect=record(card).attacks[action.attackIndex];applyPlan(g,actor,card,effect,action);g.history.push({turnNumber:g.turnNumber,player:actor,type:'attack',details:{effectId:effect.effectId,referenceOfficialCardId:record(card).officialCardId}});refresh(g);finishAttack(g,actor);
 }else if(action.type==='use_ability'){
  const card=[...field(p),...p.hand].find(c=>id(c)===action.sourceInstanceId),effect=record(card).abilities.find(a=>a.effectId===action.abilityId);applyPlan(g,actor,card,effect,action);mark(p,card,effect);g.history.push({turnNumber:g.turnNumber,player:actor,type:'ability_used',details:{effectId:effect.effectId}});functions().Core.resolveKnockouts(g,actor);
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
  const c=find(g,action.targetInstanceId)?.card;if(c){c.validationBase||=reduced(current(find(before,action.targetInstanceId).card));for(const k of ['referenceProtection','referenceCannotAttackTurn'])delete c[k];}
 }
 if(g.status==='finished'){delete g.pendingReferenceChoice;delete g.referenceAttackTurnPending;}
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
  for(const target of p.bench){const units=mon.energyCards||[],choices=[];let count=0;for(const e of units){if(count>=mon.retreatCost)break;choices.push(id(e));count+=energyUnits({...mon,energyCards:[e]}).length;}out.push({kind:'retreat',label:'にげる → '+target.name,action:{type:'retreat',benchInstanceId:id(target),energyIds:choices},requests:[]});}
 }
 return out;
}
function handOptions(g,actor,ident){
 const p=player(g,actor),card=p.hand.find(c=>id(c)===ident);if(!card)return [];
 const out=[];
 if(card.kind==='pokemon'){
  if(card.basic){out.push({key:'bench',label:'ベンチに出す',action:{type:'bench_basic',cardId:ident}});out.push({key:'active',label:'バトル場に出す',action:{type:'play_active_basic',cardId:ident}});}
  else for(const c of field(p))out.push({key:id(c),label:'進化する',action:{type:'evolve',cardId:ident,targetInstanceId:id(c)}});
  for(const a of abilityActions(g,actor,card))if(a.referenceEffect.plan?.mechanic==='EXCITE_DIVE')out.push({...a,key:'hand-ability'});
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
 for(const r of option.requests||[]){
  if(r.kind==='POKEMON')action.targetIds=r.candidates.slice(0,r.min).map(c=>c.instanceId);
  else if(r.kind==='COUNTERS'){action.selections||={};action.selections.allocation=r.candidates.length?{[r.candidates[0].id]:6}:{};}
  else if(r.kind==='COUNT'){action.selections||={};const source=find(g,action.selections.source?.[0])?.card;action.selections.count=Math.min(3,Math.floor((source?.damage||0)/10));}
  else {action.selections||={};const max=r.max;action.selections[r.key]=r.candidates.slice(0,max).map(id);}
 }
 const card=action.cardId?p.hand.find(c=>id(c)===action.cardId):action.sourceInstanceId?[...field(p),...p.hand].find(c=>id(c)===action.sourceInstanceId):p.active;
 const effect=action.type==='attack_turn'?record(card)?.attacks[action.attackIndex]:action.type==='use_ability'?record(card)?.abilities.find(a=>a.effectId===action.abilityId):{plan:record(card)?.mainPlan};
 const m=effect?.plan?.mechanic;
 if(m==='AKAMATSU'){
  const candidates=requests(g,actor,card,effect).find(r=>r.key==='cards').candidates,types=new Set(),chosen=candidates.filter(c=>{if(types.has(c.energyType))return false;types.add(c.energyType);return true;}).slice(0,2);
  action.selections.cards=chosen.map(id);action.selections.toHand=chosen.slice(0,1).map(id);action.selections.attachTo=chosen.length>1?[id(p.active)]:[];
 }
 if(m==='HILDA'){const candidates=p.deck;action.selections.cards=[candidates.find(c=>c.kind==='pokemon'&&!record(c).facts.basic),candidates.find(c=>c.kind==='energy')].filter(Boolean).map(id);}
 if(m==='BROCK'){const basics=p.deck.filter(c=>c.kind==='pokemon'&&record(c).facts.basic).slice(0,2);action.selections.cards=basics.length?basics.map(id):p.deck.filter(c=>c.kind==='pokemon').slice(0,1).map(id);}
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
 for(const c of nested){const r=record(c);assert(r,'REFERENCE_SOURCE_REQUIRED');assert(c.officialCardId==null&&c.catalogCardId==null,'REFERENCE_ADOPTION_FORBIDDEN');}
 for(const {card} of inPlay(g)){
  const r=record(card),cape=toolEnabled(g)&&(card.tools||[]).some(t=>record(t)?.mainPlan?.mechanic==='HERO_CAPE');
  assert(card.hp===r.facts.hp+(cape?100:0),'REFERENCE_HP_CONFLICT');
  assert(card.basic===r.facts.basic&&card.stage===r.facts.stage,'REFERENCE_STAGE_CONFLICT');
 }
}
function projectView(view,viewer){
 if(!view.referenceEffectValidation)return view;
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
  if(card.referenceCannotAttackTurn&&g.turnNumber<=card.referenceCannotAttackTurn)add('attack-lock','次の自分の番はワザ使用不可','むげんのやいば','次の自分の番の終わりまで');
 }
 for(const state of g.referenceItemLock||[])if(g.turnNumber===state.turnNumber)out.push({id:'reference-item-lock-'+state.playerId,short:'グッズ不可',label:'グッズ使用不可',scope:'PLAYER',playerId:state.playerId,sourceCard:'スボミー',sourceEffect:'むずむずかふん',start:'前の番のワザ解決時',duration:'この番の終わりまで',removal:'期限終了',condition:'このプレイヤーの番',description:'手札からグッズを出して使えない'});
 const name={WATCHTOWER:'無色ポケモンの特性なし',NIGHT_MINE:'テラスタルのワザの無色コスト＋1',RUINS:'悪以外のたねをベンチに出すとダメカン2個',JAMMING:'どうぐの効果なし'}[stadium(g)];
 if(name)out.push({id:'reference-stadium',short:name,label:name,scope:'FIELD',sourceCard:g.stadium.name,sourceEffect:'スタジアム',start:'スタジアムが場に出たとき',duration:'このスタジアムが場にあるかぎり',removal:'場を離れたとき',condition:'公式参照版',description:name});
 return out;
}
function cardInfo(g,actor,ident){
 const p=player(g,actor),card=[...field(p),...p.hand,...p.discard].find(c=>id(c)===ident),r=record(card);if(!r)return null;
 const entries=[...r.attacks.map(e=>({...e,type:'ATTACK'})),...r.abilities.map(e=>({...e,type:'ABILITY'})),...(r.category!=='pokemon'?[{name:r.name,text:r.text,plan:r.mainPlan,type:'CARD'}]:[])].map(e=>({id:e.effectId||r.officialCardId,name:e.name,type:e.type,officialText:e.text,damage:e.damage??null,cost:e.cost||[],active:null,description:e.text||'印刷されたダメージ',condition:'印刷版 '+r.officialCardId+' / '+r.set+' / '+(r.cardNumber||'番号無印字'),usage:'公式テキストと合法手判定に従う',removal:'公式テキストと期限の判定に従う',resolution:connected(e.plan)?e.plan.commands.join(' → '):'未接続・使用時に停止'}));
 return {instanceId:ident,entries,referenceOfficialCardId:r.officialCardId,officialPageUrl:r.officialPageUrl,deckPrintAdopted:false};
}
function coverage(){return {prints:catalog.records.length,defaults:Object.entries(catalog.defaultValidationReferences).map(([name,ident])=>{const r=records.get(ident);return {name,officialCardId:ident,deckPrintAdopted:false,unconnected:[...r.attacks,...r.abilities].filter(e=>!connected(e.plan)).map(e=>e.name),mainConnected:r.category==='pokemon'||connected(r.mainPlan)};})};}
module.exports={reduced,catalog,record,connected,preflight,handles,execute,refresh,afterAction,onEndTurn,pokemonActions,handOptions,completeAction,blockers,coverage,validateGame,projectView,plannedCommands,statuses,cardInfo,energyUnits,damage,damages};
