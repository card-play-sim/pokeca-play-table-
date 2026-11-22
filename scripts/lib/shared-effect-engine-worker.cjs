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
  if (kind === "attack") {
    const cards = manifest.decks[locations[0].deck].cards;
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
    locations,
  };
  const frame = S.create(E, manifest, row);
  if (frame.blocked) return { blocked: frame.blocked };
  if (["RECOIL_DAMAGE", "HEAL_SELF_ATTACK", "COIN_UNTIL_TAILS_DAMAGE", "FIXED_COIN_HITS", "VANILLA_DAMAGE", "BENCH_COUNT_DAMAGE", "FULL_BENCH_REQUIRED_DAMAGE", "SELF_COUNTER_DAMAGE", "COIN_BONUS_DAMAGE", "DISCARD_ONE_SELF_ENERGY_ATTACK"].includes(m)) {
    const p = frame.game.players[0];
    for (const energy of [...p.active.energyCards])
      if (energy.isSpecial) {
        p.active.energyCards.splice(p.active.energyCards.indexOf(energy), 1);
        p.deck.push(energy);
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
function verifyPrintedAttack(before, after, effect, amount) {
  const [own, opponent] = before.players;
  const attacker = E.getReferenceEffectRecord(own.active);
  const defender = E.getReferenceEffectRecord(opponent.active);
  const hasType = rule => rule?.types.some(type => attacker.facts.types.includes(type));
  if (hasType(defender.facts.weakness)) amount *= 2;
  if (hasType(defender.facts.resistance))
    amount = Math.max(0, amount + Number(defender.facts.resistance.value.replace("－", "-")));
  const changes = after.history.slice(before.history.length);
  assert(changes.some(event => event.type === "attack" &&
    event.details.effectId === effect.effectId &&
    event.details.referenceOfficialCardId === attacker.officialCardId));
  assert(changes.some(event => event.details?.command === "DAMAGE" &&
    event.details.targetInstanceId === opponent.active.id && event.details.amount === amount));
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
    if (!o && !t.action)
      o = ["attack", "ability"].includes(t.kind)
        ? p
            .getPokemonActions("you", t.sourceId)
            .find(
              (o) =>
                o.kind === t.kind &&
                (t.kind !== "attack" ||
                  o.action.attackIndex === e.effectIndex) &&
                (t.kind !== "ability" || o.action.abilityId === e.effectId),
            )
        : p.getHandOptions("you", t.sourceId).find((o) => o.ok);
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
  if (e.plan.mechanic === "VANILLA_DAMAGE")
    verifyPrintedAttack(before, after, e, Number(e.damage));
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
