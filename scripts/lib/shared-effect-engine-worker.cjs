"use strict";
// Local, read-only execution worker. Never calls a model API or edits engine/card data.
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  B = require("./shared-effect-batch.cjs");
const bundle = fs.readFileSync("ui/engine.bundle.js", "utf8"),
  context = { window: {}, console, performance, Math, setTimeout };
vm.runInNewContext(bundle, context);
const E = context.window.Pokeca;
const extension = JSON.parse(
  fs.readFileSync("data/effect-extensions/compiled.json"),
);
assert.deepEqual(
  require("../build-effect-extensions.cjs").build(
    JSON.parse(fs.readFileSync("data/effect-extensions/intake.json")),
  ),
  extension,
);
const S = vm.runInNewContext(
    fs.readFileSync("tests/fixtures/control-005-scenarios.js", "utf8"),
    { console },
  ),
  fixed = JSON.parse(fs.readFileSync("data/fixed-test-decks.json"));
const F9 = require("../../tests/fixtures/control-009-scenarios.cjs")(E),
  F10 = require("../../tests/fixtures/control-010-scenarios.cjs")(E),
  records = new Map(
    E.getReferenceEffectCatalog({ includeExtensions: true }).records.map(
      (r) => [r.officialCardId, r],
    ),
  );
const legacy = E.getReferenceEffectCatalog({
  includeExtensions: true,
}).records.filter((r) =>
  ["DRAW_CARDS", "HEAL_DAMAGE", "COIN_FORCE_SWITCH"].includes(
    r.mainPlan?.mechanic,
  ),
);
const fileDigests = [
  "ui/engine.bundle.js",
  "engine/pokeca_reference_effect_runtime.cjs",
  "engine/reference-effect-plans.cjs",
  "scripts/lib/shared-effect-engine-worker.cjs",
  "tests/fixtures/control-005-scenarios.js",
  "tests/fixtures/control-009-scenarios.cjs",
  "tests/fixtures/control-010-scenarios.cjs",
  "data/fixed-test-decks.json",
  "data/effect-extensions/compiled.json",
].map((p) => [p, B.hash(fs.readFileSync(p))]);
function port(game) {
  let current = game;
  const p = E.createUIPort({
    getGame: () => current,
    setGame: (g) => (current = g),
  });
  const r = p.loadGame(game);
  assert(r.ok, JSON.stringify(r));
  return p;
}
function batchSearchCandidate(c,plan){
 const r=E.getReferenceEffectRecord(c),pokemon=c.kind==='pokemon',typed=pokemon&&r?.facts.types?.includes(plan.type),basic=c.kind==='energy'&&!c.isSpecial&&['草','炎','水','雷','超','闘','悪','鋼'].includes(c.energyType);
 if(plan.mechanic==='SEARCH_BASIC_TO_BENCH_ATTACK')return pokemon&&r?.facts.basic&&(!plan.type||typed)&&(!plan.team||r.name.startsWith(plan.team+'の'))&&(!plan.nameExact||r.name===plan.nameExact);
 if(plan.filter==='any')return true;
 if(plan.filter==='basicEnergy')return basic;
 if(plan.filter==='typedBasicEnergy')return basic&&c.energyType===plan.type;
 if(plan.filter==='typedPokemon')return typed;
 if(plan.filter==='typedPokemonOrBasicEnergy')return typed||basic&&c.energyType===plan.type;
 if(plan.filter==='typedPokemonOrStadium')return typed||r?.category==='stadium';
 return r?.category===plan.filter;
}
function massTransferCandidate(c,plan){
 const r=E.getReferenceEffectRecord(c);
 if(plan.category==='pokemonOrBasicEnergy')return c.kind==='energy'&&!c.isSpecial?(!plan.energyType||c.energyType===plan.energyType):r?.category==='pokemon'&&(!plan.type||r.facts.types.includes(plan.type))&&(!Number.isInteger(plan.stage)||r.facts.stage===plan.stage)&&(!plan.team||r.name.startsWith(plan.team+'の'));
 if(plan.nameExact&&r?.name!==plan.nameExact)return false;
 if(plan.retreatCost!==undefined&&r?.facts?.retreatCost!==plan.retreatCost)return false;
 if(plan.resistanceType&&!r?.facts?.resistance?.types?.includes(plan.resistanceType))return false;
 if(plan.category==='any')return !!r;
 if(plan.nameContains&&(!r||!r.name.includes(plan.nameContains)))return false;
 if(plan.category==='categorySet')return plan.categories.includes(r?.category);
 if(plan.energyTypes&&(c.kind!=='energy'||c.isSpecial||!plan.energyTypes.includes(c.energyType)))return false;
 if(plan.category==='basicEnergy')return c.kind==='energy'&&!c.isSpecial&&(!plan.type||c.energyType===plan.type);
 if(plan.category==='trainer')return ['item','supporter','tool','stadium'].includes(r?.category);
 if(r?.category!==plan.category)return false;
 if(plan.type&&!r.facts.types?.includes(plan.type))return false;
 if(plan.stage==='evolved'&&!(r.facts.stage>0))return false;
 if(Number.isInteger(plan.stage)&&r.facts.stage!==plan.stage)return false;
 if(plan.team&&!r.name.startsWith(plan.team+'の'))return false;
 return true;
}
// Try every eligible physical print in deterministic priority order.
// ensure() is transactional on failure; no fabricated cards or failed
// reservations may enter a fixture. A failed preferred print is not proof
// that the requested resource cannot be constructed.
function firstReservable(candidates,predicate,ensure,excludedId){
 const seen=new Set();
 for(const record of candidates){
  if(!record||record.officialCardId===excludedId||seen.has(record.officialCardId))continue;
  seen.add(record.officialCardId);
  if(predicate(record)&&ensure(record))return record;
 }
 return null;
}
// Each requirement consumes a distinct physical card, even when two
// requirements refer to the same registered print in different zones.
function requiredCopies(requirements,side,printId){
 return 1+requirements.filter(r=>r.side===side&&r.printId===printId).length;
}
// A complete evolution line is a single reservation transaction. Restore
// the deck and its protected IDs if any physical parent cannot be reserved.
// Enumerate exact registered parent alternatives. Stage decreases strictly,
// so no cyclic evolution or fabricated print can enter a fixture.
function* evolutionLines(record,candidates){
 if(record.facts.basic){yield [record];return;}
 for(const parent of candidates){
  if(parent.category!=='pokemon'||parent.name!==record.facts.evolvesFrom||parent.facts.stage!==record.facts.stage-1)continue;
  for(const prefix of evolutionLines(parent,candidates))yield [...prefix,record];
 }
}
function tryReserveChain(deck,reservedPrints,index,chain,ensure){
 const original=deck.cards.map(c=>({...c}));
 const had=reservedPrints.has(index),reserved=new Set(reservedPrints.get(index)||[]);
 let ok=false;
 try{ok=chain.every(record=>ensure(index,record));return ok;}
 finally{
  if(!ok){
   deck.cards=original;
   if(had)reservedPrints.set(index,reserved);else reservedPrints.delete(index);
  }
 }
}
// Test manifests use only real, exact registered official prints. Reserve
// physical cards before the scenario allocates prizes, bench and attack costs.
// This helper never changes a release manifest or marks a print as verified.
function fixtureResources(manifest,deckIndex,source,e){
 const plan=e.plan,m=plan.mechanic,requirements=[];
 const defaults=E.getReferenceEffectCatalog({includeExtensions:true}).defaultValidationReferences;
 const lookup=c=>records.get(c.referenceOfficialCardId||defaults[c.name]);
 const typeOf=r=>r?.facts?.basicEnergyType||r?.name?.match(/^基本(.)エネルギー$/)?.[1];
 const legal=[...records.values()].filter(r=>r.officialCardId!==source.officialCardId&&(r.category==='pokemon'?r.attacks.length>0&&r.attacks.every(a=>a.plan)&&r.abilities.every(a=>a.plan):r.mainPlan));
 const normalize=c=>({goods:'item',support:'supporter'}[c]||c);
 const sameName=(a,b)=>a===b;
 const reservedPrints=new Map();
 function ensure(index,record,count=1){
  if(!record||!Number.isInteger(count)||count<1)return false;
  const deck=manifest.decks[index],cards=deck.cards.map(c=>({...c}));
  const total=deck.cards.reduce((n,c)=>n+c.count,0);
  const reserved=reservedPrints.get(index)||new Set();
  const protect=c=>lookup(c)?.officialCardId===source.officialCardId||reserved.has(lookup(c)?.officialCardId);
  const mark=()=>{reserved.add(record.officialCardId);reservedPrints.set(index,reserved);};
  const exact=cards.filter(c=>lookup(c)?.officialCardId===record.officialCardId).reduce((n,c)=>n+c.count,0);
  if(exact>=count){mark();return true;}
  let needed=count-exact;
  const named=cards.filter(c=>sameName(c.name,record.deckName));
  // All tentative substitutions are on a private copy. No failed request
  // can remove physical cards or invalidate an earlier successful reservation.
  for(const donor of named.filter(c=>lookup(c)?.officialCardId!==record.officialCardId&&!protect(c))){
   const n=Math.min(needed,donor.count);donor.count-=n;needed-=n;
   if(!needed)break;
  }
  const remainingNamed=cards.filter(c=>c.name===record.deckName).reduce((n,c)=>n+c.count,0);
  if(record.mainPlan?.mechanic!=='BASIC_ENERGY'&&remainingNamed+count-exact>4)return false;
  const donorOK=c=>c.count>0&&!protect(c)&&c.name!==source.deckName&&c.name!==record.deckName&&
   (record.category==='energy'?normalize(c.category)==='energy':normalize(c.category)!=='energy'&&normalize(c.category)!=='pokemon');
  while(needed){
   const donor=cards.filter(donorOK).sort((a,b)=>b.count-a.count)[0];
   if(!donor)return false;
   donor.count--;needed--;
  }
  const existing=cards.find(c=>c.referenceOfficialCardId===record.officialCardId);
  if(existing)existing.count+=count-exact;
  else cards.push({name:record.deckName,category:record.category,count:count-exact,referenceOfficialCardId:record.officialCardId});
  if(cards.reduce((n,c)=>n+c.count,0)!==total||cards.some(c=>!Number.isInteger(c.count)||c.count<0))return false;
  deck.cards=cards.filter(c=>c.count>0);
  mark();
  return true;
 }
 function pick(predicate,index=deckIndex){
  const existing=manifest.decks[index].cards.map(lookup).filter(Boolean);
  return existing.find(r=>r.officialCardId!==source.officialCardId&&predicate(r))||legal.find(predicate);
 }
 function reserve(predicate,zone,side=0){
  const index=side===0?deckIndex:1-deckIndex;
  const existing=manifest.decks[index].cards.map(lookup).filter(Boolean);
  const record=firstReservable([...existing,...legal],predicate,r=>ensure(index,r,requiredCopies(requirements,side,r.officialCardId)),source.officialCardId);
  if(!record)return null;
  requirements.push({side,zone,printId:record.officialCardId});return record;
 }
 const mon=(r,type,stage)=>r.category==='pokemon'&&(!type||r.facts.types.includes(type))&&(stage===null||stage===undefined||stage==='evolved'&&r.facts.stage>0||r.facts.stage===stage);
 const isBasicEnergy=r=>r.category==='energy'&&r.mainPlan?.mechanic==='BASIC_ENERGY';
 const vanilla=r=>r.category==='pokemon'&&r.facts.basic&&r.attacks.find(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0);
 const reserveEnergy=(type,count,index=deckIndex)=>!!firstReservable(
  [...manifest.decks[index].cards.map(lookup).filter(Boolean),...legal],
  r=>isBasicEnergy(r)&&(!type||typeOf(r)===type),r=>ensure(index,r,count),source.officialCardId);
 const ensureAttackCost=(record,index)=>{
  const attack=vanilla(record);if(!attack)return false;
  const needed=new Map();for(const type of attack.cost)needed.set(type==='無色'?(record.facts.types.find(t=>['草','炎','水','雷','超','闘','悪','鋼'].includes(t))||'超'):type,(needed.get(type==='無色'?(record.facts.types.find(t=>['草','炎','水','雷','超','闘','悪','鋼'].includes(t))||'超'):type)||0)+1);
  return [...needed].every(([t,n])=>reserveEnergy(t,n,index));
 };
 // Reserve a real registered physical print for each counted zone before
 // allocating the test match; never manufacture counters or card identities.
 // Reserve the actual printed Energy type before prize/hand allocation.
 if(m==='MASS_ATTACHED_ENERGY_MOVE'&&plan.type){
  const side=plan.source.startsWith('opponent')?1:0,index=side===0?deckIndex:1-deckIndex;
  const energy=pick(r=>isBasicEnergy(r)&&typeOf(r)===plan.type,index);
  const cost=side===0?kindAttackCost(e,plan.type):0;
  const count=plan.count===null?1:Math.min(plan.count,3);
  if(ensure(index,energy,cost+count))
   for(let i=0;i<count;i++)requirements.push({side,zone:'deck',printId:energy.officialCardId});
 }
 // Damage-reduction proof needs an attacker which survives the printed
 // attack and can execute a nonzero ordinary return attack.
 if(m==='ATTACK_DAMAGE_REDUCTION'){
  const attacker=reserve(r=>vanilla(r)&&!r.abilities.length&&
   r.facts.hp>Number(e.damage||0)*(r.facts.weakness?.types.some(t=>source.facts.types.includes(t))?2:1)&&
   vanilla(r).cost.length<=3&&Number(vanilla(r).damage)>0,'active',1);
  if(attacker){
   const costs=new Map();
   for(const type of vanilla(attacker).cost){
    const actual=type==='無色'?(attacker.facts.types.find(t=>['草','炎','水','雷','超','闘','悪','鋼'].includes(t))||'超'):type;
    costs.set(actual,(costs.get(actual)||0)+1);
   }
   for(const [type,count] of costs){
    const energy=pick(r=>isBasicEnergy(r)&&typeOf(r)===type,1-deckIndex);
    if(ensure(1-deckIndex,energy,count))
     for(let i=0;i<count;i++)requirements.push({side:1,zone:'deck',printId:energy.officialCardId});
   }
  }
 }
 if(e.proofTeamBoost){
  const proof=e.proofTeamBoost;
  // Reserve the exact print and every physical evolution parent before setup.
  // All copies must fit within the ordinary 60-card/four-copy deck rules.
  const reserveChain=(ids,side,zone,count=1)=>{
   const index=side===0?deckIndex:1-deckIndex;
   const before=manifest.decks[index].cards.map(c=>({...c}));
   const protectedBefore=new Set(reservedPrints.get(index)||[]);
   const chain=ids.map(id=>records.get(id));
   if(!chain.length||chain.some(r=>!r)||!chain.every((r,i)=>i===0&&zone==='source'?r.officialCardId===source.officialCardId:ensure(index,r,count))){
    manifest.decks[index].cards=before;reservedPrints.set(index,protectedBefore);return false;
   }
   for(let n=0;n<count;n++)for(let i=0;i<chain.length;i++){
    if(i===0&&zone==='source')continue;
    requirements.push({side,zone:i===0?zone:'hand',printId:chain[i].officialCardId});
   }
   return true;
  };
  if(!reserveChain(proof.holderChain,0,'bench',proof.nonStack?2:1))requirements.teamBoostBlocked='NO_TEAM_BOOST_HOLDER_CHAIN';
  if(proof.attackerChain.length>1&&!reserveChain(proof.attackerChain,0,'source'))requirements.teamBoostBlocked='NO_TEAM_BOOST_ATTACKER_CHAIN';
  if(proof.defenderChain.length&&!reserveChain(proof.defenderChain,1,'active'))requirements.teamBoostBlocked='NO_TEAM_BOOST_DEFENDER_CHAIN';
 }
 if(e.proofContextCost){
  const proof=e.proofContextCost;
  if(proof.mode==='discardName')reserve(r=>r.name===proof.name,'discard');
  if(proof.mode==='ownAllNames')for(const name of proof.names)if(source.name!==name)reserve(r=>mon(r,null,0)&&r.name===name,'bench');
 }
 if(m==='ATTACK_SPREAD_DAMAGE'&&(plan.filter==='ex'||plan.filter==='exV')){
  reserve(r=>mon(r,null,0)&&r.name.endsWith('ex')&&!r.facts.teraBenchProtection&&!r.abilities.length,'bench',1);
  reserve(r=>mon(r,null,0)&&!r.facts.rulePokemon&&!r.abilities.length,'bench',1);
 }
 if(m==='ATTACK_DISCARD_DEFENDER_ENERGY'&&plan.type){
  reserveEnergy(plan.type,2,1-deckIndex);
  reserve(r=>isBasicEnergy(r)&&typeOf(r)!==plan.type,'deck',1);
 }
 if(m==='ATTACK_APPLY_STATUS'&&plan.defenderType){
  const survives=r=>mon(r,null,0)&&!r.abilities.length&&r.facts.hp>Number(e.damage||0)*(r.facts.weakness?.types.some(t=>source.facts.types.includes(t))?2:1);
  reserve(r=>survives(r)&&r.facts.types.includes(plan.defenderType),'active',1);
  reserve(r=>survives(r)&&!r.facts.types.includes(plan.defenderType),'bench',1);
 }
 if(m==='ABILITY_EVOLVE_FORCE_SWITCH'&&plan.maxRemainingHp){
  reserve(r=>mon(r,null,0)&&!r.abilities.length&&r.facts.hp<=plan.maxRemainingHp,'bench',1);
  reserve(r=>mon(r,null,0)&&!r.abilities.length&&r.facts.hp>plan.maxRemainingHp,'bench',1);
 }
 const contextGate=source.abilities?.find(a=>a.plan?.mechanic==='PASSIVE_CONTEXT_ATTACK_GATE')?.plan;
 if(contextGate?.mode==='opponentExV'){
  reserve(r=>mon(r,null,0)&&!r.facts.rulePokemon&&!r.abilities.length,'active',1);
  reserve(r=>mon(r,null,0)&&(r.name.endsWith('ex')||/V(?:MAX|STAR)?$/.test(r.name))&&!r.abilities.length,'bench',1);
 }
 if(m==='ATTACK_DISCARD_DEFENDER_ENERGY'&&plan.defenderEx)
  reserve(r=>mon(r,null,0)&&r.name.endsWith('ex')&&!r.abilities.length,'active',1);
 if(m==='MASS_COUNT_COIN_DAMAGE'){
  if(plan.metric==='ownTypedBoard')reserve(r=>mon(r,plan.type,0),'bench');
  if(plan.metric==='ownTypedEnergy'){
   const typed=r=>isBasicEnergy(r)&&typeOf(r)===plan.type;
   const energy=firstReservable([...manifest.decks[deckIndex].cards.map(lookup).filter(Boolean),...legal],typed,r=>ensure(deckIndex,r,kindAttackCost(e,plan.type)+2),source.officialCardId);
   if(energy)requirements.push({side:0,zone:'deck',printId:energy.officialCardId});
  }
  if(plan.metric==='bothActiveEnergy')reserveEnergy(null,2,1-deckIndex);
  if(plan.metric==='opponentBench')reserve(r=>mon(r,null,0),'bench',1);
 }
 if(m==='ATTACK_OPTIONAL_ENERGY_BONUS'&&plan.type)reserveEnergy(plan.type,Math.max(1,kindAttackCost(e,plan.type)+1));
 if(m==='ATTACK_DISCARD_MULTIPLE_SELF_ENERGY'&&plan.type)reserveEnergy(plan.type,Math.min(12,kindAttackCost(e,plan.type)+plan.count));
 if(m==='MASS_ENERGY_COUNT_DISCARD'&&plan.type)
  reserveEnergy(plan.type,Math.min(12,kindAttackCost(e,plan.type)+2));
 if(m==='SCALED_ATTACK_DAMAGE'){
  if(plan.metric==='opponentHandTrainerCount')reserve(r=>['item','supporter','tool','stadium'].includes(r.category),'hand',1);
  if(plan.metric==='ownDiscardNamedAttack'){
   const reserved=reserve(r=>r.category==='pokemon'&&r.attacks.some(a=>a.name===plan.name),'discard');
   // A second physical copy of the attacking print is also a valid
   // discarded Pokemon, but must be independently reserved in the 60-card deck.
   if(!reserved&&source.attacks.some(a=>a.name===plan.name)&&ensure(deckIndex,source,2))
    requirements.push({side:0,zone:'discard',printId:source.officialCardId});
  }
  if(plan.metric==='ownDiscardNamedCard')reserve(r=>r.name===plan.name,'discard');
  if(plan.metric==='ownDiscardSupporterContains')reserve(r=>r.category==='supporter'&&r.name.includes(plan.name),'discard');
  if(plan.metric==='ownNamedOrExCount'&&![plan.name,plan.name+'ex'].includes(source.name))reserve(r=>mon(r,null,0)&&[plan.name,plan.name+'ex'].includes(r.name),'bench');
  if(plan.metric==='bothNameContainsCount'&&![plan.name,plan.secondName].some(n=>source.name.includes(n)))reserve(r=>mon(r,null,0)&&[plan.name,plan.secondName].some(n=>r.name.includes(n)),'bench');
  if(plan.metric==='ownBenchNamedCount'&&!reserve(r=>mon(r,null,0)&&r.name===plan.name,'bench')){
   outer:for(const target of legal.filter(r=>mon(r,null,'evolved')&&r.name===plan.name)){
    for(const chain of evolutionLines(target,legal)){
     if(!tryReserveChain(manifest.decks[deckIndex],reservedPrints,deckIndex,chain,(i,r)=>ensure(i,r,requiredCopies(requirements,0,r.officialCardId))))continue;
     requirements.push({side:0,zone:'bench',printId:chain[0].officialCardId});
     for(const record of chain.slice(1))requirements.push({side:0,zone:'hand',printId:record.officialCardId});
     requirements.namedBenchChain=chain.map(record=>record.officialCardId);
     break outer;
    }
   }
  }
  if(['ownBenchTeamCounters','ownNamedTeamEnergy'].includes(plan.metric))
   reserve(r=>mon(r,null,0)&&r.name.startsWith(plan.team+'の'),'bench');
  if(['ownNamedTeamEnergy','ownBenchWithTypedEnergy'].includes(plan.metric))
   reserveEnergy(plan.type,kindAttackCost(e,plan.type)+2);
  if(plan.metric==='ownBenchNamedCounters')reserve(r=>mon(r,null,0)&&r.name===plan.name,'bench');
  if(['ownAttachedSpecialCards','opponentAttachedSpecialCards'].includes(plan.metric))
   reserve(r=>r.category==='energy'&&r.mainPlan?.mechanic==='IGNITION','deck',plan.metric.startsWith('opponent')?1:0);
  if(plan.metric==='ownBenchTypedCounters')reserve(r=>mon(r,plan.type,0),'bench');
  if(plan.metric==='ownDiscardTypedPokemon')reserve(r=>mon(r,plan.type),'discard');
  if(plan.metric==='opponentDiscardBasic')reserve(isBasicEnergy,'discard',1);
  if(plan.metric==='opponentDiscardItem')reserve(r=>r.category==='item','discard',1);
  if(plan.metric==='ownNamedAttackCount'&&!source.attacks.some(a=>a.name===plan.name))reserve(r=>mon(r,null,0)&&r.attacks.some(a=>a.name===plan.name),'bench');
  if(plan.metric==='ownTeamNameCount'&&!source.name.startsWith(plan.name+'の'))reserve(r=>mon(r,null,0)&&r.name.startsWith(plan.name+'の'),'bench');
  if(plan.metric==='opponentAbilityCount')reserve(r=>mon(r,null,0)&&r.abilities.length>0,'bench',1);
  if(plan.metric==='opponentExVCount')reserve(r=>mon(r,null,0)&&/ex$|V(?:MAX|STAR|-UNION)?$/.test(r.name),'bench',1);
 }
 if(m==='ATTACK_MOVE_BENCH_COUNTERS'&&plan.team)reserve(r=>mon(r,null,0)&&r.name.startsWith(plan.team+'の'),'bench');
 if(m==='ATTACK_RECYCLE_BASIC_ENERGY'){
  reserve(r=>isBasicEnergy(r)&&typeOf(r)===plan.type,'discard');
  reserveEnergy(plan.type,kindAttackCost(e,plan.type)+2);
 }
 if(m==='ATTACK_DISCARD_OPPONENT_ATTACHMENTS'){
  reserve(r=>r.mainPlan?.mechanic==='IGNITION','deck',1);
  if(plan.tools)reserve(r=>r.category==='tool','deck',1);
 }
 if(m==='MASS_MILL_COUNT_DAMAGE'){
  const filter=r=>plan.filter==='typedBasic'?isBasicEnergy(r)&&typeOf(r)===plan.type:plan.filter==='energy'?r.category==='energy':plan.filter==='trainer'?['item','supporter','tool','stadium'].includes(r.category):r.category==='pokemon'&&r.name.startsWith(plan.team+'の');
  const chosen=reserve(filter,'deck');
  if(chosen?.category==='energy')reserveEnergy(typeOf(chosen),kindAttackCost(e,typeOf(chosen))+1);
  if(plan.scope==='both')reserve(filter,'deck',1);
 }

 if(m==='ATTACK_NAMED_DISCARD_BENCH'){
  const target=pick(r=>mon(r,null,0)&&r.name===plan.name);
  if(target){
   for(let n=plan.limit;n>0;n--)if(ensure(deckIndex,target,n)){
    for(let i=0;i<n;i++)requirements.push({side:0,zone:'discard',printId:target.officialCardId});
    break;
   }
  }
 }
 if((['ABILITY_EVOLVE_MULTI_COUNTERS','ATTACK_OPTIONAL_RETURN_POKEMON'].includes(m)||m==='MASS_BOARD_BONUS'&&plan.predicate==='evolvedFromThisTurn')&&!source.facts.basic){
  for(const line of evolutionLines(source,legal)){
   if(!tryReserveChain(manifest.decks[deckIndex],reservedPrints,deckIndex,line.slice(0,-1),(i,r)=>ensure(i,r,requiredCopies(requirements,0,r.officialCardId))))continue;
   requirements.evolvedSourceChain=line.map(x=>x.officialCardId);
   for(const parent of line.slice(0,-1))requirements.push({side:0,zone:'hand',printId:parent.officialCardId});
   break;
  }
 }
 if(e.proofDefenseBypass)reserve(r=>r.category==='stadium'&&r.mainPlan?.mechanic==='SUPPRESS_RULE_ABILITIES','deck');
 if(e.proofSuppression)reserve(r=>mon(r,null,0)&&r.abilities.some(a=>a.plan?.mechanic==='DASH'&&a.name!==e.proofSuppression),'active',1);
 if(e.proofRetreatTeamRecipient)reserve(r=>mon(r,null,0)&&r.facts.retreatCost>0&&!r.abilities.length,'bench');
 function reserveTera(zone){
   // Prefer a real basic Tera. Otherwise reserve the complete physical
   // evolution line, not an evolved card inserted into the field.
   const basic=reserve(r=>mon(r,null,0)&&r.facts.teraBenchProtection===true,zone);
   if(!basic){
    const occupied=new Set(requirements.filter(x=>x.side===0).map(x=>x.printId));
    const options=legal.filter(r=>r.category==='pokemon'&&r.facts.teraBenchProtection===true&&!r.facts.basic).sort((x,y)=>x.facts.stage-y.facts.stage);
    outer:for(const target of options){
     for(const chain of evolutionLines(target,legal)){
      if(chain.some(record=>occupied.has(record.officialCardId)))continue;
      if(tryReserveChain(manifest.decks[deckIndex],reservedPrints,deckIndex,chain,ensure)){
       requirements.push({side:0,zone:'bench',printId:chain[0].officialCardId});
       for(const record of chain.slice(1))requirements.push({side:0,zone:'hand',printId:record.officialCardId});
       requirements.teraChain=chain.map(record=>record.officialCardId);break outer;
      }
     }
    }
   }
  }
 if(m==='INSPECTED_OPPONENT_HAND_TRANSFER'){
  if(plan.filter==='itemTool'){
   reserve(r=>r.category==='item','hand',1);reserve(r=>r.category==='tool','hand',1);
  }else reserve(r=>plan.filter==='any'||r.category===plan.filter,'hand',1);
  if(plan.filter!=='any')reserve(r=>r.category==='pokemon','hand',1);
 }
 if(m==='ABILITY_TYPED_COST_COUNTER')reserve(r=>isBasicEnergy(r)&&typeOf(r)===plan.type,'hand');
 if(m==='MASS_PLACE_COUNTERS'&&plan.target==='bothAbility'){
  reserve(r=>mon(r,null,0)&&r.abilities.length>0,'bench',1);
  reserve(r=>mon(r,null,0)&&r.abilities.length===0,'bench',1);
 }
 if(m==='ABILITY_TYPED_COST_DRAW_LIMIT'){
  const energy=reserve(r=>isBasicEnergy(r)&&typeOf(r)===plan.type,'hand');
  if(plan.partnerName){
   reserve(r=>mon(r,null,0)&&r.name===plan.partnerName,'bench');
   if(ensure(deckIndex,source,2))requirements.push({side:0,zone:'bench',printId:source.officialCardId});
   if(energy&&ensure(deckIndex,energy,2))requirements.push({side:0,zone:'hand',printId:energy.officialCardId});
  }
 }
 if(m==='SUPPORTER_NON_RULE_DISCARD_DRAW')reserve(r=>r.category==='pokemon'&&!r.facts.rulePokemon,'hand');
 if(m==='MASS_ZONE_TRANSFER'){
  if(plan.requiresTera)reserveTera('bench');
  const filter=r=>{
   if(plan.category==='pokemonOrBasicEnergy')return isBasicEnergy(r)?(!plan.energyType||typeOf(r)===plan.energyType):r.category==='pokemon'&&(!plan.type||r.facts.types.includes(plan.type))&&(!Number.isInteger(plan.stage)||r.facts.stage===plan.stage)&&(!plan.team||r.name.startsWith(plan.team+'の'));
   if(plan.nameExact&&r.name!==plan.nameExact)return false;
   if(plan.retreatCost!==undefined&&r.facts.retreatCost!==plan.retreatCost)return false;
   if(plan.resistanceType&&!r.facts.resistance?.types?.includes(plan.resistanceType))return false;
   if(plan.category==='any')return true;
   if(plan.nameContains&&!r.name.includes(plan.nameContains))return false;
   if(plan.category==='categorySet')return plan.categories.includes(r.category);
   if(plan.energyTypes&&(!isBasicEnergy(r)||!plan.energyTypes.includes(typeOf(r))))return false;
   if(plan.category==='basicEnergy')return isBasicEnergy(r)&&(!plan.type||typeOf(r)===plan.type);
   if(plan.category==='trainer')return ['item','supporter','tool','stadium'].includes(r.category);
   return r.category===plan.category&&(!plan.type||r.category==='energy'&&typeOf(r)===plan.type||r.facts.types?.includes(plan.type))&&
    (plan.stage==null||plan.stage==='evolved'&&r.facts.stage>0||r.facts.stage===plan.stage)&&(!plan.team||r.name.startsWith(plan.team+'の'));
  };
  let target;
  if(plan.category==='categorySet'){
   for(const category of plan.categories){const chosen=reserve(r=>r.category===category&&filter(r),plan.zone);if(!target)target=chosen;}
  }else if(plan.distinctBy==='energyType'){
   const types=plan.energyTypes||['草','炎','水','雷','超','闘','悪','鋼'];
   for(const type of types){
    const chosen=pick(r=>filter(r)&&typeOf(r)===type);
    if(chosen&&ensure(deckIndex,chosen,kindAttackCost(e,type)+1)){
     requirements.push({side:0,zone:plan.zone,printId:chosen.officialCardId});
     if(!target)target=chosen;
    }
   }
  }else if(plan.category==='pokemonOrBasicEnergy'){
   target=reserve(r=>r.category==='pokemon'&&filter(r),plan.zone);
   const energy=reserve(r=>isBasicEnergy(r)&&filter(r),plan.zone);
   if(!target)target=energy;
  }else target=reserve(filter,plan.zone);
  if(target?.category==='energy'&&kindAttackCost(e,typeOf(target))>0)reserveEnergy(typeOf(target),kindAttackCost(e,typeOf(target))+1);
 }
 if(e.plan.batchSearch){
  const filter=r=>m==='SEARCH_BASIC_TO_BENCH_ATTACK'?mon(r,plan.type,0)&&(!plan.team||r.name.startsWith(plan.team+'の'))&&(!plan.nameExact||r.name===plan.nameExact):
   plan.filter==='any'?r.category==='item':
   plan.filter==='basicEnergy'?isBasicEnergy(r):
   plan.filter==='typedBasicEnergy'?isBasicEnergy(r)&&typeOf(r)===plan.type:
   plan.filter==='typedPokemon'?mon(r,plan.type):
   plan.filter==='typedPokemonOrBasicEnergy'?mon(r,plan.type):
   plan.filter==='typedPokemonOrStadium'?mon(r,plan.type):r.category===plan.filter;
  const target=reserve(filter,'deck');
  if(target?.category==='energy'&&kindAttackCost(e,typeOf(target))>0)reserveEnergy(typeOf(target),kindAttackCost(e,typeOf(target))+1);
 }
 if(m==='MASS_ENERGY_ROUTE'&&plan.target!=='self'&&(plan.holderType||plan.team)){
  const valid=r=>mon(r,plan.holderType,0)&&(!plan.team||r.name.startsWith(plan.team+'の'));
  if(plan.poisonActive){
   const active=reserve(valid,'active');
   reserve(r=>valid(r)&&r.officialCardId!==active?.officialCardId,'bench');
  }else{
   const first=reserve(valid,'bench');
   if(plan.oneEach&&first)reserve(r=>valid(r)&&r.officialCardId!==first.officialCardId,'bench');
  }
 }
 if(m==='MASS_ENERGY_ROUTE'&&plan.requiresTera)reserveTera('active');
 if(m==='MASS_ENERGY_ROUTE'&&plan.origin==='activeEntry')reserve(r=>r.category==='item'&&r.mainPlan?.mechanic==='SWITCH','hand');
 if(m==='SUPPORTER_MEGA_HEAL_RETURN_ENERGY')reserve(r=>mon(r,null,0)&&String(r.rulesText).includes('メガシンカexがきぜつしたとき'),'active');
 if(m==='MASS_HEAL_SCOPE'&&plan.type)reserve(r=>mon(r,plan.type,0),plan.scope==='active'&&source.category!=='pokemon'?'active':'bench');
 if(m==='MASS_HEAL_OWN'&&plan.type)
  reserve(r=>mon(r,plan.type,0),plan.target==='active'&&source.category!=='pokemon'?'active':'bench');
 if(m==='ATTACK_GUARDED_DAMAGE'){
  if(plan.predicate==='opponentEx'){
   reserve(r=>mon(r,null,0)&&r.name.endsWith('ex')&&!r.abilities.length,'active',1);
   reserve(r=>mon(r,null,0)&&!r.name.endsWith('ex'),'bench',1);
  }
  if(plan.predicate==='ownBenchedNames')for(const name of plan.names)reserve(r=>mon(r,null,0)&&r.name===name,'bench');
  if(plan.predicate==='stadium')reserve(r=>r.category==='stadium'&&r.mainPlan?.mechanic==='JAMMING','deck');
 }
 if(m==='MASS_BOARD_BONUS'){
  if(plan.predicate==='healedThisTurn')reserve(r=>r.category==='item'&&r.mainPlan?.mechanic==='HEAL_DAMAGE','hand');
  if(plan.predicate==='becameActive')reserve(r=>r.category==='item'&&r.mainPlan?.mechanic==='SWITCH','hand');
  if(plan.predicate==='sharedFieldType'){
   reserve(r=>mon(r,null,0)&&r.facts.types.some(type=>source.facts.types.includes(type)),'active',1);
   reserve(r=>mon(r,null,0)&&r.facts.types.every(type=>!source.facts.types.includes(type)),'bench',1);
  }
  if(plan.predicate==='stadiumPresent')reserve(r=>r.category==='stadium'&&r.mainPlan?.mechanic==='JAMMING','deck');
  if(plan.predicate==='ownNamedEnergy')reserve(r=>r.category==='energy'&&r.name===plan.name,'deck');
  if(plan.predicate==='ownBenchNamed'||plan.predicate==='ownBenchContains'){
   const named=r=>mon(r,null,null)&&(plan.predicate==='ownBenchNamed'?r.name===plan.name:r.name.includes(plan.name));
   if(!reserve(r=>named(r)&&r.facts.basic,'bench')){
    outer:for(const target of legal.filter(r=>named(r)&&!r.facts.basic).sort((a,b)=>a.facts.stage-b.facts.stage)){
     for(const chain of evolutionLines(target,legal)){
      if(tryReserveChain(manifest.decks[deckIndex],reservedPrints,deckIndex,chain,(i,r)=>ensure(i,r,requiredCopies(requirements,0,r.officialCardId)))){
       requirements.push({side:0,zone:'bench',printId:chain[0].officialCardId});
       for(const record of chain.slice(1))requirements.push({side:0,zone:'hand',printId:record.officialCardId});
       requirements.namedBenchChain=chain.map(record=>record.officialCardId);
       break outer;
      }
     }
    }
   }
  }
  if(plan.predicate==='opponentType'||plan.predicate==='opponentResistance'||plan.predicate==='opponentTera'){
   const matches=r=>plan.predicate==='opponentType'?r.facts.types.includes(plan.type):plan.predicate==='opponentResistance'?!!r.facts.resistance?.types.includes(plan.type):r.facts.teraBenchProtection===true;
   reserve(r=>mon(r,null,0)&&matches(r),'active',1);
   reserve(r=>mon(r,null,0)&&!matches(r),'bench',1);
  }
  if(plan.predicate==='ownStadium'||plan.predicate==='stadiumContains')reserve(r=>r.category==='stadium'&&(plan.predicate==='ownStadium'||r.name.includes(plan.name)),'deck');
 }
 if(m==='MASS_CONTEXT_BONUS'&&plan.predicate==='ownTypedBench')reserve(r=>mon(r,plan.type,plan.stage),'bench');
 if(m==='ABILITY_SEARCH_TYPED_EVOLUTION')reserve(r=>mon(r,plan.type,'evolved'),'deck');
 if(m==='MASS_HAND_FLOW'&&plan.mode==='rocketLimit'){
  const valid=r=>mon(r,null,0)&&r.name.startsWith('ロケット団の');
  const active=reserve(valid,'active');
  if(active)reserve(r=>valid(r)&&r.officialCardId!==active.officialCardId,'bench');
  reserve(r=>mon(r,null,0)&&!r.name.startsWith('ロケット団の'),'deck');
 }
 if(m==='SUPPORTER_ROCKET_SWITCH_BOTH'){
  const active=reserve(r=>mon(r,null,0)&&r.name.startsWith('ロケット団の'),'active');
  if(active)reserve(r=>mon(r,null,0)&&r.name.startsWith('ロケット団の')&&r.officialCardId!==active.officialCardId,'bench');
 }
 if(m==='SUPPORTER_BASIC_SWITCH_CONFUSE')reserve(r=>mon(r,null,0),'bench',1);
 if(m==='SUPPORTER_SWITCH_EX_HEAL')reserve(r=>mon(r,null,0)&&r.name.endsWith('ex'),'active');
 if(m==='TRAINER_SEARCH_TERA')reserve(r=>r.category==='pokemon'&&r.facts.teraBenchProtection,'deck');
 if(m==='TRAINER_TEAM_DAMAGE_REDUCTION'){
  const attacker=reserve(r=>vanilla(r),'active',1);
  if(attacker)ensureAttackCost(attacker,1-deckIndex);
  const active=reserve(r=>mon(r,plan.type,0)&&!r.abilities.length,'active');
  const bench=reserve(r=>mon(r,plan.type,0)&&!r.abilities.length&&r.officialCardId!==active?.officialCardId,'bench');
  if(!bench&&active&&ensure(deckIndex,active,2))requirements.push({side:0,zone:'bench',printId:active.officialCardId});
  if(plan.type)reserve(r=>mon(r,null,0)&&!r.facts.types.includes(plan.type)&&!r.abilities.length,'bench');
 }
 if(m==='TRAINER_TYPED_DAMAGE_BOOST'){
  const target=reserve(r=>vanilla(r)&&r.facts.types.includes(plan.type),'active');
  if(target)ensureAttackCost(target,deckIndex);
 }
 if(m==='TOOL_EX_ATTACK_BOOST'||m==='TOOL_PRIZE_COST_DISCOUNT'){
  // The attachment alone proves nothing. Reserve a basic, ability-free attacker
  // whose first ordinary attack has a small colorless cost and real printed damage.
  const target=reserve(r=>r.category==='pokemon'&&r.facts.basic&&!r.facts.rulePokemon&&!r.abilities.length&&r.attacks.some(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0&&Number(a.damage)<=60&&a.cost.length>0&&a.cost.every(t=>t==='無色'))&&r.attacks.find(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0)?.cost.every(t=>t==='無色'),'active');
  if(target){
   ensureAttackCost(target,deckIndex);
   const attack=target.attacks.find(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0&&(m!=='TOOL_PRIZE_COST_DISCOUNT'||a.cost.includes('無色')));
   if(m==='TOOL_EX_ATTACK_BOOST'&&attack)reserve(r=>r.category==='pokemon'&&r.facts.basic&&r.name.endsWith('ex')&&!r.abilities.length&&r.facts.hp>Number(attack.damage)+plan.amount&&!r.facts.weakness?.types.some(t=>target.facts.types.includes(t))&&!r.facts.resistance?.types.some(t=>target.facts.types.includes(t)),'active',1);
  }
 }
 if(m==='ATTACK_DISCARD_TOOL_BEFORE_DAMAGE')reserve(r=>r.category==='tool'&&r.mainPlan?.mechanic==='CIRCULATOR','deck',1);
 if(m==='ATTACK_BASIC_DAMAGE_PROTECTION'){
  const target=reserve(r=>vanilla(r)&&!r.facts.types.includes(plan.exceptType)&&r.facts.hp>Number(e.damage||0)&&!r.facts.weakness?.types.some(t=>source.facts.types.includes(t)),'active',1);
  if(target)ensureAttackCost(target,1-deckIndex);
 }
 return requirements;
}
function kindAttackCost(e,type){return (e.cost||[]).filter(t=>t===type||t==='無色').length;}
function evolveTeraFixture(pp,chain,requireTera=true,side=0,zone='bench',targetId=null){
 const actor=side===0?'you':'ai',other=side===0?'ai':'you';
 const targets=state=>zone==='active'?[state.players[side].active]:state.players[side].bench;
 const base=targets(pp.getSnapshot()).find(c=>c&&E.getReferenceEffectRecord(c).officialCardId===chain[0]&&(!targetId||c.id===targetId));
 if(!base)return {blocked:'NO_TERA_EVOLUTION_BASE'};
 const initial=Array.from(S.identities(pp.getSnapshot()));
 const endTurn=who=>{
  const action=E.getLegalActions(pp.getSnapshot(),who).actions.find(a=>a.type==='end_turn');
  return !!action&&pp.dispatch(who,action).ok;
 };
 if(side===1&&!endTurn('you'))return {blocked:'OPPONENT_EVOLUTION_INITIAL_END_TURN_REJECTED'};
 for(let i=1;i<chain.length;i++){
  const printId=chain[i],state=pp.getSnapshot(),physical=state.players[side].hand.find(c=>E.getReferenceEffectRecord(c).officialCardId===printId);
  if(!physical)return {blocked:'NO_TERA_EVOLUTION_HAND_PRINT'};
  const evolve={type:'evolve',cardId:physical.id,targetInstanceId:base.id};
  if(!pp.dispatch(actor,evolve).ok)return {blocked:'TERA_LEGAL_EVOLUTION_REJECTED'};
  const evolved=targets(pp.getSnapshot()).find(c=>c?.id===base.id);
  assert.equal(E.getReferenceEffectRecord(evolved).officialCardId,printId);
  assert(evolved.evolutionCards.some(c=>c.id===physical.id));
  if(!endTurn(actor))return {blocked:'TERA_EVOLUTION_END_TURN_REJECTED'};
  if((side===0||i<chain.length-1)&&!endTurn(other))return {blocked:'TERA_EVOLUTION_END_TURN_REJECTED'};
 }
 assert.deepEqual(Array.from(S.identities(pp.getSnapshot())),initial);
 assert(targets(pp.getSnapshot()).some(c=>c?.id===base.id&&E.getReferenceEffectRecord(c).officialCardId===chain.at(-1)&&(!requireTera||E.getReferenceEffectRecord(c).facts.teraBenchProtection===true)));
 assert.equal(pp.getSnapshot().turnPlayer,'you');
 return {port:pp};
}
function prepare(r, e, kind) {
  const idx = e.effectIndex ?? 0,
    m = e.plan.mechanic;
  if(['PASSIVE_EMPTY_ENERGY_RETREAT','PASSIVE_TYPED_TEAM_RETREAT'].includes(m)){
    const attackIndex=r.attacks.findIndex(a=>a.plan);
    if(attackIndex<0)return {blocked:'NO_RETREAT_CONTEXT_TRIGGER'};
    const trigger={...r.attacks[attackIndex],effectIndex:attackIndex,proofRetreatTeamRecipient:m==='PASSIVE_TYPED_TEAM_RETREAT'};
    const t=prepare(r,trigger,'attack');
    if(t.blocked)return t;
    const game=t.port.getSnapshot(),own=game.players[0],mon=own.active;
    if(E.getReferenceEffectRecord(mon)?.officialCardId!==r.officialCardId||!own.bench.length||!r.facts.retreatCost)return {blocked:'NO_EXACT_RETREAT_CONTEXT_FIXTURE'};
    const empty=structuredClone(game),side=empty.players[0],holder=side.active;
    const physical=holder.energyCards.splice(0);side.deck.push(...physical);
    const zero=port(empty),start=zero.getSnapshot();
    const self=m==='PASSIVE_EMPTY_ENERGY_RETREAT';
    assert.equal(start.players[0].active.retreatCost,self?0:r.facts.retreatCost);
    assert(physical.length,'RETREAT_CONTEXT_REQUIRES_PHYSICAL_ENERGY');
    if(!self&&!physical.some(c=>!c.isSpecial&&c.energyType===e.plan.energyType))return {blocked:'NO_TYPED_RETREAT_ENERGY'};
    assert.equal(mon.retreatCost,self?r.facts.retreatCost:0);
    if(!self){
      // Verify the aura reaches a different Pokémon, not only its source,
      // and neither an untyped recipient nor the opponent is discounted.
      const team=structuredClone(game),ours=team.players[0],holder=ours.active;
      const recipient=ours.bench.find(c=>E.getReferenceEffectRecord(c).facts.retreatCost>0&&!c.tools?.length&&!E.getReferenceEffectRecord(c).abilities.length);
      if(!recipient)return {blocked:'NO_TYPED_RETREAT_TEAM_RECIPIENT'};
      const typed=holder.energyCards.find(c=>!c.isSpecial&&c.energyType===e.plan.energyType);
      assert(typed);
      ours.deck.push(...recipient.energyCards.splice(0));
      const prior=port(team).getSnapshot(),priorRecipient=prior.players[0].bench.find(c=>c.id===recipient.id);
      assert.equal(priorRecipient.retreatCost,E.getReferenceEffectRecord(priorRecipient).facts.retreatCost);
      recipient.energyCards.push(holder.energyCards.splice(holder.energyCards.findIndex(c=>c.id===typed.id),1)[0]);
      const changed=port(team).getSnapshot(),changedRecipient=changed.players[0].bench.find(c=>c.id===recipient.id);
      assert.equal(changedRecipient.retreatCost,0);
      assert(changedRecipient.energyCards.some(c=>c.id===typed.id));
      assert.deepEqual(S.identities(prior),S.identities(changed));
      assert.equal(changed.players[1].active.retreatCost,prior.players[1].active.retreatCost);
    }
    const free=self?zero:port(game),before=free.getSnapshot();
    const retreat=E.getLegalActions(before,'you').actions.find(a=>a.type==='retreat'&&!(a.energyIds||[]).length);
    assert(retreat,'NO_LEGAL_FREE_RETREAT_ACTION');
    assert(free.dispatch('you',retreat).ok);
    const after=free.getSnapshot(),moved=after.players[0].bench.find(c=>c.id===mon.id);
    assert(moved);assert.deepEqual(moved.energyCards.map(c=>c.id),before.players[0].active.energyCards.map(c=>c.id));
    assert.deepEqual(S.identities(before),S.identities(after));
    assert(free.restoreSession(free.getResumeSnapshot()).ok);assert.deepEqual(free.getSnapshot(),after);
    const denied=self?port(game):zero;
    assert.equal(denied.dispatch('you',retreat).ok,false);
    return {...t,trigger};
  }
  if(m==='ACTIVE_OPPONENT_ABILITY_SUPPRESSION'){
    const index=r.attacks.findIndex(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0);
    const chosen=index>=0?index:r.attacks.findIndex(a=>a.plan);
    if(chosen<0)return {blocked:'NO_SUPPRESSION_ATTACK_TRIGGER'};
    const trigger={...r.attacks[chosen],effectIndex:chosen,proofSuppression:e.plan.exceptAbilityName},t=prepare(r,trigger,'attack');
    if(t.blocked)return t;
    const game=t.port.getSnapshot(),own=game.players[0],other=game.players[1];
    if(!own.bench.length||!E.getReferenceEffectRecord(other.active).abilities.some(a=>a.plan?.mechanic==='DASH'&&a.name!==e.plan.exceptAbilityName))return {blocked:'NO_SUPPRESSION_TARGET_FIXTURE'};
    return {...t,trigger};
  }
  if (["PASSIVE_ROCKET_TEAM_ATTACK_GATE","PASSIVE_CONTEXT_ATTACK_GATE"].includes(m)) {
    const attackIndex = r.attacks.findIndex(attack => attack.plan);
    if (attackIndex < 0) return { blocked: "NO_PASSIVE_TRIGGER_ATTACK" };
    const trigger = { ...r.attacks[attackIndex], effectIndex: attackIndex };
    return { ...prepare(r, trigger, "attack"), trigger };
  }
  if (m === "PASSIVE_TYPED_ATTACK_IMMUNITY") {
    const attacker = records.get(e.plan.attacker==='ex'?'49264':'47301');
    if(!attacker)return {blocked:'NO_IMMUNITY_ATTACKER'};
    const attackIndex=attacker.attacks.findIndex(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0);
    if(attackIndex<0)return {blocked:'NO_IMMUNITY_ATTACK'};
    const trigger={...attacker.attacks[attackIndex],effectIndex:attackIndex};
    const manifest=require("../../tests/fixtures/control-009-extension-manifest.cjs")(fixed,[r]);
    const deck=manifest.decks[0],existing=deck.cards.find(c=>c.name===attacker.deckName);
    if(existing)existing.referenceOfficialCardId=attacker.officialCardId;
    else{
      const donor=deck.cards.find(c=>c.category==='pokemon'&&c.count>1);
      if(!donor)return {blocked:'NO_IMMUNITY_ATTACKER_DECK_SLOT'};
      donor.count--;deck.cards.push({name:attacker.deckName,category:'pokemon',count:1,referenceOfficialCardId:attacker.officialCardId});
    }
    const frame=S.create(E,manifest,{cardName:attacker.deckName,category:'pokemon',officialCardId:attacker.officialCardId,kind:'attack',index:attackIndex,plan:trigger.plan,cost:trigger.cost,locations:[{deck:0}],defenderOfficialCardId:r.officialCardId});
    if(frame.blocked)return frame;
    return {port:port(frame.game),sourceId:frame.sourceId,kind:'attack',trigger};
  }
  if(m==='PASSIVE_TEAM_ATTACK_BOOST'){
    const plan=e.plan,all=[...records.values()];
    const line=record=>{
      if(record.facts.basic)return [record];
      if(!(record.facts.stage>0))return null;
      const parent=all.find(x=>x.category==='pokemon'&&x.name===record.facts.evolvesFrom&&x.facts.stage===record.facts.stage-1&&x.attacks.every(a=>a.plan)&&!x.abilities.length);
      const previous=parent&&line(parent);return previous?[...previous,record]:null;
    };
    const holderChain=line(r);
    if(!holderChain)return {blocked:'NO_TEAM_BOOST_HOLDER_EVOLUTION_LINE'};
    const attackIndex=x=>x.attacks.findIndex(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0&&Number(a.damage)<=100&&a.cost.length>0&&a.cost.every(t=>['草','炎','水','雷','超','闘','悪','鋼','無色'].includes(t)));
    const matches=x=>x.category==='pokemon'&&x.officialCardId!==r.officialCardId&&x.name!==r.name&&!x.abilities.length&&x.attacks.every(a=>a.plan)&&attackIndex(x)>=0&&(plan.evolvedSource?x.facts.stage>0:x.facts.basic)&&(!plan.team||x.name.startsWith(plan.team+'の'))&&(!plan.types.length||plan.types.some(t=>x.facts.types.includes(t)));
    const attackerChain=all.filter(matches).map(line).find(chain=>chain&&!chain.some(x=>holderChain.some(h=>h.deckName===x.deckName)));
    if(!attackerChain)return {blocked:'NO_TEAM_BOOST_ATTACKER'};
    const attacker=attackerChain.at(-1),i=attackIndex(attacker),damage=Number(attacker.attacks[i].damage);
    const defenders=all.filter(x=>x.category==='pokemon'&&!x.abilities.length&&x.attacks.every(a=>a.plan)&&(plan.evolvedTarget?x.facts.stage>0:x.facts.basic)&&x.facts.hp>damage+plan.amount&&!x.facts.weakness?.types.some(t=>attacker.facts.types.includes(t))&&!x.facts.resistance?.types.some(t=>attacker.facts.types.includes(t)));
    const defenderChain=defenders.map(line).find(Boolean);
    if(!defenderChain)return {blocked:'NO_TEAM_BOOST_DEFENDER'};
    const ids=chain=>chain.map(x=>x.officialCardId);
    const trigger={...attacker.attacks[i],effectIndex:i,proofTeamBoost:{holderPrint:r.officialCardId,holderChain:ids(holderChain),attackerChain:ids(attackerChain),defenderChain:ids(defenderChain),nonStack:plan.nonStack}};
    const t=prepare(attackerChain[0],trigger,'attack');
    if(t.blocked)return t;
    const state=t.port.getSnapshot(),holders=state.players[0].bench.filter(c=>E.getReferenceEffectRecord(c)?.officialCardId===r.officialCardId);
    if(holders.length!==(plan.nonStack?2:1))return {blocked:'NO_EXACT_TEAM_BOOST_HOLDERS'};
    assert.equal(E.getReferenceEffectRecord(state.players[0].active).officialCardId,attacker.officialCardId);
    assert.equal(E.getReferenceEffectRecord(state.players[1].active).officialCardId,defenderChain.at(-1).officialCardId);
    return {...t,trigger,boostHolderIds:holders.map(c=>c.id)};
  }
  if(m==='PASSIVE_CONTEXT_COST_DISCOUNT'){
    const plan=e.plan;
    const preferred=r.attacks.findIndex(a=>a.cost.includes('無色')&&['VANILLA_DAMAGE','ATTACK_NAMED_NEXT_TURN_LOCK','NO_NEXT_ATTACK'].includes(a.plan?.mechanic)&&Number(a.damage)>0);
    // A continuous cost modifier applies to every printed attack, not just fixed-damage attacks.
    const attackIndex=preferred>=0?preferred:r.attacks.findIndex(a=>a.cost.includes('無色')&&a.plan);
    if(attackIndex<0)return {blocked:'NO_CONTEXT_COST_ATTACK_FIXTURE'};
    const trigger={...r.attacks[attackIndex],effectIndex:attackIndex,proofContextCost:plan},t=prepare(r,trigger,'attack');
    if(t.blocked)return t;
    const game=t.port.getSnapshot(),[own,other]=game.players;
    if(plan.mode==='discardName'){
      const eligible=c=>E.getReferenceEffectRecord(c)?.name===plan.name;
      for(const zone of [own.hand,own.deck]){const i=zone.findIndex(eligible);if(i>=0){own.discard.push(zone.splice(i,1)[0]);break;}}
      if(!own.discard.some(eligible))return {blocked:'NO_CONTEXT_COST_DISCARD_FIXTURE'};
    }else if(plan.mode==='opponentHandExact'){
      while(other.hand.length>plan.count)other.deck.push(other.hand.pop());
      while(other.hand.length<plan.count&&other.deck.length)other.hand.push(other.deck.pop());
      if(other.hand.length!==plan.count)return {blocked:'NO_CONTEXT_COST_HAND_FIXTURE'};
    }else if(plan.mode==='opponentBench'){
      if(!other.bench.length)return {blocked:'NO_CONTEXT_COST_BENCH_FIXTURE'};
    }else if(plan.mode==='ownAllNames'){
      if(!plan.names.every(name=>[own.active,...own.bench].some(c=>E.getReferenceEffectRecord(c)?.name===name)))return {blocked:'NO_CONTEXT_COST_NAMED_FIELD_FIXTURE'};
    }
    const discount=plan.mode==='discardName'?own.discard.filter(c=>E.getReferenceEffectRecord(c)?.name===plan.name).length:plan.mode==='opponentBench'?other.bench.length:trigger.cost.length;
    const keep=[];
    for(const type of trigger.cost.filter(c=>c!=='無色')){
      const i=own.active.energyCards.findIndex(c=>!c.isSpecial&&c.energyType===type);
      if(i<0)return {blocked:'NO_CONTEXT_COST_TYPED_PAYMENT'};
      keep.push(own.active.energyCards.splice(i,1)[0]);
    }
    for(let n=Math.max(0,trigger.cost.filter(c=>c==='無色').length-discount);n>0;n--){
      const i=own.active.energyCards.findIndex(c=>!c.isSpecial);
      if(i<0)return {blocked:'NO_CONTEXT_COST_COLORLESS_PAYMENT'};
      keep.push(own.active.energyCards.splice(i,1)[0]);
    }
    own.deck.push(...own.active.energyCards);own.active.energyCards=keep;
    return {...t,port:port(game),trigger};
  }
  if(m==='PASSIVE_NAMED_PRIZE_DISCOUNT'){
    const attackIndex=r.attacks.findIndex(a=>a.name===e.plan.attackName&&a.cost.includes('無色')&&['VANILLA_DAMAGE','ATTACK_NAMED_NEXT_TURN_LOCK','NO_NEXT_ATTACK'].includes(a.plan?.mechanic)&&Number(a.damage)>0);
    if(attackIndex<0)return {blocked:'NO_NAMED_PRIZE_ATTACK_FIXTURE'};
    const trigger={...r.attacks[attackIndex],effectIndex:attackIndex},t=prepare(r,trigger,'attack');
    if(t.blocked)return t;
    const game=t.port.getSnapshot(),own=game.players[0],other=game.players[1];
    while(other.prizes>1){other.hand.push(other.prizeCards.pop());other.prizes--;}
    const cost=trigger.cost.filter(x=>x!=='無色'),keep=[];
    for(const type of cost){
     const index=own.active.energyCards.findIndex(c=>!c.isSpecial&&c.energyType===type);
     if(index<0)return {blocked:'NO_NAMED_PRIZE_TYPED_PAYMENT'};
     keep.push(own.active.energyCards.splice(index,1)[0]);
    }
    const colorless=Math.max(0,trigger.cost.filter(x=>x==='無色').length-(6-other.prizes));
    for(let i=0;i<colorless;i++){
     const index=own.active.energyCards.findIndex(c=>!c.isSpecial);
     if(index<0)return {blocked:'NO_NAMED_PRIZE_COLORLESS_PAYMENT'};
     keep.push(own.active.energyCards.splice(index,1)[0]);
    }
    own.deck.push(...own.active.energyCards);own.active.energyCards=keep;
    return {...t,port:port(game),trigger};
  }
  if(m==='PASSIVE_IGNORE_ACTIVE_DEFENSE'){
    const attackIndex=r.attacks.findIndex(a=>a.plan?.mechanic==='ATTACK_STATUS_BONUS_DAMAGE');
    if(attackIndex<0)return {blocked:'NO_DEFENSE_BYPASS_ATTACK'};
    const trigger={...r.attacks[attackIndex],effectIndex:attackIndex,proofDefenseBypass:true},t=prepare(r,trigger,'attack');
    if(t.blocked)return t;
    const g=t.port.getSnapshot(),own=g.players[0],other=g.players[1];
    for(const c of [...own.active.energyCards])if(c.isSpecial){own.active.energyCards.splice(own.active.energyCards.indexOf(c),1);own.deck.push(c);}
    if(!own.deck.some(c=>E.getReferenceEffectRecord(c)?.mainPlan?.mechanic==='SUPPRESS_RULE_ABILITIES'))return {blocked:'NO_DEFENSE_BYPASS_SUPPRESSION_STADIUM'};
    if(g.stadium)return {blocked:'NO_EMPTY_STADIUM_FIXTURE'};
    other.active.referenceProtection={opponentTurn:g.turnNumber};
    return {...t,port:port(g),trigger};
  }
  if(m==='PASSIVE_ACTIVE_HIT_RETALIATION'||m==='PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION'&&e.plan.condition){
    const attacker=records.get('45152'),attackIndex=attacker?.attacks.findIndex(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0);
    if(!(attackIndex>=0))return {blocked:'NO_RETALIATION_ATTACK_FIXTURE'};
    const trigger={...attacker.attacks[attackIndex],effectIndex:attackIndex};
    const line=record=>{
      if(record.facts.basic)return [record];
      const parent=[...records.values()].find(c=>c.category==='pokemon'&&c.name===record.facts.evolvesFrom&&c.facts.stage===record.facts.stage-1&&c.attacks.length&&c.attacks.every(a=>a.plan)&&c.abilities.every(a=>a.plan));
      const previous=parent&&line(parent);return previous?[...previous,record]:null;
    };
    const chain=line(r);
    if(!chain)return {blocked:'NO_RETALIATION_EVOLUTION_LINE'};
    const manifest=require("../../tests/fixtures/control-009-extension-manifest.cjs")(fixed,chain);
    const requirements=chain.length>1?[{side:1,zone:'active',printId:chain[0].officialCardId},...chain.slice(1).map(c=>({side:1,zone:'hand',printId:c.officialCardId}))]:[];
    const frame=S.create(E,manifest,{cardName:attacker.deckName,category:'pokemon',officialCardId:attacker.officialCardId,kind:'attack',index:attackIndex,plan:trigger.plan,cost:trigger.cost,locations:[{deck:0}],defenderOfficialCardId:chain[0].officialCardId,fixtureRequirements:requirements});
    if(frame.blocked)return frame;
    let game=frame.game;
    if(chain.length>1){
      const identities=Array.from(S.identities(game)),baseId=game.players[1].active.id;
      const first=port(game),end=E.getLegalActions(first.getSnapshot(),'you').actions.find(a=>a.type==='end_turn');
      if(!end||!first.dispatch('you',end).ok)return {blocked:'RETALIATION_INITIAL_END_TURN_REJECTED'};
      const pp=first;
      for(let i=1;i<chain.length;i++){
        const state=pp.getSnapshot(),child=state.players[1].hand.find(c=>E.getReferenceEffectRecord(c).officialCardId===chain[i].officialCardId);
        if(!child)return {blocked:'NO_RETALIATION_EVOLUTION_HAND_PRINT'};
        const action={type:'evolve',cardId:child.id,targetInstanceId:baseId};
        const early=JSON.parse(JSON.stringify(state));early.players[1].active.enteredTurn=early.turnNumber;
        const denied=port(early);assert.equal(denied.dispatch('ai',action).ok,false);assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(early));
        if(!pp.dispatch('ai',action).ok)return {blocked:'RETALIATION_LEGAL_EVOLUTION_REJECTED'};
        const evolved=pp.getSnapshot().players[1].active;
        assert.equal(E.getReferenceEffectRecord(evolved).officialCardId,chain[i].officialCardId);
        assert(evolved.evolutionCards.some(c=>c.id===child.id));
        for(const actor of (i+1<chain.length?['ai','you']:['ai'])){
          const end=E.getLegalActions(pp.getSnapshot(),actor).actions.find(a=>a.type==='end_turn');
          if(!end||!pp.dispatch(actor,end).ok)return {blocked:'RETALIATION_EVOLUTION_END_TURN_REJECTED'};
        }
      }
      game=pp.getSnapshot();
      assert.equal(game.turnPlayer,'you');
      assert.deepEqual(Array.from(S.identities(game)),identities);
      assert.equal(E.getReferenceEffectRecord(game.players[1].active).officialCardId,r.officialCardId);
    }
    if(m==='PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION'&&e.plan.condition){
      const [own,other]=game.players,defender=other.active;
      for(const c of [...own.active.energyCards])if(c.isSpecial){own.active.energyCards.splice(own.active.energyCards.indexOf(c),1);own.deck.push(c);}
      if(e.plan.condition==='hasEnergy'&&!defender.energyCards.length){
        const i=other.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial);
        if(i<0)return {blocked:'NO_CONDITIONAL_REDUCTION_ENERGY'};
        defender.energyCards.push(other.deck.splice(i,1)[0]);
      }
      if(e.plan.condition==='fullHp')assert.equal(defender.damage,0);
    }
    return {port:port(game),sourceId:frame.sourceId,kind:'attack',trigger};
  }
  if(['PASSIVE_FULL_HP_SURVIVAL','PASSIVE_COIN_DAMAGE_GUARD','PASSIVE_COIN_KO_SURVIVAL'].includes(m)){
    const attacker=records.get('50359'),attackIndex=attacker?.attacks.findIndex(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0&&(m!=='PASSIVE_FULL_HP_SURVIVAL'||Number(a.damage)>=r.facts.hp));
    if(!(attackIndex>=0))return {blocked:'NO_SURVIVAL_ATTACK_FIXTURE'};
    const trigger={...attacker.attacks[attackIndex],effectIndex:attackIndex};
    // Resolve the exact legal evolution chain, including stage-two defenders.
    const survivalLine=record=>{
      if(record.facts.basic)return [record];
      const parents=[...records.values()].filter(c=>c.category==='pokemon'&&c.name===record.facts.evolvesFrom&&c.facts.stage===record.facts.stage-1&&c.attacks.length&&c.attacks.every(a=>a.plan)&&c.abilities.every(a=>a.plan));
      for(const candidate of parents){const prefix=survivalLine(candidate);if(prefix)return [...prefix,record];}
      return null;
    };
    const chain=survivalLine(r);
    if(!chain)return {blocked:'NO_SURVIVAL_EVOLUTION_PARENT'};
    const manifest=require("../../tests/fixtures/control-009-extension-manifest.cjs")(fixed,[...chain,attacker]);
    const deck=manifest.decks[0],water=[...records.values()].find(c=>c.mainPlan?.mechanic==='BASIC_ENERGY'&&(c.facts.basicEnergyType==='水'||c.name==='基本水エネルギー'));
    if(!water)return {blocked:'NO_SURVIVAL_WATER_ENERGY'};
    const available=deck.cards.filter(c=>c.name===water.deckName).reduce((n,c)=>n+c.count,0);
    let need=Math.max(0,trigger.cost.length-available);
    const originalNeed=need;
    for(const donor of deck.cards.filter(c=>c.category==='energy'&&c.name!==water.deckName)){
      const n=Math.min(need,donor.count);donor.count-=n;need-=n;
    }
    if(need)return {blocked:'NO_SURVIVAL_ENERGY_RESOURCES'};
    if(originalNeed){const existing=deck.cards.find(c=>c.name===water.deckName);if(existing){existing.count+=originalNeed;existing.referenceOfficialCardId=water.officialCardId;}else deck.cards.push({name:water.deckName,category:'energy',count:originalNeed,referenceOfficialCardId:water.officialCardId});}
    deck.cards=deck.cards.filter(c=>c.count>0);
    if(e.plan.energyType){
      const energy=[...records.values()].find(c=>c.mainPlan?.mechanic==='BASIC_ENERGY'&&(c.facts.basicEnergyType===e.plan.energyType||c.name==='基本'+e.plan.energyType+'エネルギー'));
      if(!energy)return {blocked:'NO_DEFENSIVE_COIN_ENERGY_PRINT'};
      const side=manifest.decks[1];
      if(!side.cards.some(c=>c.name===energy.deckName)){
        const donor=side.cards.find(c=>c.category==='energy'&&c.count>1);
        if(!donor)return {blocked:'NO_DEFENSIVE_COIN_ENERGY_DONOR'};
        donor.count--;side.cards.push({name:energy.deckName,category:'energy',count:1,referenceOfficialCardId:energy.officialCardId});
      }
    }
    const frame=S.create(E,manifest,{cardName:attacker.deckName,category:'pokemon',officialCardId:attacker.officialCardId,kind:'attack',index:attackIndex,plan:trigger.plan,cost:trigger.cost,locations:[{deck:0}],defenderOfficialCardId:chain[0].officialCardId,fixtureRequirements:chain.length>1?[{side:1,zone:'active',printId:chain[0].officialCardId},...chain.slice(1).map(c=>({side:1,zone:'hand',printId:c.officialCardId}))]:[]});
    if(frame.blocked)return frame;
    let game=frame.game;const own=game.players[0];
    for(const c of [...own.active.energyCards])if(c.isSpecial){own.active.energyCards.splice(own.active.energyCards.indexOf(c),1);own.deck.push(c);}
    if(chain.length>1){
      const identities=Array.from(S.identities(game)),baseId=game.players[1].active.id;
      const evoPort=port(game);
      const firstEnd=E.getLegalActions(evoPort.getSnapshot(),'you').actions.find(a=>a.type==='end_turn');
      if(!firstEnd||!evoPort.dispatch('you',firstEnd).ok)return {blocked:'SURVIVAL_INITIAL_END_TURN_REJECTED'};
      for(let i=1;i<chain.length;i++){
        const state=evoPort.getSnapshot();
        const evolution=state.players[1].hand.find(c=>E.getReferenceEffectRecord(c)?.officialCardId===chain[i].officialCardId);
        if(!evolution)return {blocked:'NO_SURVIVAL_EVOLUTION_HAND_PRINT'};
        const action={type:'evolve',cardId:evolution.id,targetInstanceId:baseId};
        const illegal=structuredClone(state);illegal.players[1].active.enteredTurn=illegal.turnNumber;
        const denied=port(illegal);assert.equal(denied.dispatch('ai',action).ok,false);
        assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(illegal));
        if(!evoPort.dispatch('ai',action).ok)return {blocked:'SURVIVAL_LEGAL_EVOLUTION_REJECTED'};
        const evolved=evoPort.getSnapshot();
        assert.equal(E.getReferenceEffectRecord(evolved.players[1].active).officialCardId,chain[i].officialCardId);
        assert.equal(evolved.players[1].active.id,baseId);
        assert(evolved.players[1].active.evolutionCards.some(c=>c.id===evolution.id));
        for(const actor of (i+1<chain.length?['ai','you']:['ai'])){
          const end=E.getLegalActions(evoPort.getSnapshot(),actor).actions.find(a=>a.type==='end_turn');
          if(!end||!evoPort.dispatch(actor,end).ok)return {blocked:'SURVIVAL_EVOLUTION_END_TURN_REJECTED'};
        }
      }
      game=evoPort.getSnapshot();
      assert.equal(game.turnPlayer,'you');
      assert.deepEqual(Array.from(S.identities(game)),identities);
      assert.equal(E.getReferenceEffectRecord(game.players[1].active).officialCardId,r.officialCardId);
    }
    assert.equal(game.players[1].active.damage,0);
    if(e.plan.energyType){
      const side=game.players[1],zones=[side.deck,side.hand,side.discard];
      const zone=zones.find(z=>z.some(c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===e.plan.energyType));
      if(!zone)return {blocked:'NO_PHYSICAL_DEFENSIVE_COIN_ENERGY'};
      side.active.energyCards.push(zone.splice(zone.findIndex(c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===e.plan.energyType),1)[0]);
    }
    // The coin-based survival text does not require full HP. Exercise
    // lethal damage on the already-injured real defender, without changing printed HP.
    if(m==='PASSIVE_COIN_KO_SURVIVAL')game.players[1].active.damage=game.players[1].active.hp-10;
    if(m!=='PASSIVE_FULL_HP_SURVIVAL')game.referenceRngState=0;
    return {port:port(game),sourceId:frame.sourceId,kind:'attack',trigger};
  }
  if (m === "PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION") {
    // A fixed-deck attacker hits the exact verified defender in the browser.
    const attacker = records.get("45152");
    const attackIndex = attacker.attacks.findIndex(attack => attack.plan?.mechanic === "VANILLA_DAMAGE");
    const trigger = { ...attacker.attacks[attackIndex], effectIndex: attackIndex };
    const manifest = require("../../tests/fixtures/control-009-extension-manifest.cjs")(fixed, [r]);
    const frame = S.create(E, manifest, {
      cardName: attacker.deckName, category: "pokemon", officialCardId: attacker.officialCardId,
      kind: "attack", index: attackIndex, plan: trigger.plan, cost: trigger.cost,
      locations: [{ deck: 0 }], defenderOfficialCardId: r.officialCardId,
    });
    return { port: port(frame.game), sourceId: frame.sourceId, kind: "attack", trigger };
  }
  if (!e.proofTeamBoost && F10.records.some((x) => x.officialCardId === r.officialCardId)) {
    if (m === "BENCH_DAMAGE_PROTECTION") {
      const f = F10.protection(r.officialCardId);
      return {
        port: port(f.game),
        action: {
          type: "attack_turn",
          attackIndex: f.frame.row.index,
          targetIds: [f.targetId],
        },
        passiveTrigger: true,
      };
    }
    const t = F10.create(
      r.officialCardId,
      kind === "energy" ? "energy" : kind,
      idx,
    );
    return { port: t.port, sourceId: t.frame.sourceId, kind };
  }
  if (!e.proofTeamBoost && F9.records.some((x) => x.officialCardId === r.officialCardId)) {
    const t = F9.create(r.officialCardId);
    return { port: t.port, sourceId: t.frame.sourceId, kind };
  }
  if (
    legacy.some((x) => x.officialCardId === r.officialCardId) &&
    JSON.stringify(
      require("../../tests/fixtures/control-008-extension-manifest.cjs")(fixed),
    ).includes(r.officialCardId)
  ) {
    const manifest =
      require("../../tests/fixtures/control-008-extension-manifest.cjs")(fixed);
    let n = 2;
    const result = E.createReferenceValidationMatch(manifest, {
      firstDeck: manifest.decks.findIndex((d) =>
        d.cards.some((c) => c.referenceOfficialCardId === r.officialCardId),
      ),
      rng: () => {
        n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
        return n / 4294967296;
      },
    });
    assert(result.ok);
    const g = result.game;
    delete g.pendingReferenceChoice;
    g.turnNumber = 8;
    g.turnPlayer = "you";
    g.history = [];
    g.referenceRngState = 0;
    const p = g.players[0],
      o = g.players[1],
      pool = p.hand.concat(p.deck, p.prizeCards),
      source = pool.find(
        (c) => c.validationReference.officialCardId === r.officialCardId,
      );
    assert(source);
    if (!p.hand.includes(source)) {
      const zone = p.deck.includes(source) ? p.deck : p.prizeCards;
      zone[zone.indexOf(source)] = p.hand[0];
      p.hand[0] = source;
    }
    p.active.damage = 50;
    p.turnLimits = { supporterUsed: false, abilityUses: {} };
    if (!o.bench.length) {
      const i = o.deck.findIndex((c) => c.kind === "pokemon" && c.basic);
      if (i < 0) return { blocked: "NO_BENCH_FIXTURE_RESOURCE" };
      const mon = o.deck.splice(i, 1)[0];
      Object.assign(mon, {
        cardId: mon.id,
        damage: 0,
        enteredTurn: 0,
        energyCards: [],
        energies: [],
        tools: [],
      });
      o.bench.push(mon);
    }
    return { port: port(g), sourceId: source.id, kind };
  }
  let manifest = JSON.parse(JSON.stringify(fixed));
  if (!manifest.decks.some((d) => d.cards.some((c) => c.name === r.deckName)))
    manifest =
      require("../../tests/fixtures/control-009-extension-manifest.cjs")(
        fixed,
        [r],
      );
  for (const d of manifest.decks)
    for (const card of d.cards)
      if (card.name === r.deckName)
        card.referenceOfficialCardId = r.officialCardId;
  const locations = manifest.decks.flatMap((d, i) =>
    d.cards.filter((c) => c.name === r.deckName).map(() => ({ deck: i })),
  );
  if (!locations.length) return { blocked: "NO_VERIFICATION_DECK_ADAPTER" };
  const rocketTeamCount = kind === "attack"
    ? r.abilities.find(ability => ability.plan?.mechanic === "PASSIVE_ROCKET_TEAM_ATTACK_GATE")?.plan.required
    : undefined;
  if (kind === "attack" || m === "RECOVER_TYPED_DISCARD" || m === "ABILITY_ATTACH_SELF_DRAW" || m==="TRAINER_TOP_TYPED_SEARCH"||m==="MASS_ENERGY_ROUTE") {
    const cards = manifest.decks[locations[0].deck].cards;
    if (rocketTeamCount) {
      const teammate = [...records.values()].find(record =>
        record.name.startsWith("ロケット団の") && record.deckName !== r.deckName &&
        record.facts.basic && !record.abilities.length && record.attacks.every(attack => attack.plan) &&
        !cards.some(card => card.name === record.deckName));
      const remaining = rocketTeamCount - 1;
      const donor = cards.find(card => ["goods", "item", "support", "supporter"].includes(card.category)
        && card.count >= remaining);
      if (!teammate || !donor || remaining > 4) return { blocked: "NO_ROCKET_TEAM_FIXTURE_RESOURCE" };
      donor.count -= remaining;
      cards.push({ name: teammate.deckName, category: "pokemon", count: remaining,
        referenceOfficialCardId: teammate.officialCardId });
    }
    const references = E.getReferenceEffectCatalog({ includeExtensions: true });
    const needed = new Map();
    for (const type of e.cost || []) {
      if (type !== "無色") needed.set(type, (needed.get(type) || 0) + 1);
    }
    if (m === "RECOVER_TYPED_DISCARD") needed.set(e.plan.type, e.plan.amount);
    if(m==="ABILITY_ATTACH_SELF_DRAW"||m==="TRAINER_TOP_TYPED_SEARCH")needed.set(e.plan.type,m==="TRAINER_TOP_TYPED_SEARCH"?e.plan.amount:1);
    if(["ATTACK_ACCELERATE_BASIC_ENERGY","MASS_ENERGY_ROUTE"].includes(m)&&e.plan.type)needed.set(e.plan.type,(needed.get(e.plan.type)||0)+Math.min(e.plan.limit,4));
    if (m === "SCALED_ATTACK_DAMAGE" && e.plan.metric === "ownTeamEnergy")
      for (const type of [e.plan.type, e.plan.secondType].filter(Boolean))
        needed.set(type, (needed.get(type) || 0) + 1);
    const basicType = reference => reference?.mainPlan?.mechanic === "BASIC_ENERGY"
      ? reference.facts.basicEnergyType || reference.name.match(/^基本(.)エネルギー$/)?.[1]
      : null;
    const entryType = entry => basicType(records.get(
      entry.referenceOfficialCardId || references.defaultValidationReferences[entry.name]));
    for (const [type, count] of needed) {
      const available = cards.filter(card => entryType(card) === type)
        .reduce((total, card) => total + card.count, 0);
      if (available >= count) continue;
      const reference = [...records.values()].find(card => basicType(card) === type);
      const donors = cards.filter(card => card.category === "energy" && !needed.has(entryType(card)));
      if (!reference || donors.reduce((total, card) => total + card.count, 0) < count - available) continue;
      let missing = count - available;
      for (const donor of donors) {
        const moved = Math.min(missing, donor.count);
        donor.count -= moved;
        missing -= moved;
      }
      cards.push({name:reference.name, category:"energy", count:count - available,
        referenceOfficialCardId:reference.officialCardId});
    }
    manifest.decks[locations[0].deck].cards = cards.filter(card => card.count);
  }
  if(["ABILITY_SEARCH_TYPED_EVOLUTION","TRAINER_SEARCH_TERA","TRAINER_TYPED_DAMAGE_BOOST"].includes(m)){
    const deck=manifest.decks[locations[0].deck],plan=e.plan;
    const predicate=record=>record.category==="pokemon"&&(m==="TRAINER_SEARCH_TERA"?record.facts.teraBenchProtection===true:m==="ABILITY_SEARCH_TYPED_EVOLUTION"?record.facts.stage>0&&record.facts.types.includes(plan.type):record.facts.types.includes(plan.type)&&record.attacks.some(a=>a.plan?.mechanic==="VANILLA_DAMAGE"&&Number(a.damage)>0));
    const eligible=[...records.values()].filter(record=>predicate(record)&&record.officialCardId!==r.officialCardId);
    const names=new Set(eligible.map(record=>record.deckName));
    if(!deck.cards.some(card=>names.has(card.name))){
      const exact=eligible.find(record=>!deck.cards.some(card=>card.name===record.deckName));
      const donor=deck.cards.find(card=>card.category==="pokemon"&&card.count>1&&!card.referenceOfficialCardId);
      if(exact&&donor){donor.count--;deck.cards.push({name:exact.deckName,category:"pokemon",count:1,referenceOfficialCardId:exact.officialCardId});}
    }
  }
  if (m === "TRAINER_SWITCH_BOTH") {
    const {records: deckCatalog}=require("../../data/deck-building/catalog.json");
    const aceNames=new Set(deckCatalog.filter(card=>card.aceSpec).map(card=>card.source.identityName));
    if(aceNames.has(r.name)){
      const playerDeck=manifest.decks[locations[0].deck];
      const energy=playerDeck.cards.find(card=>card.category==="energy"&&card.name.startsWith("基本"));
      if(!energy)return {blocked:"NO_LEGAL_ACE_SPEC_FIXTURE_RESOURCE"};
      playerDeck.cards=playerDeck.cards.filter(card=>{
        if(!aceNames.has(card.name)||card.name===r.deckName)return true;
        energy.count+=card.count;
        return false;
      });
    }
  }
  if (m==="TRAINER_DISCARD_SPECIAL_ENERGY"||(["ATTACK_DISCARD_DEFENDER_ENERGY","ATTACK_COIN_DISCARD_DEFENDER_ENERGY"].includes(m) && e.plan.specialOnly)) {
    const opponentEntries = manifest.decks[1-locations[0].deck].cards;
    const ignition = [...records.values()].find(record => record.mainPlan?.mechanic === "IGNITION");
    if (!ignition) return {blocked:"NO_DEFENDER_ENERGY_FIXTURE_RESOURCE"};
    if (!opponentEntries.some(card => card.name === ignition.deckName)) {
      const donor = opponentEntries.find(card => card.category === "energy" && card.count > 1);
      if (!donor) return {blocked:"NO_DEFENDER_ENERGY_FIXTURE_RESOURCE"};
      donor.count--;
      opponentEntries.push({name:ignition.deckName,category:"energy",count:1,
        referenceOfficialCardId:ignition.officialCardId});
    }
  }
  if(e.plan.origin==='evolve'&&m!=='ABILITY_EVOLVE_MULTI_COUNTERS'){
    const deck=manifest.decks[locations[0].deck];
    const parent=[...records.values()].find(x=>x.name===r.facts.evolvesFrom&&x.facts.stage===r.facts.stage-1&&x.attacks.every(a=>a.plan)&&x.abilities.every(a=>a.plan));
    if(!parent||e.plan.requiresTera&&!parent.facts.basic)return {blocked:'NO_EXACT_EVOLUTION_PARENT_FIXTURE'};
    if(!deck.cards.some(c=>c.name===parent.deckName)){
      const donor=deck.cards.find(c=>c.category==='pokemon'&&c.name!==r.deckName&&c.count>1);
      if(!donor)return {blocked:'NO_EVOLUTION_PARENT_DECK_SLOT'};
      donor.count--;deck.cards.push({name:parent.deckName,category:'pokemon',count:1,referenceOfficialCardId:parent.officialCardId});
    }
  }
  const fixtureRequirements=fixtureResources(manifest,locations[0].deck,r,e);
  if(fixtureRequirements.teamBoostBlocked)return {blocked:fixtureRequirements.teamBoostBlocked};
  const row = {
    fixtureRequirements,
    cardName: r.deckName,
    category: r.category,
    officialCardId: r.officialCardId,
    kind: kind === "attack" || kind === "ability" ? kind : "main",
    index: idx,
    effectId: e.effectId,
    plan: e.plan,
    cost: e.cost || [],
    damage: e.damage || "0",
    rocketTeamCount,
    locations,
  };
  const frame = S.create(E, manifest, row);
  if (frame.blocked) return { blocked: frame.blocked };
  const boostBasePhysical={};
  if(e.proofTeamBoost){
    const proof=e.proofTeamBoost,own=frame.game.players[0];
    for(const energy of [...own.active.energyCards])if(energy.isSpecial){
      own.active.energyCards.splice(own.active.energyCards.indexOf(energy),1);
      own.deck.push(energy);
    }
    let pp=port(frame.game);
    const bases=own.bench.filter(c=>E.getReferenceEffectRecord(c)?.officialCardId===proof.holderChain[0]).slice(0,proof.nonStack?2:1);
    if(bases.length!==(proof.nonStack?2:1))return {blocked:'NO_TEAM_BOOST_EVOLUTION_BASE'};
    for(const base of bases){
      boostBasePhysical[base.id]=JSON.parse(JSON.stringify(base));
      if(proof.holderChain.length>1){
        const evolved=evolveTeraFixture(pp,proof.holderChain,false,0,'bench',base.id);
        if(evolved.blocked)return evolved;pp=evolved.port;
      }
    }
    if(proof.attackerChain.length>1){
      const evolved=evolveTeraFixture(pp,proof.attackerChain,false,0,'active',own.active.id);
      if(evolved.blocked)return evolved;pp=evolved.port;
    }
    if(proof.defenderChain.length>1){
      const evolved=evolveTeraFixture(pp,proof.defenderChain,false,1,'active');
      if(evolved.blocked)return evolved;pp=evolved.port;
    }
    frame.game=pp.getSnapshot();
  }
  if(m==='MASS_COUNT_COIN_DAMAGE'){
    const [own,other]=frame.game.players,plan=e.plan;
    for(const mon of [own.active,other.active])for(const energy of [...mon.energyCards])if(energy.isSpecial){
      const side=mon===own.active?own:other;
      side.deck.push(mon.energyCards.splice(mon.energyCards.indexOf(energy),1)[0]);
    }
    const attach=(side,type)=>{const valid=c=>c.kind==='energy'&&!c.isSpecial&&(!type||c.energyType===type);
      const zone=[side.deck,side.hand].find(z=>z.some(valid));if(!zone)return false;
      side.active.energyCards.push(zone.splice(zone.findIndex(valid),1)[0]);return true;};
    if(plan.metric==='ownTypedEnergy'&&!attach(own,plan.type))return {blocked:'NO_TYPED_COIN_ENERGY_FIXTURE'};
    if(plan.metric==='bothActiveEnergy'&&!attach(other,null))return {blocked:'NO_OPPONENT_COIN_ENERGY_FIXTURE'};
    if(plan.metric==='ownTypedBoard'&&![own.active,...own.bench].some(c=>E.getReferenceEffectRecord(c).facts.types.includes(plan.type)))return {blocked:'NO_TYPED_COIN_BOARD_FIXTURE'};
    if(plan.metric==='opponentBench'&&!other.bench.length)return {blocked:'NO_OPPONENT_COIN_BENCH_FIXTURE'};
  }
  if(m==='ATTACK_ATTACHED_ENERGY_COINS'){
    const own=frame.game.players[0];
    for(const energy of [...own.active.energyCards])if(energy.isSpecial){
      own.active.energyCards.splice(own.active.energyCards.indexOf(energy),1);
      own.deck.push(energy);
    }
    while(own.active.energyCards.length<2){
      const index=own.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial);
      if(index<0)return {blocked:"NO_ATTACHED_ENERGY_COIN_FIXTURE"};
      own.active.energyCards.push(own.deck.splice(index,1)[0]);
    }
  }
  if(m==='ATTACK_BASIC_DAMAGE_PROTECTION'){
    const other=frame.game.players[1],printed=E.getReferenceEffectRecord(other.active);
    const attack=printed.attacks.find(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0);
    if(!printed.facts.basic||printed.facts.types.includes(e.plan.exceptType)||!attack)return {blocked:'NO_QUALIFYING_BASIC_ATTACKER_FIXTURE'};
    for(const type of [...attack.cost.filter(t=>t!=='無色'),...attack.cost.filter(t=>t==='無色')]){
     const eligible=c=>c.kind==='energy'&&!c.isSpecial&&(type==='無色'||c.energyType===type);
     let card;
     for(const zone of [other.deck,other.hand]){
      const i=zone.findIndex(eligible);if(i>=0){card=zone.splice(i,1)[0];break;}
     }
     if(!card){const i=other.prizeCards.findIndex(eligible);if(i>=0&&other.deck.length){card=other.prizeCards[i];other.prizeCards[i]=other.deck.shift();}}
     if(!card)return {blocked:'NO_PROTECTION_ATTACK_PAYMENT'};
     other.active.energyCards.push(card);
    }
  }
  if(m==='ATTACK_ATTACH_BASIC_FROM_HAND'){
    const player=frame.game.players[0];
    const basic=card=>card.kind==='energy'&&!card.isSpecial&&['草','炎','水','雷','超','闘','悪','鋼'].includes(card.energyType);
    if(!player.hand.some(basic)){
      const index=player.deck.findIndex(basic);
      if(index<0)return {blocked:'NO_HAND_ATTACHMENT_FIXTURE_RESOURCE'};
      player.hand.push(player.deck.splice(index,1)[0]);
    }
  }
  if(m==='ABILITY_ATTACH_SELF_DRAW'){
    const own=frame.game.players[0],eligible=c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===e.plan.type;
    if(!own.hand.some(eligible)){
      const index=own.deck.findIndex(eligible);
      if(index>=0)own.hand.push(own.deck.splice(index,1)[0]);
      else {
        const prize=own.prizeCards.findIndex(eligible);
        if(prize<0||!own.deck.length)return {blocked:'NO_TYPED_HAND_ENERGY_FIXTURE'};
        own.hand.push(own.prizeCards[prize]);own.prizeCards[prize]=own.deck.shift();
      }
    }
  }
  if(["ABILITY_SEARCH_TYPED_EVOLUTION","TRAINER_SEARCH_TERA"].includes(m)){
    const own=frame.game.players[0],plan=e.plan;
    const eligible=c=>c.kind==="pokemon"&&(m==="TRAINER_SEARCH_TERA"?E.getReferenceEffectRecord(c).facts.teraBenchProtection===true:E.getReferenceEffectRecord(c).facts.stage>0&&E.getReferenceEffectRecord(c).facts.types.includes(plan.type));
    if(!own.deck.some(eligible)){
      const prize=own.prizeCards.findIndex(eligible);
      if(prize>=0&&own.deck.length){const saved=own.prizeCards[prize];own.prizeCards[prize]=own.deck.shift();own.deck.push(saved);}
      else {
        const index=own.bench.findIndex(eligible);
        if(index<0)return {blocked:"NO_EXACT_TYPED_SEARCH_RESOURCE"};
        const mon=own.bench.splice(index,1)[0];
        own.deck.push(mon);
      }
    }
  }
  if(m==='TRAINER_TEAM_DAMAGE_REDUCTION'){
    const other=frame.game.players[1],attack=E.getReferenceEffectRecord(other.active).attacks.find(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0);
    if(!attack)return {blocked:'NO_TEAM_REDUCTION_ATTACKER'};
    for(const energy of other.deck.filter(c=>c.kind==='energy'&&!c.isSpecial))other.active.energyCards.push(other.deck.splice(other.deck.indexOf(energy),1)[0]);
    if(e.plan.type&&!E.getReferenceEffectRecord(frame.game.players[0].active).facts.types.includes(e.plan.type))return {blocked:'NO_TEAM_REDUCTION_TYPED_ACTIVE'};
  }
  if(m==="TRAINER_TYPED_DAMAGE_BOOST"){
    const own=frame.game.players[0];
    const eligible=c=>E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type)&&E.getReferenceEffectRecord(c).attacks.some(a=>a.plan?.mechanic==="VANILLA_DAMAGE"&&Number(a.damage)>0);
    if(!eligible(own.active)){
      const index=own.bench.findIndex(eligible);
      if(index<0)return {blocked:"NO_TYPED_ATTACK_BOOST_FIXTURE"};
      [own.active,own.bench[index]]=[own.bench[index],own.active];
    }
    const attack=E.getReferenceEffectRecord(own.active).attacks.find(a=>a.plan?.mechanic==="VANILLA_DAMAGE"&&Number(a.damage)>0);
    for(const type of [...attack.cost.filter(t=>t!=='無色'),...attack.cost.filter(t=>t==='無色')]){
      const eligible=c=>c.kind==='energy'&&!c.isSpecial&&(type==='無色'||c.energyType===type);
      let card;
      for(const zone of [own.deck,own.hand]){
       const index=zone.findIndex(eligible);if(index>=0){card=zone.splice(index,1)[0];break;}
      }
      if(!card){const i=own.prizeCards.findIndex(eligible);if(i>=0&&own.deck.length){card=own.prizeCards[i];own.prizeCards[i]=own.deck.shift();}}
      if(!card)return {blocked:'NO_TYPED_ATTACK_PAYMENT_FIXTURE'};
      own.active.energyCards.push(card);
    }
  }
  if(kind==='attack'){
    const gate=r.abilities.find(a=>a.plan?.mechanic==='PASSIVE_CONTEXT_ATTACK_GATE')?.plan;
    if(gate?.mode==='ownHand'){
      const own=frame.game.players[0];
      while(own.hand.length<gate.required&&own.deck.length)own.hand.push(own.deck.shift());
      while(own.hand.length>gate.required)own.deck.unshift(own.hand.pop());
      if(own.hand.length!==gate.required)return {blocked:'NO_CONTEXT_ATTACK_HAND_FIXTURE'};
    }
    if(gate?.mode==='opponentExV'){
      const other=frame.game.players[1],qualifies=c=>{const name=E.getReferenceEffectRecord(c).name;return name.endsWith('ex')||/V(?:MAX|STAR)?$/.test(name);};
      if(qualifies(other.active)||!other.bench.some(qualifies))return {blocked:'NO_CONTEXT_ATTACK_BOARD_FIXTURE'};
    }
  }
  if(m==='ATTACK_OPTIONAL_ENERGY_BONUS'){
    const own=frame.game.players[0],plan=e.plan,eligible=c=>c.kind==='energy'&&!c.isSpecial&&(!plan.type||c.energyType===plan.type);
    for(const energy of [...own.active.energyCards])if(energy.isSpecial){own.active.energyCards.splice(own.active.energyCards.indexOf(energy),1);own.deck.push(energy);}
    if(!own.active.energyCards.some(eligible)){
      const i=own.deck.findIndex(eligible);if(i>=0)own.active.energyCards.push(own.deck.splice(i,1)[0]);
    }
    if(!own.active.energyCards.some(eligible))return {blocked:'NO_OPTIONAL_ENERGY_BONUS_FIXTURE'};
  }
  if(m==='SUPPORTER_SWITCH_EX_HEAL'){
    const active=frame.game.players[0].active;
    if(!E.getReferenceEffectRecord(active)?.name.endsWith('ex'))return {blocked:'NO_EX_SWITCH_HEAL_FIXTURE'};
    active.damage=Math.min(active.hp-10,e.plan.amount+10);
  }
  if(m==='SUPPORTER_MEGA_HEAL_RETURN_ENERGY'){
    const own=frame.game.players[0],target=own.active;
    if(!String(E.getReferenceEffectRecord(target).rulesText).includes('メガシンカexがきぜつしたとき'))return {blocked:'NO_EXACT_MEGA_HEAL_FIXTURE'};
    target.damage=Math.min(target.hp-10,100);
    for(const c of own.deck.filter(c=>c.kind==='energy').slice(0,2)){own.deck.splice(own.deck.indexOf(c),1);target.energyCards.push(c);}
    if(!target.energyCards.length)return {blocked:'NO_MEGA_HEAL_ENERGY_FIXTURE'};
  }
  if(m==='MASS_ATTACHED_ENERGY_MOVE'){
    const plan=e.plan,[own,other]=frame.game.players,side=plan.source.startsWith('opponent')?other:own;
    const sources=plan.source==='self'?[own.active]:plan.source==='opponentActive'?[other.active]:plan.source==='ownBench'?own.bench:[side.active,...side.bench];
    const target=plan.target==='self'?own.active:plan.target==='ownActive'?own.active:null;
    const holder=sources.find(c=>c&&c!==target);
    if(!holder)return {blocked:'NO_MOVE_SOURCE'};
    const eligible=c=>c.kind==='energy'&&!c.isSpecial&&(!plan.type||c.energyType===plan.type);
    const want=Math.min(plan.count??3,3);
    while(holder.energyCards.filter(eligible).length<want){
      const index=side.deck.findIndex(eligible);
      if(index<0)break;
      holder.energyCards.push(side.deck.splice(index,1)[0]);
    }
    if(!holder.energyCards.some(eligible))return {blocked:'NO_MOVE_ENERGY_FIXTURE'};
  }
  if(m==='MASS_ENERGY_ROUTE'){
    if(e.plan.requiresTera&&fixtureRequirements.teraChain){
      const tera=evolveTeraFixture(port(frame.game),fixtureRequirements.teraChain);
      if(tera.blocked)return tera;
      frame.game=tera.port.getSnapshot();
    }
    const own=frame.game.players[0],plan=e.plan,eligible=c=>c.kind==='energy'&&!c.isSpecial&&(!plan.type||c.energyType===plan.type);
    const targets=(plan.target==='self'?[own.active]:plan.target==='bench'?own.bench:[own.active,...own.bench]).filter(c=>!plan.holderType||E.getReferenceEffectRecord(c).facts.types.includes(plan.holderType)).filter(c=>!plan.team||E.getReferenceEffectRecord(c).name.startsWith(plan.team+'の'));
    if(!targets.length)return {blocked:'NO_MASS_ROUTE_TARGET'};
    if(plan.zone!=='deck')for(const zone of [own.deck,own.hand,own.discard].filter(zone=>zone!==own[plan.zone])){
     while(own[plan.zone].filter(eligible).length<Math.min(3,plan.limit)){
      const index=zone.findIndex(eligible);if(index<0)break;own[plan.zone].push(zone.splice(index,1)[0]);
     }
    }
    if(!own[plan.zone].some(eligible)){
     const index=own.prizeCards.findIndex(eligible);
     if(index>=0&&own.deck.length){const saved=own.prizeCards[index];own.prizeCards[index]=own.deck.shift();own[plan.zone].push(saved);}
    }
    if(!own[plan.zone].some(eligible))return {blocked:'NO_MASS_ROUTE_ENERGY'};
    if(plan.oneEach&&targets.length<2)return {blocked:'NO_TWO_DISTINCT_ROUTE_TARGETS'};
    if(plan.oneEach&&own[plan.zone].filter(eligible).length<2)return {blocked:'NO_TWO_PHYSICAL_ROUTE_ENERGIES'};
    if(plan.requiresTera&&![own.active,...own.bench].some(c=>E.getReferenceEffectRecord(c).facts.teraBenchProtection===true))return {blocked:'NO_TERA_ROUTE_FIXTURE'};
    if(plan.heal)for(const target of targets)target.damage=Math.min(target.hp-10,40);
  }
  if(m==='MASS_ZONE_TRANSFER'){
    const own=frame.game.players[0],plan=e.plan,eligible=c=>massTransferCandidate(c,plan);
    if(plan.onlyHandCard||plan.emptyHand){
      const moved=own.hand.filter(c=>!plan.onlyHandCard||c.id!==frame.sourceId);
      own.hand=own.hand.filter(c=>!moved.includes(c));own.deck.push(...moved);
    }
    if(plan.zone==='discard'){
      for(const zone of [own.deck,own.hand])while(own.discard.filter(eligible).length<plan.limit){
       const index=zone.findIndex(eligible);if(index<0)break;own.discard.push(zone.splice(index,1)[0]);
      }
    }
    if(!own[plan.zone].some(eligible)){
      const index=own.prizeCards.findIndex(eligible);
      if(index>=0&&own.deck.length){const saved=own.prizeCards[index];own.prizeCards[index]=own.deck.shift();own[plan.zone].push(saved);}
    }
    if(!own[plan.zone].some(eligible))return {blocked:'NO_MASS_TRANSFER_FIXTURE'};
  }
  if(m==='ATTACK_DISCARD_MULTIPLE_SELF_ENERGY'&&e.plan.type){
    const own=frame.game.players[0],plan=e.plan,attached=own.active.energyCards;
    // Typed cost verification uses real basic energies plus a deliberately
    // nonmatching energy; no fabricated energy symbols or physical cards.
    for(const c of [...attached])if(c.isSpecial){attached.splice(attached.indexOf(c),1);own.deck.push(c);}
    for(const type of e.cost.filter(t=>t!=='無色')){
      const required=e.cost.filter(t=>t===type).length;
      while(attached.filter(c=>c.energyType===type).length<required){
        const i=own.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===type);
        if(i<0)return {blocked:'NO_TYPED_DISCARD_PAYMENT_FIXTURE'};
        attached.push(own.deck.splice(i,1)[0]);
      }
    }
    while(attached.filter(c=>c.energyType===plan.type).length<plan.count||attached.length<e.cost.length){
      const i=own.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===plan.type);
      if(i<0)return {blocked:'NO_TYPED_DISCARD_FIXTURE'};
      attached.push(own.deck.splice(i,1)[0]);
    }
    if(!attached.some(c=>c.energyType!==plan.type)){
      const i=own.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial&&c.energyType!==plan.type);
      if(i<0)return {blocked:'NO_WRONG_TYPE_DISCARD_FIXTURE'};
      attached.push(own.deck.splice(i,1)[0]);
    }
  }
  if(m==='MASS_ENERGY_COUNT_DISCARD'){
    const own=frame.game.players[0],plan=e.plan;
    // Use real basic energies and retain all existing attack payments.
    const eligible=c=>c.kind==='energy'&&!c.isSpecial&&(!plan.type||c.energyType===plan.type);
    const dest=plan.zone==='hand'?own.hand:plan.zone==='bench'?own.bench[0]?.energyCards:own.active.energyCards;
    if(!dest)return {blocked:'NO_ENERGY_COUNT_HOLDER'};
    for(const card of own.deck.filter(eligible).slice(0,Math.min(plan.limit,2))){
      own.deck.splice(own.deck.indexOf(card),1);dest.push(card);
    }
    if(!dest.some(eligible)&&dest!==own.active.energyCards){
      // Older generic attack fixtures attach every Energy to Active. Preserve
      // exact printed attack payment and relocate only surplus physical cards.
      const remaining=[...own.active.energyCards],payment=[];
      const take=predicate=>{const i=remaining.findIndex(predicate);return i<0?null:remaining.splice(i,1)[0];};
      for(const type of (e.cost||[]).filter(t=>t!=='無色')){
        const card=take(c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===type);
        if(!card)return {blocked:'NO_ENERGY_COUNT_TYPED_PAYMENT'};
        payment.push(card);
      }
      for(const type of (e.cost||[]).filter(t=>t==='無色')){
        const card=take(c=>c.kind==='energy'&&!c.isSpecial&&!eligible(c))||take(c=>c.kind==='energy'&&!c.isSpecial);
        if(!card)return {blocked:'NO_ENERGY_COUNT_COLORLESS_PAYMENT'};
        payment.push(card);
      }
      const surplus=remaining.filter(eligible).slice(0,Math.min(plan.limit,2));
      for(const card of surplus){
        own.active.energyCards.splice(own.active.energyCards.indexOf(card),1);dest.push(card);
      }
      assert(payment.every(c=>own.active.energyCards.some(x=>x.id===c.id)));
    }
    if(!dest.some(eligible))return {blocked:'NO_ENERGY_COUNT_RESOURCE'};
    // Known special energy types are checked against physical card and holder below.
    // Never silently treat an unrecognised special energy as a basic one.
  }
  if(m==='MASS_HEAL_SCOPE'){
    const [own,other]=frame.game.players,plan=e.plan;
    const targets=plan.scope==='both'?[own.active,...own.bench,other.active,...other.bench]:plan.scope==='active'?[own.active]:plan.scope==='bench'?own.bench:[own.active,...own.bench].filter(c=>E.getReferenceEffectRecord(c).facts.basic);
    const eligible=targets.filter(c=>!plan.type||E.getReferenceEffectRecord(c).facts.types.includes(plan.type));
    if(!eligible.length)return {blocked:'NO_SCOPE_HEAL_FIXTURE'};
    for(const mon of eligible)mon.damage=Math.min(mon.hp-10,plan.amount==='all'?30:plan.amount+10);
  }
  if(m==='MASS_HAND_FLOW'){
    const [own,other]=frame.game.players,plan=e.plan;
    if(plan.mode==='revealCount'&&!other.hand.some(c=>c.kind==='pokemon')){
     const i=other.deck.findIndex(c=>c.kind==='pokemon');if(i<0)return {blocked:'NO_REVEAL_POKEMON_FIXTURE'};other.hand.push(other.deck.splice(i,1)[0]);
    }
    if(plan.mode==='rocketLimit'){
      const rocket=c=>E.getReferenceEffectRecord(c).name.startsWith('ロケット団の');
      if(!rocket(own.active)||!own.bench.some(rocket))return {blocked:'NO_ROCKET_DRAW_TEAM_FIXTURE'};
      for(const c of own.bench.filter(c=>!rocket(c))){
        if(c.evolutionCards?.length||c.energyCards?.length||c.tools?.length)return {blocked:'ROCKET_DRAW_UNEXPECTED_STACK'};
        own.bench.splice(own.bench.indexOf(c),1);
        const raw=JSON.parse(JSON.stringify(c));
        for(const key of ['cardId','damage','enteredTurn','evolvedTurn','energyCards','energies','tools','statusCondition','statusConditionInfo','entryWindow','referenceEvolutionWindow'])delete raw[key];
        own.deck.push(raw);
      }
      if(!own.deck.some(c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c).facts.basic&&!rocket(c)))return {blocked:'NO_ROCKET_DRAW_MIXED_TEAM_FIXTURE'};
      while(own.hand.length>=plan.amount){
        const index=own.hand.findIndex(c=>c.id!==frame.sourceId);
        if(index<0)return {blocked:'NO_ROCKET_DRAW_HAND_FIXTURE'};
        own.deck.push(own.hand.splice(index,1)[0]);
      }
    }
  }
  if(m==='MASS_HEAL_OWN'){
    const own=frame.game.players[0],targets=(e.plan.target==='active'?[own.active]:[own.active,...own.bench]).filter(c=>!e.plan.type||E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type));
    if(!targets.length)return {blocked:'NO_MASS_HEAL_FIXTURE'};
    for(const mon of targets)mon.damage=Math.min(mon.hp-10,e.plan.amount==='all'?70:Math.max(10,e.plan.amount+10));
  }
  if(m==='ATTACK_GUARDED_DAMAGE'){
    const g=frame.game,[own,other]=g.players,plan=e.plan;
    for(const energy of own.active.energyCards.filter(c=>c.isSpecial))
      own.deck.push(own.active.energyCards.splice(own.active.energyCards.indexOf(energy),1)[0]);
    if(plan.predicate==='opponentDamaged')other.active.damage=10;
    if(plan.predicate==='opponentStatus')other.active.statusCondition=plan.status;
    const resizeHand=(side,amount)=>{
      while(side.hand.length<amount&&side.deck.length)side.hand.push(side.deck.shift());
      while(side.hand.length>amount)side.deck.unshift(side.hand.pop());
      return side.hand.length===amount;
    };
    if(plan.predicate==='ownHandCount'&&!resizeHand(own,plan.threshold))return {blocked:'NO_EXACT_HAND_COUNT_FIXTURE'};
    if(plan.predicate==='handCountsEqual'&&!resizeHand(own,other.hand.length))return {blocked:'NO_EQUAL_HAND_COUNTS_FIXTURE'};
    if(plan.predicate==='opponentPrizeCounts'){
      while(other.prizes>plan.prizes[0]){other.hand.push(other.prizeCards.pop());other.prizes--;}
    }
    if(plan.predicate==='stadium'){
      const i=own.deck.findIndex(c=>c.kind==='stadium'&&E.getReferenceEffectRecord(c).mainPlan?.mechanic==='JAMMING');
      if(i<0)return {blocked:'NO_GUARD_STADIUM_FIXTURE'};
      g.stadium=own.deck.splice(i,1)[0];g.stadiumOwner=own.id;
    }
  }
  if(m==='MASS_BOARD_BONUS'){
    if(fixtureRequirements.namedBenchChain){
      const evolved=evolveTeraFixture(port(frame.game),fixtureRequirements.namedBenchChain,false);
      if(evolved.blocked)return evolved;
      frame.game=evolved.port.getSnapshot();
    }
    const g=frame.game,[own,other]=g.players,plan=e.plan;
    // Only the special-energy predicate keeps a real attached special energy.
    for(const card of [...own.active.energyCards])if(card.isSpecial&&plan.predicate!=='ownSpecialEnergy'){
      own.active.energyCards.splice(own.active.energyCards.indexOf(card),1);own.deck.push(card);
    }
    if(plan.predicate==='ownSpecialEnergy'&&!own.active.energyCards.some(c=>c.isSpecial))return {blocked:'NO_SPECIAL_ENERGY_PREDICATE_FIXTURE'};
    if(plan.predicate==='becameActive'){
      if(!own.bench.length)return {blocked:'NO_BENCH_TO_ACTIVE_FIXTURE'};
      const source=own.active;
      [own.active,own.bench[0]]=[own.bench[0],source];
      const swap=c=>c.cardType==='ITEM'&&E.getReferenceEffectRecord(c)?.mainPlan?.mechanic==='SWITCH';
      if(!own.hand.some(swap)){
        const i=own.deck.findIndex(swap);
        if(i<0)return {blocked:'NO_BENCH_TO_ACTIVE_SWITCH_ITEM'};
        own.hand.push(own.deck.splice(i,1)[0]);
      }
      const item=own.hand.find(swap);
      const replay=port(g);
      const moved=replay.dispatch('you',{type:'play_item',cardId:item.id,selections:{bench:[source.id]}});
      if(!moved.ok)return {blocked:'BENCH_TO_ACTIVE_SWITCH_REJECTED'};
      frame.game=replay.getSnapshot();
    }
    if(plan.predicate==='healedThisTurn'){
      const heal=c=>c.cardType==='ITEM'&&E.getReferenceEffectRecord(c)?.mainPlan?.mechanic==='HEAL_DAMAGE';
      if(!own.hand.some(heal)){
        const i=own.deck.findIndex(heal);
        if(i<0)return {blocked:'NO_SELF_HEAL_ITEM_FIXTURE'};
        own.hand.push(own.deck.splice(i,1)[0]);
      }
      own.active.damage=10;
      const replay=port(g),item=own.hand.find(heal);
      if(!replay.dispatch('you',{type:'play_item',cardId:item.id,selections:{cards:[own.active.id]}}).ok)
        return {blocked:'SELF_HEAL_ITEM_REJECTED'};
      frame.game=replay.getSnapshot();
    }
    if(plan.predicate==='stadiumPresent'){
      const i=own.deck.findIndex(c=>c.kind==='stadium'&&E.getReferenceEffectRecord(c).mainPlan?.mechanic==='JAMMING');
      if(i<0)return {blocked:'NO_STADIUM_PREDICATE_FIXTURE'};
      g.stadium=own.deck.splice(i,1)[0];g.stadiumOwner=own.id;
    }
    if(plan.predicate==='ownNamedEnergy'){
      const eligible=c=>c.kind==='energy'&&E.getReferenceEffectRecord(c)?.name===plan.name;
      const zone=[own.deck,own.hand,own.discard].find(cards=>cards.some(eligible));
      if(!zone)return {blocked:'NO_NAMED_ENERGY_PREDICATE_FIXTURE'};
      own.active.energyCards.push(zone.splice(zone.findIndex(eligible),1)[0]);
    }
    if(plan.predicate==='ownHandEmpty')own.deck.push(...own.hand.splice(0));
    if(plan.predicate==='ownDeckAtMost')own.discard.push(...own.deck.splice(plan.threshold));
    if(plan.predicate==='ownPrizesExact'||plan.predicate==='opponentPrizesExact'){
      const side=plan.predicate==='ownPrizesExact'?own:other;
      while(side.prizes>plan.threshold){side.prizes--;side.hand.push(side.prizeCards.pop());}
    }
    if(plan.predicate==='allDamagedBench')for(const mon of own.bench)mon.damage=Math.min(10,mon.hp-10);
    if(plan.predicate==='ownStadium'||plan.predicate==='stadiumContains'){
      const valid=c=>c.kind==='stadium'&&(plan.predicate==='ownStadium'||E.getReferenceEffectRecord(c)?.name.includes(plan.name));
      const zone=[own.deck,own.hand,own.discard].find(z=>z.some(valid));
      if(!zone)return {blocked:'NO_STADIUM_PREDICATE_FIXTURE'};
      g.stadium=zone.splice(zone.findIndex(valid),1)[0];g.stadiumOwner=own.id;
    }
  }
  if(m==='MASS_CONTEXT_BONUS'){
    const own=frame.game.players[0],other=frame.game.players[1],plan=e.plan;
    if(plan.predicate==='opponentStatus')other.active.statusCondition=plan.statuses[0];
    if(plan.predicate==='ownStatus')own.active.statusCondition=plan.statuses[0];
    if(plan.predicate==='equalHand'){while(own.hand.length>other.hand.length)own.deck.push(own.hand.pop());while(other.hand.length>own.hand.length)other.deck.push(other.hand.pop());}
    if(plan.predicate==='opponentBench'){
      for(let i=other.deck.length-1;i>=0&&other.bench.length<plan.threshold;i--){
       const mon=other.deck[i];if(mon.kind==='pokemon'&&E.getReferenceEffectRecord(mon).facts.basic){other.deck.splice(i,1);other.bench.push({...mon,cardId:mon.id,damage:0,enteredTurn:0,energies:[],energyCards:[],tools:[]});}
      }
      if(other.bench.length<plan.threshold)return {blocked:'NO_BENCH_THRESHOLD_FIXTURE'};
    }
    if(plan.predicate==='ownTypedBench'&&!own.bench.some(c=>E.getReferenceEffectRecord(c).facts.types.includes(plan.type)&&(plan.stage===null||E.getReferenceEffectRecord(c).facts.stage===plan.stage)))return {blocked:'NO_TYPED_BENCH_FIXTURE'};
    for(const card of [...own.active.energyCards])if(card.isSpecial){own.active.energyCards.splice(own.active.energyCards.indexOf(card),1);own.deck.push(card);}
  }
  if(m==='ABILITY_TYPED_COST_DRAW_LIMIT'){
    const own=frame.game.players[0],plan=e.plan,source=[own.active,...own.bench].find(c=>c?.id===frame.sourceId);
    const valid=c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===plan.type;
    const target=plan.zone==='attached'?source?.energyCards:own.hand;
    if(!target)return {blocked:'NO_TYPED_DRAW_HOLDER'};
    if(!target.some(valid)){
      for(const zone of [own.hand,own.deck]){
        const i=zone.findIndex(valid);if(i>=0){target.push(zone.splice(i,1)[0]);break;}
      }
    }
    if(!target.some(valid))return {blocked:'NO_TYPED_DRAW_ENERGY'};
    const keep=plan.zone==='hand'?target.find(valid):null;
    while(own.hand.length>=plan.limit){
      const i=own.hand.findIndex(c=>c!==keep);if(i<0)break;own.deck.push(own.hand.splice(i,1)[0]);
    }
  }
  if(m==='SUPPORTER_NON_RULE_DISCARD_DRAW'){
    const own=frame.game.players[0],valid=c=>c.kind==='pokemon'&&!E.getReferenceEffectRecord(c).facts.rulePokemon;
    if(!own.hand.some(valid)){const i=own.deck.findIndex(valid);if(i>=0)own.hand.push(own.deck.splice(i,1)[0]);}
    if(!own.hand.some(valid))return {blocked:'NO_NON_RULE_DRAW_COST_FIXTURE'};
  }
  if(m==='ABILITY_TYPED_COST_COUNTER'){
    const own=frame.game.players[0],valid=c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===e.plan.type;
    if(!own.hand.some(valid)){const i=own.deck.findIndex(valid);if(i>=0)own.hand.push(own.deck.splice(i,1)[0]);}
    if(!own.hand.some(valid))return {blocked:'NO_TYPED_COUNTER_COST'};
  }
  if(m==='MASS_HAND_ACQUISITION'){
    const own=frame.game.players[0];
    if(!own.deck.length)return {blocked:'NO_HAND_ACQUISITION_FIXTURE'};
    const specials=own.active.energyCards.filter(c=>c.isSpecial);
    own.active.energyCards=own.active.energyCards.filter(c=>!c.isSpecial);own.deck.push(...specials);
  }
  if(m==='MASS_COUNTER_GRAMMAR'){
    const plan=e.plan,other=frame.game.players[1],own=frame.game.players[0];
    if(plan.mode==='multiply'){other.active.damage=10;if(other.bench.length)other.bench[0].damage=20;}
    if(plan.mode==='hand'&&!own.hand.length&&own.deck.length)own.hand.push(own.deck.shift());
    if(plan.mode==='remaining'){
      const pool=plan.scope==='active'?[other.active]:plan.scope==='bench'?other.bench:[other.active,...other.bench];
      if(!pool.some(c=>c.hp>plan.remaining))return {blocked:'NO_REMAINING_HP_POSITIVE_FIXTURE'};
      for(const c of pool)c.damage=0;
    }
  }
  if(m==='MASS_PLACE_COUNTERS'&&e.plan.target==='damagedOpponent'){
    const other=frame.game.players[1];other.active.damage=10;
    for(const mon of other.bench)mon.damage=0;
  }
  if(m==='INSPECTED_OPPONENT_HAND_TRANSFER'){
    const other=frame.game.players[1],plan=e.plan,eligible=c=>{const k=E.getReferenceEffectRecord(c)?.category;return plan.filter==='any'||plan.filter==='itemTool'&&['item','tool'].includes(k)||plan.filter===k;};
    if(!other.hand.some(eligible)){const i=other.deck.findIndex(eligible);if(i>=0)other.hand.push(other.deck.splice(i,1)[0]);}
    if(!other.hand.some(eligible))return {blocked:'NO_INSPECTED_HAND_POSITIVE_FIXTURE'};
  }
  if(m==='ABILITY_DISCARD_DRAW'){
    const own=frame.game.players[0];
    while(own.hand.length<e.plan.cost&&own.deck.length>e.plan.amount)own.hand.push(own.deck.shift());
    if(own.hand.length<e.plan.cost||!own.deck.length)return {blocked:'NO_ABILITY_COST_FIXTURE'};
  }
  if(m==='SUPPORTER_ORDERED_BOTTOM_DRAW'){
    const own=frame.game.players[0];
    while(own.hand.filter(c=>c.id!==frame.sourceId).length<e.plan.count){
      const donor=own.deck.shift();if(!donor)return {blocked:'NO_BOTTOM_COST_FIXTURE'};own.hand.push(donor);
    }
    if(own.deck.length<e.plan.draw)return {blocked:'NO_BOTTOM_DRAW_FIXTURE'};
  }
  if(m==='SUPPORTER_DISCARD_ONE_DRAW_TO_SIX'){
    const player=frame.game.players[0];
    if(!player.hand.some(card=>card.id!==frame.sourceId)){
      const donor=player.deck.shift();
      if(!donor)return {blocked:'NO_HAND_DISCARD_FIXTURE_RESOURCE'};
      player.hand.push(donor);
    }
  }
  if (["TRAINER_TOP_TYPED_SEARCH","TRAINER_TOP_POKEMON_TRAINER"].includes(m)){
    const own=frame.game.players[0],plan=e.plan;
    const category=c=>m==="TRAINER_TOP_TYPED_SEARCH"?(c.kind==="pokemon"&&E.getReferenceEffectRecord(c).facts.types.includes(plan.type)?"pokemon":c.kind==="energy"&&!c.isSpecial&&c.energyType===plan.type?"energy":null):c.kind==="pokemon"?"pokemon":["item","supporter","tool","stadium"].includes(E.getReferenceEffectRecord(c)?.category)?"trainer":null;
    const eligible=own.deck.filter(category);
    if(!eligible.length)return {blocked:"NO_TOP_SEARCH_FIXTURE"};
    const selected=m==="TRAINER_TOP_POKEMON_TRAINER"?[eligible.find(c=>category(c)==="pokemon"),eligible.find(c=>category(c)==="trainer")].filter(Boolean):eligible.slice(0,plan.amount);
    own.deck=[...selected,...own.deck.filter(c=>!selected.includes(c))];
  }
  if(m==="ATTACK_DISCARD_TOOL_BEFORE_DAMAGE"){
    const [own,other]=frame.game.players;
    const zone=[other.deck,other.hand,other.prizeCards].find(cards=>cards.some(c=>c.kind==="tool"));
    if(!zone)return {blocked:"NO_TOOL_DISCARD_FIXTURE"};
    other.active.tools.push(zone.splice(zone.findIndex(c=>c.kind==="tool"),1)[0]);
    if(zone===other.prizeCards&&other.deck.length)other.prizeCards.push(other.deck.shift());
    for(const energy of [...own.active.energyCards])if(energy.isSpecial){own.active.energyCards.splice(own.active.energyCards.indexOf(energy),1);own.deck.push(energy);}
  }
  if (m === "ATTACK_DISCARD_STADIUM" || e.plan.requiresStadium) {
    const owner = frame.game.players[1];
    const zone = [owner.deck, owner.hand, owner.prizeCards]
      .find(cards => cards.some(card => card.kind === "stadium"));
    if (!zone) return {blocked:"NO_STADIUM_FIXTURE_RESOURCE"};
    const [stadium] = zone.splice(zone.findIndex(card => card.kind === "stadium"), 1);
    frame.game.stadium = stadium;
    frame.game.stadiumOwner = owner.id;
    if (zone === owner.prizeCards && owner.deck.length) owner.prizeCards.push(owner.deck.shift());
  }
  if (m === "ATTACK_ATTACHED_TOOL_COUNT") {
    const [own, opponent] = frame.game.players;
    let attached = false;
    for (const side of e.plan.bothSides ? [opponent, own] : [own]) {
      if (side.active.tools?.length) {
        attached = true;
        continue;
      }
      const zone = [side.deck, side.hand, side.prizeCards]
        .find(cards => cards.some(card => card.kind === "tool"));
      if (!zone) continue;
      const [tool] = zone.splice(zone.findIndex(card => card.kind === "tool"), 1);
      side.active.tools = [tool];
      attached = true;
    }
    if (!attached) return {blocked:"NO_ATTACHED_TOOL_FIXTURE_RESOURCE"};
  }
  if (["RECOIL_DAMAGE", "HEAL_SELF_ATTACK", "COIN_UNTIL_TAILS_MILL", "COIN_UNTIL_TAILS_DAMAGE", "FIXED_COIN_HITS", "VANILLA_DAMAGE", "ATTACK_UNDAMAGED_BONUS", "ATTACK_ATTACHED_TOOL_COUNT", "BENCH_COUNT_DAMAGE", "FULL_BENCH_REQUIRED_DAMAGE", "SELF_COUNTER_DAMAGE", "COIN_BONUS_DAMAGE", "DISCARD_ONE_SELF_ENERGY_ATTACK", "ATTACK_SPLASH_DAMAGE", "ATTACK_DISCARD_OPPONENT_DECK_TOP", "ATTACK_DISCARD_HAND_DRAW", "ATTACK_IGNORE_DAMAGE_RULES", "ANY_DAMAGE"].includes(m)) {
    const p = frame.game.players[0];
    for (const energy of [...p.active.energyCards])
      if (energy.isSpecial) {
        p.active.energyCards.splice(p.active.energyCards.indexOf(energy), 1);
        p.deck.push(energy);
      }
  }
  if (m === "DISCARD_TO_SEARCH_DISTINCT_CATEGORIES") {
    const own = frame.game.players[0];
    // Leave the source in hand and add usable costs without hiding deck categories.
    while (own.hand.length <= e.plan.cost) {
      const index = own.deck.findIndex(card => card.kind === "pokemon" || card.kind === "energy");
      if (index < 0) return { blocked: "NO_HAND_DISCARD_FIXTURE_RESOURCE" };
      own.hand.push(own.deck.splice(index, 1)[0]);
    }
  }
  if (m === "SEARCH_REVEAL_TO_HAND_ATTACK" && e.plan.filter === "basicEnergy") {
    const player = frame.game.players[0];
    const attached = player.active.energyCards;
    const required = new Set(e.cost);
    const candidates = attached.filter(card => !card.isSpecial)
      .sort((a, b) => Number(required.has(a.energyType)) - Number(required.has(b.energyType)));
    for (const card of candidates.slice(0, e.plan.limit))
      player.deck.push(attached.splice(attached.indexOf(card), 1)[0]);
  }
  if (m === "SELF_COUNTER_DAMAGE") frame.game.players[0].active.damage = 20;
  if (m === "HEAL_SELF_ATTACK")
    frame.game.players[0].active.damage = Math.min(
      40,
      frame.game.players[0].active.hp - 10,
    );
  if (m === "HEAL_LOW_HP_FULL") {
    const mon=frame.game.players[0].active;
    mon.damage=Math.max(10,mon.hp-e.plan.threshold);
  }
  if (m === "RECOVER_NON_RULE_AND_ENERGY") {
    const own=frame.game.players[0],eligible=c=>c.kind==="pokemon"?!E.getReferenceEffectRecord(c).facts.rulePokemon:c.kind==="energy"&&!c.isSpecial;
    for(const zone of [own.deck,own.hand]){
      while(own.discard.filter(eligible).length<e.plan.amount){
        const i=zone.findIndex(eligible);if(i<0)break;
        own.discard.push(zone.splice(i,1)[0]);
      }
    }
  }
  if (["ATTACK_EVOLUTION_BONUS_DISCARD","ATTACK_PRIZE_BONUS_DISCARD"].includes(m)){
    const own=frame.game.players[0];
    for(const energy of [...own.active.energyCards])if(energy.isSpecial){
      own.active.energyCards.splice(own.active.energyCards.indexOf(energy),1);own.deck.push(energy);
    }
    if(m==="ATTACK_PRIZE_BONUS_DISCARD"&&frame.game.players[1].prizes>1){
      frame.game.players[1].prizes--;frame.game.players[1].hand.push(frame.game.players[1].prizeCards.pop());
    }
  }
  if (m === "HEAL_DAMAGE") frame.game.players[0].active.damage = 40;
  if (["RECOVER_TYPED_DISCARD", "RECOVER_BASIC_ENERGY"].includes(m)) {
    const p = frame.game.players[0],
      eligible = (c) =>
        c.kind === "pokemon"
          ? m === "RECOVER_TYPED_DISCARD" && E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type)
          : c.kind === "energy" && !c.isSpecial && (!e.plan.type || c.energyType === e.plan.type);
    const resources = [p.deck, p.hand, p.prizeCards];
    while (p.discard.filter(eligible).length < e.plan.amount) {
      const zone = resources.find(cards => cards.some(eligible));
      if (!zone) break;
      p.discard.push(zone.splice(zone.findIndex(eligible), 1)[0]);
    }
    while (p.prizeCards.length < p.prizes && p.deck.length) p.prizeCards.push(p.deck.shift());
  }
  if (m === "RETREAT_LOCK_ATTACK") {
    const opponent = frame.game.players[1];
    const cost = opponent.active.retreatCost;
    const payment = opponent.deck.filter(card => card.kind === "energy" && !card.isSpecial).slice(0, cost);
    if (payment.length !== cost) return { blocked: "NO_RETREAT_PAYMENT_FIXTURE" };
    for (const card of payment)
      opponent.active.energyCards.push(opponent.deck.splice(opponent.deck.indexOf(card), 1)[0]);
  }
  if (m === "ATTACK_DAMAGE_REDUCTION"||m==="ATTACK_BASIC_DAMAGE_PROTECTION") {
    const opponent = frame.game.players[1];
    for (const card of opponent.deck.filter(card => card.kind === "energy" && !card.isSpecial))
      opponent.active.energyCards.push(opponent.deck.splice(opponent.deck.indexOf(card), 1)[0]);
  }
  // The official active-only healing supporter needs a damaged Active fixture.
  if(m==="TRAINER_DISCARD_SPECIAL_ENERGY"){
    const other=frame.game.players[1],zone=[other.deck,other.hand,other.prizeCards].find(cards=>cards.some(c=>c.kind==="energy"&&c.isSpecial));
    if(!zone)return {blocked:"NO_SPECIAL_ENERGY_FIXTURE"};
    const target=other.bench[0]||other.active;
    target.energyCards.push(zone.splice(zone.findIndex(c=>c.kind==="energy"&&c.isSpecial),1)[0]);
    if(zone===other.prizeCards&&other.deck.length)other.prizeCards.push(other.deck.shift());
    const basic=other.deck.findIndex(c=>c.kind==="energy"&&!c.isSpecial);
    if(basic>=0)target.energyCards.push(other.deck.splice(basic,1)[0]);
  }
  if(m==="TOOL_LOW_HP_RETREAT_DISCOUNT"){
    const own=frame.game.players[0];
    own.active.damage=Math.max(0,own.active.hp-e.plan.threshold-10);
  }
  if (m === "HEAL_ACTIVE_DAMAGE") frame.game.players[0].active.damage = 40;
  if (m === "FULL_BENCH_REQUIRED_DAMAGE" && !e.plan.requiresStadium) {
    const player = frame.game.players[0];
    const basics = player.deck.filter(card => card.kind === "pokemon" && E.getReferenceEffectRecord(card).facts.basic);
    for (const card of basics.slice(0, e.plan.minimum - player.bench.length)) {
      player.deck.splice(player.deck.indexOf(card), 1);
      player.bench.push({...card, cardId:card.id, enteredTurn:0, damage:0, energies:[], energyCards:[], tools:[]});
    }
    assert(player.bench.length >= e.plan.minimum);
  }
  if (m === "ACTIVE_TOP_SUPPORTER_SEARCH") {
    const deck=frame.game.players[0].deck;
    const supporters=deck.filter(card=>card.cardType==="SUPPORTER");
    assert(supporters.length>=2);
    for (const [card, position] of [[supporters[0],0],[supporters[1],6]]) {
      deck.splice(deck.indexOf(card),1);
      deck.splice(position,0,card);
    }
  }
  if (m === "CONDITIONAL_ATTACK_BONUS") {
    const [own, opponent] = frame.game.players;
    if (e.plan.predicate === "opponentDamaged") opponent.active.damage = 10;
    if (e.plan.predicate === "ownBenchDamaged" && own.bench.length) own.bench[0].damage = 10;
  }
  if(m==='ATTACK_MOVE_BENCH_COUNTERS'){
    const own=frame.game.players[0],source=own.bench.find(c=>!e.plan.team||E.getReferenceEffectRecord(c).name.startsWith(e.plan.team+'の'));
    if(!source||source.hp<=40)return {blocked:'NO_DAMAGED_BENCH_COUNTER_SOURCE_FIXTURE'};
    source.damage=40;
  }
  if(m==='ATTACK_SPREAD_DAMAGE'&&e.plan.counterUnit)frame.game.players[1].active.damage=20;
  if(m==='ATTACK_SPREAD_DAMAGE'&&e.plan.requiresDamage){
    const bench=frame.game.players[1].bench;
    if(!bench.length)return {blocked:'NO_DAMAGED_BENCH_FIXTURE'};
    bench[0].damage=10;
  }
  if(m==='ATTACK_SPREAD_DAMAGE'&&e.plan.prizeUnit){
    const other=frame.game.players[1];
    if(!other.bench.length||!other.prizeCards.length)return {blocked:'NO_PRIZE_SCALED_BENCH_FIXTURE'};
    other.hand.push(other.prizeCards.pop());other.prizes--;
  }
  if(m==='ATTACK_RECYCLE_BASIC_ENERGY'){
    const own=frame.game.players[0],energy=c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===e.plan.type;
    if(!own.discard.some(energy)){
      const zone=[own.deck,own.hand].find(cards=>cards.some(energy));
      if(!zone)return {blocked:'NO_RECYCLABLE_TYPED_ENERGY'};
      own.discard.push(zone.splice(zone.findIndex(energy),1)[0]);
    }
  }
  if(m==='ATTACK_DISCARD_OPPONENT_ATTACHMENTS'){
    const other=frame.game.players[1];
    const attach=(test,list)=>{
      const zone=[other.deck,other.hand].find(cards=>cards.some(test));
      if(!zone)return false;
      list.push(zone.splice(zone.findIndex(test),1)[0]);return true;
    };
    if(!other.bench.length)return {blocked:'NO_ATTACHED_DISCARD_BENCH_FIXTURE'};
    if(!attach(c=>c.kind==='energy'&&c.isSpecial,other.active.energyCards))return {blocked:'NO_SPECIAL_ENERGY_DISCARD_FIXTURE'};
    if(!attach(c=>c.kind==='energy'&&!c.isSpecial,other.bench[0].energyCards))return {blocked:'NO_BASIC_ENERGY_PRESERVATION_FIXTURE'};
    if(e.plan.tools&&!attach(c=>c.kind==='tool',other.bench[0].tools))return {blocked:'NO_TOOL_DISCARD_FIXTURE'};
  }
  if (m === "ATTACK_SPREAD_DAMAGE" && e.plan.ignoreDefense)
    frame.game.players[1].active.referenceProtection={opponentTurn:frame.game.turnNumber};
  if(m==='ATTACK_SPREAD_DAMAGE'&&(e.plan.filter||e.plan.metric||e.plan.scope==='bothBench')){
    const own=frame.game.players[0],other=frame.game.players[1],plan=e.plan;
    if(!other.bench.length||plan.scope==='bothBench'&&!own.bench.length)return {blocked:'NO_FILTERED_SPREAD_BENCH'};
    if(plan.filter==='damaged'){
      for(const side of plan.scope==='bothBench'?[own,other]:[other]){
        if(side.bench.length<2)return {blocked:'NO_DAMAGED_AND_UNDAMAGED_BENCH'};
        side.bench.forEach((c,i)=>{c.damage=i===0?10:0;});
      }
    }
    if(plan.filter==='ex'||plan.filter==='exV'){
      const eligible=c=>{const name=E.getReferenceEffectRecord(c)?.name||'';return name.endsWith('ex')||plan.filter==='exV'&&/V(?:MAX|STAR|-UNION)?$/.test(name);};
      if(!other.bench.some(eligible)||!other.bench.some(c=>!eligible(c)))return {blocked:'NO_RULE_AND_NON_RULE_SPREAD_FIXTURE'};
    }
    if(plan.metric==='opponentPrizesTaken'){
      while(other.prizes>4){other.hand.push(other.prizeCards.pop());other.prizes--;}
      if(other.prizes!==4)return {blocked:'NO_SPREAD_PRIZE_FIXTURE'};
    }
  }
  if(m==='ATTACK_SPREAD_DAMAGE'&&e.plan.discardAttached!==undefined){
    const own=frame.game.players[0],other=frame.game.players[1],attached=own.active.energyCards;
    const required=Number.isInteger(e.plan.discardAttached)?e.plan.discardAttached:1;
    // Use real physical basic energy and ensure a nonempty discard fixture.
    while(attached.filter(c=>!c.isSpecial).length<required){
      const i=own.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial);
      if(i<0)return {blocked:'NO_COMPOUND_SPREAD_ENERGY_FIXTURE'};
      attached.push(own.deck.splice(i,1)[0]);
    }
    if(other.bench.length<Math.min(e.plan.count,e.plan.scope==='opponent'?e.plan.count-1:e.plan.count))return {blocked:'NO_COMPOUND_SPREAD_TARGETS'};
  }
  if(m==='MASS_COIN_OUTCOME'){
    const [own,other]=frame.game.players;
    if(e.plan.heal)own.active.damage=Math.min(e.plan.heal,own.active.hp-10);
    for(const energy of [...own.active.energyCards])if(energy.isSpecial){own.active.energyCards.splice(own.active.energyCards.indexOf(energy),1);own.deck.push(energy);}
  }
  if(m==='MASS_MILL_COUNT_DAMAGE'){
    const plan=e.plan,own=frame.game.players[0];
    const filter=c=>plan.filter==='typedBasic'?c.kind==='energy'&&!c.isSpecial&&c.energyType===plan.type:plan.filter==='energy'?c.kind==='energy':plan.filter==='trainer'?['item','supporter','tool','stadium'].includes(E.getReferenceEffectRecord(c)?.category):c.kind==='pokemon'&&E.getReferenceEffectRecord(c).name.startsWith(plan.team+'の');
    for(const side of plan.scope==='both'?frame.game.players:[own]){
      const index=side.deck.findIndex(filter);
      if(index>=0)side.deck.unshift(side.deck.splice(index,1)[0]);
    }
    if(!(plan.scope==='both'?frame.game.players:[own]).some(side=>side.deck.slice(0,plan.limit).some(filter)))return {blocked:'NO_MILL_POSITIVE_FIXTURE'};
  }
  if (m === "SCALED_ATTACK_DAMAGE") {
    if(fixtureRequirements.namedBenchChain){
      const evolved=evolveTeraFixture(port(frame.game),fixtureRequirements.namedBenchChain,false);
      if(evolved.blocked)return evolved;
      frame.game=evolved.port.getSnapshot();
    }
    const [own, opponent] = frame.game.players;
    if(e.plan.metric==='opponentHandTrainerCount'){
      const trainer=c=>['item','supporter','tool','stadium'].includes(E.getReferenceEffectRecord(c)?.category);
      if(!opponent.hand.some(trainer)){
        const i=opponent.deck.findIndex(trainer);if(i>=0)opponent.hand.push(opponent.deck.splice(i,1)[0]);
      }
      if(!opponent.hand.some(trainer))return {blocked:'NO_HAND_TRAINER_COUNT_FIXTURE'};
    }
    if(e.plan.metric==="ownTeamEnergy"&&own.bench.length){
      const index=own.active.energyCards.findIndex(energy=>!energy.isSpecial&&[e.plan.type,e.plan.secondType].includes(energy.energyType)
        &&own.active.energyCards.filter(card=>!card.isSpecial&&card.energyType===energy.energyType).length>e.cost.filter(type=>type===energy.energyType).length);
      if(index>=0&&own.active.energyCards.filter(card=>!card.isSpecial).length>e.cost.length)
        own.bench[0].energyCards.push(own.active.energyCards.splice(index,1)[0]);
    }
    if (e.plan.metric === "opponentCounters") opponent.active.damage = 20;
    if (e.plan.metric === "ownCounters") own.active.damage = 20;
    if (e.plan.metric === "opponentTeamCounters") for (const mon of [opponent.active,...opponent.bench]) mon.damage=10;
    if(e.plan.metric==='ownBenchTeamCounters'){
      const targets=own.bench.filter(c=>E.getReferenceEffectRecord(c).name.startsWith(e.plan.team+'の'));
      if(!targets.length)return {blocked:'NO_TEAM_COUNTER_FIXTURE'};
      for(const c of own.bench)c.damage=targets.includes(c)?20:10;
    }
    if(['ownNamedTeamEnergy','ownBenchWithTypedEnergy'].includes(e.plan.metric)){
      const plan=e.plan,eligible=c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===plan.type;
      const targets=own.bench.filter(c=>plan.metric==='ownBenchWithTypedEnergy'||E.getReferenceEffectRecord(c).name.startsWith(plan.team+'の'));
      if(!targets.length)return {blocked:'NO_TYPED_ENERGY_BENCH_FIXTURE'};
      const zone=[own.deck,own.hand].find(z=>z.some(eligible));
      if(zone)targets[0].energyCards.push(zone.splice(zone.findIndex(eligible),1)[0]);
      else {
        const attached=own.active.energyCards;
        const typed=attached.filter(eligible).length;
        if(typed<=e.cost.filter(t=>t===plan.type).length||attached.filter(c=>!c.isSpecial).length<=e.cost.length)return {blocked:'NO_EXTRA_TYPED_ENERGY_FIXTURE'};
        targets[0].energyCards.push(attached.splice(attached.findIndex(eligible),1)[0]);
      }
      if(!targets[0].energyCards.some(eligible))return {blocked:'NO_POSITIVE_TYPED_ENERGY_FIXTURE'};
    }
    if(e.plan.metric==='ownBenchNamedCounters')for(const c of own.bench)if(E.getReferenceEffectRecord(c).name===e.plan.name)c.damage=20;
    if(['ownAttachedSpecialCards','opponentAttachedSpecialCards'].includes(e.plan.metric)){
      const side=e.plan.metric.startsWith('opponent')?opponent:own;
      const holders=e.plan.metric.startsWith('opponent')?side.bench:[side.active];
      const special=c=>c.kind==='energy'&&c.isSpecial&&E.getReferenceEffectRecord(c)?.mainPlan?.mechanic==='IGNITION';
      const zone=[side.deck,side.hand].find(cards=>cards.some(special));
      if(!zone||!holders.length)return {blocked:'NO_PHYSICAL_SPECIAL_ENERGY_COUNT_FIXTURE'};
      holders[0].energyCards.push(zone.splice(zone.findIndex(special),1)[0]);
    }
    if(e.plan.metric==='ownDistinctBasicTypes'&&own.bench.length){
      const costs=e.cost.filter(t=>t!=='無色');
      const basics=own.active.energyCards.filter(c=>!c.isSpecial);
      const payment=[];
      for(const type of costs){
        const card=basics.find(c=>c.energyType===type&&!payment.includes(c));
        if(!card)return {blocked:'MISSING_DISTINCT_TYPES_ATTACK_PAYMENT'};
        payment.push(card);
      }
      for(const card of basics.sort((a,b)=>Number(costs.includes(b.energyType))-Number(costs.includes(a.energyType))))
        if(payment.length<e.cost.length&&!payment.includes(card))payment.push(card);
      for(const card of basics)if(!payment.includes(card))own.deck.push(own.active.energyCards.splice(own.active.energyCards.indexOf(card),1)[0]);
      const candidate=own.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial&&!payment.some(a=>a.energyType===c.energyType));
      if(candidate>=0)own.bench[0].energyCards.push(own.deck.splice(candidate,1)[0]);
    }
    if(e.plan.metric==='ownBenchTypedCounters')for(const c of own.bench)if(E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type))c.damage=10;
    if (e.plan.metric === "ownDamagedBenchCount" && own.bench.length) own.bench[0].damage=10;
    if (e.plan.metric === "ownPrizesTaken" && own.prizeCards.length>1) {own.prizes--;own.hand.push(own.prizeCards.pop());}
    if (["opponentEnergy", "opponentTeamEnergy", "bothActiveEnergy", "bothTeamEnergy"].includes(e.plan.metric)) {
      const targets = ["opponentEnergy","bothActiveEnergy"].includes(e.plan.metric) ? [opponent.active] : [opponent.active, ...opponent.bench];
      for (const target of targets) {
        const index = opponent.deck.findIndex(card => card.kind === "energy" && !card.isSpecial);
        if (index >= 0) target.energyCards.push(opponent.deck.splice(index, 1)[0]);
      }
    }
    for (const energy of [...own.active.energyCards]) {
      if (!energy.isSpecial||e.plan.metric==='ownAttachedSpecialCards') continue;
      own.active.energyCards.splice(own.active.energyCards.indexOf(energy), 1);
      own.deck.push(energy);
    }
    if (e.plan.metric === "opponentPrizesTaken") {
      opponent.prizes--;
      opponent.hand.push(opponent.prizeCards.pop());
    }
    if(e.plan.metric==='ownDamagedCount')own.active.damage=10;
    const discardFilters={
      opponentDiscardBasic:c=>c.kind==='energy'&&!c.isSpecial,
      opponentDiscardItem:c=>E.getReferenceEffectRecord(c)?.category==='item',
      ownDiscardNamedCard:c=>E.getReferenceEffectRecord(c)?.name===e.plan.name,
      ownDiscardSupporterContains:c=>E.getReferenceEffectRecord(c)?.category==='supporter'&&E.getReferenceEffectRecord(c).name.includes(e.plan.name),
      ownDiscardTypedPokemon:c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c)?.facts.types.includes(e.plan.type),
      ownDiscardNamedAttack:c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c)?.attacks.some(a=>a.name===e.plan.name)
    };
    const filter=discardFilters[e.plan.metric];
    if(filter){
      const side=e.plan.metric.startsWith('opponent')?opponent:own;
      if(!side.discard.some(filter)){
        for(const zone of [side.deck,side.hand,side.prizeCards]){
          const index=zone.findIndex(filter);
          if(index<0||zone===side.prizeCards&&!side.deck.length)continue;
          side.discard.push(zone.splice(index,1)[0]);
          if(zone===side.prizeCards)side.prizeCards.push(side.deck.shift());
          break;
        }
      }
    }
    if (e.plan.metric === "ownDiscardEnergy") {
      const index = own.deck.findIndex(card => card.kind === "energy");
      if (index >= 0) own.discard.push(own.deck.splice(index, 1)[0]);
    }
  }
  if (["ATTACK_OPTIONAL_DRAW_TO_LIMIT","ATTACK_HEAL_OWN_TARGET","ATTACK_DISCARD_DEFENDER_ENERGY",
    "ATTACK_DISCARD_FIELD_BASIC","ATTACK_COIN_DISCARD_DEFENDER_ENERGY","CONTEXT_ATTACK_BONUS","ATTACK_PRIZE_BONUS_RECOIL"].includes(m)) {
    const [own, other] = frame.game.players;
    if (m === "ATTACK_OPTIONAL_DRAW_TO_LIMIT") {
      own.deck.push(...own.hand.splice(Math.max(0,e.plan.limit-1)));
    }
    if (m === "ATTACK_HEAL_OWN_TARGET") own.active.damage = 20;
    if (["ATTACK_DISCARD_DEFENDER_ENERGY","ATTACK_COIN_DISCARD_DEFENDER_ENERGY"].includes(m)) {
      const eligible = card => card.kind === "energy" && !!card.isSpecial === e.plan.specialOnly&&(!e.plan.type||card.energyType===e.plan.type);
      if(e.plan.defenderEx&&!E.getReferenceEffectRecord(other.active).name.endsWith('ex'))return {blocked:'NO_EX_DEFENDER_FIXTURE'};
      const zone = [other.deck, other.hand, other.prizeCards].find(cards => cards.some(eligible));
      if (!zone) return {blocked:"NO_DEFENDER_ENERGY_FIXTURE_RESOURCE"};
      other.active.energyCards.push(zone.splice(zone.findIndex(eligible), 1)[0]);
      if (zone === other.prizeCards && other.deck.length) other.prizeCards.push(other.deck.shift());
      if(e.plan.type){
        const wrong=c=>c.kind==='energy'&&!c.isSpecial&&c.energyType!==e.plan.type;
        const otherZone=[other.deck,other.hand].find(z=>z.some(wrong));
        if(!otherZone)return {blocked:'NO_WRONG_TYPE_DEFENDER_ENERGY_FIXTURE'};
        other.active.energyCards.push(otherZone.splice(otherZone.findIndex(wrong),1)[0]);
      }
    }
    if (m === "ATTACK_DISCARD_FIELD_BASIC" && own.bench.length) {
      const energies = own.active.energyCards.filter(card => !card.isSpecial);
      if (energies.length > e.cost.length) {
        const energy = energies.find(card => !e.cost.includes(card.energyType));
        if (energy) own.bench[0].energyCards.push(own.active.energyCards.splice(own.active.energyCards.indexOf(energy),1)[0]);
      }
    }
    if (m === "CONTEXT_ATTACK_BONUS") {
      if (e.plan.predicate === "opponentPoisoned") other.active.statusCondition = "POISONED";
      if (e.plan.predicate === "ownPoisoned") own.active.statusCondition = "POISONED";
      if (e.plan.predicate === "ownDamaged") own.active.damage = 10;
      const side = e.plan.predicate === "ownTool" ? own : e.plan.predicate === "opponentTool" ? other : null;
      if (side) {
        const index = side.deck.findIndex(card => E.getReferenceEffectRecord(card)?.mainPlan?.mechanic === "CIRCULATOR");
        if (index >= 0) side.active.tools.push(side.deck.splice(index,1)[0]);
      }
    }
    if (["CONTEXT_ATTACK_BONUS","ATTACK_PRIZE_BONUS_RECOIL","ATTACK_OPTIONAL_DRAW_TO_LIMIT"].includes(m)) {
      const specials=own.active.energyCards.filter(energy=>energy.isSpecial);
      own.active.energyCards=own.active.energyCards.filter(energy=>!energy.isSpecial);
      own.deck.push(...specials);
    }
  }
  if(m==="ATTACK_ACCELERATE_BASIC_ENERGY"){
    const own=frame.game.players[0],eligible=c=>c.kind==="energy"&&!c.isSpecial&&(!e.plan.type||c.energyType===e.plan.type);
    const targets=(e.plan.target==="self"?[own.active]:e.plan.target==="bench"?own.bench:[own.active,...own.bench]).filter(c=>!e.plan.holderType||E.getReferenceEffectRecord(c).facts.types.includes(e.plan.holderType));
    if(!targets.length)return {blocked:"NO_ACCELERATION_TARGET_FIXTURE"};
    if(e.plan.zone==="discard"){
      for(const zone of [own.deck,own.hand]){
       while(own.discard.filter(eligible).length<e.plan.limit){
        const index=zone.findIndex(eligible);if(index<0)break;
        own.discard.push(zone.splice(index,1)[0]);
       }
      }
    }
    if(!own[e.plan.zone].some(eligible))return {blocked:"NO_ACCELERATION_ENERGY_FIXTURE"};
  }
  if(m==='ATTACK_NAMED_DISCARD_BENCH'){
    const own=frame.game.players[0],plan=e.plan;
    if(own.bench.length>=5||!own.discard.some(c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c)?.facts.basic&&E.getReferenceEffectRecord(c).name===plan.name))return {blocked:'NO_NAMED_DISCARD_BENCH_FIXTURE'};
  }
  if(e.plan.batchSearch){
    const own=frame.game.players[0];
    if(m==='SEARCH_BASIC_TO_BENCH_ATTACK'&&own.bench.length>=5)return {blocked:"NO_BENCH_SEARCH_SPACE"};
    if(!own.deck.some(c=>batchSearchCandidate(c,e.plan)))return {blocked:"NO_EXACT_SEARCH_FIXTURE_RESOURCE"};
  }
  if((['ABILITY_EVOLVE_MULTI_COUNTERS','ATTACK_OPTIONAL_RETURN_POKEMON'].includes(m)||m==='MASS_BOARD_BONUS'&&e.plan.predicate==='evolvedFromThisTurn')&&!r.facts.basic){
    const chain=fixtureRequirements.evolvedSourceChain;
    if(!chain)return {blocked:'NO_EVOLVED_SOURCE_FULL_LINE'};
    const own=frame.game.players[0],child=own.active;
    if(child.id!==frame.sourceId)return {blocked:'NO_EVOLVED_SOURCE_PRINT'};
    const initial=Array.from(S.identities(frame.game)),energy=[...(child.energyCards||[])],tools=[...(child.tools||[])];
    const i=own.hand.findIndex(c=>E.getReferenceEffectRecord(c).officialCardId===chain[0]);
    if(i<0)return {blocked:'NO_EVOLVED_SOURCE_BASE'};
    const base=own.hand.splice(i,1)[0];
    for(const key of ['cardId','damage','enteredTurn','evolvedTurn','energyCards','energies','tools','statusCondition','statusConditionInfo','evolutionCards','validationBase','entryWindow','referenceEvolutionWindow'])delete child[key];
    own.hand.push(child);
    own.active={...base,cardId:base.id,damage:0,enteredTurn:0,energyCards:energy.filter(c=>!c.isSpecial),energies:[],tools};
    own.deck.push(...energy.filter(c=>c.isSpecial));
    let pp=port(frame.game);
    for(let n=1;n<chain.length;n++){
      const current=pp.getSnapshot(),physical=current.players[0].hand.find(c=>E.getReferenceEffectRecord(c).officialCardId===chain[n]);
      if(!physical)return {blocked:'NO_EVOLVED_SOURCE_HAND_PRINT'};
      const action={type:'evolve',cardId:physical.id,targetInstanceId:base.id};
      const early=JSON.parse(JSON.stringify(current));early.players[0].active.enteredTurn=early.turnNumber;
      const denied=port(early);assert.equal(denied.dispatch('you',action).ok,false);assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(early));
      if(!pp.dispatch('you',action).ok)return {blocked:'EVOLVED_SOURCE_ACTION_REJECTED'};
      const now=pp.getSnapshot().players[0].active;
      assert.equal(E.getReferenceEffectRecord(now).officialCardId,chain[n]);
      assert(now.evolutionCards.some(c=>c.id===physical.id));
      if(n+1<chain.length)for(const actor of ['you','ai']){
        const end=E.getLegalActions(pp.getSnapshot(),actor).actions.find(a=>a.type==='end_turn');
        if(!end||!pp.dispatch(actor,end).ok)return {blocked:'EVOLVED_SOURCE_TURN_REJECTED'};
      }
    }
    assert.deepEqual(Array.from(S.identities(pp.getSnapshot())),initial);
    return {port:pp,sourceId:base.id,kind};
  }
  if(m==='MASS_EFFECT_SEQUENCE'||e.plan.origin==='evolve'){
    const own=frame.game.players[0];
    if((e.plan.steps||[]).some(s=>['healSelf','drain'].includes(s.op))){
      const source=[own.active,...own.bench].find(c=>c.id===frame.sourceId);
      if(source)source.damage=Math.min(source.hp-10,70);
    }
    if(e.plan.origin==='evolve'){
      const eligible=c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c).name===r.facts.evolvesFrom;
      let parent;
      for(const zone of [own.deck,own.hand,own.bench]){
        const i=zone.findIndex(eligible);
        if(i>=0){parent=zone.splice(i,1)[0];break;}
      }
      if(!parent){const i=own.prizeCards.findIndex(eligible);if(i>=0&&own.deck.length){parent=own.prizeCards[i];own.prizeCards[i]=own.deck.shift();}}
      if(!parent)return {blocked:'NO_PHYSICAL_EVOLUTION_PARENT'};
      const child=own.active;
      if(child.id!==frame.sourceId)return {blocked:'NO_PHYSICAL_EVOLUTION_CHILD'};
      for(const key of ['cardId','damage','enteredTurn','evolvedTurn','energyCards','energies','tools','statusCondition','statusConditionInfo','evolutionCards','validationBase','entryWindow'])delete child[key];
      own.hand.push(child);
      own.active={...parent,cardId:parent.id,damage:0,enteredTurn:0,energyCards:[],energies:[],tools:[]};
      let pp=port(frame.game);
      if(e.plan.requiresTera&&fixtureRequirements.teraChain){
        const tera=evolveTeraFixture(pp,fixtureRequirements.teraChain);
        if(tera.blocked)return tera;
        pp=tera.port;
      }
      const action={type:'evolve',cardId:child.id,targetInstanceId:parent.id};
      if(e.plan.requiresTera){
        const early=JSON.parse(JSON.stringify(pp.getSnapshot()));early.players[0].active.enteredTurn=early.turnNumber;
        const invalid=port(early);assert.equal(invalid.dispatch('you',action).ok,false);assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(early));
      }
      if(!pp.dispatch('you',action).ok)return {blocked:'EVOLUTION_FIXTURE_ACTION_REJECTED'};
      const now=pp.getSnapshot().players[0].active;
      if(E.getReferenceEffectRecord(now).officialCardId!==r.officialCardId)return {blocked:'EVOLUTION_FIXTURE_PRINT_MISMATCH'};
      return {port:pp,sourceId:now.id,kind};
    }
  }
  if(kind==='ability'&&e.plan.selfBenchOnly){
    const own=frame.game.players[0];
    if(own.active?.id===frame.sourceId){
      if(!own.bench.length)return {blocked:'NO_SELF_SWITCH_BENCH_FIXTURE'};
      [own.active,own.bench[0]]=[own.bench[0],own.active];
    }
    if(!own.bench.some(c=>c.id===frame.sourceId))return {blocked:'NO_SELF_SWITCH_SOURCE'};
  }
  if(kind==='ability'&&e.plan.origin==='activeEntry'){
    const own=frame.game.players[0];
    if(own.active?.id!==frame.sourceId||!own.bench.length)return {blocked:'NO_ACTIVE_ENTRY_FIXTURE'};
    const source=own.active;
    [own.active,own.bench[0]]=[own.bench[0],source];
    const swap=c=>c.cardType==='ITEM'&&E.getReferenceEffectRecord(c)?.mainPlan?.mechanic==='SWITCH';
    if(!own.hand.some(swap)){
      const i=own.deck.findIndex(swap);if(i<0)return {blocked:'NO_ACTIVE_ENTRY_SWITCH_ITEM'};
      own.hand.push(own.deck.splice(i,1)[0]);
    }
    const item=own.hand.find(swap),replay=port(frame.game);
    const moved=replay.dispatch('you',{type:'play_item',cardId:item.id,selections:{bench:[source.id]}});
    if(!moved.ok)return {blocked:'ACTIVE_ENTRY_SWITCH_REJECTED'};
    frame.game=replay.getSnapshot();
  }
  const p = port(frame.game);
  if(kind==='ability'&&e.plan.origin==='bench'){
    if(!p.dispatch('you',{type:'bench_basic',cardId:frame.sourceId}).ok)return {blocked:'BENCH_ENTRY_FIXTURE_ACTION_REJECTED'};
    // The real entry action opens the window. A subsequent harmless action
    // must close it; verify this independently without mutating the fixture.
  }
  if (m === "MEOWTH_ENTRY")
    assert(
      p.dispatch("you", { type: "bench_basic", cardId: frame.sourceId }).ok,
    );
  if (["SKYLINE", "FAIRY_ZONE"].includes(m))
    return {
      port: p,
      sourceId: frame.sourceId,
      kind,
      option: p
        .getHandOptions("you", frame.sourceId)
        .find((o) => o.action.type === "bench_basic"),
    };
  if (m === "BENCH_NON_RULE_PROTECTION")
    return { port: p, sourceId: frame.sourceId, kind, passive: true };
  return { port: p, sourceId: frame.sourceId, kind, ...(e.proofTeamBoost?{boostBasePhysical}:{}) };
}
function verifyPrintedAttack(before, after, effect, amount, reduction = 0) {
  const [own, opponent] = before.players;
  const attacker = E.getReferenceEffectRecord(own.active);
  const defender = E.getReferenceEffectRecord(opponent.active);
  const hasType = rule => rule?.types.some(type => attacker.facts.types.includes(type));
  if (!effect.plan.skipWeakness && hasType(defender.facts.weakness)) amount *= 2;
  if (!effect.plan.skipResistance && hasType(defender.facts.resistance))
    amount = Math.max(0, amount + Number(defender.facts.resistance.value.replace("－", "-")));
  amount = Math.max(0, amount - reduction);
  const changes = after.history.slice(before.history.length);
  assert(changes.some(event => event.type === "attack" &&
    event.details.effectId === effect.effectId &&
    event.details.referenceOfficialCardId === attacker.officialCardId));
  assert(changes.some(event => event.details?.command === "DAMAGE" &&
    event.details.targetInstanceId === opponent.active.id && event.details.amount === amount));
}

function effectOption(t, e) {
  if (t.option) return t.option;
  e = t.trigger || e;
  const p = t.port;
  if (t.kind === "ability") {
    const inHand = p.getSnapshot().players[0].hand.some(card => card.id === t.sourceId);
    const options = inHand ? p.getHandOptions("you", t.sourceId) : p.getPokemonActions("you", t.sourceId);
    return options.find(o => o.kind === "ability" && o.action.abilityId === e.effectId);
  }
  if (t.kind === "attack") {
    return p.getPokemonActions("you", t.sourceId)
      .find(o => o.kind === "attack" && o.action.attackIndex === e.effectIndex);
  }
  return p.getHandOptions("you", t.sourceId).find(o => o.ok);
}
function verifyCase(t, e) {
  if (t.blocked) return { status: "BLOCKED", reason: t.blocked };
  const p = t.port,
    before = p.getSnapshot();
  let o = t.option;
  if (t.passive) {
    const bad = {
        type: "use_ability",
        sourceInstanceId: t.sourceId,
        abilityId: e.effectId,
      },
      saved = JSON.stringify(before);
    assert.equal(p.dispatch("you", bad).ok, false);
    assert.equal(JSON.stringify(p.getSnapshot()), saved);
    const info = p
      .getCardInfo("you", t.sourceId)
      .entries.find((x) => x.id === e.effectId);
    assert.equal(info.active, true);
  } else {
    if (!o && !t.action) o = effectOption(t, e);
    if (!t.action && !(o && (o.ok ?? o.enabled)))
      return {
        status: "BLOCKED",
        reason: "NO_LEGAL_VERIFICATION_FIXTURE",
        details: o?.errors || o?.disabledReasons || [],
      };
    const action = t.action || o.action;
    const legal = E.getLegalActions(before, "you").actions;
    assert(
      legal.every((a) => p.canDispatch("you", a)),
      "AI_PROPOSED_ILLEGAL_ACTION",
    );
    assert(
      t.passiveTrigger
        ? legal.some(
            (a) =>
              a.type === action.type && a.attackIndex === action.attackIndex,
          )
        : legal.some(
            (a) =>
              JSON.stringify(B.canonical(a)) ===
              JSON.stringify(B.canonical(action)),
          ),
      "AI_UI_LEGAL_PARITY",
    );
    const rejected = JSON.stringify(p.getSnapshot());
    assert.equal(p.dispatch("ai", action).ok, false);
    assert.equal(JSON.stringify(p.getSnapshot()), rejected);
    const forged =
      action.type === "attack_turn"
        ? { ...action, attackIndex: 999 }
        : action.type === "use_ability"
          ? { ...action, sourceInstanceId: "invalid-source" }
          : action.type === "attach_energy"
            ? { ...action, target: "invalid-target" }
            : { ...action, cardId: "invalid-source" };
    assert.equal(p.dispatch("you", forged).ok, false);
    assert.equal(JSON.stringify(p.getSnapshot()), rejected);
    assert(p.dispatch("you", action).ok);
  }
  const after = p.getSnapshot();
  const [attackingSide, defendingSide] = before.players;
  const effectEvents = after.history.slice(before.history.length).map(event => event.details);
  if (e.plan.mechanic === "SWITCH_SELF_ATTACK" && e.plan.optional) {
    const action = t.action || o.action;
    const target = before.players[0].bench[0];
    if (!target) return {status:"BLOCKED", reason:"NO_OPTIONAL_SWITCH_FIXTURE"};
    assert.equal(after.players[0].active.id,target.id);
    if (Number(e.damage)>0) verifyPrintedAttack(before, after, e, Number(e.damage));
    const choice = port(before);
    assert(choice.dispatch("you", {...action, targetIds:[]}).ok);
    assert.equal(choice.getSnapshot().players[0].active.id,before.players[0].active.id);
    const invalid = port(before);
    assert.equal(invalid.dispatch("you", {...action, targetIds:[defendingSide.active.id]}).ok,false);
    assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
  }
  if (e.plan.mechanic === "ATTACK_SWITCH_THEN_DAMAGE") {
    const action = t.action || o.action;
    const target = defendingSide.bench.find(card=>card.id===action.targetIds?.[0]);
    if (!target) return {status:"BLOCKED",reason:"NO_FORCED_SWITCH_DAMAGE_FIXTURE"};
    const switched = JSON.parse(JSON.stringify(before));
    switched.players[1].active=target;
    verifyPrintedAttack(switched,after,e,e.plan.amount);
    assert(effectEvents.some(event=>event?.command==="SELECT_BENCH_SWITCH"&&event.benchInstanceId===target.id));
    const invalid=port(before);
    assert.equal(invalid.dispatch("you",{...action,targetIds:[defendingSide.active.id]}).ok,false);
    assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
  }
  if (e.plan.mechanic === "ATTACK_RETURN_SELF_ENERGY") {
    const action=t.action||o.action,returned=action.selections.energy;
    if (!returned.length) return {status:"BLOCKED",reason:"NO_ATTACHED_RETURN_FIXTURE"};
    assert(returned.every(id=>after.players[0].hand.some(c=>c.id===id)));
    assert(returned.every(id=>!after.players[0].active.energyCards.some(c=>c.id===id)));
    if (Number(e.damage)>0) verifyPrintedAttack(before,after,e,Number(e.damage));
    const invalid=port(before);
    assert.equal(invalid.dispatch("you",{...action,selections:{energy:["unknown-attached-energy"]}}).ok,false);
    assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
  }
  if(e.plan.mechanic==='MASS_EFFECT_SEQUENCE'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],other=before.players[1],resolved=after.players[0];
    const source=[own.active,...own.bench].find(c=>c.id===t.sourceId),next=[resolved.active,...resolved.bench].find(c=>c?.id===t.sourceId);
    if(action.type==='attack_turn'&&Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
    let ownCursor=0,otherCursor=0,handCount=own.hand.length-(plan.steps.some(s=>s.op==='drawIfHand')?1:0);
    for(const step of plan.steps){
      const target=step.side==='opponent'?after.players[1].active:next;
      if(step.op==='discardOwnHand'){
        const chosen=action.selections.sequenceDiscard||[];
        assert.equal(chosen.length,Math.min(step.amount,own.hand.length));
        assert(chosen.every(id=>own.hand.some(c=>c.id===id)&&resolved.discard.some(c=>c.id===id)&&!resolved.hand.some(c=>c.id===id)));
        handCount-=chosen.length;
      }
      if(step.op==='blindDiscardOpponent'){
        const req=o.requests.find(r=>r.key==='sequenceBlind');
        assert(req&&req.candidates.every(c=>/^hand-slot-\d+$/.test(c.id)&&!c.validationReference));
        const moved=other.hand.filter(c=>!after.players[1].hand.some(x=>x.id===c.id));
        assert.equal(moved.length,Math.min(step.amount,other.hand.length));assert(moved.every(c=>after.players[1].discard.some(x=>x.id===c.id)));
      }
      if(step.op==='draw'||step.op==='drawIfHand'&&handCount>=step.threshold){
        const drawn=own.deck.slice(ownCursor,ownCursor+step.amount);
        assert(drawn.every(c=>resolved.hand.some(x=>x.id===c.id)));
        ownCursor+=drawn.length;handCount+=drawn.length;
      }
      if(step.op==='revealHand')assert(effectEvents.some(x=>x?.command==='REVEAL'&&x.fromZone==='hand'&&x.privateTo==='you'&&JSON.stringify(x.cardIds)===JSON.stringify(other.hand.map(c=>c.id))));
      if(step.op==='peekTop')assert(effectEvents.some(x=>x?.command==='REVEAL'&&x.fromZone==='deck'&&x.privateTo==='you'&&JSON.stringify(x.cardIds)===JSON.stringify(other.deck.slice(otherCursor,otherCursor+step.amount).map(c=>c.id))));
      if(step.op==='mill'){
        const side=step.side==='opponent'?other:own,result=after.players[step.side==='opponent'?1:0];
        const cursor=step.side==='opponent'?otherCursor:ownCursor,picked=side.deck.slice(cursor,cursor+step.amount);
        assert(picked.every(c=>result.discard.some(x=>x.id===c.id)));
        if(step.side==='opponent')otherCursor+=picked.length;else ownCursor+=picked.length;
      }
      if(step.op==='healSelf'||step.op==='drain'){
        const amount=step.op==='healSelf'?step.amount:effectEvents.find(x=>x?.command==='DAMAGE'&&x.targetInstanceId===other.active.id)?.amount;
        assert(next&&source.damage>0&&amount>0);assert.equal(next.damage,Math.max(0,source.damage-amount));
      }
      if(step.op==='status'){
        assert(effectEvents.some(x=>x?.command==='STATUS_CONDITION'&&x.status===step.status&&x.targetInstanceId===(step.side==='opponent'?other.active.id:source.id)));
      }
      if(step.op==='retreatLock')assert.equal(target.referenceCannotRetreatTurn,before.turnNumber+step.offset);
      if(step.op==='attackLock')assert.equal(next.referenceCannotAttackTurn,before.turnNumber+step.offset);
      if(step.op==='reduce')assert.deepEqual(next.referenceDamageReduction,{turn:before.turnNumber+1,amount:step.amount});
      if(step.op==='discardAttached')assert(source.energyCards.every(c=>resolved.discard.some(x=>x.id===c.id)));
      if(step.op==='itemLock')assert(after.referenceItemLock.some(x=>x.playerId==='ai'&&x.turnNumber===before.turnNumber+1));
      if(step.op==='noWeakness')assert.equal(next.referenceNoWeaknessTurn,before.turnNumber+1);
    }
    if(plan.steps.some(s=>s.op==='drawIfHand')){
      const bonus=plan.steps.find(s=>s.op==='drawIfHand'),first=plan.steps[0].amount;
      // Prove both sides of the threshold using real physical cards.
      for(const meets of [false,true]){
        const start=JSON.parse(JSON.stringify(before)),side=start.players[0];
        const desired=bonus.threshold-first+1-(meets?0:1);
        assert(desired>=1,'INVALID_THRESHOLD_FIXTURE');
        const sourceId=t.sourceId;
        while(side.hand.length>desired){
          const i=side.hand.findIndex(c=>c.id!==sourceId);assert(i>=0);side.deck.push(side.hand.splice(i,1)[0]);
        }
        while(side.hand.length<desired){assert(side.deck.length);side.hand.push(side.deck.shift());}
        assert(side.deck.length>=first+bonus.amount);
        assert.deepEqual(S.identities(before),S.identities(start));
        const replay=port(start);assert(replay.dispatch('you',action).ok);
        const end=replay.getSnapshot().players[0],drawn=first+(meets?bonus.amount:0);
        assert.deepEqual(Array.from(end.deck,c=>c.id),Array.from(side.deck.slice(drawn),c=>c.id));
        assert.equal(end.hand.length,desired-1+drawn);
      }
    }
    if(plan.steps.some(s=>['revealHand','peekTop'].includes(s.op))&&!plan.steps.some(s=>s.op==='mill'&&s.side==='opponent')){
      assert.deepEqual(after.players[1].deck.map(c=>c.id),other.deck.map(c=>c.id));
      assert.deepEqual(after.players[1].hand.map(c=>c.id),other.hand.map(c=>c.id));
    }
    if(plan.origin==='active'&&plan.steps.length===1&&plan.steps[0].op==='status'){
      assert.equal(after.players[1].active.statusCondition,plan.steps[0].status);
      const activeOnly=JSON.parse(JSON.stringify(before)),side=activeOnly.players[0];
      assert(side.bench.length>0,'NO_ACTIVE_ONLY_NEGATIVE_FIXTURE');
      const source=side.active;side.active=side.bench.shift();side.bench.push(source);
      const denied=port(activeOnly);
      assert.equal(denied.dispatch('you',action).ok,false,'BENCH_STATUS_ABILITY_MUST_BE_REJECTED');
      assert.deepEqual(S.identities(before),S.identities(activeOnly));
      const used=port(after);
      assert.equal(used.dispatch('you',action).ok,false,'ACTIVE_STATUS_ABILITY_ONCE_PER_TURN');
    }
    if(['bench','evolve'].includes(plan.origin)){
      const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
      const replay=port(closed);assert.equal(replay.dispatch('you',action).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(closed));
    }
  }
  if(e.plan.mechanic==='MASS_ATTACHED_ENERGY_MOVE'){
    const plan=e.plan,action=t.action||o.action,side=plan.source.startsWith('opponent')?1:0;
    const prior=before.players[side],resolved=after.players[side],chosen=action.selections.energy;
    assert(chosen.length>0);
    const all=[prior.active,...prior.bench],next=[resolved.active,...resolved.bench];
    for(const [i,id] of chosen.entries()){
      const source=all.find(c=>c.energyCards.some(e=>e.id===id));
      assert(source);
      const energy=source.energyCards.find(e=>e.id===id);
      assert(!plan.basic||!energy.isSpecial);
      if(plan.type&&!energy.isSpecial)assert.equal(energy.energyType,plan.type);
      const target=plan.target==='self'?t.sourceId:plan.target==='ownActive'?prior.active.id:action.selections['moveTo'+(plan.multi?i:0)][0];
      assert.notEqual(target,source.id);
      const attached=next.find(c=>c?.id===target)?.energyCards.some(e=>e.id===id);
      const expired=E.getReferenceEffectRecord(energy)?.mainPlan?.mechanic==='IGNITION'&&after.turnNumber>before.turnNumber&&resolved.discard.some(c=>c.id===id);
      assert(attached||expired,'ATTACHED_ENERGY_DESTINATION_MISSING:'+id+':'+target);
      assert(!next.find(c=>c?.id===source.id)?.energyCards.some(e=>e.id===id));
      assert(effectEvents.some(x=>x?.command==='MOVE_ENERGY'&&x.energyId===id&&x.sourceInstanceId===source.id&&x.targetInstanceId===target));
    }
    assert.equal(prior.normalEnergyAttached,resolved.normalEnergyAttached);
    assert.deepEqual(S.identities(before),S.identities(after));
    if(plan.optional){const skip=port(before);assert(skip.dispatch('you',{...action,selections:{energy:[],moveTo0:[]}}).ok);assert(!skip.getSnapshot().history.slice(before.history.length).some(x=>x.details?.command==='MOVE_ENERGY'&&!x.details.reference));}
    if(action.type==='attack_turn'&&Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
  }
  if(e.plan.mechanic==='MASS_ENERGY_ROUTE'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],resolved=after.players[0],energy=action.selections.energy;
    assert(energy.length>0&&energy.length<=plan.limit);
    for(const [i,id] of energy.entries()){
      const source=own[plan.zone].find(c=>c.id===id);
      assert(source?.kind==='energy'&&!source.isSpecial&&(!plan.type||source.energyType===plan.type));
      const targetId=plan.target==='self'?t.sourceId:action.selections['attachTo'+(plan.multi?i:0)][0];
      const previous=[own.active,...own.bench].find(c=>c.id===targetId);
      assert(previous);
      const facts=E.getReferenceEffectRecord(previous).facts;
      assert(!plan.holderType||facts.types.includes(plan.holderType));
      assert(!plan.team||E.getReferenceEffectRecord(previous).name.startsWith(plan.team+'の'));
      if(plan.target==='bench')assert(own.bench.some(c=>c.id===targetId));
      const next=[resolved.active,...resolved.bench].find(c=>c.id===targetId);
      assert(next?.energyCards.some(c=>c.id===id));
      assert(!resolved[plan.zone].some(c=>c.id===id));
      if(plan.heal)assert.equal(next.damage,plan.heal==='all'?0:Math.max(0,previous.damage-plan.heal));
      assert(effectEvents.some(ev=>ev?.command==='ATTACH_ENERGY'&&ev.energyId===id&&ev.targetInstanceId===targetId));
    }
    assert.equal(resolved.normalEnergyAttached,own.normalEnergyAttached);
    if(plan.origin==='bench'){
      const source=own.bench.find(c=>c.id===t.sourceId);assert(source&&source.entryWindow===before.referenceActionSequence);
      const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
      const denied=port(closed);assert.equal(denied.dispatch('you',action).ok,false);assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(closed));
    }
    if(plan.origin==='evolve'){
      const source=[own.active,...own.bench].find(c=>c.id===t.sourceId);
      assert(source?.evolutionCards?.length&&source.referenceEvolutionWindow===before.referenceActionSequence);
      const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
      const replay=port(closed);assert.equal(replay.dispatch('you',action).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(closed));
    }
    if(plan.origin==='activeEntry'){
      assert.equal(own.active.id,t.sourceId);
      assert.equal(own.active.referenceActiveEntryWindow,before.referenceActionSequence);
      const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
      const denied=port(closed);assert.equal(denied.dispatch('you',action).ok,false);
      assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(closed));
      const noEntry=JSON.parse(JSON.stringify(before));delete noEntry.players[0].active.referenceActiveEntryWindow;
      const initial=port(noEntry);assert.equal(initial.dispatch('you',action).ok,false);
      assert.equal(JSON.stringify(initial.getSnapshot()),JSON.stringify(noEntry));
      const twice=port(after);assert.equal(twice.dispatch('you',action).ok,false);
      assert.equal(JSON.stringify(twice.getSnapshot()),JSON.stringify(after));
    }
    if(plan.oneEach){
      const selectedTargets=energy.map((_,i)=>action.selections['attachTo'+i][0]);
      assert.equal(new Set(selectedTargets).size,energy.length);
      const candidates=(plan.target==='bench'?own.bench:[own.active,...own.bench]).filter(c=>!plan.holderType||E.getReferenceEffectRecord(c).facts.types.includes(plan.holderType));
      const cards=own[plan.zone].filter(c=>c.kind==='energy'&&!c.isSpecial&&(!plan.type||c.energyType===plan.type));
      const n=Math.min(plan.limit,candidates.length,cards.length);
      assert(n>=2);
      if(plan.allHolders&&plan.zone==='discard')assert.equal(energy.length,n);
      const selections={energy:cards.slice(0,n).map(c=>c.id)};
      for(let i=0;i<n;i++)selections['attachTo'+i]=[candidates[i].id];
      const good=port(before);assert(good.dispatch('you',{...action,selections}).ok);
      const goodAfter=good.getSnapshot();
      assert(candidates.slice(0,n).every((c,i)=>[goodAfter.players[0].active,...goodAfter.players[0].bench].find(h=>h?.id===c.id)?.energyCards.some(en=>en.id===selections.energy[i])));
      const bad=port(before),duplicates={...selections,attachTo1:selections.attachTo0};
      assert.equal(bad.dispatch('you',{...action,selections:duplicates}).ok,false);assert.equal(JSON.stringify(bad.getSnapshot()),JSON.stringify(before));
    }
    if(plan.poisonActive){
      const assigned=plan.target==='self'?energy.length>0:energy.some((_,i)=>action.selections['attachTo'+i][0]===own.active.id);
      assert.equal(effectEvents.some(ev=>ev?.command==='STATUS_CONDITION'&&ev.status==='POISONED'&&ev.targetInstanceId===own.active.id),assigned);
      if(plan.target==='own'){
        assert(E.getReferenceEffectRecord(own.active).facts.types.includes('悪'));
        const candidate=own.bench.find(c=>E.getReferenceEffectRecord(c).facts.types.includes('悪'));
        assert(candidate);
        for(const holder of [own.active,candidate]){
          const replay=port(before);assert(replay.dispatch('you',{...action,selections:{energy:[energy[0]],attachTo0:[holder.id]}}).ok);
          const ev=replay.getSnapshot().history.slice(before.history.length).map(x=>x.details);
          assert.equal(ev.some(e=>e?.command==='STATUS_CONDITION'&&e.status==='POISONED'&&e.targetInstanceId===own.active.id),holder===own.active);
        }
      }
    }
    if(plan.requiresTera){
      const absent=JSON.parse(JSON.stringify(before)),side=absent.players[0],isTera=c=>E.getReferenceEffectRecord(c).facts.teraBenchProtection===true;
      const raw=mon=>{const result=JSON.parse(JSON.stringify(mon));if(result.evolutionCards?.length){assert(result.validationBase);Object.assign(result,result.validationBase);}for(const key of ['cardId','damage','energies','energyCards','tools','evolutionCards','statusCondition','statusConditionInfo','enteredTurn','evolvedTurn','entryWindow','referenceEvolutionWindow','validationBase'])delete result[key];return result;};
      const returnStack=c=>side.deck.push(raw(c),...(c.evolutionCards||[]).map(raw),...(c.energyCards||[]),...(c.tools||[]));
      if(isTera(side.active)){
        const i=side.bench.findIndex(c=>!isTera(c));
        if(i>=0){const old=side.active;side.active=side.bench.splice(i,1)[0];returnStack(old);}
      }
      for(const c of side.bench.filter(isTera)){side.bench.splice(side.bench.indexOf(c),1);returnStack(c);}
      assert.deepEqual(Array.from(S.identities(absent)),Array.from(S.identities(before)));
      if(![side.active,...side.bench].some(isTera)){
        const replay=port(absent);assert.equal(replay.dispatch('you',action).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(absent));
      }else return {status:'BLOCKED',reason:'NO_TERA_ABSENCE_NEGATIVE_FIXTURE'};
    }
    const invalid=port(before);
    assert.equal(invalid.dispatch("you",{...action,selections:{...action.selections,energy:[energy[0],energy[0]]}}).ok,false);
    assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
    if(plan.target!=='self'){
     assert.equal(invalid.dispatch("you",{...action,selections:{...action.selections,attachTo0:[before.players[1].active.id]}}).ok,false);
     assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
    }
    if(plan.multi&&energy.length>=2){
     const eligible=[own.active,...own.bench].filter(c=>(plan.target!=='bench'||own.bench.includes(c))&&(!plan.holderType||E.getReferenceEffectRecord(c).facts.types.includes(plan.holderType))&&(!plan.team||E.getReferenceEffectRecord(c).name.startsWith(plan.team+'の')));
     if(eligible.length>=2){
      const replay=port(before),selections={...action.selections,attachTo0:[eligible[0].id],attachTo1:[eligible[1].id]};
      assert(replay.dispatch("you",{...action,selections}).ok);
      const field=[replay.getSnapshot().players[0].active,...replay.getSnapshot().players[0].bench];
      assert(field.find(c=>c.id===eligible[0].id).energyCards.some(c=>c.id===energy[0]));
      assert(field.find(c=>c.id===eligible[1].id).energyCards.some(c=>c.id===energy[1]));
     }
    }
    if(t.kind==='ability'&&!plan.repeated){assert.equal(p.dispatch("you",action).ok,false);assert.deepEqual(p.getSnapshot(),after);}
  }
  if(e.plan.mechanic==='SUPPORTER_MEGA_HEAL_RETURN_ENERGY'){
    const action=t.action||o.action,target=[...([before.players[0].active]),...before.players[0].bench].find(c=>c.id===action.selections.cards[0]);
    assert(target?.damage>0&&String(E.getReferenceEffectRecord(target).rulesText).includes('メガシンカexがきぜつしたとき'));
    const next=[after.players[0].active,...after.players[0].bench].find(c=>c.id===target.id);
    assert.equal(next.damage,0);assert.equal(next.energyCards.length,0);
    assert(target.energyCards.length>0&&target.energyCards.every(c=>after.players[0].hand.some(h=>h.id===c.id)));
    assert(effectEvents.some(ev=>ev?.command==='RETURN_TO_HAND'&&ev.targetInstanceId===target.id&&target.energyCards.every(c=>ev.cardIds.includes(c.id))));
    const other=before.players[0].bench.find(c=>!String(E.getReferenceEffectRecord(c).rulesText).includes('メガシンカexがきぜつしたとき'));
    if(other){const replay=port(before);assert.equal(replay.dispatch('you',{...action,selections:{cards:[other.id]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));}
  }
  if(e.plan.mechanic==='MASS_ZONE_TRANSFER'){
    const plan=e.plan,action=t.action||o.action,ids=action.selections.cards,own=before.players[0],resolved=after.players[0];
    assert(ids.length>0&&ids.length<=plan.limit);
    assert(ids.every(id=>own[plan.zone].some(c=>c.id===id&&massTransferCandidate(c,plan))));
    if(plan.category==='pokemonOrBasicEnergy'){
      const pool=own[plan.zone].filter(c=>massTransferCandidate(c,plan));
      for(const kind of ['pokemon','energy']){
        const target=pool.find(c=>c.kind===kind);
        if(!target)return {status:'BLOCKED',reason:'NO_MIXED_SEARCH_BOTH_CATEGORY_FIXTURE'};
        const replay=port(before);assert(replay.dispatch('you',{...action,selections:{cards:[target.id]}}).ok);
        const end=replay.getSnapshot();assert(end.players[0][plan.destination].some(c=>c.id===target.id));
        assert(!end.players[0][plan.zone].some(c=>c.id===target.id));
        assert.deepEqual(S.identities(before),S.identities(end));
      }
    }
    if(plan.category==='categorySet'||plan.distinctBy){
      const pool=own[plan.zone].filter(c=>massTransferCandidate(c,plan));
      const group=c=>plan.distinctBy==='energyType'?c.energyType:E.getReferenceEffectRecord(c).category;
      const groups=new Map();
      for(const c of pool){const key=group(c);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
      const required=plan.categories||plan.energyTypes;
      if(required&&!required.every(key=>groups.has(key))||!required&&groups.size<2)
        return {status:'BLOCKED',reason:'NO_MULTI_GROUP_SEARCH_PROOF'};
      const selected=[...groups.values()].slice(0,plan.limit).map(a=>a[0].id);
      const replay=port(before);assert(replay.dispatch('you',{...action,selections:{cards:selected}}).ok);
      const end=replay.getSnapshot();assert(selected.every(id=>end.players[0].hand.some(c=>c.id===id)));
      assert.deepEqual(S.identities(before),S.identities(end));
      if(plan.distinctBy){
        assert.equal(new Set(ids.map(id=>group(pool.find(c=>c.id===id)))).size,ids.length);
        const duplicates=[...groups.values()].find(a=>a.length>=2);
        if(duplicates&&plan.limit>=2){
          const denied=port(before);assert.equal(denied.dispatch('you',{...action,selections:{cards:duplicates.slice(0,2).map(c=>c.id)}}).ok,false);
          assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(before));
        }
      }
    }
    assert(ids.every(id=>resolved[plan.destination].some(c=>c.id===id)&&!resolved[plan.zone].some(c=>c.id===id)));
    if(plan.privateSearch)assert(!effectEvents.some(ev=>ev?.command==='REVEAL'&&ev.cardIds?.some(id=>ids.includes(id))));
    else assert(effectEvents.some(ev=>ev?.command==='REVEAL'&&ids.every(id=>ev.cardIds?.includes(id))));
    if(plan.onlyHandCard||plan.emptyHand){
      assert.equal(own.hand.length,plan.onlyHandCard?1:0);
      const denied=structuredClone(before),side=denied.players[0],extra=side.deck.findIndex(c=>!ids.includes(c.id));
      assert(extra>=0);side.hand.push(side.deck.splice(extra,1)[0]);
      const retry=port(denied);assert.equal(retry.dispatch('you',action).ok,false);assert.deepEqual(retry.getSnapshot(),denied);
    }
    if(plan.firstTurnAllowed){
      assert(ids.every(id=>own.deck.some(c=>c.id===id&&E.getReferenceEffectRecord(c).facts.basic&&E.getReferenceEffectRecord(c).name.startsWith('ロケット団の'))));
      const first=structuredClone(before);first.turnNumber=1;first.players[0].turnLimits={};
      const pp=port(first);assert(pp.dispatch('you',action).ok);
      const used=structuredClone(first);used.players[0].turnLimits={supporterUsed:true};
      assert.equal(port(used).dispatch('you',action).ok,false);
    }
    if(plan.origin==='evolve'||plan.origin==='bench'){
      if(plan.origin==='bench'){const source=own.bench.find(c=>c.id===t.sourceId);assert(source&&source.entryWindow===before.referenceActionSequence);}
      const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
      const late=port(closed);assert.equal(late.dispatch('you',action).ok,false);assert.equal(JSON.stringify(late.getSnapshot()),JSON.stringify(closed));
    }
    if(plan.requiresTera){
      const tera=c=>E.getReferenceEffectRecord(c).facts.teraBenchProtection===true;
      assert([own.active,...own.bench].some(tera));
      if(!tera(own.active)){
        const absent=JSON.parse(JSON.stringify(before)),side=absent.players[0];
        for(const c of side.bench.filter(tera)){
          side.bench.splice(side.bench.indexOf(c),1);
          const raw=mon=>{const result=JSON.parse(JSON.stringify(mon));if(result.evolutionCards?.length){assert(result.validationBase);Object.assign(result,result.validationBase);}for(const key of ['cardId','damage','energies','energyCards','tools','evolutionCards','statusCondition','statusConditionInfo','enteredTurn','evolvedTurn','entryWindow','referenceEvolutionWindow','validationBase'])delete result[key];return result;};
          side.deck.push(raw(c),...(c.evolutionCards||[]).map(raw),...(c.energyCards||[]),...(c.tools||[]));
        }
        assert.deepEqual(Array.from(S.identities(absent)),Array.from(S.identities(before)));
        const replay=port(absent);assert.equal(replay.dispatch('you',action).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(absent));
      }
    }
    const invalid=own[plan.zone].find(c=>!massTransferCandidate(c,plan));
    if(invalid){const replay=port(before);assert.equal(replay.dispatch("you",{...action,selections:{cards:[invalid.id]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));}
  }
  if(e.plan.mechanic==='MASS_ENERGY_COUNT_DISCARD'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0];
    const holders=plan.zone==='self'?[own.active]:plan.zone==='bench'?own.bench:[own.active,...own.bench];
    const physical=plan.zone==='hand'?own.hand.map(c=>({c,holder:null})):holders.flatMap(holder=>holder.energyCards.map(c=>({c,holder})));
    const knownSpecial=new Set(['ROCKET_ENERGY','IGNITION','COLORLESS_MULTI_ENERGY']);
    if(plan.type&&!plan.basic&&physical.some(({c})=>c.isSpecial&&!knownSpecial.has(E.getReferenceEffectRecord(c)?.mainPlan?.mechanic)))
      return {status:'BLOCKED',reason:'SPECIAL_ENERGY_TYPE_UNPROVEN'};
    const pool=physical.filter(({c,holder})=>{
      if(c.kind!=='energy'||plan.basic&&c.isSpecial)return false;
      if(!plan.type)return true;
      if(!c.isSpecial)return c.energyType===plan.type;
      // Rocket energy supplies Psychic/Dark only on an eligible Rocket holder.
      // Ignition and colorless multi-energy cannot meet these typed discards.
      return holder&&E.getReferenceEffectRecord(c)?.mainPlan?.mechanic==='ROCKET_ENERGY'&&E.getReferenceEffectRecord(holder)?.name.startsWith('ロケット団の')&&['超','悪'].includes(plan.type);
    }).map(({c})=>c);
    const chosen=plan.all?pool.map(c=>c.id):action.selections.energy;
    assert(chosen.length>0&&chosen.length<=plan.limit);
    assert(chosen.every(id=>pool.some(c=>c.id===id)));
    const check=(start,end,ids)=>{
      assert(ids.every(id=>end.players[0].discard.some(c=>c.id===id)));
      const events=end.history.slice(start.history.length).map(x=>x.details);
      assert(ids.every(id=>events.some(ev=>ev?.command==='DISCARD'&&ev.cardIds?.includes(id))));
      const penalty=start.players[0].active.energyCards.filter(c=>!ids.includes(c.id)).reduce((sum,c)=>{
        const p=E.getReferenceEffectRecord(c)?.mainPlan;
        return sum+(p?.mechanic==='COLORLESS_MULTI_ENERGY'?p.damagePenalty:0);
      },0);
      const amount=Math.max(0,plan.base+ids.length*plan.unit-penalty);
      if(amount===0)assert(events.some(ev=>ev?.command==='DAMAGE'&&ev.amount===0&&ev.targetInstanceId===start.players[1].active.id));
      else verifyPrintedAttack(start,end,e,amount);
      assert.deepEqual(S.identities(start),S.identities(end));
    };
    check(before,after,chosen);
    // Count physical energy cards, not supplied energy units.
    const special=pool.find(c=>c.isSpecial);
    if(special&&!chosen.includes(special.id)){
      assert(!plan.all);
      const replay=port(before);
      assert(replay.dispatch('you',{...action,selections:{...action.selections,energy:[special.id]}}).ok);
      check(before,replay.getSnapshot(),[special.id]);
    }
    if(plan.basic||plan.type){
      const excluded=physical.map(({c})=>c).find(c=>c.isSpecial&&!pool.some(allowed=>allowed.id===c.id));
      if(excluded){
        assert(!chosen.includes(excluded.id));
        const excludedPlan=E.getReferenceEffectRecord(excluded)?.mainPlan;
        if(excludedPlan?.mechanic==='IGNITION'&&after.turnNumber>before.turnNumber){
          // Ignition is discarded at the end of the turn, independently of the attack selection.
          assert(effectEvents.some(ev=>ev?.command==='DISCARD'&&ev.cardIds?.includes(excluded.id)&&!ev.sourceInstanceId&&!ev.fromZone));
        }else assert(!after.players[0].discard.some(c=>c.id===excluded.id));
        if(!plan.all){
          const invalid=port(before);
          assert.equal(invalid.dispatch('you',{...action,selections:{...action.selections,energy:[excluded.id]}}).ok,false);
          assert.deepEqual(B.canonical(JSON.parse(JSON.stringify(invalid.getSnapshot()))),B.canonical(JSON.parse(JSON.stringify(before))));
        }
      }
    }
    if(!plan.all)for(let n=0;n<chosen.length;n++){
      const replay=port(before),ids=chosen.slice(0,n);
      assert(replay.dispatch('you',{...action,selections:{...action.selections,energy:ids}}).ok);
      check(before,replay.getSnapshot(),ids);
    }
  }
  if(e.plan.mechanic==='MASS_HEAL_SCOPE'){
    const plan=e.plan,action=t.action||o.action,[own,other]=before.players;
    const targets=plan.scope==='both'?[own.active,...own.bench,other.active,...other.bench]:plan.scope==='active'?[own.active]:plan.scope==='bench'?own.bench:[own.active,...own.bench].filter(c=>E.getReferenceEffectRecord(c).facts.basic);
    const eligible=targets.filter(c=>c.damage>0&&(!plan.type||E.getReferenceEffectRecord(c).facts.types.includes(plan.type))&&(!plan.choice||action.selections.cards.includes(c.id)));
    assert(eligible.length>0);
    for(const mon of eligible){
      const next=after.players.flatMap(p=>[p.active,...p.bench]).find(c=>c?.id===mon.id);
      assert(next);assert.equal(next.damage,plan.amount==='all'?0:Math.max(0,mon.damage-plan.amount));
    }
  }
  if(e.plan.mechanic==='MASS_HAND_FLOW'){
    const q=e.plan,[own,other]=before.players;
    const checkDraw=(side,n)=>{const count=Math.min(n,side.deck.length);assert(side.deck.slice(0,count).every(c=>after.players.find(p=>p.id===side.id).hand.some(x=>x.id===c.id)));};
    const checkReset=(side,n)=>{
      const result=after.players.find(p=>p.id===side.id),pool=[...side.hand,...side.deck],history=after.history.slice(before.history.length);
      const returned=history.filter(ev=>ev.player===side.id&&ev.details?.command==='RETURN_TO_DECK'&&!ev.details.reference);
      assert.equal(returned.length,1);
      assert.deepEqual(Array.from(returned[0].details.cardIds).sort(),Array.from(side.hand,c=>c.id).sort());
      const effectDraws=history.filter(ev=>ev.details?.command==='DRAW'&&ev.details.privateTo===side.id&&!ev.details.reference);
      assert.equal(effectDraws.length,1);
      const ids=Array.from(effectDraws[0].details.cardIds),count=Math.min(n,pool.length);
      assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);
      const turnDraws=history.filter(ev=>ev.type==='draw'&&ev.details?.playerId===side.id);
      const startsNextTurn=before.mode==='match'&&after.turnNumber===before.turnNumber+1&&after.turnPlayer===side.id;
      const extra=startsNextTurn&&pool.length>count?1:0;
      assert.equal(turnDraws.length,extra);
      if(extra){assert.equal(turnDraws[0].turnNumber,after.turnNumber);assert.equal(turnDraws[0].details.count,1);assert.equal(turnDraws[0].details.cardIds.length,1);ids.push(turnDraws[0].details.cardIds[0]);}
      assert.equal(new Set(ids).size,ids.length);
      assert.deepEqual(Array.from(result.hand,c=>c.id).sort(),ids.sort());
      assert.equal(result.deck.length,pool.length-count-extra);
      assert.deepEqual(Array.from([...result.hand,...result.deck],c=>c.id).sort(),Array.from(pool,c=>c.id).sort());
    };
    if(q.mode==='resetOpponent')checkReset(other,q.amount);
    if(q.mode==='bothDraw'){checkDraw(own,q.amount);checkDraw(other,q.amount);}
    if(q.mode==='resetOwnMatch')checkReset(own,other.hand.length);
    if(q.mode==='revealCount'){assert(other.hand.some(c=>c.kind==='pokemon'));checkDraw(own,other.hand.filter(c=>c.kind==='pokemon').length);assert(effectEvents.some(ev=>ev?.command==='REVEAL'&&ev.privateTo===own.id));}
    if(q.mode==='rocketLimit'){
      const limit=[own.active,...own.bench].every(c=>E.getReferenceEffectRecord(c).name.startsWith('ロケット団の'))?q.bonus:q.amount;
      const hand=own.hand.filter(c=>c.id!==t.sourceId);checkDraw(own,Math.max(0,limit-hand.length));
      const rocket=c=>E.getReferenceEffectRecord(c).name.startsWith('ロケット団の');
      assert([own.active,...own.bench].every(rocket));assert.equal(limit,q.bonus);
      assert.equal(after.players[0].hand.length,hand.length+Math.min(own.deck.length,Math.max(0,q.bonus-hand.length)));
      const mixed=JSON.parse(JSON.stringify(before)),side=mixed.players[0];
      if(side.bench.length>=5)return {status:'BLOCKED',reason:'NO_ROCKET_DRAW_BENCH_SPACE'};
      const i=side.deck.findIndex(c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c).facts.basic&&!rocket(c));
      if(i<0)return {status:'BLOCKED',reason:'NO_ROCKET_DRAW_MIXED_TEAM_FIXTURE'};
      const c=side.deck.splice(i,1)[0];side.bench.push({...c,cardId:c.id,damage:0,enteredTurn:0,energyCards:[],energies:[],tools:[]});
      const p=port(mixed),action=t.action||o.action;
      assert(p.dispatch('you',action).ok);
      const next=p.getSnapshot(),count=Math.min(side.deck.length,Math.max(0,q.amount-(side.hand.length-1)));
      assert(side.deck.slice(0,count).every(c=>next.players[0].hand.some(x=>x.id===c.id)));
      assert.equal(next.players[0].hand.length,side.hand.length-1+count);
      assert.deepEqual(Array.from(S.identities(mixed)),Array.from(S.identities(next)));
    }
    if(q.mode==='resetBothCoin'){
      const flips=after.history.slice(before.history.length).filter(ev=>ev.details?.command==='COIN_FLIP'&&typeof ev.details.heads==='boolean');
      assert.equal(flips.length,2);assert.deepEqual(Array.from(flips,ev=>ev.player),[own.id,other.id]);
      checkReset({...own,hand:own.hand.filter(c=>c.id!==t.sourceId)},flips[0].details.heads?q.amount:q.tails);
      checkReset(other,flips[1].details.heads?q.amount:q.tails);
    }
  }
  if(e.plan.mechanic==='MASS_HEAL_OWN'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],resolved=after.players[0];
    if(plan.origin==='evolve'){
      const source=[own.active,...own.bench].find(c=>c.id===t.sourceId);assert(source?.evolutionCards?.length&&source.referenceEvolutionWindow===before.referenceActionSequence);
      const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
      const denied=port(closed);assert.equal(denied.dispatch('you',action).ok,false);assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(closed));
    }
    const targets=(plan.target==='active'?[own.active]:[own.active,...own.bench]).filter(c=>(!plan.type||E.getReferenceEffectRecord(c).facts.types.includes(plan.type))&&(plan.target!=='choice'||action.selections.cards.includes(c.id))&&c.damage>0);
    assert(targets.length>0);
    for(const mon of targets){const next=[resolved.active,...resolved.bench].find(c=>c.id===mon.id);assert(next);assert.equal(next.damage,plan.amount==='all'?0:Math.max(0,mon.damage-plan.amount));}
  }
  if(e.plan.mechanic==='MASS_PRIZE_DRAW'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],resolved=after.players[0];
    const n=Math.min(own.deck.length,plan.amount+(before.players[1].prizes<=plan.threshold?plan.extra:0));
    assert(own.deck.slice(0,n).every(c=>resolved.hand.some(x=>x.id===c.id)));
    assert.equal(resolved.hand.length,own.hand.length+n-(action.type==='play_item'||action.type==='play_supporter'?1:0));
  }
  if(e.plan.mechanic==='ABILITY_EVOLVE_MULTI_COUNTERS'){
    const plan=e.plan,action=t.action||o.action,source=before.players[0].active,targets=[before.players[1].active,...before.players[1].bench];
    assert(source.evolutionCards?.length&&source.referenceEvolutionWindow===before.referenceActionSequence);
    const selected=action.selections.target;
    assert.equal(selected.length,Math.min(plan.count,targets.length));assert.equal(new Set(selected).size,selected.length);
    assert(selected.every(id=>effectEvents.some(ev=>ev?.command==='PLACE_DAMAGE_COUNTERS'&&ev.targetInstanceId===id&&ev.counterCount===plan.amount)));
    const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
    const denied=port(closed);assert.equal(denied.dispatch('you',action).ok,false);assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(closed));
    const invalid=port(before);assert.equal(invalid.dispatch('you',{...action,selections:{target:[selected[0],selected[0]]}}).ok,false);assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
  }
  if(e.plan.mechanic==='ATTACK_OPTIONAL_RETURN_POKEMON'){
    const action=t.action||o.action,source=before.players[0].active;
    for(const mode of ['stay','return']){
      const replay=port(before);assert(replay.dispatch('you',{...action,selections:{mode:[mode]}}).ok);
      const end=replay.getSnapshot(),side=end.players[0],events=end.history.slice(before.history.length).map(x=>x.details);
      verifyPrintedAttack(before,end,e,Number(e.damage));
      if(mode==='return'){
        const stack=[source,...(source.evolutionCards||[])].map(c=>c.id);
        const attached=[...(source.energyCards||[]),...(source.tools||[])].map(c=>c.id);
        assert(stack.every(id=>side.hand.some(c=>c.id===id)));assert(attached.length>0&&attached.every(id=>side.discard.some(c=>c.id===id)&&!side.hand.some(c=>c.id===id)));
        assert(events.some(ev=>ev?.command==='RETURN_TO_HAND'&&stack.every(id=>ev.cardIds.includes(id))));
        assert(events.some(ev=>ev?.command==='DISCARD'&&attached.every(id=>ev.cardIds.includes(id))));
      }else assert(side.active?.id===source.id&&source.energyCards.every(c=>side.active.energyCards.some(x=>x.id===c.id)));
      assert.deepEqual(Array.from(S.identities(end)),Array.from(S.identities(before)));
    }
  }
  if(e.plan.mechanic==='MASS_HAND_ACQUISITION'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],resolved=after.players[0],selection=action.selections||{};
    if(Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
    const count=Math.min(plan.amount,own.deck.length),expected=plan.mode==='bottom'?own.deck.slice(-count).reverse().map(c=>c.id):plan.mode==='draw'?own.deck.slice(0,count).map(c=>c.id):selection.cards;
    assert(expected.length>0);
    assert(expected.every(id=>resolved.hand.some(c=>c.id===id)));
    assert.equal(resolved.hand.length,own.hand.length+expected.length);
    if(plan.mode==='bottom')assert.deepEqual(resolved.deck.map(c=>c.id),own.deck.slice(0,-count).map(c=>c.id));
    if(plan.mode==='search'){
      assert(effectEvents.some(x=>x?.command==='SHUFFLE_DECK'&&!x.reference));
      assert(!effectEvents.some(x=>x?.command==='REVEAL'&&!x.reference));
    }
    if(plan.mode!=='bottom'){
      assert.deepEqual(Array.from(selection.acquire),['do']);
      const skip=port(before);assert(skip.dispatch('you',{...action,selections:{acquire:['skip'],cards:[]}}).ok);
      assert.deepEqual(skip.getSnapshot().players[0].hand,own.hand);
      assert.deepEqual(skip.getSnapshot().players[0].deck,own.deck);
      if(plan.mode==='search'){
        const bad=port(before);assert.equal(bad.dispatch('you',{...action,selections:{acquire:['skip'],cards:[own.deck[0].id]}}).ok,false);
        assert.deepEqual(bad.getSnapshot(),before);
      }
    }
  }
  if(e.plan.mechanic==='MASS_COUNTER_GRAMMAR'){
    const plan=e.plan,action=t.action||o.action,other=before.players[1],own=before.players[0];
    const targets=plan.scope==='active'?[other.active]:plan.scope==='bench'?other.bench:plan.scope==='choice'?[other.active,...other.bench].filter(c=>action.selections.target.includes(c.id)):[other.active,...other.bench];
    if(Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
    let positive=0;
    for(const c of targets){
      const hit=effectEvents.find(x=>x?.command==='DAMAGE'&&x.targetInstanceId===c.id&&!x.reference)?.amount||0;
      const expected=plan.mode==='remaining'?Math.max(0,(c.hp-c.damage-hit-plan.remaining)/10):plan.mode==='allocation'?(action.selections.allocation[c.id]||0):plan.mode==='hand'?own.hand.length*plan.unit:plan.mode==='multiply'?(c.damage+hit)/10*plan.unit:plan.amount;
      const moves=effectEvents.filter(x=>x?.command==='PLACE_DAMAGE_COUNTERS'&&x.targetInstanceId===c.id&&!x.reference);
      assert.equal(moves.reduce((n,x)=>n+x.counterCount,0),expected);positive+=expected;
    }
    if(!positive)return {status:'BLOCKED',reason:'NO_POSITIVE_COUNTER_GRAMMAR_PROOF'};
    if(plan.mode==='allocation'){
      assert.equal(Object.values(action.selections.allocation).reduce((a,b)=>a+b,0),plan.amount);
      const invalid=port(before);assert.equal(invalid.dispatch('you',{...action,selections:{allocation:{[other.active.id]:plan.amount+1}}}).ok,false);
      assert.deepEqual(invalid.getSnapshot(),before);
    }
    if(plan.mode==='remaining'&&plan.scope==='active'&&other.active.hp>plan.remaining&&Number(e.damage||0)===0){
      const lower=JSON.parse(JSON.stringify(before));lower.players[1].active.damage=other.active.hp-plan.remaining+10;
      if(lower.players[1].active.damage<other.active.hp){
        const replay=port(lower);assert(replay.dispatch('you',action).ok);
        assert(!replay.getSnapshot().history.slice(lower.history.length).some(x=>x.details?.command==='PLACE_DAMAGE_COUNTERS'&&!x.details.reference));
      }
    }
  }
  if(e.plan.mechanic==='MASS_PLACE_COUNTERS'){
    const plan=e.plan,action=t.action||o.action,other=before.players[1];
    const own=before.players[0],all=[own.active,...own.bench,other.active,...other.bench];
    const ids=plan.target==='all'?[other.active,...other.bench].map(c=>c.id):plan.target==='active'?[other.active.id]:plan.target==='damagedOpponent'?[other.active,...other.bench].filter(c=>c.damage>0).map(c=>c.id):plan.target==='bothAbility'?all.filter(c=>E.getReferenceEffectRecord(c).abilities.length>0).map(c=>c.id):action.selections.target;
    if(!ids.length)return {status:'BLOCKED',reason:'NO_SCOPED_COUNTER_POSITIVE_FIXTURE'};
    if(plan.target==='benchChoice')assert(ids.every(id=>other.bench.some(c=>c.id===id)));
    assert.deepEqual(Array.from(effectEvents.filter(ev=>ev?.command==='PLACE_DAMAGE_COUNTERS'&&ev.counterCount===plan.amount&&!ev.reference),ev=>ev.targetInstanceId).sort(),Array.from(ids).sort());
    if(plan.target==='damagedOpponent'||plan.target==='bothAbility'){
      const universe=plan.target==='damagedOpponent'?[other.active,...other.bench]:all;
      if(!universe.some(c=>!ids.includes(c.id)))return {status:'BLOCKED',reason:'NO_SCOPED_COUNTER_NEGATIVE_FIXTURE'};
    }
  }
  if(e.plan.mechanic==='ABILITY_TYPED_COST_COUNTER'){
    const own=before.players[0],other=before.players[1],action=t.action||o.action,energy=action.selections.discard[0],target=action.selections.target[0];
    assert.equal(own.active.id,t.sourceId);
    assert(own.hand.some(c=>c.id===energy&&c.kind==='energy'&&!c.isSpecial&&c.energyType===e.plan.type));
    assert(after.players[0].discard.some(c=>c.id===energy));
    assert([other.active,...other.bench].some(c=>c.id===target));
    assert(effectEvents.some(ev=>ev?.command==='PLACE_DAMAGE_COUNTERS'&&ev.targetInstanceId===target&&ev.counterCount===e.plan.amount));
    const replay=port(before);assert.equal(replay.dispatch('you',{...action,selections:{...action.selections,discard:[]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    const invalid=own.hand.find(c=>c.kind!=='energy'||c.isSpecial||c.energyType!==e.plan.type);
    if(invalid){const denied=port(before);assert.equal(denied.dispatch('you',{...action,selections:{...action.selections,discard:[invalid.id]}}).ok,false);assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(before));}
  }
  if(e.plan.mechanic==='ATTACK_OPTIONAL_RECOIL_BONUS'){
    const plan=e.plan,action=t.action||o.action;
    assert.deepEqual(Array.from(action.selections.recoilBonus),['accept-recoil']);
    verifyPrintedAttack(before,after,e,plan.base+plan.bonus);
    assert(effectEvents.some(event=>event?.command==='DAMAGE'&&event.targetInstanceId===before.players[0].active.id&&event.amount===plan.recoil));
    const replay=port(before);
    assert(replay.dispatch('you',{...action,selections:{recoilBonus:[]}}).ok);
    verifyPrintedAttack(before,replay.getSnapshot(),e,plan.base);
    assert(!replay.getSnapshot().history.slice(before.history.length).some(event=>event.details?.command==='DAMAGE'&&event.details.targetInstanceId===before.players[0].active.id));
    const invalid=port(before);
    assert.equal(invalid.dispatch('you',{...action,selections:{recoilBonus:['other']}}).ok,false);
    assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
  }

  if(e.plan.mechanic==='ATTACK_GUARDED_DAMAGE'){
    const plan=e.plan,action=t.action||o.action,missing=JSON.parse(JSON.stringify(before)),[own,other]=missing.players;
    const removeFromHand=side=>{if(side.hand.length)side.deck.unshift(side.hand.pop());else side.hand.push(side.deck.shift());};
    switch(plan.predicate){
      case 'opponentEx':{
        if(!E.getReferenceEffectRecord(other.active).name.endsWith('ex'))return {status:'BLOCKED',reason:'NO_OPPONENT_EX_GUARD_FIXTURE'};
        const i=other.bench.findIndex(c=>!E.getReferenceEffectRecord(c).name.endsWith('ex'));
        if(i<0)return {status:'BLOCKED',reason:'NO_OPPONENT_NON_EX_GUARD_FIXTURE'};
        [other.active,other.bench[i]]=[other.bench[i],other.active];break;
      }
      case 'ownBenchedNames':{
        const i=own.bench.findIndex(c=>E.getReferenceEffectRecord(c).name===plan.names[0]);
        if(i<0||!plan.names.every(name=>own.bench.some(c=>E.getReferenceEffectRecord(c).name===name)))return {status:'BLOCKED',reason:'NO_NAMED_GUARD_BENCH_FIXTURE'};
        own.deck.push(own.bench.splice(i,1)[0]);break;
      }
      case 'opponentDamaged':other.active.damage=0;break;
      case 'opponentStatus':other.active.statusCondition=null;break;
      case 'opponentPrizeCounts':
        if(!plan.prizes.includes(other.prizes))return {status:'BLOCKED',reason:'NO_GUARD_PRIZE_COUNT_FIXTURE'};
        while(plan.prizes.includes(other.prizes)&&other.prizes<6){other.prizeCards.push(other.hand.pop());other.prizes++;}
        if(plan.prizes.includes(other.prizes))return {status:'BLOCKED',reason:'NO_NEGATIVE_PRIZE_COUNT_FIXTURE'};
        break;
      case 'ownHandCount':case 'handCountsEqual':removeFromHand(own);break;
      case 'stadium':own.deck.push(missing.stadium);missing.stadium=null;missing.stadiumOwner=null;break;
    }
    verifyPrintedAttack(before,after,e,Number(e.damage));
    assert(!effectEvents.some(step=>step?.command==='ATTACK_FAILED'));
    if(plan.discardStadium){
      assert.equal(after.stadium,null);
      assert(after.players[0].discard.some(c=>c.id===before.stadium.id));
      const discard=effectEvents.findIndex(step=>step?.command==='DISCARD'&&step.fromZone==='stadium');
      assert(discard>=0&&effectEvents.slice(discard+1).some(step=>step?.command==='DAMAGE'&&step.amount>0));
    }
    const replay=port(missing);
    assert(replay.dispatch('you',action).ok);
    const failed=replay.getSnapshot().history.slice(missing.history.length);
    assert(failed.some(step=>step.details?.command==='ATTACK_FAILED'&&step.details.effectId===e.effectId));
    assert(!failed.some(step=>step.details?.command==='DAMAGE'&&Number(step.details.amount)>0));
    assert.deepEqual(Array.from(S.identities(replay.getSnapshot())),Array.from(S.identities(missing)));
  }
  if(e.plan.mechanic==='MASS_BOARD_BONUS'){
    const plan=e.plan,action=t.action||o.action;
    const rec=c=>E.getReferenceEffectRecord(c);
    const matches=c=>plan.predicate==='opponentType'?rec(c).facts.types.includes(plan.type):plan.predicate==='opponentResistance'?!!rec(c).facts.resistance?.types.includes(plan.type):rec(c).facts.teraBenchProtection===true;
    const nameMatches=c=>plan.predicate==='ownBenchNamed'?rec(c).name===plan.name:rec(c).name.includes(plan.name);
    const positive=g=>{
      const [own,other]=g.players;
      switch(plan.predicate){
        case 'healedThisTurn':return g.history.some(h=>h.turnNumber===g.turnNumber&&h.details?.command==='HEAL'&&h.details.amount>0&&h.details.targetInstanceId===own.active.id);
        case 'evolvedFromThisTurn':return own.active.evolvedTurn===g.turnNumber&&(own.active.evolutionCards?.at(-2)?.validationReference?.officialName||own.active.validationBase?.validationReference?.officialName)===plan.name;
        case 'becameActive':return g.history.some(h=>h.turnNumber===g.turnNumber&&h.player===own.id&&h.details?.command==='SWITCH'&&h.details.activeInstanceId===own.active.id);
        case 'sharedFieldType':return [own.active,...own.bench].some(a=>[other.active,...other.bench].some(b=>rec(a).facts.types.some(type=>rec(b).facts.types.includes(type))));
        case 'ownNamedEnergy':return own.active.energyCards.some(c=>c.name===plan.name);
        case 'stadiumPresent':return Boolean(g.stadium);
        case 'ownHandEmpty':return own.hand.length===0;
        case 'ownDeckAtMost':return own.deck.length<=plan.threshold;
        case 'ownPrizesExact':return own.prizes===plan.threshold;
        case 'opponentPrizesExact':return other.prizes===plan.threshold;
        case 'allDamagedBench':return own.bench.length>0&&own.bench.every(c=>c.damage>0);
        case 'ownBenchNamed':case 'ownBenchContains':return own.bench.some(nameMatches);
        case 'ownStadium':return !!g.stadium&&g.stadiumOwner===own.id;
        case 'stadiumContains':return !!g.stadium&&rec(g.stadium).name.includes(plan.name);
        case 'opponentType':case 'opponentResistance':case 'opponentTera':return matches(other.active);
        case 'ownSpecialEnergy':return own.active.energyCards.some(c=>c.isSpecial);
        default:throw Error('MISSING_BOARD_PREDICATE_PROOF');
      }
    };
    if(!positive(before))return {status:'BLOCKED',reason:'NO_POSITIVE_BOARD_PREDICATE_FIXTURE'};
    const start=JSON.parse(JSON.stringify(before)),[own,other]=start.players;
    switch(plan.predicate){
      case 'healedThisTurn':start.history.find(h=>h.details?.command==='HEAL'&&h.details.targetInstanceId===own.active.id).turnNumber--;break;
      case 'evolvedFromThisTurn':own.active.evolvedTurn--;break;
      case 'becameActive':start.history.find(h=>h.details?.command==='SWITCH'&&h.details.activeInstanceId===own.active.id).turnNumber--;break;
      case 'stadiumPresent':own.deck.push(start.stadium);start.stadium=null;start.stadiumOwner=null;break;
      case 'ownNamedEnergy':for(const c of [...own.active.energyCards])if(c.name===plan.name)own.deck.push(own.active.energyCards.splice(own.active.energyCards.indexOf(c),1)[0]);break;
      case 'sharedFieldType':{
        const i=other.bench.findIndex(c=>rec(c).facts.types.every(type=>!rec(own.active).facts.types.includes(type)));
        if(i<0)return {status:'BLOCKED',reason:'NO_NEGATIVE_SHARED_TYPE_FIXTURE'};
        [other.active,other.bench[i]]=[other.bench[i],other.active];
        for(const side of [own,other])for(const card of side.bench.splice(0)){
          assert(!card.evolutionCards?.length&&!card.tools?.length&&!card.energyCards?.length);
          side.deck.push(card);
        }
        break;
      }
      case 'ownHandEmpty':own.hand.push(own.deck.shift());break;
      case 'ownDeckAtMost':while(own.deck.length<=plan.threshold&&own.discard.length)own.deck.push(own.discard.pop());break;
      case 'ownPrizesExact':case 'opponentPrizesExact':{
        const side=plan.predicate==='ownPrizesExact'?own:other;
        if(side.prizes>1){side.prizes--;side.hand.push(side.prizeCards.pop());}
        else if(side.hand.length){side.prizes++;side.prizeCards.push(side.hand.pop());}
        break;
      }
      case 'allDamagedBench':own.bench[0].damage=0;break;
      case 'ownBenchNamed':case 'ownBenchContains':{
        for(let i=own.bench.length-1;i>=0;i--)if(nameMatches(own.bench[i])){
          const c=own.bench.splice(i,1)[0];
          const raw=card=>{
            const out=JSON.parse(JSON.stringify(card));
            if(out.evolutionCards?.length){assert(out.validationBase,'EVOLUTION_BASE_METADATA_MISSING');Object.assign(out,out.validationBase);}
            for(const key of ['cardId','damage','enteredTurn','evolvedTurn','energyCards','energies','tools','statusCondition','statusConditionInfo','evolutionCards','validationBase','entryWindow','referenceEvolutionWindow'])delete out[key];
            return out;
          };
          own.deck.push(...(c.energyCards||[]),...(c.tools||[]),...(c.evolutionCards||[]).map(raw),raw(c));
        }break;
      }
      case 'ownStadium':case 'stadiumContains':own.deck.push(start.stadium);start.stadium=null;start.stadiumOwner=null;break;
      case 'opponentType':case 'opponentResistance':case 'opponentTera':{
        const i=other.bench.findIndex(c=>!matches(c));if(i<0)return {status:'BLOCKED',reason:'NO_NEGATIVE_DEFENDER_FIXTURE'};
        [other.active,other.bench[i]]=[other.bench[i],other.active];break;
      }
      case 'ownSpecialEnergy':for(const c of [...own.active.energyCards])if(c.isSpecial){own.active.energyCards.splice(own.active.energyCards.indexOf(c),1);own.deck.push(c);}break;
    }
    if(positive(start))return {status:'BLOCKED',reason:'NO_NEGATIVE_BOARD_PREDICATE_FIXTURE'};
    assert.deepEqual(S.identities(before),S.identities(start));
    const replay=port(start);
    if(!replay.dispatch('you',plan.optional?{...action,selections:{...action.selections,stadiumBonus:[]}}:action).ok)return {status:'BLOCKED',reason:'NEGATIVE_PREDICATE_ATTACK_UNPAYABLE'};
    // Special energy with damage penalty or a stadium modifier must not be
    // declared qualified by a simplified damage formula.
    if(plan.predicate==='ownSpecialEnergy'&&before.players[0].active.energyCards.some(c=>c.isSpecial&&rec(c)?.mainPlan?.damagePenalty))return {status:'BLOCKED',reason:'SPECIAL_ENERGY_PENALTY_PROOF_REQUIRED'};
    if(plan.discardStadium){
      assert.equal(after.stadium,null);
      if(plan.optional){
        const optional=port(before);
        const decline={...action,selections:{...action.selections,stadiumBonus:[]}};
        assert(optional.dispatch('you',decline).ok);
        verifyPrintedAttack(before,optional.getSnapshot(),e,plan.base);
        assert.equal(optional.getSnapshot().stadium.id,before.stadium.id);
        const discardIndex=effectEvents.findIndex(step=>step?.command==='DISCARD'&&step.fromZone==='stadium');
        const damageIndex=effectEvents.findIndex(step=>step?.command==='DAMAGE'&&step.targetInstanceId===before.players[1].active.id);
        assert(discardIndex>=0&&damageIndex>discardIndex);
      }
      assert(after.players.find(p=>p.id===before.stadiumOwner).discard.some(c=>c.id===before.stadium.id));
    }
    verifyPrintedAttack(before,after,e,plan.base+plan.bonus);
    verifyPrintedAttack(start,replay.getSnapshot(),e,plan.base);
  }
  if(e.plan.mechanic==='MASS_CONTEXT_BONUS'){
    const plan=e.plan,own=before.players[0],other=before.players[1];
    const trueCondition=plan.predicate==='equalHand'?own.hand.length===other.hand.length:plan.predicate==='opponentBench'?other.bench.length>=plan.threshold:plan.predicate==='ownTypedBench'?own.bench.some(c=>E.getReferenceEffectRecord(c).facts.types.includes(plan.type)&&(plan.stage===null||E.getReferenceEffectRecord(c).facts.stage===plan.stage)):plan.statuses.includes((plan.predicate==='ownStatus'?own.active:other.active).statusCondition);
    assert(trueCondition);
    verifyPrintedAttack(before,after,e,plan.base+plan.bonus);
    const start=JSON.parse(JSON.stringify(before));
    if(plan.predicate==='equalHand'){start.players[0].hand.push(start.players[0].deck.shift());}
    else if(plan.predicate==='opponentBench'||plan.predicate==='ownTypedBench'){const side=start.players[plan.predicate==='opponentBench'?1:0];side.deck.push(...side.bench.splice(0));}
    else start.players[plan.predicate==='ownStatus'?0:1].active.statusCondition=null;
    const replay=port(start),action=t.action||o.action;
    assert(replay.dispatch("you",action).ok);
    verifyPrintedAttack(start,replay.getSnapshot(),e,plan.base);
  }
  if(e.plan.mechanic==='ABILITY_EVOLVE_FORCE_SWITCH'){
    const action=t.action||o.action,own=before.players[0],other=before.players[1],resolved=after.players[1];
    const source=[own.active,...own.bench].find(c=>c.id===t.sourceId);
    assert(source?.evolutionCards?.length&&source.referenceEvolutionWindow===before.referenceActionSequence);
    assert.equal(resolved.active.id,action.selections.bench[0]);
    assert(resolved.bench.some(c=>c.id===other.active.id));
    assert.deepEqual(S.identities(before),S.identities(after));
    if(e.plan.maxRemainingHp){
      const threshold=e.plan.maxRemainingHp;
      const selected=other.bench.find(c=>c.id===action.selections.bench[0]);
      const excluded=other.bench.find(c=>c.hp-(c.damage||0)>threshold&&c.hp>threshold);
      assert(selected&&selected.hp-(selected.damage||0)>0&&selected.hp-(selected.damage||0)<=threshold,'LOW_HP_SWITCH_POSITIVE_FIXTURE');
      assert(excluded,'LOW_HP_SWITCH_NEGATIVE_FIXTURE');
      const invalid={...action,selections:{...action.selections,bench:[excluded.id]}};
      const denied=port(before);assert.equal(denied.dispatch('you',invalid).ok,false);
      assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(before));
      const boundary=JSON.parse(JSON.stringify(before)),card=boundary.players[1].bench.find(c=>c.id===excluded.id);
      card.damage=card.hp-threshold;
      const replay=port(boundary);assert(replay.dispatch('you',invalid).ok);
      const result=replay.getSnapshot();assert.equal(result.players[1].active.id,excluded.id);
      assert.equal(result.players[1].active.hp-result.players[1].active.damage,threshold);
      assert.deepEqual(Array.from(S.identities(boundary)),Array.from(S.identities(result)));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(result));
    }
    const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
    const late=port(closed);assert.equal(late.dispatch('you',action).ok,false);assert.equal(JSON.stringify(late.getSnapshot()),JSON.stringify(closed));
    assert.equal(p.dispatch('you',action).ok,false);assert.equal(JSON.stringify(p.getSnapshot()),JSON.stringify(after));
  }
  if(e.plan.mechanic==="ABILITY_SWITCH_OWN"){
    const action=t.action||o.action,own=before.players[0],resolved=after.players[0];
    assert.equal(resolved.active.id,action.selections.ownBench[0]);
    if(e.plan.selfBenchOnly){
      assert.equal(resolved.active.id,t.sourceId);
      assert(own.bench.some(c=>c.id===t.sourceId));
      const active=JSON.parse(JSON.stringify(before)),side=active.players[0],i=side.bench.findIndex(c=>c.id===t.sourceId);
      [side.active,side.bench[i]]=[side.bench[i],side.active];
      const denied=port(active);assert.equal(denied.dispatch('you',action).ok,false,'SELF_SWITCH_ACTIVE_DENIED');
      assert.deepEqual(B.canonical(JSON.parse(JSON.stringify(denied.getSnapshot()))),B.canonical(active),'SELF_SWITCH_REJECTION_MUST_NOT_MUTATE_STATE');
    }
    assert(resolved.bench.some(c=>c.id===own.active.id));
    assert.equal(p.dispatch("you",action).ok,false);
    assert.deepEqual(p.getSnapshot(),after);
    const none=JSON.parse(JSON.stringify(before));none.players[0].deck.push(...none.players[0].bench.splice(0));
    const replay=port(none);assert.equal(replay.dispatch("you",action).ok,false);
  }
  if(["ABILITY_SEARCH_TYPED_EVOLUTION","TRAINER_SEARCH_TERA"].includes(e.plan.mechanic)){
    const plan=e.plan,action=t.action||o.action,chosen=action.selections.cards,own=before.players[0],resolved=after.players[0];
    assert(chosen.length>0&&chosen.length<=plan.limit);
    for(const id of chosen){
      const c=own.deck.find(c=>c.id===id);assert(c?.kind==="pokemon");
      const facts=E.getReferenceEffectRecord(c).facts;
      assert(plan.mechanic==="TRAINER_SEARCH_TERA"?facts.teraBenchProtection:facts.stage>0&&facts.types.includes(plan.type));
      assert(resolved.hand.some(c=>c.id===id)&&!resolved.deck.some(c=>c.id===id));
    }
    assert.deepEqual(resolved.deck.map(c=>c.id).sort(),own.deck.filter(c=>!chosen.includes(c.id)).map(c=>c.id).sort());
    assert(effectEvents.some(ev=>ev?.command==="REVEAL"&&chosen.every(id=>ev.cardIds?.includes(id))));
    assert(effectEvents.some(ev=>ev?.command==="SHUFFLE_DECK"&&!ev.reference));
    const invalid=own.deck.find(c=>c.kind!=="pokemon");
    if(invalid){const replay=port(before);assert.equal(replay.dispatch("you",{...action,selections:{cards:[invalid.id]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));}
  }
  if(e.plan.mechanic==='TRAINER_TEAM_DAMAGE_REDUCTION'){
    const plan=e.plan,own=after.players[0];
    assert(own.referenceTeamDamageReductions.some(x=>x.turn===after.turnNumber+1&&x.type===plan.type&&x.amount===plan.amount));
    const ended=port(after),end=E.getLegalActions(after,'you').actions.find(a=>a.type==='end_turn');
    if(!end||!ended.dispatch('you',end).ok)return {status:'BLOCKED',reason:'NO_TEAM_REDUCTION_END_TURN'};
    const protectedState=ended.getSnapshot(),baseline=JSON.parse(JSON.stringify(protectedState));
    delete baseline.players[0].referenceTeamDamageReductions;
    const attacks=E.getReferenceEffectRecord(baseline.players[1].active).attacks;
    const incoming=E.getLegalActions(baseline,'ai').actions.filter(a=>a.type==='attack_turn'&&attacks[a.attackIndex].plan.mechanic==='VANILLA_DAMAGE');
    const damage=(state,action)=>{const replay=port(state);if(!replay.dispatch('ai',action).ok)return undefined;return replay.getSnapshot().history.slice(state.history.length).find(ev=>ev.details?.command==='DAMAGE'&&ev.details.targetInstanceId===state.players[0].active.id)?.details.amount;};
    let tested=0;
    for(const action of incoming){
      const normal=damage(baseline,action);if(!(normal>0))continue;
      assert.equal(damage(protectedState,action),Math.max(0,normal-plan.amount));
      assert.equal(damage({...protectedState,turnNumber:protectedState.turnNumber+2},action),normal);
      const newlyActive=JSON.parse(JSON.stringify(protectedState)),side=newlyActive.players[0];
      const eligible=side.bench.findIndex(c=>!plan.type||E.getReferenceEffectRecord(c).facts.types.includes(plan.type));
      if(eligible<0)return {status:'BLOCKED',reason:'NO_TEAM_REDUCTION_OTHER_TARGET'};
      [side.active,side.bench[eligible]]=[side.bench[eligible],side.active];
      const newlyBase=JSON.parse(JSON.stringify(newlyActive));delete newlyBase.players[0].referenceTeamDamageReductions;
      const normalOther=damage(newlyBase,action);if(!(normalOther>0))continue;
      assert.equal(damage(newlyActive,action),Math.max(0,normalOther-plan.amount));
      if(plan.type){
        const wrong=JSON.parse(JSON.stringify(protectedState)),s=wrong.players[0],i=s.bench.findIndex(c=>!E.getReferenceEffectRecord(c).facts.types.includes(plan.type));
        if(i<0)return {status:'BLOCKED',reason:'NO_TEAM_REDUCTION_WRONG_TYPE'};
        [s.active,s.bench[i]]=[s.bench[i],s.active];const wrongBase=JSON.parse(JSON.stringify(wrong));delete wrongBase.players[0].referenceTeamDamageReductions;
        assert.equal(damage(wrong,action),damage(wrongBase,action));
      }
      tested++;break;
    }
    if(!tested)return {status:'BLOCKED',reason:'NO_TEAM_REDUCTION_POSITIVE_DAMAGE'};
  }
  if(e.plan.mechanic==="TRAINER_TYPED_DAMAGE_BOOST"){
    const plan=e.plan,own=after.players[0];
    assert(own.referenceTypedDamageBoosts.some(boost=>boost.turn===after.turnNumber&&boost.type===plan.type&&boost.amount===plan.amount));
    const base=JSON.parse(JSON.stringify(after));delete base.players[0].referenceTypedDamageBoosts;
    const active=own.active,attacks=E.getReferenceEffectRecord(active).attacks;
    const action=E.getLegalActions(base,"you").actions.find(a=>a.type==="attack_turn"&&attacks[a.attackIndex].plan.mechanic==="VANILLA_DAMAGE");
    if(!action)return {status:"BLOCKED",reason:"NO_LEGAL_DAMAGE_BOOST_ATTACK"};
    const damage=state=>{const replay=port(state);assert(replay.dispatch("you",action).ok);return replay.getSnapshot().history.slice(state.history.length).find(ev=>ev.details?.command==="DAMAGE"&&ev.details.targetInstanceId===state.players[1].active.id)?.details.amount;};
    const normal=damage(base),boosted=damage(after);
    const def=E.getReferenceEffectRecord(after.players[1].active).facts,attacker=E.getReferenceEffectRecord(active).facts;
    const weak=def.weakness?.types.some(t=>attacker.types.includes(t))?2:1;
    if(!(normal>0))return {status:"BLOCKED",reason:"NO_POSITIVE_DAMAGE_BOOST_FIXTURE"};
    assert.equal(boosted,normal+plan.amount*weak);
    const expired={...after,turnNumber:after.turnNumber+2};assert.equal(damage(expired),normal);
  }
  if(['ABILITY_TYPED_COST_DRAW_LIMIT','SUPPORTER_NON_RULE_DISCARD_DRAW'].includes(e.plan.mechanic)){
    const own=before.players[0],resolved=after.players[0],plan=e.plan,action=t.action||o.action,chosen=action.selections.discard;
    const source=[own.active,...own.bench].find(c=>c?.id===t.sourceId);
    const ability=plan.mechanic==='ABILITY_TYPED_COST_DRAW_LIMIT';
    const pool=ability&&plan.zone==='attached'?source.energyCards:own.hand;
    const valid=c=>ability?c.kind==='energy'&&!c.isSpecial&&c.energyType===plan.type:c.kind==='pokemon'&&!E.getReferenceEffectRecord(c).facts.rulePokemon;
    assert(chosen.length>0&&chosen.every(id=>pool.some(c=>c.id===id&&valid(c))));
    assert(chosen.every(id=>resolved.discard.some(c=>c.id===id)));
    const remaining=own.hand.length-(ability?(plan.zone==='hand'?1:0):chosen.length+1);
    const amount=ability?(plan.amount??Math.max(0,plan.limit-remaining)):chosen.length*plan.unit;
    const drawn=own.deck.slice(0,amount);
    assert.equal(resolved.hand.length,remaining+drawn.length);
    assert(drawn.every(c=>resolved.hand.some(x=>x.id===c.id)));
    assert.deepEqual(resolved.deck.map(c=>c.id),own.deck.slice(drawn.length).map(c=>c.id));
    const invalid=pool.find(c=>!valid(c));
    if(invalid){const replay=port(before);assert.equal(replay.dispatch('you',{...action,selections:{...action.selections,discard:[invalid.id]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));}
    const replay=port(before);
    assert.equal(replay.dispatch('you',{...action,selections:{...action.selections,discard:[]}}).ok,false);
    assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    if(plan.partnerName){
      const absent=JSON.parse(JSON.stringify(before)),side=absent.players[0];
      const i=side.bench.findIndex(c=>E.getReferenceEffectRecord(c).name===plan.partnerName);
      if(i<0)return {status:'BLOCKED',reason:'NO_TYPED_DRAW_PARTNER_FIXTURE'};
      side.deck.push(side.bench.splice(i,1)[0]);
      const missing=port(absent);
      assert.equal(missing.dispatch('you',action).ok,false);
      assert.equal(JSON.stringify(missing.getSnapshot()),JSON.stringify(absent));
      const other=resolved.bench.find(c=>c.id!==source.id&&E.getReferenceEffectRecord(c).officialCardId===E.getReferenceEffectRecord(source).officialCardId);
      const payment=resolved.hand.find(valid);
      if(!other||!payment)return {status:'BLOCKED',reason:'NO_SHARED_TYPED_DRAW_SECOND_COPY'};
      const second={...action,sourceInstanceId:other.id,selections:{...action.selections,discard:[payment.id]}};
      const repeated=port(after);
      assert.equal(repeated.dispatch('you',second).ok,false);
      assert.equal(JSON.stringify(repeated.getSnapshot()),JSON.stringify(after));
      const cleared=JSON.parse(JSON.stringify(after));
      delete cleared.players[0].turnLimits.abilityNames[plan.sharedUseName];
      assert(port(cleared).dispatch('you',second).ok);
    }
  }
  if(["ABILITY_DISCARD_DRAW","ABILITY_ATTACH_SELF_DRAW"].includes(e.plan.mechanic)){
    const action=t.action||o.action,own=before.players[0],resolved=after.players[0],plan=e.plan;
    const costKey=plan.mechanic==="ABILITY_DISCARD_DRAW"?"discard":"energy",chosen=action.selections[costKey];
    const count=plan.mechanic==="ABILITY_DISCARD_DRAW"?plan.cost:1;
    assert.equal(chosen.length,count);
    assert(chosen.every(id=>own.hand.some(c=>c.id===id)));
    assert(chosen.every(id=>!resolved.hand.some(c=>c.id===id)));
    const drawn=own.deck.slice(0,plan.amount).map(c=>c.id);
    assert.deepEqual(resolved.deck.map(c=>c.id),own.deck.slice(drawn.length).map(c=>c.id));
    assert(drawn.every(id=>resolved.hand.some(c=>c.id===id)));
    assert.equal(resolved.hand.length,own.hand.length-count+drawn.length);
    if(costKey==="discard")assert(chosen.every(id=>resolved.discard.some(c=>c.id===id)));
    else {
      const source=[resolved.active,...resolved.bench].find(c=>c?.id===t.sourceId);
      assert(own.hand.some(c=>c.id===chosen[0]&&c.kind==="energy"&&!c.isSpecial&&c.energyType===plan.type));
      assert(source.energyCards.some(c=>c.id===chosen[0]));
      assert.equal(resolved.normalEnergyAttached,own.normalEnergyAttached);
    }
    const replay=port(before);
    assert.equal(replay.dispatch("you",{...action,selections:{...action.selections,[costKey]:[]}}).ok,false);
    assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    const invalid=port(before);
    assert.equal(invalid.dispatch("you",{...action,selections:{...action.selections,[costKey]:["not-a-physical-card"]}}).ok,false);
    assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
    const repeated=port(after);
    assert.equal(repeated.dispatch("you",action).ok,false);
    assert.deepEqual(repeated.getSnapshot(),after);
  }
  if (e.plan.mechanic === "TRAINER_SWITCH_BOTH") {
    const selections=o.action.selections;
    assert.equal(after.players[1].active.id,selections.opponentBench[0]);
    assert.equal(after.players[0].active.id,selections.ownBench[0]);
    const switched=effectEvents.filter(step=>step?.command==="SELECT_BENCH_SWITCH");
    assert.deepEqual(Array.from(switched,step=>step.playerId),["ai","you"]);
    const start=JSON.parse(JSON.stringify(before));
    start.players[0].deck.push(...start.players[0].bench.splice(0));
    const replay=port(start);
    assert(replay.dispatch("you",{...o.action,selections:{opponentBench:selections.opponentBench}}).ok);
    assert.equal(replay.getSnapshot().players[1].active.id,selections.opponentBench[0]);
    const noOpponent=JSON.parse(JSON.stringify(before));
    noOpponent.players[1].deck.push(...noOpponent.players[1].bench.splice(0));
    assert.equal(port(noOpponent).dispatch("you",o.action).ok,false);
  }
  if(e.plan.mechanic==='SUPPORTER_ROCKET_SWITCH_BOTH'){
    const a=t.action||o.action,q=a.selections;
    assert(E.getReferenceEffectRecord(before.players[0].active).name.startsWith('ロケット団の'));
    assert.equal(after.players[0].active.id,q.ownBench[0]);
    assert(E.getReferenceEffectRecord(after.players[0].active).name.startsWith('ロケット団の'));
    if(before.players[1].bench.length)assert.equal(after.players[1].active.id,q.opponentBench[0]);
    const switched=effectEvents.filter(ev=>ev?.command==='SELECT_BENCH_SWITCH');
    assert.deepEqual(Array.from(switched,ev=>ev.playerId),before.players[1].bench.length?['you','ai']:['you']);
    const invalid=before.players[0].bench.find(c=>!E.getReferenceEffectRecord(c).name.startsWith('ロケット団の'));
    if(invalid){const replay=port(before);assert.equal(replay.dispatch('you',{...a,selections:{...q,ownBench:[invalid.id]}}).ok,false);assert.deepEqual(replay.getSnapshot(),before);}
  }
  if(e.plan.mechanic==='SUPPORTER_BASIC_SWITCH_CONFUSE'){
    const a=t.action||o.action,q=a.selections;
    assert.equal(after.players[1].active.id,q.opponentBench[0]);
    assert(E.getReferenceEffectRecord(after.players[1].active).facts.basic);
    assert.equal(after.players[1].active.statusCondition,'CONFUSED');
    const invalid=before.players[1].bench.find(c=>!E.getReferenceEffectRecord(c).facts.basic);
    if(invalid){const replay=port(before);assert.equal(replay.dispatch('you',{...a,selections:{...q,opponentBench:[invalid.id]}}).ok,false);assert.deepEqual(replay.getSnapshot(),before);}
  }
  if(e.plan.mechanic==='SUPPORTER_SWITCH_EX_HEAL'){
    const a=t.action||o.action,q=a.selections,old=before.players[0].active;
    assert(E.getReferenceEffectRecord(old).name.endsWith('ex'));
    assert.equal(after.players[0].active.id,q.ownBench[0]);
    assert.equal(after.players[0].bench.find(c=>c.id===old.id).damage,Math.max(0,old.damage-e.plan.amount));
    const nonEx=before.players[0].bench.find(c=>E.getReferenceEffectRecord(c).facts.basic&&!E.getReferenceEffectRecord(c).name.endsWith('ex'));
    if(nonEx){
      const control=JSON.parse(JSON.stringify(before)),side=control.players[0],i=side.bench.findIndex(c=>c.id===nonEx.id);
      const oldActive=side.active;side.active=side.bench[i];side.bench[i]=oldActive;side.active.damage=Math.min(30,side.active.hp-10);
      const negative=port(control);assert(negative.dispatch('you',{...a,selections:{...q,ownBench:[oldActive.id]}}).ok);
      assert.equal(negative.getSnapshot().players[0].bench.find(c=>c.id===nonEx.id).damage,side.active.damage);
    }
  }
  if (e.plan.mechanic === "SUPPORTER_SWITCH_THEN_DRAW_TO_LIMIT") {
    assert.equal(after.players[0].active.id,o.action.selections.ownBench[0]);
    const startingHand=attackingSide.hand.length-1;
    const drawCount=Math.min(attackingSide.deck.length,Math.max(0,e.plan.limit-startingHand));
    assert.equal(after.players[0].hand.length,startingHand+drawCount);
    const noBench=JSON.parse(JSON.stringify(before));
    noBench.players[0].deck.push(...noBench.players[0].bench.splice(0));
    assert.equal(port(noBench).dispatch("you",o.action).ok,false);
  }
  if (e.plan.mechanic === "SUPPORTER_SEARCH_BY_STAGE") {
    const selection=o.action.selections.cards;
    assert(selection.length>0);
    const stages=selection.map(id=>E.getReferenceEffectRecord(attackingSide.deck.find(c=>c.id===id)).facts.stage);
    assert.equal(stages.length,new Set(stages).size);
    assert(selection.every(id=>after.players[0].hand.some(c=>c.id===id)));
    assert(effectEvents.some(step=>step?.command==="SHUFFLE_DECK"));
    const known=attackingSide.deck.filter(card=>card.kind==="pokemon");
    const sameStage=known.find(card=>known.some(second=>second.id!==card.id&&
      E.getReferenceEffectRecord(second).facts.stage===E.getReferenceEffectRecord(card).facts.stage));
    assert(sameStage);
    const other=known.find(card=>card.id!==sameStage.id&&
      E.getReferenceEffectRecord(card).facts.stage===E.getReferenceEffectRecord(sameStage).facts.stage);
    assert.equal(port(before).dispatch("you",{...o.action,selections:{cards:[sameStage.id,other.id]}}).ok,false);
  }
  if (e.plan.mechanic === "ATTACK_OPTIONAL_DRAW_TO_LIMIT") {
    const chosen=o.action.selections.drawChoice;
    assert.deepEqual(Array.from(chosen),["draw"]);
    const amount=Math.min(attackingSide.deck.length,e.plan.limit-attackingSide.hand.length);
    assert.equal(after.players[0].hand.length,attackingSide.hand.length+amount);
    const replay=port(before);
    assert(replay.dispatch("you",{...o.action,selections:{drawChoice:["skip"]}}).ok);
    assert.equal(replay.getSnapshot().players[0].hand.length,attackingSide.hand.length);
  }
  if (e.plan.mechanic === "ATTACK_HEAL_OWN_TARGET") {
    const target=o.action.selections.healTarget[0];
    const original=[attackingSide.active,...attackingSide.bench].find(card=>card.id===target);
    assert(effectEvents.some(step=>step?.command==="HEAL"&&step.targetInstanceId===target&&step.amount===Math.min(original.damage,e.plan.amount)));
  }
  if (["ATTACK_DISCARD_FIELD_BASIC","ATTACK_DISCARD_DEFENDER_ENERGY"].includes(e.plan.mechanic)) {
    const own=e.plan.mechanic==="ATTACK_DISCARD_FIELD_BASIC",side=own?0:1,energy=o.action.selections.energy;
    assert(energy.length>0);
    for(const id of energy) {
      assert(after.players[side].discard.some(card=>card.id===id));
      assert(effectEvents.some(step=>step?.command==="DISCARD"&&step.fromZone==="attached"&&step.cardIds?.includes(id)));
    }
    if(!own&&e.plan.type){
      const action=t.action||o.action,wrong=defendingSide.active.energyCards.find(c=>!c.isSpecial&&c.energyType!==e.plan.type);
      assert(wrong&&energy.every(id=>defendingSide.active.energyCards.some(c=>c.id===id&&!c.isSpecial&&c.energyType===e.plan.type)));
      assert(after.players[1].active.energyCards.some(c=>c.id===wrong.id));
      const denied=port(before);
      assert.equal(denied.dispatch('you',{...action,selections:{...action.selections,energy:[wrong.id]}}).ok,false);
      assert.deepEqual(denied.getSnapshot(),before);
      const noMatch=JSON.parse(JSON.stringify(before)),other=noMatch.players[1];
      const removed=other.active.energyCards.filter(c=>c.energyType===e.plan.type);
      other.active.energyCards=other.active.energyCards.filter(c=>!removed.includes(c));other.deck.push(...removed);
      const replay=port(noMatch);assert(replay.dispatch('you',{...action,selections:{...action.selections,energy:[]}}).ok);
      assert(replay.getSnapshot().players[1].active.energyCards.some(c=>c.id===wrong.id));
      assert.deepEqual(S.identities(before),S.identities(replay.getSnapshot()));
    }
    if(!own&&e.plan.defenderEx)assert(E.getReferenceEffectRecord(defendingSide.active).name.endsWith('ex'));
    if(own)assert(effectEvents.some(step=>step?.command==="DAMAGE"&&step.targetInstanceId===defendingSide.active.id));
  }
  if (e.plan.mechanic === "ATTACK_DISABLE_SELECTED_MOVE") {
    const move=E.getReferenceEffectRecord(defendingSide.active).attacks.find(attack=>attack.effectId===o.action.selections.attackChoice[0]);
    const target=[after.players[1].active,...after.players[1].bench].find(card=>card?.id===defendingSide.active.id);
    if(target) {
      assert.equal(target.referenceNamedAttackLock?.turn,before.turnNumber+1);
      assert.equal(target.referenceNamedAttackLock?.attackName,move.name);
    } else assert(after.players[1].discard.some(card=>card.id===defendingSide.active.id));
  }
  if(e.plan.mechanic==='INSPECTED_OPPONENT_HAND_TRANSFER'){
    const plan=e.plan,action=t.action||o.action,other=before.players[1],resolved=after.players[1],chosen=action.selections.opponentCards;
    const valid=c=>{const k=E.getReferenceEffectRecord(c)?.category;return plan.filter==='any'||plan.filter==='itemTool'&&['item','tool'].includes(k)||plan.filter===k;};
    if(!chosen.length)return {status:'BLOCKED',reason:'NO_INSPECTED_HAND_SELECTION_PROOF'};
    assert(chosen.every(id=>other.hand.some(c=>c.id===id&&valid(c))));
    const drawCount=after.turnNumber>before.turnNumber&&after.turnPlayer==='ai'&&other.deck.length?1:0;
    const expectedHand=[...Array.from(other.hand.filter(c=>!chosen.includes(c.id)),c=>c.id),...Array.from(other.deck.slice(0,drawCount),c=>c.id)];
    assert.deepEqual(Array.from(resolved.hand,c=>c.id),expectedHand);
    assert(effectEvents.some(ev=>ev?.command==='REVEAL'&&ev.privateTo==='you'&&ev.fromZone==='hand'&&JSON.stringify(ev.cardIds)===JSON.stringify(other.hand.map(c=>c.id))));
    if(plan.destination==='discard')assert(chosen.every(id=>resolved.discard.some(c=>c.id===id)));
    else {assert.deepEqual(Array.from(resolved.deck,c=>c.id),[...Array.from(other.deck.slice(drawCount),c=>c.id),...Array.from(chosen)]);assert(!effectEvents.some(ev=>ev?.command==='SHUFFLE_DECK'));}
    if(plan.all)assert.equal(chosen.length,other.hand.filter(valid).length);
    if(plan.filter!=='any'){
      const invalid=other.hand.find(c=>!valid(c));
      if(!invalid)return {status:'BLOCKED',reason:'NO_INSPECTED_HAND_NEGATIVE_FIXTURE'};
      const denied=port(before);assert.equal(denied.dispatch('you',{...action,selections:{...action.selections,opponentCards:[invalid.id]}}).ok,false);assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(before));
    }
    if(action.type==='attack_turn'&&Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
  }
  if (e.plan.mechanic === "ATTACK_BLIND_HAND_CHOICE") {
    assert(o.requests[0].candidates.every(c=>/^hand-slot-\d+$/.test(c.id)&&!c.validationReference));
    const prior=defendingSide.hand;
    const moved=prior.filter(card=>!after.players[1].hand.some(now=>now.id===card.id));
    assert.equal(moved.length,Math.min(e.plan.amount,prior.length));
    assert(moved.every(card=>after.players[1][e.plan.destination].some(now=>now.id===card.id)));
    if(e.plan.destination==="deck") assert(effectEvents.some(step=>step?.command==="REVEAL"&&
      step.privateTo==="you"&&moved.every(card=>step.cardIds.includes(card.id))));
  }
  if (["ATTACK_SPLASH_OWN_BENCH","ATTACK_SPREAD_DAMAGE"].includes(e.plan.mechanic)) {
    const plan=e.plan,action=t.action||o.action;
    const pool=plan.mechanic==="ATTACK_SPLASH_OWN_BENCH"||plan.scope==="ownBench" ? attackingSide.bench :
      plan.scope==="bothBench"?[...attackingSide.bench,...defendingSide.bench]:plan.scope==="opponentBench"?defendingSide.bench:[defendingSide.active,...defendingSide.bench];
    const targets=pool.filter(card=>{
      if(plan.requiresDamage||plan.filter==='damaged')return card.damage>0;
      if(plan.filter==='ex'||plan.filter==='exV'){const name=E.getReferenceEffectRecord(card)?.name||'';return name.endsWith('ex')||plan.filter==='exV'&&/V(?:MAX|STAR|-UNION)?$/.test(name);}
      return true;
    });
    const chosen=plan.count==null?targets.map(card=>card.id):o.action.targetIds;
    if(plan.filter||plan.metric||plan.scope==='bothBench'){
      const expected=plan.metric==='opponentPrizesTaken'?plan.amount*(6-defendingSide.prizes):plan.amount;
      assert(chosen.every(id=>targets.some(c=>c.id===id)));
      assert(chosen.every(id=>effectEvents.some(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===id&&ev.amount===expected)));
      const notChosen=pool.filter(c=>!chosen.includes(c.id)&&!(Number(e.damage)>0&&c.id===defendingSide.active.id));
      assert(notChosen.every(c=>!effectEvents.some(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===c.id&&ev.amount>0)));
      if(Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
      if(plan.filter&&plan.count!==null){
        const wrong=pool.find(c=>!targets.includes(c));
        assert(wrong,'NO_FILTER_NEGATIVE_TARGET');
        const invalid=port(before),action=t.action||o.action;
        assert.equal(invalid.dispatch('you',{...action,targetIds:[wrong.id]}).ok,false);
        assert.deepEqual(B.canonical(invalid.getSnapshot()),B.canonical(before));
      }
    }
    assert(chosen.length>0);
    assert(chosen.every(id=>effectEvents.some(step=>step?.command==="DAMAGE"&&step.targetInstanceId===id
      &&(!plan.ignoreDefense||step.amount===plan.amount))));
    if(plan.counterUnit){
      assert.deepEqual(Array.from(chosen),[defendingSide.active.id]);
      assert(defendingSide.active.damage>0);
      verifyPrintedAttack(before,after,e,defendingSide.active.damage/10*plan.counterUnit);
      const replay=port(before),bench=defendingSide.bench[0];
      assert(bench);
      assert(replay.dispatch('you',{...action,targetIds:[bench.id]}).ok);
      assert(replay.getSnapshot().history.slice(before.history.length).some(step=>step.details?.command==='DAMAGE'&&step.details.targetInstanceId===bench.id&&step.details.amount===0));
    }
    if(plan.prizeUnit||plan.requiresDamage){
      const expected=plan.prizeUnit?(6-defendingSide.prizes)*plan.prizeUnit:plan.amount;
      const benchEvents=effectEvents.filter(step=>step?.command==='DAMAGE'&&targets.some(c=>c.id===step.targetInstanceId));
      assert.equal(benchEvents.length,chosen.length);
      assert(benchEvents.every(step=>chosen.includes(step.targetInstanceId)&&step.amount===expected));
      verifyPrintedAttack(before,after,e,Number(e.damage));
      const noBonus=JSON.parse(JSON.stringify(before)),other=noBonus.players[1];
      if(plan.requiresDamage){
        for(const mon of other.bench)mon.damage=0;
        const invalid=port(noBonus);assert.equal(invalid.dispatch('you',action).ok,false);
        assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(noBonus));
      }else{
        other.prizes++;other.prizeCards.push(other.hand.pop());
      }
      const replay=port(noBonus);
      const next=plan.requiresDamage?{...action,targetIds:[]}:action;
      assert(replay.dispatch('you',next).ok);
      assert(!replay.getSnapshot().history.slice(before.history.length).some(step=>step.details?.command==='DAMAGE'&&step.details.amount>0&&other.bench.some(mon=>mon.id===step.details.targetInstanceId)));
    }

    if(e.plan.discardAttached!==undefined){
      const plan=e.plan,action=t.action||o.action,attached=attackingSide.active.energyCards;
      const picked=plan.discardAttached==='all'?attached.map(c=>c.id):action.selections.energy;
      assert(picked.length>0&&new Set(picked).size===picked.length);
      assert(picked.every(id=>attached.some(c=>c.id===id)));
      assert(picked.every(id=>after.players[0].discard.some(c=>c.id===id)));
      const discardEvents=effectEvents.filter(ev=>ev?.command==='DISCARD'&&ev.sourceInstanceId===attackingSide.active.id);
      assert.deepEqual(Array.from(discardEvents).flatMap(ev=>Array.from(ev.cardIds)).sort(),Array.from(picked).sort());
      // Discard must precede the selected-target damage; printed Active
      // damage (the primary attack) is applied first when present.
      const lastDiscard=effectEvents.lastIndexOf(discardEvents.at(-1));
      assert(chosen.every(id=>effectEvents.some((ev,i)=>i>lastDiscard&&ev?.command==='DAMAGE'&&ev.targetInstanceId===id)));
      if(Number.isInteger(plan.discardAttached)){
        const invalid=port(before);
        assert.equal(invalid.dispatch('you',{...action,selections:{...action.selections,energy:[]}}).ok,false);
        assert.deepEqual(B.canonical(invalid.getSnapshot()),B.canonical(before));
      }
      const selectedActive=chosen.includes(defendingSide.active.id);
      if(Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
      else if(selectedActive)verifyPrintedAttack(before,after,e,plan.amount);
    }
  }
  if(e.plan.mechanic==='ATTACK_MOVE_BENCH_COUNTERS'){
    const plan=e.plan,action=t.action||o.action;
    const source=attackingSide.bench.find(c=>c.id===action.selections.counterSource[0]);
    const target=plan.targetActive?defendingSide.active:[defendingSide.active,...defendingSide.bench].find(c=>c.id===action.targetIds[0]);
    assert(source.damage>=40&&target);
    if(plan.team)assert(E.getReferenceEffectRecord(source).name.startsWith(plan.team+'の'));
    assert.equal(after.players[0].bench.find(c=>c.id===source.id).damage,0);
    assert(effectEvents.some(step=>step?.command==='MOVE_DAMAGE_COUNTERS'&&step.sourceInstanceId===source.id&&step.targetInstanceId===target.id&&step.counterCount===source.damage/10));
    const invalid=port(before);
    assert.equal(invalid.dispatch('you',{...action,selections:{...action.selections,counterSource:[attackingSide.active.id]}}).ok,false);
    assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
    const blocked=JSON.parse(JSON.stringify(before)),side=blocked.players[1];
    [side.active,...side.bench].find(c=>c.id===target.id).referenceProtection={opponentTurn:blocked.turnNumber};
    const replay=port(blocked);
    assert(replay.dispatch('you',action).ok);
    assert.equal(replay.getSnapshot().players[0].bench.find(c=>c.id===source.id).damage,source.damage);
    assert(!replay.getSnapshot().history.slice(before.history.length).some(step=>step.details?.command==='MOVE_DAMAGE_COUNTERS'&&!step.details.reference));
  }
  if(e.plan.mechanic==='ATTACK_RECYCLE_BASIC_ENERGY'){
    const plan=e.plan,action=t.action||o.action;
    const matches=c=>c.kind==='energy'&&!c.isSpecial&&c.energyType===plan.type;
    const chosen=Array.from(attackingSide.discard.filter(matches),c=>c.id);
    assert(chosen.length>0);
    const reveal=effectEvents.findIndex(step=>step?.command==='REVEAL'&&step.fromZone==='discard');
    const move=effectEvents.findIndex(step=>step?.command==='RETURN_TO_DECK'&&step.fromZone==='discard');
    assert(reveal>=0&&move>reveal);
    assert.deepEqual(Array.from(effectEvents[reveal].cardIds),chosen);
    assert.deepEqual(Array.from(effectEvents[move].cardIds),chosen);
    assert(effectEvents.slice(move+1).some(step=>step?.command==='SHUFFLE_DECK'&&!step.reference));
    assert(chosen.every(id=>after.players[0].deck.some(c=>c.id===id)&&!after.players[0].discard.some(c=>c.id===id)));
    if(plan.counters){
      assert(effectEvents.slice(reveal+1,move).some(step=>step?.command==='PLACE_DAMAGE_COUNTERS'&&step.targetInstanceId===action.targetIds[0]&&step.counterCount===chosen.length*plan.unit));
      const invalid=port(before),bad={...action,targetIds:[attackingSide.active.id]};
      assert.equal(invalid.dispatch('you',bad).ok,false);
      assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
    }else verifyPrintedAttack(before,after,e,chosen.length*plan.unit);
  }
  if(e.plan.mechanic==='ATTACK_DISCARD_OPPONENT_ATTACHMENTS'){
    const targets=[defendingSide.active,...defendingSide.bench];
    const removed=targets.flatMap(c=>[...c.energyCards.filter(a=>a.isSpecial),...(e.plan.tools?c.tools:[])]).map(c=>c.id);
    const returned=effectEvents.filter(ev=>ev?.command==='DISCARD'&&ev.fromZone==='attached').flatMap(ev=>ev.cardIds);
    assert(removed.length>0);
    assert.deepEqual(Array.from(returned).sort(),removed.sort());
    assert(removed.every(id=>after.players[1].discard.some(c=>c.id===id)));
    if(Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
    const protectedGame=JSON.parse(JSON.stringify(before)),other=protectedGame.players[1],protectedId=other.active.id;
    other.active.referenceProtection={opponentTurn:protectedGame.turnNumber};
    const replay=port(protectedGame);
    assert(replay.dispatch('you',t.action||o.action).ok);
    const target=replay.getSnapshot().players[1].active;
    assert.equal(target.id,protectedId);
    assert.deepEqual(Array.from(target.energyCards,c=>c.id),Array.from(other.active.energyCards,c=>c.id));
  }
  if(e.plan.mechanic==="PHANTOM"&&e.plan.counterCount) {
    const allocation=o.action.selections.allocation;
    assert.equal(Object.values(allocation).reduce((sum,count)=>sum+count,0),e.plan.counterCount);
    for(const [id,count] of Object.entries(allocation))
      if(count) assert(effectEvents.some(step=>step?.command==="PLACE_DAMAGE_COUNTERS"&&step.targetInstanceId===id&&step.counterCount===count));
  }
  if (e.plan.mechanic === "ATTACK_PRIZE_BONUS_RECOIL") {
    verifyPrintedAttack(before,after,e,e.plan.base+(6-defendingSide.prizes)*e.plan.unit);
    assert(effectEvents.some(step=>step?.command==="DAMAGE"&&step.targetInstanceId===attackingSide.active.id&&step.amount===e.plan.recoil));
  }
  if (e.plan.mechanic === "CONTEXT_ATTACK_BONUS") {
    const print=E.getReferenceEffectRecord(defendingSide.active);
    const conditions={
      opponentPoisoned:defendingSide.active.statusCondition==="POISONED",ownPoisoned:attackingSide.active.statusCondition==="POISONED",
      ownDamaged:attackingSide.active.damage>0,ownTool:!!attackingSide.active.tools.length,opponentTool:!!defendingSide.active.tools.length,
      ownMorePrizes:attackingSide.prizes>defendingSide.prizes,opponentPrizes:defendingSide.prizes<=e.plan.threshold,
      opponentHand:defendingSide.hand.length<=e.plan.threshold,opponentStage:print.facts.stage===e.plan.threshold,
      extraEnergy:attackingSide.active.energyCards.length>=e.cost.length+e.plan.threshold,
      ownEnergyType:attackingSide.active.energyCards.some(card=>card.energyType===e.plan.type),
    };
    verifyPrintedAttack(before,after,e,e.plan.base+(conditions[e.plan.predicate]?e.plan.bonus:0));
  }
  if(e.plan.mechanic==='TRAINER_TOP_SELECT_DISCARD'){
    const action=t.action||o.action,plan=e.plan,own=before.players[0],resolved=after.players[0],selected=action.selections.cards;
    const top=own.deck.slice(0,plan.limit),count=Math.min(plan.amount,top.length),rest=top.filter(c=>!selected.includes(c.id));
    assert.equal(selected.length,count);assert.equal(new Set(selected).size,count);
    assert(selected.every(id=>top.some(c=>c.id===id)&&resolved.hand.some(c=>c.id===id)));
    assert(rest.every(c=>resolved.discard.some(x=>x.id===c.id)));
    assert.deepEqual(resolved.deck.map(c=>c.id),own.deck.slice(top.length).map(c=>c.id));
    assert(effectEvents.some(ev=>ev?.command==='ADD_TO_HAND'&&ev.privateTo==='you'&&selected.every(id=>ev.cardIds?.includes(id))));
    assert(effectEvents.some(ev=>ev?.command==='DISCARD'&&rest.every(c=>ev.cardIds?.includes(c.id))));
    assert(!effectEvents.some(ev=>ev?.command==='REVEAL'&&!ev.reference));
    assert(!effectEvents.some(ev=>ev?.command==='SHUFFLE_DECK'&&!ev.reference));
    const invalid=own.deck[plan.limit];
    if(invalid&&count){
      const replay=port(before),bad=[invalid.id,...selected.slice(1)];
      assert.equal(replay.dispatch('you',{...action,selections:{...action.selections,cards:bad}}).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    }
    if(count){
      const replay=port(before);assert.equal(replay.dispatch('you',{...action,selections:{...action.selections,cards:[]}}).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    }
    const short=JSON.parse(JSON.stringify(before)),side=short.players[0];
    side.discard.push(...side.deck.splice(1));
    const replay=port(short),one=side.deck.map(c=>c.id);
    assert(replay.dispatch('you',{...action,selections:{...action.selections,cards:one}}).ok);
    const end=replay.getSnapshot();assert(one.every(id=>end.players[0].hand.some(c=>c.id===id)));assert.equal(end.players[0].deck.length,0);
    assert.deepEqual(S.identities(short),S.identities(end));
  }
  if(["TRAINER_TOP_TYPED_SEARCH","TRAINER_TOP_POKEMON_TRAINER"].includes(e.plan.mechanic)){
    const action=t.action||o.action,plan=e.plan,own=before.players[0],resolved=after.players[0],chosen=action.selections.cards;
    const window=own.deck.slice(0,plan.limit),category=c=>plan.mechanic==="TRAINER_TOP_TYPED_SEARCH"?(c.kind==="pokemon"&&E.getReferenceEffectRecord(c).facts.types.includes(plan.type)?"pokemon":c.kind==="energy"&&!c.isSpecial&&c.energyType===plan.type?"energy":null):c.kind==="pokemon"?"pokemon":["item","supporter","tool","stadium"].includes(E.getReferenceEffectRecord(c)?.category)?"trainer":null;
    assert(chosen.length>0&&chosen.length<=plan.amount);
    assert(chosen.every(id=>window.some(c=>c.id===id&&category(c))));
    if(plan.mechanic==="TRAINER_TOP_POKEMON_TRAINER")assert.equal(new Set(chosen.map(id=>category(window.find(c=>c.id===id)))).size,chosen.length);
    assert(chosen.every(id=>resolved.hand.some(c=>c.id===id)));
    assert.deepEqual(resolved.deck.map(c=>c.id).sort(),own.deck.filter(c=>!chosen.includes(c.id)).map(c=>c.id).sort());
    assert(effectEvents.some(ev=>ev?.command==="SHUFFLE_DECK"&&!ev.reference));
    assert(effectEvents.some(ev=>ev?.command==="REVEAL"&&chosen.every(id=>ev.cardIds?.includes(id))));
    const outside=own.deck.slice(plan.limit).find(category)||own.deck[plan.limit];
    if(outside){const replay=port(before);assert.equal(replay.dispatch("you",{...action,selections:{...action.selections,cards:[outside.id]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));}
    const skipped=port(before);
    assert(skipped.dispatch("you",{...action,selections:{...action.selections,cards:[]}}).ok);
    assert.deepEqual(skipped.getSnapshot().players[0].deck.map(c=>c.id).sort(),own.deck.map(c=>c.id).sort());
  }
  if(e.plan.mechanic==="ATTACK_DISCARD_TOOL_BEFORE_DAMAGE"){
    const tools=before.players[1].active.tools.map(c=>c.id);
    assert(tools.length>0);
    assert(tools.every(id=>after.players[1].discard.some(c=>c.id===id)));
    const discardIndex=effectEvents.findIndex(ev=>ev?.command==="DISCARD"&&tools.every(id=>ev.cardIds?.includes(id)));
    const damageIndex=effectEvents.findIndex(ev=>ev?.command==="DAMAGE"&&ev.targetInstanceId===before.players[1].active.id);
    assert(discardIndex>=0&&damageIndex>discardIndex);
    verifyPrintedAttack(before,after,e,Number(e.damage));
  }
  if(e.plan.mechanic==="RECOVER_NON_RULE_AND_ENERGY"){
    const action=t.action||o.action,chosen=action.selections.cards,own=before.players[0],resolved=after.players[0];
    assert(chosen.length>0&&chosen.length<=e.plan.amount);
    assert(chosen.every(id=>own.discard.some(c=>c.id===id&&(c.kind==="pokemon"?!E.getReferenceEffectRecord(c).facts.rulePokemon:c.kind==="energy"&&!c.isSpecial))));
    assert(chosen.every(id=>resolved.hand.some(c=>c.id===id)&&!resolved.discard.some(c=>c.id===id)));
    const replay=port(before),invalid=own.discard.find(c=>!chosen.includes(c.id)&&(c.kind==="pokemon"?E.getReferenceEffectRecord(c).facts.rulePokemon:c.kind!=="energy"||c.isSpecial));
    if(invalid){assert.equal(replay.dispatch("you",{...action,selections:{...action.selections,cards:[invalid.id]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));}
  }
  if(e.plan.mechanic==="HEAL_LOW_HP_FULL"){
    const action=t.action||o.action,ident=action.selections.cards[0];
    const mon=[before.players[0].active,...before.players[0].bench].find(c=>c.id===ident);
    const healed=[after.players[0].active,...after.players[0].bench].find(c=>c.id===ident);
    assert(mon.damage>0&&mon.hp-mon.damage<=e.plan.threshold);
    assert.equal(healed.damage,0);
    const replayState=structuredClone(before);
    const target=[replayState.players[0].active,...replayState.players[0].bench].find(c=>c.id===ident);
    target.damage=0;
    const replay=port(replayState),snapshot=replay.getSnapshot();
    assert.equal(replay.dispatch("you",action).ok,false);assert.deepEqual(replay.getSnapshot(),snapshot);
  }
  if(["ATTACK_EVOLUTION_BONUS_DISCARD","ATTACK_PRIZE_BONUS_DISCARD"].includes(e.plan.mechanic)){
    const own=before.players[0],resolved=after.players[0],plan=e.plan;
    const evolved=E.getReferenceEffectRecord(before.players[1].active).facts.stage>0;
    const action=t.action||o.action;
    const chosen=plan.mechanic==="ATTACK_EVOLUTION_BONUS_DISCARD"?(evolved?own.active.energyCards.map(c=>c.id):[]):action.selections.energy;
    assert(chosen.every(id=>resolved.discard.some(c=>c.id===id)&&!resolved.active.energyCards.some(c=>c.id===id)));
    const bonus=plan.mechanic==="ATTACK_EVOLUTION_BONUS_DISCARD"?(evolved?plan.bonus:0):(6-before.players[1].prizes)*plan.unit;
    verifyPrintedAttack(before,after,e,plan.base+bonus);
    if(plan.mechanic==="ATTACK_PRIZE_BONUS_DISCARD")assert.equal(chosen.length,Math.min(1,own.active.energyCards.length));
  }
  if (e.plan.mechanic === "CONDITIONAL_ATTACK_BONUS") {
    const print = E.getReferenceEffectRecord(defendingSide.active);
    const conditions = {
      opponentEx: print.name.endsWith("ex"),
      opponentExOrV: print.name.endsWith("ex") || /V(?:MAX|STAR|-UNION)?$/.test(print.name),
      opponentEvolved: print.facts.stage > 0,
      opponentDamaged: defendingSide.active.damage > 0,
      ownBenchDamaged: attackingSide.bench.some(card => card.damage > 0),
    };
    verifyPrintedAttack(before, after, e, e.plan.base + (conditions[e.plan.predicate] ? e.plan.bonus : 0));
  }
  if (e.plan.mechanic === "FIXED_COIN_HITS" && Object.hasOwn(e.plan, "base")) {
    const tosses = effectEvents.filter(event => event?.command === "COIN_FLIP" && typeof event.heads === "boolean");
    assert.equal(tosses.length, e.plan.flips);
    verifyPrintedAttack(before, after, e, e.plan.base + tosses.filter(toss => toss.heads).length * e.plan.unit);
  }
  if(e.plan.mechanic==='MASS_COUNT_COIN_DAMAGE'){
    const plan=e.plan,action=t.action||o.action,[own,other]=before.players;
    assert([own.active,other.active].every(c=>c.energyCards.every(a=>!a.isSpecial)));
    const count=plan.metric==='fixed'?3:plan.metric==='ownTypedBoard'?[own.active,...own.bench].filter(c=>E.getReferenceEffectRecord(c).facts.types.includes(plan.type)).length:
      plan.metric==='ownTypedEnergy'?own.active.energyCards.filter(c=>c.energyType===plan.type).length:
      plan.metric==='bothActiveEnergy'?own.active.energyCards.length+other.active.energyCards.length:other.bench.length;
    assert(count>0);
    const seeds=new Map();
    for(let seed=0;seed<20000&&seeds.size<Math.min(count+1,4);seed++){
      let state=seed,hits=0;
      for(let i=0;i<count;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;if(plan.tails?state>=0x80000000:state<0x80000000)hits++;}
      if(!seeds.has(hits))seeds.set(hits,seed);
    }
    assert(seeds.size>=2);
    if(plan.metric==='fixed')assert.equal(seeds.size,4);
    for(const [hits,seed] of seeds){
      const start={...before,referenceRngState:seed},replay=port(start);
      assert(replay.dispatch('you',action).ok);
      const end=replay.getSnapshot(),flips=end.history.slice(start.history.length).map(x=>x.details).filter(x=>x?.command==='COIN_FLIP'&&typeof x.heads==='boolean');
      assert.equal(flips.length,count);
      let state=seed;
      for(const toss of flips){state=(Math.imul(state,1664525)+1013904223)>>>0;assert.equal(toss.heads,state<0x80000000);}
      verifyPrintedAttack(start,end,e,plan.base+(plan.bonuses?plan.bonuses[hits]:hits*plan.unit));
      assert.deepEqual(S.identities(start),S.identities(end));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.deepEqual(replay.getSnapshot(),end);
    }
  }
  if(e.plan.mechanic==='ATTACK_ATTACHED_ENERGY_COINS'){
    const action=t.action||o.action;
    const energies=before.players[0].active.energyCards;
    assert(energies.length>=2&&energies.every(c=>!c.isSpecial));
    for(const seed of [0,682]){
      const start={...before,referenceRngState:seed},replay=port(start);
      assert(replay.dispatch('you',action).ok);
      const end=replay.getSnapshot(),events=end.history.slice(start.history.length).map(event=>event.details);
      const actual=events.filter(event=>event?.command==='COIN_FLIP'&&typeof event.heads==='boolean');
      let state=seed,heads=0;
      assert.equal(actual.length,energies.length);
      for(const toss of actual){
        state=(Math.imul(state,1664525)+1013904223)>>>0;
        const expected=state<0x80000000;
        assert.equal(toss.heads,expected);
        if(expected)heads++;
      }
      verifyPrintedAttack(start,end,e,heads*e.plan.unit);
    }
  }
  if(e.plan.mechanic==='MASS_COIN_OUTCOME'){
    const q=e.plan,action=t.action||o.action,seeds=new Map();
    for(let seed=0;seed<100000&&seeds.size<q.flips+1;seed++){
      let state=seed,n=0;for(let i=0;i<q.flips;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;if(state<0x80000000)n++;}
      if(!seeds.has(n))seeds.set(n,seed);
    }
    assert.equal(seeds.size,q.flips+1,'MISSING_COIN_OUTCOME_SEED');
    for(const [heads,seed] of seeds){
      const start={...before,referenceRngState:seed},replay=port(start);
      assert(replay.dispatch('you',action).ok);
      const end=replay.getSnapshot(),events=end.history.slice(start.history.length).map(x=>x.details);
      const tosses=events.filter(x=>x?.command==='COIN_FLIP'&&typeof x.heads==='boolean');
      assert.equal(tosses.length,q.flips);assert.equal(tosses.filter(x=>x.heads).length,heads);
      const met=q.when==='all'?heads===q.flips:q.when==='none'?heads===0:heads>=q.threshold;
      const amount=q.failOnTails&&!met?0:q.base+(q.unit||0)*heads+(met?(q.bonus||0):0);
      if(amount===0)assert(events.some(x=>x?.command==='DAMAGE'&&x.targetInstanceId===start.players[1].active.id&&x.amount===0));
      else verifyPrintedAttack(start,end,e,amount);
      const src=start.players[0].active.id,dst=start.players[1].active.id;
      if(q.status)assert.equal(events.some(x=>x?.command==='STATUS_CONDITION'&&x.targetInstanceId===dst&&x.status===q.status),met);
      if(q.recoil)assert.equal(events.some(x=>x?.command==='DAMAGE'&&x.targetInstanceId===src&&x.amount===q.recoil),met);
      if(q.heal)assert.equal(events.some(x=>x?.command==='HEAL'&&x.targetInstanceId===src&&x.amount>0),met);
      if(q.mill){const ids=start.players[1].deck.slice(0,heads).map(c=>c.id);assert(ids.every(id=>end.players[1].discard.some(c=>c.id===id)));}
      if(q.lock||q.protect){
        const target=q.lock?.startsWith('opponent')?end.players[1].active:end.players[0].active;
        if(met&&target?.id===(q.lock?.startsWith('opponent')?dst:src)){
          if(q.lock==='selfAttack')assert.equal(target.referenceCannotAttackTurn,start.turnNumber+2);
          if(q.lock==='opponentAttack')assert.equal(target.referenceCannotAttackTurn,start.turnNumber+1);
          if(q.lock==='opponentRetreat')assert.equal(target.referenceCannotRetreatTurn,start.turnNumber+1);
          if(q.protect)assert.equal(target.referenceProtection.opponentTurn,start.turnNumber+1);
        }
      }
      assert.deepEqual(S.identities(start),S.identities(end));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(end));
    }
  }
  if (e.plan.mechanic === "SCALED_ATTACK_DAMAGE") {
    const count = cards => cards.flatMap(card => card.energyCards).filter(energy =>
      !e.plan.type || [e.plan.type,e.plan.secondType].includes(energy.energyType)).length;
    const metrics = {
      opponentCounters: defendingSide.active.damage / 10,
      ownCounters: attackingSide.active.damage / 10,
      ownHand: attackingSide.hand.length,
      opponentHand: defendingSide.hand.length,
      opponentHandTrainerCount:defendingSide.hand.filter(c=>['item','supporter','tool','stadium'].includes(E.getReferenceEffectRecord(c)?.category)).length,
      ownPrizesTaken: 6-attackingSide.prizes,
      ownBasicCount: [attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.basic).length,
      opponentBasicCount: [defendingSide.active,...defendingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.basic).length,
      ownStageOneCount: [attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.stage===1).length,
      ownEvolvedCount: [attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.stage>0).length,
      opponentEvolvedCount: [defendingSide.active,...defendingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.stage>0).length,
      ownBenchStageTwoCount: attackingSide.bench.filter(c=>E.getReferenceEffectRecord(c).facts.stage===2).length,
      ownDamagedBenchCount: attackingSide.bench.filter(c=>c.damage>0).length,
      opponentTeamCounters: [defendingSide.active,...defendingSide.bench].reduce((n,c)=>n+c.damage/10,0),
      ownDiscardNamedCard:attackingSide.discard.filter(c=>E.getReferenceEffectRecord(c)?.name===e.plan.name).length,
      ownDiscardSupporterContains:attackingSide.discard.filter(c=>E.getReferenceEffectRecord(c)?.category==='supporter'&&E.getReferenceEffectRecord(c).name.includes(e.plan.name)).length,
      ownNamedOrExCount:[attackingSide.active,...attackingSide.bench].filter(c=>[e.plan.name,e.plan.name+'ex'].includes(E.getReferenceEffectRecord(c).name)).length,
      bothNameContainsCount:[attackingSide.active,...attackingSide.bench,defendingSide.active,...defendingSide.bench].filter(c=>[e.plan.name,e.plan.secondName].some(n=>E.getReferenceEffectRecord(c).name.includes(n))).length,
      ownBenchNamedCount:attackingSide.bench.filter(c=>E.getReferenceEffectRecord(c).name===e.plan.name).length,
      ownBenchTeamCounters:attackingSide.bench.filter(c=>E.getReferenceEffectRecord(c).name.startsWith(e.plan.team+'の')).reduce((n,c)=>n+c.damage/10,0),
      ownNamedTeamEnergy:[attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).name.startsWith(e.plan.team+'の')).flatMap(c=>c.energyCards).filter(c=>!c.isSpecial&&c.energyType===e.plan.type).length,
      ownBenchWithTypedEnergy:attackingSide.bench.filter(c=>c.energyCards.some(a=>!a.isSpecial&&a.energyType===e.plan.type)).length,
      ownBenchNamedCounters:attackingSide.bench.filter(c=>E.getReferenceEffectRecord(c).name===e.plan.name).reduce((n,c)=>n+c.damage/10,0),
      ownAttachedBasicCards:attackingSide.active.energyCards.filter(c=>!c.isSpecial).length,
      ownAttachedSpecialCards:attackingSide.active.energyCards.filter(c=>c.isSpecial).length,
      opponentAttachedSpecialCards:[defendingSide.active,...defendingSide.bench].flatMap(c=>c.energyCards).filter(c=>c.isSpecial).length,
      ownDistinctBasicTypes:new Set([attackingSide.active,...attackingSide.bench].flatMap(c=>c.energyCards).filter(c=>!c.isSpecial).map(c=>c.energyType)).size,
      ownBenchTypedCounters:attackingSide.bench.filter(c=>E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type)).reduce((n,c)=>n+c.damage/10,0),
      ownTypedPokemonCount: [attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type)).length,
      bothActiveEnergy: count([attackingSide.active,defendingSide.active]),
      bothTeamEnergy: count([attackingSide.active,...attackingSide.bench,defendingSide.active,...defendingSide.bench]),
      ownPokemon: 1 + attackingSide.bench.length,
      opponentRetreat: defendingSide.active.retreatCost,
      opponentDiscardBasic:defendingSide.discard.filter(c=>c.kind==='energy'&&!c.isSpecial).length,
      opponentDiscardItem:defendingSide.discard.filter(c=>E.getReferenceEffectRecord(c)?.category==='item').length,
      opponentExVCount:[defendingSide.active,...defendingSide.bench].filter(c=>/ex$|V(?:MAX|STAR|-UNION)?$/.test(E.getReferenceEffectRecord(c).name)).length,
      ownDamagedCount:[attackingSide.active,...attackingSide.bench].filter(c=>c.damage>0).length,
      opponentAbilityCount:[defendingSide.active,...defendingSide.bench].filter(c=>E.getReferenceEffectRecord(c).abilities.length>0).length,
      ownNamedAttackCount:[attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).attacks.some(a=>a.name===e.plan.name)).length,
      ownTeamNameCount:[attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).name.startsWith(e.plan.name+'の')).length,
      ownDiscardTypedPokemon:attackingSide.discard.filter(c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type)).length,
      ownDiscardNamedAttack:attackingSide.discard.filter(c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c).attacks.some(a=>a.name===e.plan.name)).length,
      ownDiscardEnergy: attackingSide.discard.filter(card=>card.kind==="energy").length,
      ownEnergy: count([attackingSide.active]),
      ownTeamEnergy: count([attackingSide.active,...attackingSide.bench]),
      opponentPrizesTaken: 6-defendingSide.prizes,
      opponentEnergy: count([defendingSide.active]),
      opponentTeamEnergy: count([defendingSide.active, ...defendingSide.bench]),
    };
    if(['ownBenchTeamCounters','ownNamedTeamEnergy','ownBenchWithTypedEnergy'].includes(e.plan.metric)){
      if(!metrics[e.plan.metric])return {status:'BLOCKED',reason:'NO_POSITIVE_TEAM_BOARD_COUNT_FIXTURE'};
      const start=JSON.parse(JSON.stringify(before)),own=start.players[0],plan=e.plan;
      let remaining=0;
      if(plan.metric==='ownBenchTeamCounters'){
        for(const c of own.bench)if(E.getReferenceEffectRecord(c).name.startsWith(plan.team+'の'))c.damage=0;
      }else{
        for(const c of own.bench){
          if(plan.metric==='ownNamedTeamEnergy'&&!E.getReferenceEffectRecord(c).name.startsWith(plan.team+'の'))continue;
          const removed=c.energyCards.filter(a=>!a.isSpecial&&a.energyType===plan.type);
          c.energyCards=c.energyCards.filter(a=>!removed.includes(a));own.deck.push(...removed);
        }
        if(plan.metric==='ownNamedTeamEnergy'&&E.getReferenceEffectRecord(own.active).name.startsWith(plan.team+'の'))remaining=own.active.energyCards.filter(a=>!a.isSpecial&&a.energyType===plan.type).length;
      }
      assert(remaining<metrics[plan.metric],'TEAM_COUNT_NEGATIVE_FIXTURE_MUST_CHANGE_COUNT');
      assert.deepEqual(S.identities(before),S.identities(start));
      const replay=port(start);assert(replay.dispatch('you',t.action||o.action).ok);
      verifyPrintedAttack(start,replay.getSnapshot(),e,plan.base+plan.unit*remaining);
    }
    if (e.plan.metric === "ownTeamEnergy") assert(metrics.ownTeamEnergy>0);
    if(['ownBenchNamedCounters','ownAttachedBasicCards','ownAttachedSpecialCards','opponentAttachedSpecialCards','ownDistinctBasicTypes'].includes(e.plan.metric)){
      if(metrics[e.plan.metric]===0)return {status:'BLOCKED',reason:'NO_POSITIVE_PHYSICAL_COUNT_FIXTURE'};
      if(e.plan.metric==='ownDistinctBasicTypes'&&metrics.ownDistinctBasicTypes<2)return {status:'BLOCKED',reason:'NO_MULTIPLE_BASIC_TYPES_FIXTURE'};
      const start=JSON.parse(JSON.stringify(before)),[own,other]=start.players;
      if(e.plan.metric==='ownBenchNamedCounters')for(const c of own.bench)c.damage=0;
      if(e.plan.metric==='ownAttachedSpecialCards'||e.plan.metric==='opponentAttachedSpecialCards'){
        const side=e.plan.metric.startsWith('opponent')?other:own;
        for(const c of [side.active,...side.bench])for(const energy of c.energyCards.filter(a=>a.isSpecial))
          side.deck.push(c.energyCards.splice(c.energyCards.indexOf(energy),1)[0]);
      }
      if(e.plan.metric==='ownDistinctBasicTypes')for(const c of own.bench)for(const energy of c.energyCards.filter(a=>!a.isSpecial))
        own.deck.push(c.energyCards.splice(c.energyCards.indexOf(energy),1)[0]);
      if(e.plan.metric!=='ownAttachedBasicCards'){
        const expected=e.plan.metric==='ownDistinctBasicTypes'?new Set(own.active.energyCards.filter(c=>!c.isSpecial).map(c=>c.energyType)).size:0;
        assert(expected<metrics[e.plan.metric]);
        const replay=port(start);
        assert(replay.dispatch('you',t.action||o.action).ok);
        verifyPrintedAttack(start,replay.getSnapshot(),e,expected*e.plan.unit);
      }
    }
    if(['ownDiscardNamedCard','ownDiscardSupporterContains','ownNamedOrExCount','bothNameContainsCount','ownBenchNamedCount','ownBenchTypedCounters','opponentDiscardBasic','opponentDiscardItem','opponentExVCount','ownDamagedCount','opponentAbilityCount','ownNamedAttackCount','ownTeamNameCount','ownDiscardTypedPokemon','ownDiscardNamedAttack'].includes(e.plan.metric)&&metrics[e.plan.metric]===0)
      return {status:'BLOCKED',reason:'NO_POSITIVE_PUBLIC_COUNT_FIXTURE'};
    assert(Number.isFinite(metrics[e.plan.metric]),"MISSING_BOARD_COUNT_METRIC");
    if(e.plan.metric==='opponentHandTrainerCount'){
      assert(metrics.opponentHandTrainerCount>0);
      assert(effectEvents.some(ev=>ev?.command==='REVEAL'&&ev.privateTo==='you'&&ev.fromZone==='hand'&&JSON.stringify(ev.cardIds)===JSON.stringify(defendingSide.hand.map(c=>c.id))));
      const zero=JSON.parse(JSON.stringify(before)),other=zero.players[1],trainer=c=>['item','supporter','tool','stadium'].includes(E.getReferenceEffectRecord(c)?.category);
      other.deck.push(...other.hand.filter(trainer));other.hand=other.hand.filter(c=>!trainer(c));
      assert.deepEqual(S.identities(before),S.identities(zero));
      const replay=port(zero);assert(replay.dispatch('you',t.action||o.action).ok);
      verifyPrintedAttack(zero,replay.getSnapshot(),e,0);
    }
    verifyPrintedAttack(before, after, e, Math.max(0,e.plan.base+(e.plan.subtract?-1:1)*e.plan.unit*metrics[e.plan.metric]));
    const discardMetricFilters={
      opponentDiscardBasic:c=>c.kind==='energy'&&!c.isSpecial,
      opponentDiscardItem:c=>E.getReferenceEffectRecord(c)?.category==='item',
      ownDiscardNamedCard:c=>E.getReferenceEffectRecord(c)?.name===e.plan.name,
      ownDiscardSupporterContains:c=>E.getReferenceEffectRecord(c)?.category==='supporter'&&E.getReferenceEffectRecord(c).name.includes(e.plan.name),
      ownDiscardTypedPokemon:c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c)?.facts.types.includes(e.plan.type),
      ownDiscardNamedAttack:c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c)?.attacks.some(a=>a.name===e.plan.name)
    };
    const discardFilter=discardMetricFilters[e.plan.metric];
    if(discardFilter){
      const start=JSON.parse(JSON.stringify(before)),side=start.players[e.plan.metric.startsWith('opponent')?1:0];
      const removed=side.discard.filter(discardFilter);
      assert(removed.length>0,'MISSING_POSITIVE_DISCARD_PROOF');
      side.discard=side.discard.filter(c=>!discardFilter(c));
      side.deck.push(...removed);
      assert.deepEqual(S.identities(before),S.identities(start));
      const replay=port(start);
      assert(replay.dispatch('you',t.action||o.action).ok);
      verifyPrintedAttack(start,replay.getSnapshot(),e,e.plan.base);
    }
    if (e.plan.subtract) {
      assert(p.restoreSession(p.getResumeSnapshot()).ok);
      assert.deepEqual(p.getSnapshot(),after);
    }
  }
  if(e.plan.mechanic==='ATTACK_BASIC_ENERGY_MOVE'){
    const own=before.players[0],resolved=after.players[0],action=t.action||o.action,energy=action.selections.energy?.[0],to=action.selections.attachTo?.[0];
    if(!energy||!to)return {status:'BLOCKED',reason:'NO_BASIC_ENERGY_MOVE_FIXTURE'};
    assert(own.active.energyCards.some(c=>c.id===energy&&!c.isSpecial));
    assert(!resolved.active.energyCards.some(c=>c.id===energy)&&resolved.bench.find(c=>c.id===to)?.energyCards.some(c=>c.id===energy));
    assert(effectEvents.some(ev=>ev?.command==='MOVE_ENERGY'&&ev.energyId===energy&&ev.sourceInstanceId===own.active.id&&ev.targetInstanceId===to));
    verifyPrintedAttack(before,after,e,Number(e.damage));
    const denied=port(before);assert.equal(denied.dispatch('you',{...action,selections:{...action.selections,attachTo:[own.active.id]}}).ok,false);
    assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(before));
  }
  if (e.plan.mechanic === "ATTACK_RESET_HAND") {
    assert.equal(after.players[0].hand.length, Math.min(e.plan.amount, attackingSide.hand.length + attackingSide.deck.length));
    assert(effectEvents.some(event => event?.command === "SHUFFLE_DECK"));
    assert(effectEvents.some(event => event?.command === "RETURN_TO_DECK" &&
      JSON.stringify(event.cardIds) === JSON.stringify(attackingSide.hand.map(card => card.id))));
  }
  if(e.plan.mechanic==='MASS_MILL_COUNT_DAMAGE'){
    const plan=e.plan,filter=c=>plan.filter==='typedBasic'?c.kind==='energy'&&!c.isSpecial&&c.energyType===plan.type:plan.filter==='energy'?c.kind==='energy':plan.filter==='trainer'?['item','supporter','tool','stadium'].includes(E.getReferenceEffectRecord(c)?.category):c.kind==='pokemon'&&E.getReferenceEffectRecord(c).name.startsWith(plan.team+'の');
    let count=0;
    for(const i of plan.scope==='both'?[0,1]:[0]){
      const side=before.players[i],picked=side.deck.slice(0,plan.limit);
      count+=picked.filter(filter).length;
      assert(picked.every(c=>after.players[i].discard.some(x=>x.id===c.id)));
      assert(effectEvents.some(ev=>ev?.command==='DISCARD'&&ev.fromZone==='deck'&&ev.playerId===side.id&&JSON.stringify(ev.cardIds)===JSON.stringify(picked.map(c=>c.id))));
    }
    assert(count>0,'NO_POSITIVE_MILL_COUNT_PROOF');
    verifyPrintedAttack(before,after,e,plan.base+count*plan.unit);
    assert(p.restoreSession(p.getResumeSnapshot()).ok);
    assert.deepEqual(p.getSnapshot(),after);
  }
  if (e.plan.mechanic === "ATTACK_DISCARD_OWN_DECK_TOP") {
    const discarded = attackingSide.deck.slice(0, e.plan.amount).map(card => card.id);
    assert(discarded.length > 0);
    assert(effectEvents.some(event => event?.command === "DISCARD" && event.fromZone === "deck" &&
      JSON.stringify(event.cardIds) === JSON.stringify(discarded)));
    assert(discarded.every(id => after.players[0].discard.some(card => card.id === id)));
  }
  if (e.plan.mechanic === "ATTACK_DISABLE_DEFENDER") {
    const target = [after.players[1].active, ...after.players[1].bench].find(card => card?.id === defendingSide.active.id);
    if (target) assert.equal(target.referenceCannotAttackTurn, before.turnNumber + 1);
    else assert(after.players[1].discard.some(card => card.id === defendingSide.active.id));
  }
  if (e.plan.mechanic === "ATTACK_WEAKEN_DEFENDER") {
    const target = [after.players[1].active, ...after.players[1].bench].find(card => card?.id === defendingSide.active.id);
    if (target) {
      assert.equal(target.referenceOutgoingDamagePenalty?.turn, before.turnNumber + 1);
      assert.equal(target.referenceOutgoingDamagePenalty?.amount, e.plan.amount);
    } else assert(after.players[1].discard.some(card => card.id === defendingSide.active.id));
  }
  if (e.plan.mechanic === "ANY_DAMAGE" && e.plan.amount) {
    const chosen = o.action.targetIds[0];
    assert(effectEvents.some(event => event?.command === "DAMAGE" && event.targetInstanceId === chosen));
    const bench = defendingSide.bench.find(card => !E.getReferenceEffectRecord(card).facts.teraBenchProtection);
    if (bench) {
      const replay = port(before);
      assert(replay.dispatch("you", { ...o.action, targetIds: [bench.id] }).ok);
      const result = replay.getSnapshot();
      assert(result.history.slice(before.history.length).some(event => event.details?.command === "DAMAGE" &&
        event.details.targetInstanceId === bench.id && event.details.amount === e.plan.amount));
    }
  }
  if (e.plan.mechanic === "COIN_SEARCH_POKEMON") {
    const action = o.action;
    const choice = after.pendingReferenceChoice;
    assert.equal(choice?.kind, "DECK_POKEMON_SEARCH");
    assert.equal(choice.playerId, "you");
    assert(after.players[0].discard.some(card => card.id === t.sourceId));
    assert.equal(p.getView("ai").pendingReferenceChoice.options, undefined);
    const saved = p.getResumeSnapshot();
    assert(p.restoreSession(saved).ok);
    assert.deepEqual(p.getSnapshot(), after);
    const deckCardId = choice.options[0];
    const selection = { type: "resolve_reference_choice", deckCardId };
    const actions = E.getLegalActions(after, "you").actions;
    assert(actions.some(candidate => JSON.stringify(candidate) === JSON.stringify(selection)));
    assert(actions.every(candidate => candidate.type === selection.type));
    const invalid = after.players[0].deck.find(card => card.kind !== "pokemon");
    assert.equal(p.dispatch("you", { ...selection, deckCardId: invalid.id }).ok, false);
    assert.equal(p.dispatch("you", { type: "end_turn" }).ok, false);
    assert.deepEqual(p.getSnapshot(), after);
    assert(p.dispatch("you", selection).ok);
    const resolved = p.getSnapshot();
    assert(!resolved.pendingReferenceChoice);
    assert(resolved.players[0].hand.some(card => card.id === deckCardId));
    assert(!resolved.players[0].deck.some(card => card.id === deckCardId));
    assert(resolved.history.some(event => event.details?.command === "REVEAL" &&
      event.details.cardIds?.includes(deckCardId)));
    assert(resolved.history.some(event => event.details?.command === "SHUFFLE_DECK"));
    assert.deepEqual(S.identities(before), S.identities(resolved));
    assert(p.restoreSession(saved).ok);

    const skipped = port(after);
    assert(skipped.dispatch("you", { ...selection, deckCardId: null }).ok);
    assert.deepEqual(skipped.getSnapshot().players[0].hand, after.players[0].hand);
    assert(skipped.getSnapshot().history.some(event => event.details?.command === "SHUFFLE_DECK"));

    const tails = port({ ...before, referenceRngState: 682 });
    assert(tails.dispatch("you", action).ok);
    const tailResult = tails.getSnapshot();
    assert(!tailResult.pendingReferenceChoice);
    assert.deepEqual(tailResult.players[0].deck, before.players[0].deck);
    const steps = tailResult.history.slice(before.history.length).map(event => event.details);
    assert(steps.some(step => step?.command === "COIN_FLIP" && step.heads === false));
    assert(steps.every(step => !["REVEAL", "SEARCH_DECK", "SHUFFLE_DECK"].includes(step?.command)));

    const noPokemon = structuredClone(before);
    const own = noPokemon.players[0];
    own.hand.push(...own.deck.filter(card => card.kind === "pokemon"));
    own.deck = own.deck.filter(card => card.kind !== "pokemon");
    const emptyOfPokemon = port(noPokemon);
    assert(emptyOfPokemon.dispatch("you", action).ok);
    const noChoice = emptyOfPokemon.getSnapshot();
    assert(!noChoice.pendingReferenceChoice);
    assert(noChoice.history.some(event => event.details?.command === "SHUFFLE_DECK"));
    own.hand.push(...own.deck.splice(0));
    const emptyDeck = port(noPokemon);
    assert.equal(emptyDeck.dispatch("you", action).ok, false);
  }
  if(e.plan.mechanic==='ACTIVE_OPPONENT_ABILITY_SUPPRESSION'){
    const g=JSON.parse(JSON.stringify(before)),own=g.players[0],other=g.players[1];
    const ability=E.getReferenceEffectRecord(other.active).abilities.find(a=>a.plan?.mechanic==='DASH'&&a.name!==e.plan.exceptAbilityName);
    assert(ability&&own.bench.length);g.turnPlayer='ai';
    const action={type:'use_ability',sourceInstanceId:other.active.id,abilityId:ability.effectId};
    const blocked=port(g),saved=JSON.stringify(blocked.getSnapshot());
    assert(!E.getLegalActions(blocked.getSnapshot(),'ai').actions.some(a=>a.type===action.type&&a.abilityId===action.abilityId&&a.sourceInstanceId===action.sourceInstanceId));
    assert.equal(blocked.dispatch('ai',action).ok,false);
    assert.equal(JSON.stringify(blocked.getSnapshot()),saved);
    [own.active,own.bench[0]]=[own.bench[0],own.active];
    const allowed=port(g),legal=E.getLegalActions(allowed.getSnapshot(),'ai').actions.find(a=>a.type===action.type&&a.abilityId===action.abilityId&&a.sourceInstanceId===action.sourceInstanceId);
    assert(legal,'SUPPRESSION_MUST_END_ON_BENCH');assert(allowed.dispatch('ai',legal).ok);
    assert.deepEqual(S.identities(g),S.identities(allowed.getSnapshot()));
  }
  if(e.plan.mechanic==='PASSIVE_TYPED_ATTACK_IMMUNITY'){
    const defender=E.getReferenceEffectRecord(before.players[1].active);
    assert(defender.abilities.some(a=>a.effectId===e.effectId));
    const source=E.getReferenceEffectRecord(before.players[0].active);
    assert(e.plan.attacker==='ex'?source.name.endsWith('ex'):source.abilities.length>0);
    assert(effectEvents.some(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===before.players[1].active.id&&ev.amount===0));
    assert.equal(after.players[1].active.damage,before.players[1].active.damage);
  }
  if(e.plan.mechanic==='PASSIVE_TEAM_ATTACK_BOOST'){
    const plan=e.plan,action=t.action||o.action,baseline=JSON.parse(JSON.stringify(before)),own=baseline.players[0];
    const holders=own.bench.filter(c=>t.boostHolderIds.includes(c.id));
    assert.equal(holders.length,plan.nonStack?2:1);
    if(plan.evolvedSource)assert(E.getReferenceEffectRecord(before.players[0].active).facts.stage>0);
    if(plan.evolvedTarget)assert(E.getReferenceEffectRecord(before.players[1].active).facts.stage>0);
    for(const mon of holders){
      assert(!mon.energyCards?.length&&!mon.tools?.length);
      const stack=mon.evolutionCards||[];
      if(stack.length){
        assert.equal(t.boostBasePhysical?.[mon.id]?.id,mon.id,'MISSING_ORIGINAL_TEAM_BOOST_BASIC');
        own.hand.push(...stack);
      }
      const card={...(stack.length?t.boostBasePhysical[mon.id]:mon)};
      for(const key of ['energyCards','tools','evolutionCards','energies','damage','cardId','enteredTurn','statusCondition'])delete card[key];
      own.hand.push(card);
    }
    own.bench=own.bench.filter(c=>!t.boostHolderIds.includes(c.id));
    assert.deepEqual(S.identities(before),S.identities(baseline));
    const replay=port(baseline);assert(replay.dispatch('you',action).ok);
    verifyPrintedAttack(baseline,replay.getSnapshot(),t.trigger,Number(t.trigger.damage));
    verifyPrintedAttack(before,after,t.trigger,Number(t.trigger.damage)+plan.amount);
    assert.deepEqual(S.identities(before),S.identities(after));
  }
  if(['PASSIVE_EMPTY_ENERGY_RETREAT','PASSIVE_TYPED_TEAM_RETREAT'].includes(e.plan.mechanic)){
    const mon=before.players[0].active,print=E.getReferenceEffectRecord(mon);
    assert(print.abilities.some(a=>a.effectId===e.effectId));
    assert.equal(mon.retreatCost,e.plan.mechanic==='PASSIVE_EMPTY_ENERGY_RETREAT'?print.facts.retreatCost:0);
    const bad=port(before);assert.equal(bad.dispatch('you',{type:'use_ability',sourceInstanceId:mon.id,abilityId:e.effectId}).ok,false);
    assert.deepEqual(bad.getSnapshot(),before);
  }
  if(e.plan.mechanic==='PASSIVE_CONTEXT_COST_DISCOUNT'){
    const plan=e.plan,baseline=JSON.parse(JSON.stringify(before)),[own,other]=baseline.players;
    const action=t.action||o.action;
    if(plan.mode==='discardName'){
      const eligible=c=>E.getReferenceEffectRecord(c)?.name===plan.name;
      own.deck.push(...own.discard.filter(eligible));own.discard=own.discard.filter(c=>!eligible(c));
    }else if(plan.mode==='opponentHandExact'){
      other.deck.push(other.hand.pop());
    }else if(plan.mode==='opponentBench'){
      // Preserve physical cards and attachments while removing the opponent Bench condition.
      for(const mon of other.bench){other.hand.push(...(mon.energyCards||[]),...(mon.tools||[]),...(mon.evolutionCards||[]));const card={...mon};for(const key of ['energyCards','tools','evolutionCards','energies','damage','cardId','enteredTurn','statusCondition'])delete card[key];other.hand.push(card);}
      other.bench=[];
    }else if(plan.mode==='ownAllNames'){
      const i=own.bench.findIndex(c=>plan.names.includes(E.getReferenceEffectRecord(c)?.name)&&!c.energyCards?.length&&!c.tools?.length&&!c.evolutionCards?.length);
      if(i<0)return {status:'BLOCKED',reason:'NAMED_FIELD_NEGATIVE_FIXTURE_REQUIRED'};
      const mon=own.bench.splice(i,1)[0],card={...mon};
      for(const key of ['energyCards','tools','evolutionCards','energies','damage','cardId','enteredTurn','statusCondition'])delete card[key];
      own.hand.push(card);
    }
    assert.deepEqual(S.identities(before),S.identities(baseline));
    const replay=port(baseline);
    const denied=replay.dispatch('you',action);
    assert.equal(denied.ok,false,'CONTEXT_DISCOUNT_MUST_REQUIRE_CONDITION');
    assert(JSON.stringify(denied).includes('INSUFFICIENT_VERIFIED_ENERGY'),'CONTEXT_DISCOUNT_NEGATIVE_MUST_FAIL_PAYMENT:'+JSON.stringify(denied));
    assert.deepEqual(B.canonical(JSON.parse(JSON.stringify(replay.getSnapshot()))),B.canonical(baseline));
    // The attack's complete independent effect slot still has to pass its own verifier.
    // Here verify the exact printed action was executed at the discounted payment.
    assert(after.history.slice(before.history.length).some(ev=>ev.type==='attack'&&ev.details?.effectId===t.trigger.effectId&&ev.details.referenceOfficialCardId===E.getReferenceEffectRecord(before.players[0].active).officialCardId),'DISCOUNTED_PRINTED_ATTACK_MISSING');
    if(['VANILLA_DAMAGE','ATTACK_NAMED_NEXT_TURN_LOCK','NO_NEXT_ATTACK'].includes(t.trigger.plan.mechanic)&&Number(t.trigger.damage)>0)
      verifyPrintedAttack(before,after,t.trigger,Number(t.trigger.damage));
  }
  if(e.plan.mechanic==='PASSIVE_NAMED_PRIZE_DISCOUNT'){
    const baseline=JSON.parse(JSON.stringify(before)),other=baseline.players[1];
    while(other.prizes<6){other.prizeCards.push(other.hand.pop());other.prizes++;}
    const replay=port(baseline),action=t.action||o.action;
    assert.equal(replay.dispatch('you',action).ok,false);
    assert.deepEqual(B.canonical(JSON.parse(JSON.stringify(replay.getSnapshot()))),B.canonical(baseline));
    assert(effectEvents.some(ev=>ev?.command==='DAMAGE'&&ev.amount>0));
    verifyPrintedAttack(before,after,t.trigger,Number(t.trigger.damage));
    if(t.trigger.plan.mechanic==='ATTACK_NAMED_NEXT_TURN_LOCK'){
      const lock=after.players[0].active?.referenceNamedAttackLock;
      assert.equal(lock?.turn,before.turnNumber+2);
      assert.equal(lock?.attackName,t.trigger.name);
    }
    if(t.trigger.plan.mechanic==='NO_NEXT_ATTACK'){
      assert.equal(after.players[0].active?.referenceCannotAttackTurn,before.turnNumber+2);
    }
  }
  if(e.plan.mechanic==='TRAINER_SWITCH_OR_EX_V_BOOST'){
    const action=t.action||o.action;
    assert.equal(action.selections.mode[0],'boost');
    assert.equal(after.players[0].referenceExVDamageBoost?.turn,before.turnNumber);
    assert.equal(after.players[0].referenceExVDamageBoost?.amount,e.plan.amount);
    if(before.players[0].bench.length){
      const replay=port(before),target=before.players[0].bench[0].id;
      // The selected option changes the required target, not just the label.
      const requests=o.requests||[];
      const benchRequest=requests.find(r=>r.key==='ownBench');
      assert(benchRequest?.dependencies?.some(r=>r.kind==='countWhenSelected'&&r.value==='switch'));
      assert.equal(replay.dispatch('you',{...action,selections:{mode:['switch'],ownBench:[]}}).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
      assert(replay.dispatch('you',{...action,selections:{mode:['switch'],ownBench:[target]}}).ok);
      assert.equal(replay.getSnapshot().players[0].active.id,target);
      assert(!replay.getSnapshot().players[0].referenceExVDamageBoost);
      const invalid=port(before);
      assert.equal(invalid.dispatch('you',{...action,selections:{mode:['boost'],ownBench:[target]}}).ok,false);
      assert.deepEqual(invalid.getSnapshot(),before);
    }
  }
  if(e.plan.mechanic==='TOOL_EX_ATTACK_BOOST'||e.plan.mechanic==='TOOL_PRIZE_COST_DISCOUNT'){
    const action=t.action||o.action,own=after.players[0],other=after.players[1];
    const holder=[own.active,...own.bench].find(c=>c.id===action.targetInstanceId);
    assert(holder?.tools.some(c=>c.id===t.sourceId));
    // Tool execution must be proved using a subsequent real attack, not merely attachment.
    if(holder!==own.active)return {status:'BLOCKED',reason:'TOOL_FIXTURE_NOT_ACTIVE'};
    const print=E.getReferenceEffectRecord(holder),idx=print.attacks.findIndex(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0&&(e.plan.mechanic!=='TOOL_PRIZE_COST_DISCOUNT'||a.cost.includes('無色')));
    if(idx<0)return {status:'BLOCKED',reason:'NO_TOOL_ATTACK_FIXTURE'};
    const attack=print.attacks[idx],start=JSON.parse(JSON.stringify(after)),p0=start.players[0],p1=start.players[1];
    const testAction={type:'attack_turn',attackIndex:idx};
    if(e.plan.mechanic==='TOOL_EX_ATTACK_BOOST'){
      if(!E.getReferenceEffectRecord(other.active).name.endsWith('ex')||e.plan.nonRuleOnly&&print.facts.rulePokemon)return {status:'BLOCKED',reason:'NO_TOOL_EX_MATCHUP'};
    }else{
      while(p1.prizes>1){p1.hand.push(p1.prizeCards.pop());p1.prizes--;}
      if(p0.prizes<=p1.prizes)return {status:'BLOCKED',reason:'NO_PRIZE_ADVANTAGE_FIXTURE'};
    }
    const required=attack.cost.slice();
    if(e.plan.mechanic==='TOOL_PRIZE_COST_DISCOUNT')for(let n=0;n<e.plan.amount;n++){const i=required.indexOf('無色');if(i>=0)required.splice(i,1);}
    for(const type of required){
      const i=p0.deck.findIndex(c=>c.kind==='energy'&&!c.isSpecial&&(type==='無色'||c.energyType===type));
      if(i<0)return {status:'BLOCKED',reason:'NO_TOOL_PAYMENT_FIXTURE'};
      p0.active.energyCards.push(p0.deck.splice(i,1)[0]);
    }
    const base=JSON.parse(JSON.stringify(start));base.players[0].discard.push(...base.players[0].active.tools.splice(0));
    const withTool=port(start),withoutTool=port(base);
    if(!withTool.dispatch('you',testAction).ok)return {status:'BLOCKED',reason:'TOOL_ATTACK_UNAVAILABLE'};
    if(e.plan.mechanic==='TOOL_PRIZE_COST_DISCOUNT'){
      assert.equal(withoutTool.dispatch('you',testAction).ok,false);
    }else{
      assert(withoutTool.dispatch('you',testAction).ok);
      const trigger={...attack,effectIndex:idx};
      verifyPrintedAttack(start,withTool.getSnapshot(),trigger,Number(attack.damage)+e.plan.amount);
      verifyPrintedAttack(base,withoutTool.getSnapshot(),trigger,Number(attack.damage));
    }
  }
  if(e.plan.mechanic==='PASSIVE_IGNORE_ACTIVE_DEFENSE'){
    const attacker=before.players[0].active,defender=before.players[1].active,action=t.action||o.action;
    assert(E.getReferenceEffectRecord(attacker).abilities.some(a=>a.effectId===e.effectId));
    assert.equal(defender.referenceProtection.opponentTurn,before.turnNumber);
    const plan=t.trigger.plan,amount=plan.base+(defender.statusCondition?plan.bonus:0);
    verifyPrintedAttack(before,after,t.trigger,amount);
    assert(effectEvents.some(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===defender.id&&ev.amount>0));
    const suppressed=JSON.parse(JSON.stringify(before)),own=suppressed.players[0];
    const index=own.deck.findIndex(c=>E.getReferenceEffectRecord(c)?.mainPlan?.mechanic==='SUPPRESS_RULE_ABILITIES');
    assert(index>=0);suppressed.stadium=own.deck.splice(index,1)[0];suppressed.stadiumOwner=own.id;
    const replay=port(suppressed);assert(replay.dispatch('you',action).ok);
    const result=replay.getSnapshot();
    assert(result.history.slice(suppressed.history.length).some(ev=>ev.details?.command==='DAMAGE'&&ev.details.targetInstanceId===defender.id&&ev.details.amount===0));
    assert.equal(result.players[1].active.damage,defender.damage);
    assert.deepEqual(S.identities(suppressed),S.identities(result));
  }
  if(e.plan.mechanic==='PASSIVE_ACTIVE_HIT_RETALIATION'){
    const defender=before.players[1].active,attacker=before.players[0].active,action=t.action||o.action;
    assert(effectEvents.some(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===defender.id&&ev.amount>0));
    const reactions=effectEvents.filter(ev=>ev?.mechanic==='PASSIVE_ACTIVE_HIT_RETALIATION'&&ev.effectId===e.effectId);
    assert.equal(reactions.length,1);assert.equal(reactions[0].targetInstanceId,attacker.id);
    if(e.plan.status){assert.equal(reactions[0].command,'STATUS_CONDITION');assert.equal(reactions[0].status,e.plan.status);}
    else{assert.equal(reactions[0].counterCount,e.plan.counterCount);
      assert(effectEvents.some(ev=>ev?.command==='PLACE_DAMAGE_COUNTERS'&&ev.targetInstanceId===attacker.id&&ev.counterCount===e.plan.counterCount));
    }
    // Zero attack damage must not trigger the reaction.
    const protectedGame=JSON.parse(JSON.stringify(before));protectedGame.players[1].active.referenceProtection={opponentTurn:before.turnNumber};
    const replay=port(protectedGame);assert(replay.dispatch('you',action).ok);
    const result=replay.getSnapshot(),events=result.history.slice(protectedGame.history.length).map(ev=>ev.details);
    assert(events.some(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===defender.id&&ev.amount===0));
    assert(!events.some(ev=>ev?.mechanic==='PASSIVE_ACTIVE_HIT_RETALIATION'&&ev.effectId===e.effectId));
    assert.deepEqual(S.identities(protectedGame),S.identities(result));
  }
  if(['PASSIVE_COIN_DAMAGE_GUARD','PASSIVE_COIN_KO_SURVIVAL'].includes(e.plan.mechanic)){
    const defender=before.players[1].active,action=t.action||o.action,guard=e.plan.mechanic==='PASSIVE_COIN_DAMAGE_GUARD';
    assert(E.getReferenceEffectRecord(defender).abilities.some(a=>a.effectId===e.effectId));
    for(const [seed,heads] of [[0,true],[682,false]]){
      const start=structuredClone(before);start.referenceRngState=seed;
      const replay=port(start);assert(replay.dispatch('you',action).ok);
      const end=replay.getSnapshot(),events=end.history.slice(start.history.length).map(ev=>ev.details);
      const trigger=events.find(ev=>ev?.mechanic===e.plan.mechanic&&ev.effectId===e.effectId&&typeof ev.heads==='boolean');
      assert(trigger&&trigger.heads===heads);
      const hit=events.find(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===defender.id);
      assert(hit);
      const survivor=[end.players[1].active,...end.players[1].bench].find(c=>c?.id===defender.id);
      if(heads){assert(survivor);if(guard){assert.equal(hit.amount,0);assert.equal(survivor.damage,defender.damage);}else{assert(hit.amount>=defender.hp-defender.damage);assert.equal(survivor.hp-survivor.damage,10);}}
      else{assert(hit.amount>0);if(!guard)assert(!survivor);}
      assert.deepEqual(Array.from(S.identities(start)),Array.from(S.identities(end)));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);assert.deepEqual(replay.getSnapshot(),end);
    }
    if(e.plan.energyType){
      const noEnergy=structuredClone(before),side=noEnergy.players[1];side.deck.push(...side.active.energyCards.splice(0));
      noEnergy.referenceRngState=0;const replay=port(noEnergy);assert(replay.dispatch('you',action).ok);
      assert(!replay.getSnapshot().history.slice(noEnergy.history.length).some(ev=>ev.details?.mechanic===e.plan.mechanic&&ev.details?.effectId===e.effectId));
    }
  }
  if(e.plan.mechanic==='PASSIVE_FULL_HP_SURVIVAL'){
    const defender=before.players[1].active,action=t.action||o.action;
    assert.equal(defender.damage,0);assert(after.players[1].active?.id===defender.id);
    assert.equal(after.players[1].active.hp-after.players[1].active.damage,e.plan.remainingHp);
    const incoming=effectEvents.find(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===defender.id);
    assert(incoming&&incoming.amount>=defender.hp);
    assert(effectEvents.some(ev=>ev?.mechanic==='PASSIVE_FULL_HP_SURVIVAL'&&ev.effectId===e.effectId&&ev.remainingHp===10));
    assert.equal(after.players[0].prizes,before.players[0].prizes);
    const injured=JSON.parse(JSON.stringify(before));injured.players[1].active.damage=10;
    const retry=port(injured);assert(retry.dispatch('you',action).ok);
    const next=retry.getSnapshot();assert(![next.players[1].active,...next.players[1].bench].some(c=>c?.id===defender.id));
    assert(next.history.slice(injured.history.length).some(ev=>ev.type==='knockout'&&ev.details?.targetPlayerId==='ai'));
    assert(!next.history.slice(injured.history.length).some(ev=>ev.details?.mechanic==='PASSIVE_FULL_HP_SURVIVAL'));
    assert.deepEqual(S.identities(injured),S.identities(next));
  }
  if (e.plan.mechanic === "PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION") {
    const defender = E.getReferenceEffectRecord(before.players[1].active);
    assert(defender.abilities.some(ability => ability.effectId === e.effectId));
    verifyPrintedAttack(before, after, t.trigger, Number(t.trigger.damage), e.plan.amount);
    if(e.plan.condition){
      const start=JSON.parse(JSON.stringify(before)),side=start.players[1],mon=side.active;
      if(e.plan.condition==='hasEnergy'){
        assert(mon.energyCards.length>0);side.deck.push(...mon.energyCards.splice(0));mon.energies=[];
      }else{assert.equal(mon.damage,0);mon.damage=10;}
      const retry=port(start),action=t.action||o.action;
      assert(retry.dispatch('you',action).ok);
      const result=retry.getSnapshot();
      verifyPrintedAttack(start,result,t.trigger,Number(t.trigger.damage),0);
      assert.deepEqual(Array.from(S.identities(start)),Array.from(S.identities(result)));
      assert(retry.restoreSession(retry.getResumeSnapshot()).ok);
      assert.equal(JSON.stringify(retry.getSnapshot()),JSON.stringify(result));
    }
  }
  if(e.plan.mechanic==='ATTACK_OPTIONAL_ENERGY_BONUS'){
    const own=before.players[0],plan=e.plan,action=t.action||o.action;
    const eligible=own.active.energyCards.filter(c=>!c.isSpecial&&(!plan.type||c.energyType===plan.type));
    if(!eligible.length)return {status:'BLOCKED',reason:'NO_OPTIONAL_ENERGY_BONUS_PROOF'};
    for(const bonus of [false,true]){
      const chosen=bonus?(plan.all?own.active.energyCards:eligible.slice(0,1)).map(c=>c.id):[];
      const selections=plan.all?{mode:[bonus?'bonus':'base']}:{energy:chosen};
      const replay=port(before);assert(replay.dispatch('you',{...action,selections}).ok);
      const result=replay.getSnapshot(),side=result.players[0];
      verifyPrintedAttack(before,result,e,plan.base+(bonus?plan.bonus:0));
      assert(chosen.every(id=>side[plan.destination].some(c=>c.id===id)));
      assert.deepEqual(Array.from(side.active.energyCards,c=>c.id),Array.from(own.active.energyCards.filter(c=>!chosen.includes(c.id)),c=>c.id));
      const events=result.history.slice(before.history.length).map(ev=>ev.details);
      assert.equal(events.filter(ev=>ev?.command==='SHUFFLE_DECK'&&!ev.reference).length,bonus&&plan.destination==='deck'?1:0);
      assert.deepEqual(Array.from(S.identities(before)),Array.from(S.identities(result)));
    }
    if(!plan.all){const denied=port(before);assert.equal(denied.dispatch('you',{...action,selections:{energy:[eligible[0].id,eligible[0].id]}}).ok,false);assert.equal(JSON.stringify(denied.getSnapshot()),JSON.stringify(before));}
  }
  if ((t.trigger || e).plan.mechanic === "ATTACK_DISCARD_BENCH_ENERGY_BONUS") {
    const effect = t.trigger || e;
    const action = o.action;
    const chosen = action.selections.energy;
    assert.equal(chosen.length, effect.plan.maxDiscard);
    for (let count = 0; count <= chosen.length; count++) {
      const replay = port(before);
      const energy = chosen.slice(0, count);
      assert(replay.dispatch("you", { ...action, selections: { energy } }).ok);
      const resolved = replay.getSnapshot();
      verifyPrintedAttack(before, resolved, effect, effect.plan.base + count * effect.plan.unit);
      const [own] = resolved.players;
      assert.deepEqual(Array.from(own.discard.slice(before.players[0].discard.length), card => card.id), Array.from(energy));
      assert(own.bench.every(card => card.energyCards.every(attached => !energy.includes(attached.id))));
      assert.deepEqual(S.identities(before), S.identities(resolved));
    }
    const invalid = port(before);
    for (const energy of [[chosen[0], chosen[0]], [before.players[0].active.energyCards[0].id]]) {
      assert.equal(invalid.dispatch("you", { ...action, selections: { energy } }).ok, false);
      assert.deepEqual(invalid.getSnapshot(), before);
    }
  }
  if(e.plan.mechanic==='PASSIVE_CONTEXT_ATTACK_GATE'){
    const short=JSON.parse(JSON.stringify(before)),[own,other]=short.players,plan=e.plan;
    if(plan.mode==='ownHand'){
      assert.equal(own.hand.length,plan.required);own.deck.unshift(own.hand.pop());
    }else{
      const qualifies=c=>{const name=E.getReferenceEffectRecord(c).name;return name.endsWith('ex')||/V(?:MAX|STAR)?$/.test(name);};
      assert(!qualifies(other.active)&&other.bench.some(qualifies));
      for(const c of other.bench.filter(qualifies)){
        assert(!c.evolutionCards?.length&&!c.tools?.length&&!c.energyCards?.length);
        other.bench.splice(other.bench.indexOf(c),1);
        for(const k of ['cardId','damage','enteredTurn','evolvedTurn','energyCards','energies','tools','statusCondition','statusConditionInfo','entryWindow','referenceEvolutionWindow'])delete c[k];
        other.deck.push(c);
      }
    }
    const replay=port(short),saved=replay.getSnapshot(),option=effectOption({...t,port:replay},e);
    assert((option.errors||option.disabledReasons).includes('CONTEXT_ATTACK_REQUIREMENT'));
    assert.equal(replay.dispatch('you',o.action).ok,false);
    assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(saved));
    assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
    assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(saved));
  }
  if (e.plan.mechanic === "PASSIVE_ROCKET_TEAM_ATTACK_GATE") {
    const short = structuredClone(before);
    const [own] = short.players;
    const teammate = own.bench.pop();
    own.deck.push(...teammate.energyCards, { ...teammate, energyCards: [], energies: [] });
    const replay = port(short);
    const saved = replay.getSnapshot();
    const option = effectOption({ ...t, port: replay }, e);
    assert((option.errors || option.disabledReasons).includes("ROCKET_TEAM_ATTACK_REQUIREMENT"));
    assert.equal(replay.dispatch("you", o.action).ok, false);
    assert.deepEqual(replay.getSnapshot(), saved);
  }
  if(e.plan.mechanic==='EXCITE_DIVE'){
    const source=before.players[0].hand.find(card=>card.id===t.sourceId);
    const entered=after.players[0].bench.find(card=>card.id===t.sourceId);
    assert(source&&entered&&entered.stage===source.stage);
    assert.equal(entered.validationReference.officialCardId,source.validationReference.officialCardId);
    assert(!after.players[0].hand.some(card=>card.id===t.sourceId));
  }
  if(e.plan.mechanic==="TRAINER_DISCARD_SPECIAL_ENERGY"){
    const action=t.action||o.action,chosen=action.selections.energy;
    assert.equal(chosen.length,1);
    const target=[before.players[1].active,...before.players[1].bench].find(c=>c.energyCards.some(e=>e.id===chosen[0]&&e.isSpecial));
    assert(target);assert(after.players[1].discard.some(c=>c.id===chosen[0]));
    const resolved=[after.players[1].active,...after.players[1].bench].find(c=>c.id===target.id);
    assert.deepEqual(resolved.energyCards.map(c=>c.id),target.energyCards.filter(c=>c.id!==chosen[0]).map(c=>c.id));
    const basic=target.energyCards.find(c=>!c.isSpecial);
    if(basic){const replay=port(before);assert.equal(replay.dispatch("you",{...action,selections:{energy:[basic.id]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));}
  }
  if(e.plan.mechanic==="TOOL_LOW_HP_RETREAT_DISCOUNT"){
    const action=t.action||o.action,findMon=state=>[state.players[0].active,...state.players[0].bench].find(c=>c.id===action.targetInstanceId);
    for(const remaining of [e.plan.threshold,e.plan.threshold+10]){
      const start=JSON.parse(JSON.stringify(before)),mon=findMon(start);
      assert(mon.hp>=remaining);
      mon.damage=mon.hp-remaining;
      const replay=port(start),prior=findMon(replay.getSnapshot()).retreatCost;
      assert(replay.dispatch("you",action).ok);
      assert.equal(findMon(replay.getSnapshot()).retreatCost,remaining<=e.plan.threshold?0:Math.max(0,prior-e.plan.amount));
    }
  }
  if(e.plan.mechanic==='TOOL_RETREAT_DISCOUNT_TWO'){
    const action=t.action||o.action;
    const findMon=state=>[state.players[0].active,...state.players[0].bench]
      .filter(Boolean).find(mon=>mon.id===action.targetInstanceId);
    const previous=findMon(before),current=findMon(after);
    assert(previous&&current,'TOOL_RETREAT_TARGET_MISSING');
    assert.equal(current.retreatCost,Math.max(0,previous.retreatCost-e.plan.amount),
      'TOOL_RETREAT_DISCOUNT_INCORRECT');
  }
  if(e.plan.mechanic==='SUPPORTER_ORDERED_BOTTOM_DRAW'){
    const action=t.action||o.action,chosen=action.selections.cards,own=before.players[0],resolved=after.players[0],plan=e.plan;
    assert.equal(chosen.length,plan.count);
    assert.deepEqual(Array.from(resolved.deck,c=>c.id),[...Array.from(own.deck.slice(plan.draw),c=>c.id),...chosen]);
    assert.deepEqual(Array.from(resolved.hand,c=>c.id),[...Array.from(own.hand.filter(c=>c.id!==action.cardId&&!chosen.includes(c.id)),c=>c.id),...Array.from(own.deck.slice(0,plan.draw),c=>c.id)]);
    const reverse=port(before);assert(reverse.dispatch('you',{...action,selections:{...action.selections,cards:[...chosen].reverse()}}).ok);
    assert.deepEqual(Array.from(reverse.getSnapshot().players[0].deck.slice(-plan.count),c=>c.id),[...chosen].reverse());
    const invalid=port(before);assert.equal(invalid.dispatch('you',{...action,selections:{...action.selections,cards:chosen.slice(1)}}).ok,false);
    assert.equal(JSON.stringify(B.canonical(invalid.getSnapshot())),JSON.stringify(B.canonical(before)));
    assert.deepEqual(Array.from(S.identities(before)),Array.from(S.identities(after)));
  }
  if(e.plan.mechanic==='SUPPORTER_DISCARD_ONE_DRAW_TO_SIX'){
    const action=t.action||o.action,chosen=action.selections?.discard;
    assert(chosen?.length===1,'SUPPORTER_DISCARD_SELECTION_MISSING');
    assert(before.players[0].hand.some(card=>card.id===chosen[0]));
    assert(after.players[0].discard.some(card=>card.id===chosen[0]));
    assert(after.players[0].discard.some(card=>card.id===action.cardId));
    const initial=before.players[0].hand.length-2;
    const expected=initial+Math.min(before.players[0].deck.length,Math.max(0,e.plan.limit-initial));
    assert.equal(after.players[0].hand.length,expected,'SUPPORTER_DRAW_TO_SIX_INCORRECT');
  }
  if(e.plan.mechanic==='ATTACK_REVEAL_OPPONENT_HAND'){
    const reveal=after.history.slice(before.history.length).find(event=>
      event.details?.command==='REVEAL'&&event.details.privateTo==='you'&&
      event.details.fromZone==='hand');
    assert(reveal,'OPPONENT_HAND_PRIVATE_REVEAL_MISSING');
    assert.deepEqual(Array.from(reveal.details.cardIds),Array.from(before.players.find(player=>player.id!=='you').hand,card=>card.id),
      'OPPONENT_HAND_REVEAL_NOT_EXACT');
    verifyPrintedAttack(before,after,e,Number(e.damage)||0);
  }
  if (e.plan.mechanic === "VANILLA_DAMAGE"){
    // Include the attacker's own continuous damage ability, and any other
    // exact printed team bonuses present in this fixture. Do not infer a
    // bonus from the observed DAMAGE event. Verify the amount independently.
    const attacker=E.getReferenceEffectRecord(before.players[0].active),defender=E.getReferenceEffectRecord(before.players[1].active);
    const stadium=before.stadium&&E.getReferenceEffectRecord(before.stadium)?.mainPlan?.mechanic;
    const suppressed=record=>stadium==='WATCHTOWER'&&record.facts.types.includes('無色')||stadium==='SUPPRESS_RULE_ABILITIES'&&record.facts.rulePokemon;
    const bonuses=[],unique=new Set();
    for(const holder of [before.players[0].active,...before.players[0].bench]){
      const printed=E.getReferenceEffectRecord(holder);
      if(suppressed(printed))continue;
      for(const ability of printed.abilities){
        const plan=ability.plan;
        if(plan?.mechanic!=='PASSIVE_TEAM_ATTACK_BOOST')continue;
        if(holder===before.players[0].active&&!suppressed(defender)&&defender.abilities.some(a=>a.plan?.mechanic==='ACTIVE_OPPONENT_ABILITY_SUPPRESSION'&&a.plan.exceptAbilityName!==ability.name))continue;
        if(plan.team&&!attacker.name.startsWith(plan.team+'の'))continue;
        if(plan.types.length&&!plan.types.some(type=>attacker.facts.types.includes(type)))continue;
        if(plan.evolvedSource&&attacker.facts.stage===0||plan.evolvedTarget&&defender.facts.stage===0)continue;
        if(plan.nonStack&&unique.has(ability.name))continue;
        if(plan.nonStack)unique.add(ability.name);
        bonuses.push(plan.amount);
      }
    }
    verifyPrintedAttack(before, after, e, Number(e.damage)+bonuses.reduce((sum,n)=>sum+n,0));
  }
  if (e.plan.mechanic === "DISCARD_TO_SEARCH_DISTINCT_CATEGORIES") {
    const action = t.action || o.action;
    const { discard, cards } = action.selections;
    const [own] = before.players;
    const [resolved] = after.players;
    assert.equal(discard.length, e.plan.cost);
    assert(discard.every(id => own.hand.some(card => card.id === id && id !== action.cardId)));
    assert([action.cardId, ...discard].every(id => resolved.discard.some(card => card.id === id)));
    const selected = cards.map(id => own.deck.find(card => card.id === id));
    const categories = selected.map(card => E.getReferenceEffectRecord(card).category);
    assert(categories.length > 0 && categories.every(category => e.plan.categories.includes(category)));
    assert.equal(new Set(categories).size, categories.length);
    assert(cards.every(id => resolved.hand.some(card => card.id === id)));
    const events = after.history.slice(before.history.length).map(event => event.details);
    assert(events.some(step => step?.command === "REVEAL" && JSON.stringify(step.cardIds) === JSON.stringify(cards)));
    assert(events.some(step => step?.command === "SHUFFLE_DECK"));
    const replay = port(before);
    const byCategory = own.deck.filter(card => E.getReferenceEffectRecord(card).category === categories[0]);
    assert(byCategory.length >= 2, "DISTINCT_CATEGORY_FIXTURE_NEEDS_DUPLICATES");
    for (const selections of [
      {cards, discard: discard.slice(1)},
      {cards, discard: [action.cardId, ...discard.slice(1)]},
      {cards: byCategory.slice(0, 2).map(card => card.id), discard},
      {cards: [own.active.id], discard},
    ]) {
      assert.equal(replay.dispatch("you", {...action, selections}).ok, false);
      assert.deepEqual(replay.getSnapshot(), before);
    }
    assert(replay.dispatch("you", {...action, selections: {cards: [], discard}}).ok);
    const skipped = replay.getSnapshot();
    assert.equal(skipped.players[0].hand.length, own.hand.length - 1 - e.plan.cost);
    assert(skipped.history.slice(before.history.length).some(event => event.details?.command === "SHUFFLE_DECK"));
  }
  if (e.plan.mechanic === "ATTACK_SPLASH_DAMAGE") {
    verifyPrintedAttack(before, after, e, Number(e.damage) || 0);
    const target = before.players[1].bench.find(card => card.id === (t.action || o.action).targetIds?.[0]);
    assert(target, "SPLASH_DAMAGE_NEEDS_BENCH_FIXTURE");
    const events = after.history.slice(before.history.length);
    assert(events.some(event => event.details?.command === "DAMAGE" &&
      event.details.targetInstanceId === target.id && event.details.amount === e.plan.benchDamage));
  }
  if (e.plan.mechanic === "ATTACK_DISCARD_OPPONENT_DECK_TOP") {
    verifyPrintedAttack(before, after, e, Number(e.damage) || 0);
    const expected = before.players[1].deck.slice(0, e.plan.amount).map(card => card.id);
    assert(expected.length > 0, "DISCARD_ATTACK_NEEDS_OPPONENT_DECK_FIXTURE");
    assert.deepEqual(Array.from(after.players[1].discard
      .slice(before.players[1].discard.length, before.players[1].discard.length + expected.length),
      card => card.id), Array.from(expected));
  }
  if (e.plan.mechanic === "ATTACK_DISCARD_HAND_DRAW") {
    verifyPrintedAttack(before, after, e, Number(e.damage) || 0);
    const own = before.players[0], resolved = after.players[0];
    assert(own.hand.length > 0 && own.deck.length > 0);
    assert(own.hand.every(card => resolved.discard.some(discarded => discarded.id === card.id)));
    assert.deepEqual(Array.from(resolved.hand, card => card.id),
      Array.from(own.deck.slice(0, e.plan.amount), card => card.id));
  }
  if (e.plan.mechanic === "ATTACK_IGNORE_DAMAGE_RULES") {
    const protectedStart = JSON.parse(JSON.stringify(before));
    protectedStart.players[1].active.referenceProtection = {opponentTurn:before.turnNumber};
    const replay = port(protectedStart);
    assert(replay.dispatch("you", t.action || o.action).ok);
    verifyPrintedAttack(protectedStart, replay.getSnapshot(), e, e.plan.ignore ? Number(e.damage) || 0 : 0);
  }
  if (e.plan.mechanic === "ACTIVE_TOP_SUPPORTER_SEARCH") {
    const action=t.action||o.action;
    const [chosen]=action.selections.cards;
    const own=before.players[0];
    assert(own.deck.slice(0,6).some(card=>card.id===chosen&&card.cardType==="SUPPORTER"));
    assert(o.requests[0].inspection.cards.length===6);
    assert(after.players[0].hand.some(card=>card.id===chosen));
    const events=after.history.slice(before.history.length).map(event=>event.details);
    assert(events.some(step=>step?.command==="REVEAL"&&step.cardIds?.includes(chosen)));
    assert(events.some(step=>step?.command==="SHUFFLE_DECK"));
    const replay=port(before);
    assert.equal(replay.dispatch("you",{...action,selections:{cards:[own.deck[6].id]}}).ok,false);
    assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    const swapped=JSON.parse(JSON.stringify(before));
    const player=swapped.players[0];
    [player.active,player.bench[0]]=[player.bench[0],player.active];
    assert.equal(port(swapped).dispatch("you",action).ok,false);
    assert.equal(p.dispatch("you",action).ok,false);
  }
  if (e.plan.mechanic === "FULL_BENCH_REQUIRED_DAMAGE") {
    verifyPrintedAttack(before, after, e, Number(e.damage));
    const start = JSON.parse(JSON.stringify(before));
    if(e.plan.requiresStadium) {
      start.players.find(player=>player.id===start.stadiumOwner).discard.push(start.stadium);
      start.stadium=null;
      start.stadiumOwner=null;
    } else {
      const player = start.players[0];
      player.deck.push(player.bench.pop());
    }
    const replay = port(start);
    assert(replay.dispatch("you", (t.action || o.action)).ok);
    const end = replay.getSnapshot();
    assert.equal(end.players[1].active.damage, start.players[1].active.damage);
    assert.notEqual(end.turnPlayer, start.turnPlayer);
    assert.deepEqual(S.identities(start), S.identities(end));
  }
  if(e.plan.noSecondPlayerFirstTurn){
    const initial=JSON.parse(JSON.stringify(before));initial.turnNumber=2;
    const replay=port(initial),snapshot=replay.getSnapshot(),action=t.action||o.action;
    assert(!E.getLegalActions(snapshot,"you").actions.some(a=>a.type==="attack_turn"&&a.attackIndex===action.attackIndex));
    assert.equal(replay.dispatch("you",action).ok,false);assert.deepEqual(replay.getSnapshot(),snapshot);
  }
  if (e.plan.mechanic === "BENCH_COUNT_DAMAGE") {
    const action = t.action || o.action;
    const side = e.plan.side === "own" ? 0 : 1;
    for (const count of [0, 1, 2]) {
      const start = JSON.parse(JSON.stringify(before));
      const player = start.players[side];
      assert(player.bench.length >= count);
      player.deck.push(...player.bench.splice(count));
      const replay = port(start);
      assert(replay.dispatch("you", action).ok);
      const end = replay.getSnapshot();
      verifyPrintedAttack(start, end, e, e.plan.base + count * e.plan.unit);
      assert.deepEqual(S.identities(start), S.identities(end));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.deepEqual(replay.getSnapshot(), end);
    }
  }
  if (e.plan.mechanic === "SELF_COUNTER_DAMAGE") {
    const base = e.damage.endsWith("+") ? Number.parseInt(e.damage, 10) : 0;
    const perCounter = Number(e.text.normalize("NFKC").match(/×(\d+)ダメージ/)[1]);
    for (const damage of [0, 20]) {
      const start = structuredClone(before);
      start.players[0].active.damage = damage;
      const replay = port(start);
      assert(replay.dispatch("you", o.action).ok);
      const end = replay.getSnapshot();
      verifyPrintedAttack(start, end, e, base + damage / 10 * perCounter);
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.deepEqual(replay.getSnapshot(), end);
    }
  }
  if(e.plan.mechanic==='COIN_UNTIL_TAILS_MILL'){
    const action=t.action||o.action;
    assert(before.players[1].deck.length>=2);
    for(const [seed,heads] of [[682,0],[3,1],[0,2]]){
      const start={...before,referenceRngState:seed},replay=port(start);
      assert(replay.dispatch('you',action).ok);
      const end=replay.getSnapshot(),events=end.history.slice(start.history.length).map(x=>x.details);
      assert.deepEqual(Array.from(events.filter(x=>x?.command==='COIN_FLIP'&&typeof x.heads==='boolean'),x=>x.heads),[...Array(heads).fill(true),false]);
      const source=start.players[1], resolved=end.players[1];
      const expected=Array.from(source.deck.slice(0,heads),c=>c.id);
      const remaining=Array.from(source.deck.slice(heads),c=>c.id);
      const millEvents=events.filter(x=>x?.command==='DISCARD'&&x.fromZone==='deck'&&x.owner===source.id);
      assert.deepEqual(Array.from(millEvents.flatMap(x=>x.cardIds)),expected,'MILL_EVENT_EXACT_TOP_IDS');
      assert.equal(millEvents.length,expected.length?1:0);
      assert.deepEqual(Array.from(resolved.discard.slice(source.discard.length,source.discard.length+expected.length),c=>c.id),expected,'MILL_DISCARD_EXACT_TOP_IDS');
      const deck=Array.from(resolved.deck,c=>c.id);
      if(deck.length===remaining.length-1&&end.turnPlayer===source.id){
        // Attack completion can draw the opponent's next-turn card. Prove that
        // it is exactly the next un-milled physical card, not an extra discard.
        assert(!source.hand.some(c=>c.id===remaining[0]));
        assert(resolved.hand.some(c=>c.id===remaining[0]),'NEXT_TURN_DRAW_EXACT_ID');
        assert.deepEqual(deck,remaining.slice(1),'MILL_THEN_TURN_DRAW_ORDER');
      }else assert.deepEqual(deck,remaining,'MILL_REMAINING_DECK_ORDER');
      verifyPrintedAttack(start,end,e,e.plan.base);
      assert.deepEqual(S.identities(start),S.identities(end));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.deepEqual(replay.getSnapshot(),end);
    }
  }
  if (e.plan.mechanic === "COIN_UNTIL_TAILS_DAMAGE") {
    for (const [seed, heads] of [[682, 0], [3, 1], [0, 2]]) {
      const start = {...before, referenceRngState:seed};
      const replay = port(start);
      assert(replay.dispatch("you", o.action).ok);
      const end = replay.getSnapshot();
      const flips = end.history.slice(start.history.length).map(event => event.details)
        .filter(step => step?.command === "COIN_FLIP" && typeof step.heads === "boolean");
      assert.deepEqual(Array.from(flips, step => step.heads), [...Array(heads).fill(true), false]);
      verifyPrintedAttack(start, end, e, e.plan.base + heads * e.plan.unit);
      assert.deepEqual(S.identities(start), S.identities(end));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.deepEqual(replay.getSnapshot(), end);
    }
  }
  if (e.plan.mechanic === "COIN_BONUS_DAMAGE") {
    for (const [seed, heads] of [[0, true], [682, false]]) {
      const start = { ...before, referenceRngState: seed };
      const replay = port(start);
      assert(replay.dispatch("you", o.action).ok);
      const end = replay.getSnapshot();
      const flips = end.history.slice(start.history.length).filter(event =>
        event.details?.command === "COIN_FLIP" && typeof event.details.heads === "boolean");
      assert.equal(flips.length, 1);
      assert.equal(flips[0].details.heads, heads);
      verifyPrintedAttack(start, end, e, Number.parseInt(e.damage.normalize("NFKC"), 10) + (heads ? e.plan.bonus : 0));
      assert.deepEqual(S.identities(start), S.identities(end));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.deepEqual(replay.getSnapshot(), end);
    }
  }

  if (e.plan.mechanic === "ATTACK_APPLY_STATUS") {
    const events=after.history.slice(before.history.length);
    assert.equal(after.players[1].active.statusCondition,e.plan.status);
    assert(events.some(ev=>ev.details?.command==='STATUS_CONDITION'
      &&ev.details.status===e.plan.status
      &&ev.details.targetInstanceId===before.players[1].active.id));
    if(Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
    if(e.plan.defenderType){
      const type=e.plan.defenderType, action=t.action||o.action;
      assert(E.getReferenceEffectRecord(before.players[1].active).facts.types.includes(type),'TYPED_STATUS_POSITIVE_FIXTURE');
      const negative=JSON.parse(JSON.stringify(before)),side=negative.players[1];
      const i=side.bench.findIndex(c=>!E.getReferenceEffectRecord(c).facts.types.includes(type)&&!c.statusCondition);
      assert(i>=0,'TYPED_STATUS_NEGATIVE_FIXTURE');
      [side.active,side.bench[i]]=[side.bench[i],side.active];
      const replay=port(negative);assert(replay.dispatch('you',action).ok);
      const result=replay.getSnapshot();
      assert(!result.history.slice(negative.history.length).some(ev=>ev.details?.command==='STATUS_CONDITION'&&ev.details.targetInstanceId===side.active.id));
      if(Number(e.damage)>0)verifyPrintedAttack(negative,result,e,Number(e.damage));
      assert.deepEqual(Array.from(S.identities(negative)),Array.from(S.identities(result)));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(result));
    }
    assert(p.restoreSession(p.getResumeSnapshot()).ok);
    assert.deepEqual(p.getSnapshot(),after);
  }
  if (e.plan.mechanic === "ATTACK_HEAL_TEAM") {
    const events=after.history.slice(before.history.length);
    for(const card of [before.players[0].active,...before.players[0].bench].filter(Boolean)){
      const expected=Math.min(card.damage||0,e.plan.amount);
      assert(events.some(ev=>ev.details?.command==='HEAL'
        &&ev.details.targetInstanceId===card.id&&ev.details.amount===expected));
    }
    if(Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
    assert(p.restoreSession(p.getResumeSnapshot()).ok);
    assert.deepEqual(p.getSnapshot(),after);
  }
  if (e.plan.mechanic === "ATTACK_TAKEN_PRIZES_DAMAGE") {
    const count=6-before.players[1].prizes;
    assert(Number.isInteger(count)&&count>=0&&count<=6);
    if(count>0)verifyPrintedAttack(before,after,e,count*e.plan.unit);
    else assert(after.history.slice(before.history.length).some(ev=>ev.type==='attack'
      &&ev.details.effectId===e.effectId));
  }
  if (e.plan.mechanic === "ATTACK_DISCARD_STADIUM") {
    assert(before.stadium && before.stadiumOwner);
    if(e.plan.optional){
      const action=t.action||o.action;
      const skip=port(before);assert(skip.dispatch('you',{...action,selections:{...action.selections,stadiumDiscard:[]}}).ok);
      assert.equal(skip.getSnapshot().stadium?.id,before.stadium.id);
      if(Number(e.damage)>0)verifyPrintedAttack(before,skip.getSnapshot(),e,Number(e.damage));
      assert.deepEqual(S.identities(before),S.identities(skip.getSnapshot()));
      if(!action.selections?.stadiumDiscard?.length)return {status:'BLOCKED',reason:'NO_POSITIVE_OPTIONAL_STADIUM_FIXTURE'};
    }
    assert.equal(after.stadium, null);
    assert.equal(after.stadiumOwner, null);
    const discard = after.players.find(side => side.id === before.stadiumOwner).discard;
    assert(discard.some(card => card.id === before.stadium.id));
    if (Number(e.damage) > 0) verifyPrintedAttack(before, after, e, Number(e.damage));
  }
  if (e.plan.mechanic === "ATTACK_UNDAMAGED_BONUS") {
    for (const damage of [0, 10]) {
      const start = structuredClone(before);
      start.players[0].active.damage = damage;
      const replay = port(start);
      assert(replay.dispatch("you", t.action || o.action).ok);
      verifyPrintedAttack(start, replay.getSnapshot(), e,
        e.plan.base + (damage === 0 ? e.plan.bonus : 0));
    }
  }
  if (e.plan.mechanic === "ATTACK_ATTACHED_TOOL_COUNT") {
    const eligible = e.plan.bothSides ? before.players : before.players.slice(0, 1);
    const count = eligible.flatMap(side => [side.active, ...side.bench])
      .filter(Boolean).reduce((total, card) => total + (card.tools || []).length, 0);
    assert(count > 0, "ATTACHED_TOOL_COUNT_FIXTURE_NEEDS_TOOL");
    verifyPrintedAttack(before, after, e, count * e.plan.unit);
  }
  if (e.plan.mechanic === "ATTACK_STATUS_BONUS_DAMAGE") {
    verifyPrintedAttack(before,after,e,e.plan.base+
      (before.players[1].active.statusCondition?e.plan.bonus:0));
  }

  if (e.plan.mechanic === "ATTACK_NAMED_NEXT_TURN_LOCK") {
    verifyPrintedAttack(before, after, e, Number(e.damage) || 0);
    const lock=after.players[0].active.referenceNamedAttackLock;
    assert.equal(lock?.turn,before.turnNumber+2,'NAMED_ATTACK_LOCK_WRONG_TURN');
    assert.equal(lock?.attackName,e.plan.attackName,'NAMED_ATTACK_LOCK_WRONG_ATTACK');
    const future=structuredClone(after);
    future.turnNumber=before.turnNumber+2;
    future.turnPlayer='you';
    future.status=before.status;
    delete future.pendingPrizeSelection;
    delete future.pendingReferenceChoice;
    delete future.referenceAttackTurnPending;
    const replay=port(future);
    const sameAttack=t.action||o.action;
    assert.equal(replay.dispatch('you',sameAttack).ok,false);
    assert.equal(JSON.stringify(B.canonical(replay.getSnapshot())),JSON.stringify(B.canonical(future)));
    assert(p.restoreSession(p.getResumeSnapshot()).ok);
    assert.equal(JSON.stringify(B.canonical(p.getSnapshot())),JSON.stringify(B.canonical(after)));
  }
  if (e.plan.mechanic === "COIN_PARALYZE_ATTACK") {
    for (const [seed, heads] of [[0, true], [682, false]]) {
      const start = { ...before, referenceRngState: seed };
      const replay = port(start);
      assert(replay.dispatch("you", t.action || o.action).ok);
      const end = replay.getSnapshot();
      const flips = end.history.slice(start.history.length).filter(event =>
        event.details?.command === "COIN_FLIP" && typeof event.details.heads === "boolean");
      assert.equal(flips.length, 1);
      assert.equal(flips[0].details.heads, heads);
      assert.equal(end.players[1].active.statusCondition || null,
        heads ? "PARALYZED" : (start.players[1].active.statusCondition || null));
      verifyPrintedAttack(start, end, e, Number.parseInt(e.damage.normalize("NFKC"), 10) || 0);
      assert.deepEqual(S.identities(start), S.identities(end));
      assert(replay.restoreSession(replay.getResumeSnapshot()).ok);
      assert.deepEqual(replay.getSnapshot(), end);
    }
  }
  if(e.plan.mechanic==="ATTACK_ACCELERATE_BASIC_ENERGY"){
    const action=t.action||o.action,chosen=action.selections.energy;
    const own=before.players[0],targetId=e.plan.target==="self"?own.active.id:action.selections.attachTo[0];
    const oldTarget=[own.active,...own.bench].find(c=>c.id===targetId);
    const newTarget=[after.players[0].active,...after.players[0].bench].find(c=>c?.id===targetId);
    assert(oldTarget&&newTarget&&chosen.length>0&&chosen.length<=e.plan.limit);
    if(e.plan.target==="bench")assert(own.bench.some(c=>c.id===targetId));
    if(e.plan.holderType)assert(E.getReferenceEffectRecord(oldTarget).facts.types.includes(e.plan.holderType));
    for(const id of chosen){
      const source=own[e.plan.zone].find(c=>c.id===id);
      assert(source?.kind==="energy"&&!source.isSpecial&&(!e.plan.type||source.energyType===e.plan.type));
      assert(newTarget.energyCards.some(c=>c.id===id));
      assert(!after.players[0][e.plan.zone].some(c=>c.id===id));
      assert(effectEvents.some(s=>s?.command==="ATTACH_ENERGY"&&s.energyId===id&&s.targetInstanceId===targetId&&s.fromZone===e.plan.zone));
    }
    assert.equal(effectEvents.some(s=>s?.command==="SHUFFLE_DECK"),e.plan.zone==="deck");
    assert.equal(after.players[0].normalEnergyAttached,own.normalEnergyAttached);
    const replay=port(before);
    assert.equal(replay.dispatch("you",{...action,selections:{...action.selections,energy:[chosen[0],chosen[0]]}}).ok,false);
    assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    if(e.plan.target!=="self"){
      assert.equal(replay.dispatch("you",{...action,selections:{...action.selections,attachTo:[before.players[1].active.id]}}).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    }
    assert(p.restoreSession(p.getResumeSnapshot()).ok);
    assert.deepEqual(p.getSnapshot(),after);
  }
  if(e.plan.mechanic==='ATTACK_NAMED_DISCARD_BENCH'){
    const action=t.action||o.action,own=before.players[0],chosen=action.selections.cards,plan=e.plan;
    const eligible=c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c)?.facts.basic&&E.getReferenceEffectRecord(c).name===plan.name;
    assert(chosen.length>0&&chosen.length<=Math.min(plan.limit,5-own.bench.length));
    assert(chosen.every(id=>own.discard.some(c=>c.id===id&&eligible(c))));
    assert(chosen.every(id=>after.players[0].bench.some(c=>c.id===id&&c.enteredTurn===before.turnNumber)&&!after.players[0].discard.some(c=>c.id===id)));
    assert(chosen.every(id=>effectEvents.some(ev=>ev?.command==='BENCH_FROM_ZONE'&&ev.fromZone==='discard'&&ev.cardIds.includes(id))));
    const replay=port(before);
    const wrong=own.discard.find(c=>!eligible(c));
    for(const cards of [[chosen[0],chosen[0]],[own.active.id],...(wrong?[[wrong.id]]:[])]){
      assert.equal(replay.dispatch('you',{...action,selections:{cards}}).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    }
    assert(replay.dispatch('you',{...action,selections:{cards:[]}}).ok);
    assert.deepEqual(Array.from(S.identities(replay.getSnapshot())),Array.from(S.identities(before)));
  }
  if (e.plan.mechanic === "SEARCH_BASIC_TO_BENCH_ATTACK") {
    const action = t.action || o.action;
    const chosen = action.selections.cards;
    const own = before.players[0];
    assert(chosen.length > 0 && chosen.length <= Math.min(e.plan.limit, 5 - own.bench.length));
    for (const id of chosen) {
      const card = own.deck.find(card => card.id === id);
      assert(card && batchSearchCandidate(card,e.plan));
      assert(after.players[0].bench.some(card => card.id === id && card.enteredTurn === before.turnNumber));
      assert(!after.players[0].deck.some(card => card.id === id));
    }
    assert(after.history.slice(before.history.length).some(event => event.details?.command === "SHUFFLE_DECK"));
    const replay = port(before);
    for (const ids of [[chosen[0], chosen[0]], [own.active.id]]) {
      assert.equal(replay.dispatch("you", {...action, selections:{cards:ids}}).ok, false);
      assert.deepEqual(replay.getSnapshot(), before);
    }
    assert(replay.dispatch("you", {...action, selections:{cards:[]}}).ok);
  }
  if (e.plan.mechanic === "SEARCH_REVEAL_TO_HAND_ATTACK") {
    const action = t.action || o.action;
    const selected = action.selections.cards;
    assert(selected.length > 0 && selected.length <= e.plan.limit);
    for (const id of selected) {
      const card = before.players[0].deck.find(card => card.id === id);
      assert(card);
      assert(batchSearchCandidate(card,e.plan), 'SELECTED_CARD_MUST_MATCH_PRINTED_SEARCH_FILTER');
      assert(after.players[0].hand.some(card => card.id === id));
      assert(!after.players[0].deck.some(card => card.id === id));
    }
    const steps = after.history.slice(before.history.length).map(event => event.details);
    if(e.plan.reveal===false)assert(!steps.some(step=>step?.command==='REVEAL'&&step.cardIds?.some(id=>selected.includes(id))));
    else assert(steps.some(step => step?.command === "REVEAL" && JSON.stringify(step.cardIds) === JSON.stringify(selected)));
    assert(steps.some(step => step?.command === "SHUFFLE_DECK"));
    const replay = port(before);
    assert.equal(replay.dispatch("you", {...action, selections:{...action.selections,cards:[selected[0], selected[0]]}}).ok, false);
    assert.deepEqual(replay.getSnapshot(), before);
    const wrong=before.players[0].deck.find(c=>!batchSearchCandidate(c,e.plan));
    if(wrong){
      assert.equal(replay.dispatch("you",{...action,selections:{...action.selections,cards:[wrong.id]}}).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    }
    const skipSelections=e.plan.optional?{searchMode:['skip'],cards:[]}:{cards:[]};
    assert(replay.dispatch("you", {...action, selections:skipSelections}).ok);
    if(e.plan.optional){
      const declined=port(before);
      assert.equal(declined.dispatch('you',{...action,selections:{...skipSelections,cards:[selected[0]]}}).ok,false);
      assert.deepEqual(declined.getSnapshot(),before);
      const inspect=port(before);
      assert(inspect.dispatch('you',{...action,selections:{...action.selections,cards:[]}}).ok);
      assert(inspect.getSnapshot().history.slice(before.history.length).some(entry=>entry.details?.command==='SHUFFLE_DECK'&&!entry.details.reference));
      const skipped=replay.getSnapshot();
      assert.deepEqual(skipped.players[0].deck,before.players[0].deck);
      assert(!skipped.history.slice(before.history.length).some(entry=>entry.details?.command==='SEARCH_DECK'&&!entry.details.reference));
    }
  }
  if(e.plan.mechanic==="ATTACK_DISCARD_MULTIPLE_SELF_ENERGY"){
    const source=before.players[0].active,chosen=(t.action||o.action).selections.energy||[];
    const attached=source.energyCards||[];
    assert(chosen.length>0&&chosen.every(id=>attached.some(c=>c.id===id)),"MISSING_SELF_ENERGY_DISCARD_FIXTURE");
    assert(chosen.every(id=>after.players[0].discard.some(c=>c.id===id)),"SELF_ENERGY_NOT_DISCARDED");
    const replay=port(before);
    if(e.plan.type){
      assert.equal(chosen.length,e.plan.count);
      assert(chosen.every(id=>attached.find(c=>c.id===id)?.energyType===e.plan.type));
      const wrong=attached.find(c=>c.energyType!==e.plan.type);
      assert(wrong,'NO_TYPED_DISCARD_NEGATIVE_RESOURCE');
      const wrongSelection=[wrong.id,...chosen.slice(1)];
      assert.equal(replay.dispatch('you',{...(t.action||o.action),selections:{...(t.action||o.action).selections,energy:wrongSelection}}).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
      assert(after.players[0].active.energyCards.some(c=>c.id===wrong.id),'WRONG_TYPE_ENERGY_MUST_REMAIN');
    }
    assert.equal(replay.dispatch("you",{...(t.action||o.action),selections:{...(t.action||o.action).selections,energy:[chosen[0],chosen[0]]}}).ok,false);
    assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    verifyPrintedAttack(before,after,e,Number(e.damage)||0);
  }
  if(e.plan.mechanic==="ATTACK_COIN_DISCARD_DEFENDER_ENERGY"){
    const chosen=(t.action||o.action).selections.energy||[];
    assert(chosen.length===1,"MISSING_DEFENDER_ENERGY_DISCARD_FIXTURE");
    const flips=effectEvents.filter(ev=>ev?.command==="COIN_FLIP"&&typeof ev.heads==="boolean");
    assert.equal(flips.length,1);
    const discarded=effectEvents.some(ev=>ev?.command==="DISCARD"&&ev.fromZone==="attached"&&ev.cardIds?.includes(chosen[0]));
    assert.equal(discarded,flips[0].heads&&before.players[1].active.referenceProtection?.opponentTurn!==before.turnNumber);
    if(discarded)assert(after.players[1].discard.some(c=>c.id===chosen[0]));
    // A printed no-damage attack performs its effect without a DAMAGE event.
    // Require the actual attack event and no positive damage to the defender.
    if(Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
    else {
      assert(after.history.slice(before.history.length).some(ev=>ev.type==='attack'&&
        ev.details?.effectId===e.effectId&&ev.details.referenceOfficialCardId===E.getReferenceEffectRecord(before.players[0].active).officialCardId));
      assert(!effectEvents.some(ev=>ev?.command==='DAMAGE'&&ev.targetInstanceId===before.players[1].active.id&&ev.amount>0));
      assert.equal(after.players[1].active.damage,before.players[1].active.damage);
    }
  }
  if(e.plan.mechanic==="ATTACK_ATTACH_BASIC_FROM_HAND"){
    const action=t.action||o.action,chosen=action.selections.energy||[];
    assert.equal(chosen.length,1,"MISSING_HAND_ATTACHMENT_FIXTURE");
    const targetId=e.plan.target==="self"?before.players[0].active.id:action.selections.attachTo[0];
    const target=[after.players[0].active,...after.players[0].bench].find(c=>c?.id===targetId);
    assert(before.players[0].hand.some(c=>c.id===chosen[0]&&c.kind==="energy"&&!c.isSpecial));
    assert(target?.energyCards.some(c=>c.id===chosen[0]));
    assert(!after.players[0].hand.some(c=>c.id===chosen[0]));
  }
  if (e.plan.mechanic === "DISCARD_ALL_SELF_ENERGY_ATTACK") {
    const source = before.players[0].active;
    const ids = (source.energyCards || []).map(card => card.id);
    assert(ids.length > 0, "SELF_ENERGY_DISCARD_NEEDS_ATTACHED_ENERGY_FIXTURE");
    assert.equal(after.players[0].active.energyCards.length, 0);
    assert(ids.every(id => after.players[0].discard.some(card => card.id === id)));
    verifyPrintedAttack(before, after, e, Number.parseInt(e.damage.normalize("NFKC"), 10) || 0);
  }
  if (e.plan.mechanic === "DISCARD_ONE_SELF_ENERGY_ATTACK") {
    const energy = (t.action || o.action).selections.energy[0];
    const attached = before.players[0].active.energyCards.map(card => card.id);
    assert(attached.includes(energy));
    assert.deepEqual(after.players[0].active.energyCards.map(card => card.id),
      attached.filter(id => id !== energy));
    assert(after.players[0].discard.some(card => card.id === energy));
    const invalid = port(before);
    const legal = t.action || o.action;
    for (const ids of [[], ["unattached-energy"], [energy, energy]]) {
      assert.equal(invalid.dispatch("you", {...legal,selections:{...legal.selections,energy:ids}}).ok,false);
      assert.equal(JSON.stringify(invalid.getSnapshot()),JSON.stringify(before));
    }
    verifyPrintedAttack(before, after, e, Number.parseInt(e.damage.normalize("NFKC"), 10) || 0);
  }
  if (e.plan.mechanic === "RETREAT_LOCK_ATTACK") {
    const opponent = after.players[1];
    assert.equal(opponent.active.id, before.players[1].active.id);
    assert.equal(opponent.active.referenceCannotRetreatTurn, before.turnNumber + 1);
    // Compare the legal actions for the same state with and without the lock.
    const unlocked = JSON.parse(JSON.stringify(after));
    delete unlocked.players[1].active.referenceCannotRetreatTurn;
    const candidates = E.getLegalActions(unlocked, "ai").actions.filter(a => a.type === "retreat");
    assert(candidates.length > 0, "OPPONENT_MUST_BE_ABLE_TO_RETREAT_WITHOUT_EFFECT");
    assert(E.getLegalActions(after, "ai").actions.every(a => a.type !== "retreat"));
    const expired = { ...after, turnNumber: after.turnNumber + 2 };
    assert(E.getLegalActions(expired, "ai").actions.some(a => a.type === "retreat"));
    for (const action of candidates) {
      assert.equal(p.dispatch("ai", action).ok, false);
      assert.equal(JSON.stringify(p.getSnapshot()), JSON.stringify(after));
    }
  }
  if(e.plan.mechanic==="ATTACK_BASIC_DAMAGE_PROTECTION"){
    const source=after.players[0].active,baseline=JSON.parse(JSON.stringify(after));
    assert.equal(source.referenceBasicDamageProtection.turn,before.turnNumber+1);
    delete baseline.players[0].active.referenceBasicDamageProtection;
    const print=E.getReferenceEffectRecord(baseline.players[1].active);
    if(!print.facts.basic||print.facts.types.includes(e.plan.exceptType))return {status:"BLOCKED",reason:"NO_QUALIFYING_BASIC_ATTACKER_FIXTURE"};
    const actions=E.getLegalActions(baseline,"ai").actions.filter(a=>a.type==="attack_turn"&&!["IGNORE_DEFENDER_EFFECTS","ATTACK_IGNORE_DAMAGE_RULES"].includes(print.attacks[a.attackIndex].plan.mechanic));
    const damage=(state,action)=>{const replay=port(state);if(!replay.dispatch("ai",action).ok)return undefined;return replay.getSnapshot().history.slice(state.history.length).find(ev=>ev.details?.command==="DAMAGE"&&ev.details.targetInstanceId===source.id)?.details.amount;};
    let tested=false;
    for(const action of actions){const normal=damage(baseline,action);if(!(normal>0))continue;assert.equal(damage(after,action),0);assert.equal(damage({...after,turnNumber:after.turnNumber+2},action),normal);tested=true;break;}
    if(!tested)return {status:"BLOCKED",reason:"NO_QUALIFYING_BASIC_DAMAGE_FIXTURE"};
  }
  if (e.plan.mechanic === "ATTACK_DAMAGE_REDUCTION") {
    const active = after.players[0].active;
    assert.equal(active.referenceDamageReduction.turn, after.turnNumber);
    assert.equal(active.referenceDamageReduction.amount, e.plan.amount);
    const baseline = JSON.parse(JSON.stringify(after));
    delete baseline.players[0].active.referenceDamageReduction;
    const incoming = E.getLegalActions(baseline, "ai").actions.filter(action =>
      action.type === "attack_turn" &&
      E.getReferenceEffectRecord(baseline.players[1].active).attacks[action.attackIndex].plan.mechanic !== "IGNORE_DEFENDER_EFFECTS");
    const damage = (state, action) => {
      const replay = port(state);
      if (!replay.dispatch("ai", action).ok) return undefined;
      return replay.getSnapshot().history.slice(state.history.length).find(event =>
        event.details?.command === "DAMAGE" && event.details.targetInstanceId === active.id)?.details.amount;
    };
    let tested = false;
    for (const action of incoming) {
      const normal = damage(baseline, action);
      if (!(normal > 0)) continue;
      assert.equal(damage(after, action), Math.max(0, normal - e.plan.amount));
      const expired = { ...after, turnNumber: after.turnNumber + 2 };
      assert.equal(damage(expired, action), normal);
      tested = true;
      break;
    }
    assert(tested, "NO_INCOMING_ATTACK_DAMAGE_FIXTURE");
  }
  assert.deepEqual(S.identities(before), S.identities(after));
  const saved = p.getResumeSnapshot(),
    expected = JSON.stringify(after);
  assert(p.restoreSession(saved).ok);
  assert.equal(JSON.stringify(p.getSnapshot()), expected);
  return {
    status: "SUCCEEDED",
    checks: [
      "LEGAL_ACTION_OR_PASSIVE_GUARD",
      "INVALID_ACTION_ROLLBACK",
      "AI_UI_LEGAL_PARITY",
      "PHYSICAL_CARD_CONSERVATION",
      "EXACT_SAVE_RESTORE",
    ],
  };
}
function verifyPrintedDamage(evidence) {
  const slot = B.slot(evidence);
  const r = records.get(evidence.officialCardId);
  const original = r?.attacks[evidence.effectIndex];
  if (evidence.effectKind !== "attack" || r?.category !== "pokemon" ||
      r.officialPageUrl !== evidence.officialPageUrl || !original ||
      original.name !== evidence.effectName || original.text.trim() ||
      original.plan?.mechanic !== "VANILLA_DAMAGE" ||
      !/^\d+$/.test(original.damage) || original.damage !== evidence.printedDamage)
    return { slot, status: "BLOCKED", reason: "OFFICIAL_PRINTED_DAMAGE_MISMATCH" };
  const effect = { ...original, effectIndex: evidence.effectIndex };
  try {
    return { slot, ...verifyCase(prepare(r, effect, "attack"), effect) };
  } catch (error) {
    return { slot, status: "FAILED", reason: error.message };
  }
}
module.exports = {
  firstReservable,
  evolutionLines,
  requiredCopies,
  tryReserveChain,
  prepare,
  effectOption,
  verifyCase,
  verifyPrintedDamage,
  version: "1",
  idempotent: true,
  contextFingerprint: B.hash(JSON.stringify(fileDigests)),
  async run(task, context) {
    B.validateTask(task);
    const cases = [];
    for (const evidence of task.evidence) {
      const r = records.get(evidence.officialCardId);
      if (!r) {
        cases.push({
          slot: B.slot(evidence),
          status: "BLOCKED",
          reason: "OFFICIAL_REFERENCE_NOT_REGISTERED",
        });
        continue;
      }
      const kind = evidence.effectKind,
        index = evidence.effectIndex ?? 0,
        original =
          kind === "attack"
            ? r.attacks[index]
            : kind === "ability"
              ? r.abilities[index]
              : { name: r.name, text: r.text, plan: r.mainPlan };
      if (
        r.category !== evidence.category ||
        !original?.plan ||
        original.name !== evidence.effectName ||
        B.hash(original.text.trim()) !== evidence.officialTextSha256
      ) {
        cases.push({
          slot: B.slot(evidence),
          status: "BLOCKED",
          reason: "OFFICIAL_REFERENCE_SLOT_MISMATCH",
        });
        continue;
      }
      const effect = { ...original, effectIndex: index };
      try {
        const identity = {
            slot: B.slot(evidence),
            textHash: evidence.officialTextSha256,
            sourceHash: r.source.sha256,
            executionFingerprint: context.executionFingerprint,
          },
          file = require("node:path").join(
            context.queueDirectory,
            "row-receipts",
            B.hash(JSON.stringify(identity)) + ".json",
          );
        let cached;
        if (fs.existsSync(file)) {
          const envelope = JSON.parse(fs.readFileSync(file)),
            { checksum, ...body } = envelope;
          if (
            checksum !== B.hash(JSON.stringify(body)) ||
            JSON.stringify(body.identity) !== JSON.stringify(identity) ||
            body.result.status !== "SUCCEEDED"
          )
            throw Error("INVALID_ROW_RECEIPT");
          cached = body.result;
        }
        if (cached) {
          cases.push({ ...cached, reused: true });
          continue;
        }
        const result = {
          slot: B.slot(evidence),
          mechanic: effect.plan.mechanic,
          commands: effect.plan.commands,
          ...verifyCase(prepare(r, effect, kind), effect),
        };
        if (result.status === "SUCCEEDED") {
          const body = { identity, result }; // This is a disposable cache; the parent fsyncs the authoritative task receipt.
          const dest = require("node:path");
          fs.mkdirSync(dest.dirname(file), { recursive: true });
          const temporary = file + ".tmp-" + process.pid;
          fs.writeFileSync(
            temporary,
            JSON.stringify({ ...body, checksum: B.hash(JSON.stringify(body)) }),
          );
          fs.renameSync(temporary, file);
        }
        cases.push(result);
      } catch (e) {
        cases.push({
          slot: B.slot(evidence),
          status: "FAILED",
          reason: e.message,
          details: {mechanic:effect.plan.mechanic,stack:String(e.stack||'').slice(0,1800)},
        });
      }
    }
    return {
      status: cases.some((c) => c.status === "FAILED")
        ? "FAILED"
        : cases.some((c) => c.status === "BLOCKED")
          ? "BLOCKED"
          : "SUCCEEDED",
      stage: "REGISTERED_ENGINE_INTEGRATION_CHECK_NOT_NEW_SEMANTIC_APPROVAL",
      reason: cases.some((c) => c.status !== "SUCCEEDED")
        ? "REVIEW_CASE_RESULTS"
        : undefined,
      cases,
    };
  },
};
