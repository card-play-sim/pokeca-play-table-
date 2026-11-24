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
  if (kind === "attack") {
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
      const donor = cards.find(card => card.category === "energy" && card.count >= count - available
        && !needed.has(entryType(card)));
      if (!reference || !donor) continue;
      donor.count -= count - available;
      cards.push({name:reference.name, category:"energy", count:count - available,
        referenceOfficialCardId:reference.officialCardId});
    }
    manifest.decks[locations[0].deck].cards = cards.filter(card => card.count);
  }
  const row = {
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
  if(m==='SUPPORTER_DISCARD_ONE_DRAW_TO_SIX'){
    const player=frame.game.players[0];
    if(!player.hand.some(card=>card.id!==frame.sourceId)){
      const donor=player.deck.shift();
      if(!donor)return {blocked:'NO_HAND_DISCARD_FIXTURE_RESOURCE'};
      player.hand.push(donor);
    }
  }
  if (m === "ATTACK_DISCARD_STADIUM") {
    const owner = frame.game.players[1];
    const zone = [owner.deck, owner.hand, owner.prizeCards]
      .find(cards => cards.some(card => card.kind === "stadium"));
    if (!zone) return {blocked:"NO_STADIUM_FIXTURE_RESOURCE"};
    const [stadium] = zone.splice(zone.findIndex(card => card.kind === "stadium"), 1);
    frame.game.stadium = stadium;
    frame.game.stadiumOwner = owner.id;
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
  if (m === "RECOVER_TYPED_DISCARD") {
    const p = frame.game.players[0],
      eligible = (c) =>
        c.kind === "pokemon"
          ? E.getReferenceEffectRecord(c).facts.types.includes(e.plan.type)
          : c.kind === "energy" && !c.isSpecial && c.energyType === e.plan.type;
    for (const c of [...p.deck].filter(eligible).slice(0, e.plan.amount))
      p.discard.push(p.deck.splice(p.deck.indexOf(c), 1)[0]);
  }
  if (m === "RETREAT_LOCK_ATTACK") {
    const opponent = frame.game.players[1];
    const cost = opponent.active.retreatCost;
    const payment = opponent.deck.filter(card => card.kind === "energy" && !card.isSpecial).slice(0, cost);
    if (payment.length !== cost) return { blocked: "NO_RETREAT_PAYMENT_FIXTURE" };
    for (const card of payment)
      opponent.active.energyCards.push(opponent.deck.splice(opponent.deck.indexOf(card), 1)[0]);
  }
  if (m === "ATTACK_DAMAGE_REDUCTION") {
    const opponent = frame.game.players[1];
    for (const card of opponent.deck.filter(card => card.kind === "energy" && !card.isSpecial))
      opponent.active.energyCards.push(opponent.deck.splice(opponent.deck.indexOf(card), 1)[0]);
  }
  // The official active-only healing supporter needs a damaged Active fixture.
  if (m === "HEAL_ACTIVE_DAMAGE") frame.game.players[0].active.damage = 40;
  if (m === "FULL_BENCH_REQUIRED_DAMAGE") {
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
  if (m === "SCALED_ATTACK_DAMAGE") {
    const [own, opponent] = frame.game.players;
    if (e.plan.metric === "opponentCounters") opponent.active.damage = 20;
    if (["opponentEnergy", "opponentTeamEnergy"].includes(e.plan.metric)) {
      const targets = e.plan.metric === "opponentEnergy" ? [opponent.active] : [opponent.active, ...opponent.bench];
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
  }
  const p = port(frame.game);
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
      !e.plan.type || energy.energyType === e.plan.type).length;
    const metrics = {
      opponentCounters: defendingSide.active.damage / 10,
      ownPokemon: 1 + attackingSide.bench.length,
      ownEnergy: count([attackingSide.active]),
      opponentEnergy: count([defendingSide.active]),
      opponentTeamEnergy: count([defendingSide.active, ...defendingSide.bench]),
    };
    verifyPrintedAttack(before, after, e, e.plan.base + e.plan.unit * metrics[e.plan.metric]);
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
    assert.deepEqual(replay.getSnapshot(),before);
    const swapped=JSON.parse(JSON.stringify(before));
    const player=swapped.players[0];
    [player.active,player.bench[0]]=[player.bench[0],player.active];
    assert.equal(port(swapped).dispatch("you",action).ok,false);
    assert.equal(p.dispatch("you",action).ok,false);
  }
  if (e.plan.mechanic === "FULL_BENCH_REQUIRED_DAMAGE") {
    verifyPrintedAttack(before, after, e, Number(e.damage));
    const start = JSON.parse(JSON.stringify(before));
    const player = start.players[0];
    player.deck.push(player.bench.pop());
    const replay = port(start);
    assert(replay.dispatch("you", (t.action || o.action)).ok);
    const end = replay.getSnapshot();
    assert.equal(end.players[1].active.damage, start.players[1].active.damage);
    assert.notEqual(end.turnPlayer, start.turnPlayer);
    assert.deepEqual(S.identities(start), S.identities(end));
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
  if (e.plan.mechanic === "SEARCH_BASIC_TO_BENCH_ATTACK") {
    const action = t.action || o.action;
    const chosen = action.selections.cards;
    const own = before.players[0];
    assert(chosen.length > 0 && chosen.length <= Math.min(e.plan.limit, 5 - own.bench.length));
    for (const id of chosen) {
      const card = own.deck.find(card => card.id === id);
      assert(card && E.getReferenceEffectRecord(card).facts.basic);
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
      if (e.plan.filter === "basicEnergy") assert(card.kind === "energy" && !card.isSpecial);
      else assert.equal(E.getReferenceEffectRecord(card).category, e.plan.filter);
      assert(after.players[0].hand.some(card => card.id === id));
      assert(!after.players[0].deck.some(card => card.id === id));
    }
    const steps = after.history.slice(before.history.length).map(event => event.details);
    assert(steps.some(step => step?.command === "REVEAL" && JSON.stringify(step.cardIds) === JSON.stringify(selected)));
    assert(steps.some(step => step?.command === "SHUFFLE_DECK"));
    const replay = port(before);
    assert.equal(replay.dispatch("you", {...action, selections:{cards:[selected[0], selected[0]]}}).ok, false);
    assert.deepEqual(replay.getSnapshot(), before);
    assert(replay.dispatch("you", {...action, selections:{cards:[]}}).ok);
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
      assert.deepEqual(invalid.getSnapshot(),before);
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
