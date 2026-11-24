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
 if(plan.mechanic==='SEARCH_BASIC_TO_BENCH_ATTACK')return pokemon&&r?.facts.basic&&(!plan.type||typed);
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
 if(plan.category==='basicEnergy')return c.kind==='energy'&&!c.isSpecial&&(!plan.type||c.energyType===plan.type);
 if(plan.category==='trainer')return ['item','supporter','tool','stadium'].includes(r?.category);
 if(r?.category!==plan.category)return false;
 if(plan.type&&!r.facts.types?.includes(plan.type))return false;
 if(plan.stage==='evolved'&&!(r.facts.stage>0))return false;
 if(Number.isInteger(plan.stage)&&r.facts.stage!==plan.stage)return false;
 if(plan.team&&!r.name.startsWith(plan.team+'の'))return false;
 return true;
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
  const index=side===0?deckIndex:1-deckIndex,record=pick(predicate,index);
  if(!ensure(index,record))return null;
  requirements.push({side,zone,printId:record.officialCardId});return record;
 }
 const mon=(r,type,stage)=>r.category==='pokemon'&&(!type||r.facts.types.includes(type))&&(stage===null||stage===undefined||stage==='evolved'&&r.facts.stage>0||r.facts.stage===stage);
 const isBasicEnergy=r=>r.category==='energy'&&r.mainPlan?.mechanic==='BASIC_ENERGY';
 const vanilla=r=>r.category==='pokemon'&&r.facts.basic&&r.attacks.find(a=>a.plan?.mechanic==='VANILLA_DAMAGE'&&Number(a.damage)>0);
 const reserveEnergy=(type,count,index=deckIndex)=>ensure(index,pick(r=>isBasicEnergy(r)&&(!type||typeOf(r)===type),index),count);
 const ensureAttackCost=(record,index)=>{
  const attack=vanilla(record);if(!attack)return false;
  const needed=new Map();for(const type of attack.cost)needed.set(type==='無色'?(record.facts.types.find(t=>['草','炎','水','雷','超','闘','悪','鋼'].includes(t))||'超'):type,(needed.get(type==='無色'?(record.facts.types.find(t=>['草','炎','水','雷','超','闘','悪','鋼'].includes(t))||'超'):type)||0)+1);
  return [...needed].every(([t,n])=>reserveEnergy(t,n,index));
 };
 if(m==='MASS_ZONE_TRANSFER'){
  const filter=r=>{
   if(plan.category==='basicEnergy')return isBasicEnergy(r)&&(!plan.type||typeOf(r)===plan.type);
   if(plan.category==='trainer')return ['item','supporter','tool','stadium'].includes(r.category);
   return r.category===plan.category&&(!plan.type||r.category==='energy'&&typeOf(r)===plan.type||r.facts.types?.includes(plan.type))&&
    (plan.stage===null||plan.stage==='evolved'&&r.facts.stage>0||r.facts.stage===plan.stage)&&(!plan.team||r.name.startsWith(plan.team+'の'));
  };
  const target=reserve(filter,plan.zone);
  if(target?.category==='energy'&&kindAttackCost(e,typeOf(target))>0)reserveEnergy(typeOf(target),kindAttackCost(e,typeOf(target))+1);
 }
 if(e.plan.batchSearch){
  const filter=r=>m==='SEARCH_BASIC_TO_BENCH_ATTACK'?mon(r,plan.type,0):
   plan.filter==='any'?r.category==='item':
   plan.filter==='basicEnergy'?isBasicEnergy(r):
   plan.filter==='typedBasicEnergy'?isBasicEnergy(r)&&typeOf(r)===plan.type:
   plan.filter==='typedPokemon'?mon(r,plan.type):
   plan.filter==='typedPokemonOrBasicEnergy'?mon(r,plan.type):
   plan.filter==='typedPokemonOrStadium'?mon(r,plan.type):r.category===plan.filter;
  const target=reserve(filter,'deck');
  if(target?.category==='energy'&&kindAttackCost(e,typeOf(target))>0)reserveEnergy(typeOf(target),kindAttackCost(e,typeOf(target))+1);
 }
 if(m==='MASS_ENERGY_ROUTE'&&plan.target!=='self'&&(plan.holderType||plan.team))
  reserve(r=>mon(r,plan.holderType,0)&&(!plan.team||r.name.startsWith(plan.team+'の')),'bench');
 if(m==='MASS_HEAL_OWN'&&plan.type)
  reserve(r=>mon(r,plan.type,0),plan.target==='active'&&source.category!=='pokemon'?'active':'bench');
 if(m==='MASS_CONTEXT_BONUS'&&plan.predicate==='ownTypedBench')reserve(r=>mon(r,plan.type,plan.stage),'bench');
 if(m==='ABILITY_SEARCH_TYPED_EVOLUTION')reserve(r=>mon(r,plan.type,'evolved'),'deck');
 if(m==='TRAINER_SEARCH_TERA')reserve(r=>r.category==='pokemon'&&r.facts.teraBenchProtection,'deck');
 if(m==='TRAINER_TYPED_DAMAGE_BOOST'){
  const target=reserve(r=>vanilla(r)&&r.facts.types.includes(plan.type),'active');
  if(target)ensureAttackCost(target,deckIndex);
 }
 if(m==='ATTACK_DISCARD_TOOL_BEFORE_DAMAGE')reserve(r=>r.category==='tool'&&r.mainPlan?.mechanic==='CIRCULATOR','deck',1);
 if(m==='ATTACK_BASIC_DAMAGE_PROTECTION'){
  const target=reserve(r=>vanilla(r)&&!r.facts.types.includes(plan.exceptType)&&r.facts.hp>Number(e.damage||0)&&!r.facts.weakness?.types.some(t=>source.facts.types.includes(t)),'active',1);
  if(target)ensureAttackCost(target,1-deckIndex);
 }
 return requirements;
}
function kindAttackCost(e,type){return (e.cost||[]).filter(t=>t===type||t==='無色').length;}
function prepare(r, e, kind) {
  const idx = e.effectIndex ?? 0,
    m = e.plan.mechanic;
  if (m === "PASSIVE_ROCKET_TEAM_ATTACK_GATE") {
    const attackIndex = r.attacks.findIndex(attack => attack.plan);
    if (attackIndex < 0) return { blocked: "NO_PASSIVE_TRIGGER_ATTACK" };
    const trigger = { ...r.attacks[attackIndex], effectIndex: attackIndex };
    return { ...prepare(r, trigger, "attack"), trigger };
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
  if (F10.records.some((x) => x.officialCardId === r.officialCardId)) {
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
  if (F9.records.some((x) => x.officialCardId === r.officialCardId)) {
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
  if(m==='MASS_EFFECT_SEQUENCE'&&e.plan.origin==='evolve'){
    const deck=manifest.decks[locations[0].deck];
    const parent=[...records.values()].find(x=>x.name===r.facts.evolvesFrom&&x.facts.stage===r.facts.stage-1&&x.attacks.every(a=>a.plan)&&x.abilities.every(a=>a.plan));
    if(!parent)return {blocked:'NO_EXACT_EVOLUTION_PARENT_FIXTURE'};
    if(!deck.cards.some(c=>c.name===parent.deckName)){
      const donor=deck.cards.find(c=>c.category==='pokemon'&&c.name!==r.deckName&&c.count>1);
      if(!donor)return {blocked:'NO_EVOLUTION_PARENT_DECK_SLOT'};
      donor.count--;deck.cards.push({name:parent.deckName,category:'pokemon',count:1,referenceOfficialCardId:parent.officialCardId});
    }
  }
  const fixtureRequirements=fixtureResources(manifest,locations[0].deck,r,e);
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
  if(m==='MASS_ENERGY_ROUTE'){
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
    if(plan.heal)for(const target of targets)target.damage=Math.min(target.hp-10,40);
  }
  if(m==='MASS_ZONE_TRANSFER'){
    const own=frame.game.players[0],plan=e.plan,eligible=c=>massTransferCandidate(c,plan);
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
  if(m==='MASS_HEAL_OWN'){
    const own=frame.game.players[0],targets=(e.plan.target==='active'?[own.active]:[own.active,...own.bench]).filter(c=>!e.plan.type||E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type));
    if(!targets.length)return {blocked:'NO_MASS_HEAL_FIXTURE'};
    for(const mon of targets)mon.damage=Math.min(mon.hp-10,Math.max(10,e.plan.amount+10));
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
  if(m==='ABILITY_DISCARD_DRAW'){
    const own=frame.game.players[0];
    while(own.hand.length<e.plan.cost&&own.deck.length>e.plan.amount)own.hand.push(own.deck.shift());
    if(own.hand.length<e.plan.cost||!own.deck.length)return {blocked:'NO_ABILITY_COST_FIXTURE'};
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
  if (["RECOIL_DAMAGE", "HEAL_SELF_ATTACK", "COIN_UNTIL_TAILS_DAMAGE", "FIXED_COIN_HITS", "VANILLA_DAMAGE", "ATTACK_UNDAMAGED_BONUS", "ATTACK_ATTACHED_TOOL_COUNT", "BENCH_COUNT_DAMAGE", "FULL_BENCH_REQUIRED_DAMAGE", "SELF_COUNTER_DAMAGE", "COIN_BONUS_DAMAGE", "DISCARD_ONE_SELF_ENERGY_ATTACK", "ATTACK_SPLASH_DAMAGE", "ATTACK_DISCARD_OPPONENT_DECK_TOP", "ATTACK_DISCARD_HAND_DRAW", "ATTACK_IGNORE_DAMAGE_RULES", "ANY_DAMAGE"].includes(m)) {
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
  if (m === "ATTACK_SPREAD_DAMAGE" && e.plan.ignoreDefense)
    frame.game.players[1].active.referenceProtection={opponentTurn:frame.game.turnNumber};
  if (m === "SCALED_ATTACK_DAMAGE") {
    const [own, opponent] = frame.game.players;
    if(e.plan.metric==="ownTeamEnergy"&&own.bench.length){
      const index=own.active.energyCards.findIndex(energy=>!energy.isSpecial&&[e.plan.type,e.plan.secondType].includes(energy.energyType)
        &&own.active.energyCards.filter(card=>!card.isSpecial&&card.energyType===energy.energyType).length>e.cost.filter(type=>type===energy.energyType).length);
      if(index>=0&&own.active.energyCards.filter(card=>!card.isSpecial).length>e.cost.length)
        own.bench[0].energyCards.push(own.active.energyCards.splice(index,1)[0]);
    }
    if (e.plan.metric === "opponentCounters") opponent.active.damage = 20;
    if (e.plan.metric === "ownCounters") own.active.damage = 20;
    if (e.plan.metric === "opponentTeamCounters") for (const mon of [opponent.active,...opponent.bench]) mon.damage=10;
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
      if (!energy.isSpecial) continue;
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
      ownDiscardTypedPokemon:c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c)?.facts.types.includes(e.plan.type),
      ownDiscardNamedAttack:c=>c.kind==='pokemon'&&E.getReferenceEffectRecord(c)?.attacks.some(a=>a.name===e.plan.name)
    };
    const filter=discardFilters[e.plan.metric];
    if(filter){
      const side=e.plan.metric.startsWith('opponent')?opponent:own;
      for(const zone of [side.deck,side.hand]){
        const index=zone.findIndex(filter);
        if(index>=0){side.discard.push(zone.splice(index,1)[0]);break;}
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
      const eligible = card => card.kind === "energy" && !!card.isSpecial === e.plan.specialOnly;
      const zone = [other.deck, other.hand, other.prizeCards].find(cards => cards.some(eligible));
      if (!zone) return {blocked:"NO_DEFENDER_ENERGY_FIXTURE_RESOURCE"};
      other.active.energyCards.push(zone.splice(zone.findIndex(eligible), 1)[0]);
      if (zone === other.prizeCards && other.deck.length) other.prizeCards.push(other.deck.shift());
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
  if(e.plan.batchSearch){
    const own=frame.game.players[0];
    if(m==='SEARCH_BASIC_TO_BENCH_ATTACK'&&own.bench.length>=5)return {blocked:"NO_BENCH_SEARCH_SPACE"};
    if(!own.deck.some(c=>batchSearchCandidate(c,e.plan)))return {blocked:"NO_EXACT_SEARCH_FIXTURE_RESOURCE"};
  }
  if(m==='MASS_EFFECT_SEQUENCE'){
    const own=frame.game.players[0];
    if(e.plan.steps.some(s=>['healSelf','drain'].includes(s.op))){
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
      const pp=port(frame.game),action={type:'evolve',cardId:child.id,targetInstanceId:parent.id};
      if(!pp.dispatch('you',action).ok)return {blocked:'EVOLUTION_FIXTURE_ACTION_REJECTED'};
      const now=pp.getSnapshot().players[0].active;
      if(E.getReferenceEffectRecord(now).officialCardId!==r.officialCardId)return {blocked:'EVOLUTION_FIXTURE_PRINT_MISMATCH'};
      return {port:pp,sourceId:now.id,kind};
    }
  }
  const p = port(frame.game);
  if(m==='MASS_EFFECT_SEQUENCE'&&e.plan.origin==='bench'){
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
  return { port: p, sourceId: frame.sourceId, kind };
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
  if(e.plan.mechanic==='MASS_EFFECT_SEQUENCE'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],other=before.players[1],resolved=after.players[0];
    const source=[own.active,...own.bench].find(c=>c.id===t.sourceId),next=[resolved.active,...resolved.bench].find(c=>c?.id===t.sourceId);
    if(action.type==='attack_turn'&&Number(e.damage)>0)verifyPrintedAttack(before,after,e,Number(e.damage));
    for(const step of plan.steps){
      const target=step.side==='opponent'?after.players[1].active:next;
      if(step.op==='draw')assert(own.deck.slice(0,step.amount).every(c=>resolved.hand.some(x=>x.id===c.id)));
      if(step.op==='mill'){
        const side=step.side==='opponent'?other:own,result=after.players[step.side==='opponent'?1:0];
        assert(side.deck.slice(0,step.amount).every(c=>result.discard.some(x=>x.id===c.id)));
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
    if(['bench','evolve'].includes(plan.origin)){
      const closed=JSON.parse(JSON.stringify(before));closed.referenceActionSequence++;
      const replay=port(closed);assert.equal(replay.dispatch('you',action).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(closed));
    }
  }
  if(e.plan.mechanic==='MASS_ENERGY_ROUTE'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],resolved=after.players[0],energy=action.selections.energy;
    assert(energy.length>0&&energy.length<=plan.limit);
    for(const [i,id] of energy.entries()){
      const source=own[plan.zone].find(c=>c.id===id);
      assert(source?.kind==='energy'&&!source.isSpecial&&(!plan.type||source.energyType===plan.type));
      const targetId=plan.target==='self'?own.active.id:action.selections['attachTo'+(plan.multi?i:0)][0];
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
  if(e.plan.mechanic==='MASS_ZONE_TRANSFER'){
    const plan=e.plan,action=t.action||o.action,ids=action.selections.cards,own=before.players[0],resolved=after.players[0];
    assert(ids.length>0&&ids.length<=plan.limit);
    assert(ids.every(id=>own[plan.zone].some(c=>c.id===id&&massTransferCandidate(c,plan))));
    assert(ids.every(id=>resolved[plan.destination].some(c=>c.id===id)&&!resolved[plan.zone].some(c=>c.id===id)));
    assert(effectEvents.some(ev=>ev?.command==='REVEAL'&&ids.every(id=>ev.cardIds?.includes(id))));
    const invalid=own[plan.zone].find(c=>!massTransferCandidate(c,plan));
    if(invalid){const replay=port(before);assert.equal(replay.dispatch("you",{...action,selections:{cards:[invalid.id]}}).ok,false);assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));}
  }
  if(e.plan.mechanic==='MASS_HEAL_OWN'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],resolved=after.players[0];
    const targets=(plan.target==='active'?[own.active]:[own.active,...own.bench]).filter(c=>(!plan.type||E.getReferenceEffectRecord(c).facts.types.includes(plan.type))&&(plan.target!=='choice'||action.selections.cards.includes(c.id))&&c.damage>0);
    assert(targets.length>0);
    for(const mon of targets){const next=[resolved.active,...resolved.bench].find(c=>c.id===mon.id);assert(next);assert.equal(next.damage,Math.max(0,mon.damage-plan.amount));}
  }
  if(e.plan.mechanic==='MASS_PRIZE_DRAW'){
    const plan=e.plan,action=t.action||o.action,own=before.players[0],resolved=after.players[0];
    const n=Math.min(own.deck.length,plan.amount+(before.players[1].prizes<=plan.threshold?plan.extra:0));
    assert(own.deck.slice(0,n).every(c=>resolved.hand.some(x=>x.id===c.id)));
    assert.equal(resolved.hand.length,own.hand.length+n-(action.type==='play_item'||action.type==='play_supporter'?1:0));
  }
  if(e.plan.mechanic==='MASS_PLACE_COUNTERS'){
    const plan=e.plan,action=t.action||o.action,other=before.players[1];
    const ids=plan.target==='all'?[other.active,...other.bench].map(c=>c.id):action.selections.target;
    assert(ids.length>0);
    assert(ids.every(id=>effectEvents.some(ev=>ev?.command==='PLACE_DAMAGE_COUNTERS'&&ev.targetInstanceId===id&&ev.counterCount===plan.amount)));
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
  if(e.plan.mechanic==="ABILITY_SWITCH_OWN"){
    const action=t.action||o.action,own=before.players[0],resolved=after.players[0];
    assert.equal(resolved.active.id,action.selections.ownBench[0]);
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
    const targets=e.plan.mechanic==="ATTACK_SPLASH_OWN_BENCH"||e.plan.scope==="ownBench" ? attackingSide.bench :
      e.plan.scope==="opponentBench" ? defendingSide.bench : [defendingSide.active,...defendingSide.bench];
    const chosen=e.plan.count==null?targets.map(card=>card.id):o.action.targetIds;
    assert(chosen.length>0);
    assert(chosen.every(id=>effectEvents.some(step=>step?.command==="DAMAGE"&&step.targetInstanceId===id
      &&(!e.plan.ignoreDefense||step.amount===e.plan.amount))));
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
  if (e.plan.mechanic === "SCALED_ATTACK_DAMAGE") {
    const count = cards => cards.flatMap(card => card.energyCards).filter(energy =>
      !e.plan.type || [e.plan.type,e.plan.secondType].includes(energy.energyType)).length;
    const metrics = {
      opponentCounters: defendingSide.active.damage / 10,
      ownCounters: attackingSide.active.damage / 10,
      ownHand: attackingSide.hand.length,
      opponentHand: defendingSide.hand.length,
      ownPrizesTaken: 6-attackingSide.prizes,
      ownBasicCount: [attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.basic).length,
      opponentBasicCount: [defendingSide.active,...defendingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.basic).length,
      ownStageOneCount: [attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.stage===1).length,
      ownEvolvedCount: [attackingSide.active,...attackingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.stage>0).length,
      opponentEvolvedCount: [defendingSide.active,...defendingSide.bench].filter(c=>E.getReferenceEffectRecord(c).facts.stage>0).length,
      ownBenchStageTwoCount: attackingSide.bench.filter(c=>E.getReferenceEffectRecord(c).facts.stage===2).length,
      ownDamagedBenchCount: attackingSide.bench.filter(c=>c.damage>0).length,
      opponentTeamCounters: [defendingSide.active,...defendingSide.bench].reduce((n,c)=>n+c.damage/10,0),
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
    if (e.plan.metric === "ownTeamEnergy") assert(metrics.ownTeamEnergy>0);
    if(['opponentDiscardBasic','opponentDiscardItem','opponentExVCount','ownDamagedCount','opponentAbilityCount','ownNamedAttackCount','ownTeamNameCount','ownDiscardTypedPokemon','ownDiscardNamedAttack'].includes(e.plan.metric)&&metrics[e.plan.metric]===0)
      return {status:'BLOCKED',reason:'NO_POSITIVE_PUBLIC_COUNT_FIXTURE'};
    assert(Number.isFinite(metrics[e.plan.metric]),"MISSING_BOARD_COUNT_METRIC");
    verifyPrintedAttack(before, after, e, Math.max(0,e.plan.base+(e.plan.subtract?-1:1)*e.plan.unit*metrics[e.plan.metric]));
    if (e.plan.subtract) {
      assert(p.restoreSession(p.getResumeSnapshot()).ok);
      assert.deepEqual(p.getSnapshot(),after);
    }
  }
  if (e.plan.mechanic === "ATTACK_RESET_HAND") {
    assert.equal(after.players[0].hand.length, Math.min(e.plan.amount, attackingSide.hand.length + attackingSide.deck.length));
    assert(effectEvents.some(event => event?.command === "SHUFFLE_DECK"));
    assert(effectEvents.some(event => event?.command === "RETURN_TO_DECK" &&
      JSON.stringify(event.cardIds) === JSON.stringify(attackingSide.hand.map(card => card.id))));
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
  if (e.plan.mechanic === "PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION") {
    const defender = E.getReferenceEffectRecord(before.players[1].active);
    assert(defender.abilities.some(ability => ability.effectId === e.effectId));
    verifyPrintedAttack(before, after, t.trigger, Number(t.trigger.damage), e.plan.amount);
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
  if (e.plan.mechanic === "VANILLA_DAMAGE")
    verifyPrintedAttack(before, after, e, Number(e.damage));
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
    assert.equal(replay.dispatch("you", {...action, selections:{cards:[selected[0], selected[0]]}}).ok, false);
    assert.deepEqual(replay.getSnapshot(), before);
    const wrong=before.players[0].deck.find(c=>!batchSearchCandidate(c,e.plan));
    if(wrong){
      assert.equal(replay.dispatch("you",{...action,selections:{cards:[wrong.id]}}).ok,false);
      assert.equal(JSON.stringify(replay.getSnapshot()),JSON.stringify(before));
    }
    assert(replay.dispatch("you", {...action, selections:{cards:[]}}).ok);
  }
  if(e.plan.mechanic==="ATTACK_DISCARD_MULTIPLE_SELF_ENERGY"){
    const source=before.players[0].active,chosen=(t.action||o.action).selections.energy||[];
    const attached=source.energyCards||[];
    assert(chosen.length>0&&chosen.every(id=>attached.some(c=>c.id===id)),"MISSING_SELF_ENERGY_DISCARD_FIXTURE");
    assert(chosen.every(id=>after.players[0].discard.some(c=>c.id===id)),"SELF_ENERGY_NOT_DISCARDED");
    const replay=port(before);
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
