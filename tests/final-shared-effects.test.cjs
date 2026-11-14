"use strict";
const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert/strict"),
  B = require("../scripts/lib/shared-effect-batch.cjs");
const c = { window: {}, console, performance, Math, setTimeout };
vm.runInNewContext(fs.readFileSync("ui/engine.bundle.js", "utf8"), c);
const E = c.window.Pokeca,
  W = require("../scripts/lib/shared-effect-engine-worker.cjs"),
  S = vm.runInNewContext(
    fs.readFileSync("tests/fixtures/control-005-scenarios.js", "utf8"),
    { console },
  ),
  records = E.getReferenceEffectCatalog({ includeExtensions: true }).records;
// Reparse original official HTML; basic energy rules stay text-free and unknown
// pre-section rules cannot be silently adopted as attack-only records.
const parser = require("../scripts/parse-official-pokemon-energy.cjs");
for (const r of records.filter(
  (r) => r.mainPlan?.mechanic === "BASIC_ENERGY" && r.facts.basicEnergyType,
)) {
  const proof = JSON.parse(fs.readFileSync(r.source.path));
  const parsed = parser.parse(proof.html);
  assert.equal(parsed.text, "");
  assert.equal(parsed.facts.basicEnergyType, r.facts.basicEnergyType);
}
const tera = records.find((r) => r.facts?.teraBenchProtection);
assert(tera);
const teraHTML = JSON.parse(fs.readFileSync(tera.source.path)).html;
assert(parser.parse(teraHTML).facts.teraBenchProtection);
assert.throws(() =>
  parser.parse(
    teraHTML.replace(
      "このポケモンは、ベンチにいるかぎり、ワザのダメージを受けない。",
      "未確認の追加ルール。",
    ),
  ),
);
const wanted = new Set([
    "COIN_BONUS_DAMAGE",
    "DAMAGE_BY_OWN_COUNTERS",
    "DAMAGE_BY_ACTIVE_ENERGY",
    "ATTACK_DISCARD_DECK_TOP",
    "ATTACK_BENCH_BASICS",
    "ABILITY_ATTACH_SELF_DRAW",
    "CONDITIONAL_EVOLVED_ENERGY",
  ]),
  results = [],
  blocked = [];
const restore = (p) => {
  const before = JSON.stringify(p.getSnapshot());
  assert(p.restoreSession(p.getResumeSnapshot()).ok);
  assert.equal(JSON.stringify(p.getSnapshot()), before);
};
const ids = (cs) => cs.map((c) => c.id),
  key = (x) => JSON.stringify(B.canonical(x));
for (const r of records) {
  const effects =
    r.category === "pokemon"
      ? [
          ...r.attacks.map((e, i) => ({
            e: { ...e, effectIndex: i },
            kind: "attack",
          })),
          ...r.abilities.map((e, i) => ({
            e: { ...e, effectIndex: i },
            kind: "ability",
          })),
        ]
      : [
          {
            e: { name: r.name, text: r.text, plan: r.mainPlan },
            kind: r.category,
          },
        ];
  for (const { e, kind } of effects) {
    if (
      !wanted.has(e.plan?.mechanic) &&
      !(e.plan?.mechanic === "BASIC_ENERGY" && r.facts.basicEnergyType)
    )
      continue;
    let t;
    try {
      t = W.prepare(r, e, kind);
    } catch (error) {
      throw Error(r.officialCardId + ":" + error.stack);
    }
    if (t.blocked) {
      blocked.push({ id: r.officialCardId, reason: t.blocked });
      continue;
    }
    const p = t.port;
    let option =
      kind === "energy"
        ? p.getHandOptions("you", t.sourceId).find((o) => o.ok)
        : p
            .getPokemonActions("you", t.sourceId)
            .find(
              (o) =>
                o.kind === kind &&
                (kind !== "attack" || o.action.attackIndex === e.effectIndex),
            );
    if (!(option && (option.ok ?? option.enabled))) {
      blocked.push({ id: r.officialCardId, reason: "NO_LEGAL_FIXTURE" });
      continue;
    }
    const before = p.getSnapshot(),
      encoded = JSON.stringify(before),
      ai = E.getLegalActions(before, "you").actions;
    assert(
      ai.some((a) => key(a) === key(option.action)),
      r.officialCardId + " AI/UI parity",
    );
    assert(ai.every((a) => p.canDispatch("you", a)));
    const forged =
      kind === "attack"
        ? { ...option.action, attackIndex: 999 }
        : kind === "ability"
          ? { ...option.action, selections: { energy: ["not-in-hand"] } }
          : { ...option.action, target: "invalid-target" };
    assert.equal(p.dispatch("you", forged).ok, false);
    assert.equal(JSON.stringify(p.getSnapshot()), encoded);
    assert.equal(p.dispatch("ai", option.action).ok, false);
    assert.equal(JSON.stringify(p.getSnapshot()), encoded);
    let action = JSON.parse(JSON.stringify(option.action));
    if (e.plan.mechanic === "ATTACK_BENCH_BASICS") {
      const request = option.requests.find((r) => r.key === "cards");
      action.selections = {
        cards: request.candidates
          .slice(0, Math.min(e.plan.amount, 5 - before.players[0].bench.length))
          .map((c) => c.id),
      };
      assert(p.canDispatch("you", action));
    }
    assert(p.dispatch("you", action).ok, r.officialCardId);
    const after = p.getSnapshot(),
      own = after.players[0],
      other = after.players[1],
      m = e.plan.mechanic;
    assert.deepEqual(S.identities(before), S.identities(after));
    if (m === "ATTACK_DISCARD_DECK_TOP") {
      const expected = before.players[1].deck.slice(0, e.plan.amount);
      assert(expected.every((c) => other.discard.some((d) => d.id === c.id)));
    }
    if (m === "ATTACK_BENCH_BASICS") {
      assert(action.selections.cards.length > 0);
      assert(
        action.selections.cards.every((id) =>
          own.bench.some((c) => c.id === id),
        ),
      );
      assert(own.bench.length <= 5);
    }
    if (
      [
        "COIN_BONUS_DAMAGE",
        "DAMAGE_BY_OWN_COUNTERS",
        "DAMAGE_BY_ACTIVE_ENERGY",
      ].includes(m)
    ) {
      let amount = Number.parseInt(e.damage),
        defender = before.players[1].active,
        sr = E.getReferenceEffectRecord(before.players[0].active),
        dr = E.getReferenceEffectRecord(defender);
      if (m === "COIN_BONUS_DAMAGE") {
        const flips = after.history
          .slice(before.history.length)
          .filter(
            (e) =>
              e.details?.command === "COIN_FLIP" &&
              typeof e.details.heads === "boolean",
          );
        assert.equal(flips.length, 1);
        amount += flips[0].details.heads ? e.plan.amount : 0;
      }
      if (m === "DAMAGE_BY_OWN_COUNTERS")
        amount =
          (e.plan.addBase ? amount : 0) +
          Math.floor(before.players[0].active.damage / 10) * e.plan.unit;
      if (m === "DAMAGE_BY_ACTIVE_ENERGY")
        amount +=
          (before.players[0].active.energies.length +
            defender.energies.length) *
          e.plan.unit;
      const penalty = before.players[0].active.energyCards.reduce(
        (n, c) =>
          n + (E.getReferenceEffectRecord(c).mainPlan?.damagePenalty || 0),
        0,
      );
      amount = Math.max(0, amount - penalty);
      if (dr.facts.weakness?.types.some((t) => sr.facts.types.includes(t)))
        amount *= 2;
      if (dr.facts.resistance?.types.some((t) => sr.facts.types.includes(t)))
        amount = Math.max(0, amount + Number(dr.facts.resistance.value));
      const event = after.history
        .slice(before.history.length)
        .find(
          (e) =>
            e.details?.command === "DAMAGE" &&
            e.details.targetInstanceId === defender.id &&
            Number.isFinite(e.details.amount),
        );
      assert.equal(
        event.details.amount,
        amount,
        r.officialCardId + " exact damage",
      );
    }
    if (m === "ABILITY_ATTACH_SELF_DRAW") {
      assert.equal(
        own.active.energyCards.length,
        before.players[0].active.energyCards.length + 1,
      );
      assert.equal(
        own.hand.length,
        before.players[0].hand.length - 1 + e.plan.amount,
      );
      assert.equal(
        own.normalEnergyAttached,
        before.players[0].normalEnergyAttached,
      );
      assert(
        !p
          .getPokemonActions("you", t.sourceId)
          .find((o) => o.kind === "ability").enabled,
      );
      assert(
        own.active.energyCards.some(
          (c) => c.id === action.selections.energy[0],
        ),
      );
    }
    if (m === "BASIC_ENERGY") {
      assert.deepEqual(Array.from(own.active.energies), [
        r.facts.basicEnergyType,
      ]);
      assert(own.normalEnergyAttached);
    }
    if (m === "CONDITIONAL_EVOLVED_ENERGY") {
      assert.equal(own.active.energies.length, e.plan.bonusUnits);
      const typed = p.getSnapshot(),
        tp = typed.players[0],
        ti = tp.deck.findIndex((c) => {
          const r = E.getReferenceEffectRecord(c);
          return (
            c.kind === "pokemon" &&
            r.facts.stage > 0 &&
            !r.facts.rulePokemon &&
            r.attacks.some(
              (a) =>
                a.cost.length <= e.plan.bonusUnits &&
                a.cost.some((t) => t !== "無色"),
            )
          );
        });
      assert(ti >= 0);
      const oldMon = tp.active,
        typedMon = tp.deck.splice(ti, 1)[0];
      Object.assign(typedMon, {
        cardId: typedMon.id,
        damage: 0,
        enteredTurn: 0,
        energyCards: oldMon.energyCards.splice(0),
        energies: [],
        tools: [],
      });
      tp.bench.push(oldMon);
      tp.active = typedMon;
      assert(p.loadGame(typed).ok);
      assert(
        p
          .getPokemonActions("you", typedMon.id)
          .some((o) => o.kind === "attack" && o.enabled),
      );
      assert(p.loadGame(after).ok);
      const attack = p
        .getPokemonActions("you", own.active.id)
        .find((o) => o.kind === "attack" && o.enabled);
      assert(attack);
      const equal = p.getSnapshot(),
        you = equal.players[0],
        claimed = you.prizeCards.pop();
      you.hand.push(claimed);
      you.prizes--;
      if (you.prizeSlots)
        you.prizeSlots = you.prizeSlots.map((x) =>
          x === claimed.id ? null : x,
        );
      assert(p.loadGame(equal).ok);
      assert.equal(
        p.getSnapshot().players[0].active.energies.length,
        e.plan.normalUnits,
      );
      restore(p);
      assert(p.loadGame(after).ok);
      const rule = p.getSnapshot(),
        q = rule.players[0],
        idx = q.bench.findIndex(
          (c) => E.getReferenceEffectRecord(c).facts.rulePokemon,
        );
      assert(idx >= 0);
      const old = q.active;
      q.active = q.bench[idx];
      q.bench[idx] = old;
      q.active.energyCards.push(...old.energyCards.splice(0));
      assert(p.loadGame(rule).ok);
      assert.equal(
        p.getSnapshot().players[0].active.energies.length,
        e.plan.normalUnits,
      );
      assert.deepEqual(S.identities(p.getSnapshot()), S.identities(before));
      assert(p.loadGame(after).ok);
    }
    if (m === "ABILITY_ATTACH_SELF_DRAW") {
      const benchGame = JSON.parse(encoded),
        self = benchGame.players[0],
        source = self.active;
      self.active = self.bench[0];
      self.bench[0] = source;
      assert(p.loadGame(benchGame).ok);
      const benchOption = p
        .getPokemonActions("you", t.sourceId)
        .find((o) => o.kind === "ability" && o.enabled);
      assert(benchOption);
      const initial = p.getSnapshot();
      assert(p.dispatch("you", benchOption.action).ok);
      const state = p.getSnapshot();
      assert.equal(
        state.players[0].bench.find((c) => c.id === t.sourceId).energyCards
          .length,
        initial.players[0].bench.find((c) => c.id === t.sourceId).energyCards
          .length + 1,
      );
      assert.equal(
        state.players[0].active.energyCards.length,
        initial.players[0].active.energyCards.length,
      );
      assert(
        !p
          .getPokemonActions("you", t.sourceId)
          .find((o) => o.kind === "ability").enabled,
      );
      assert.deepEqual(S.identities(initial), S.identities(state));
    }
    restore(p);
    results.push({
      officialCardId: r.officialCardId,
      mechanic: m,
      kind,
      status: "PASS",
    });
  }
}
// The official pre-heading protection rule must be enforced after parsing Tera prints.
for (const target of records
  .filter(
    (r) =>
      r.facts.teraBenchProtection &&
      r.source?.kind === "saved-official-extension",
  )
  .slice(0, 2)) {
  const manifest = require("./fixtures/expanded-energy-manifest.cjs")(
    require("./fixtures/control-009-extension-manifest.cjs")(
      JSON.parse(fs.readFileSync("data/fixed-test-decks.json")),
      [target],
    ),
    records,
  );
  const row = S.inventory(E, manifest).find(
    (r) => r.plan?.mechanic === "ANY_DAMAGE" && r.locations.length,
  );
  assert(row);
  const frame = S.create(E, manifest, row),
    g = frame.game,
    enemy = g.players[1];
  let mon;
  for (const zone of ["deck", "hand", "prizeCards"]) {
    const i = enemy[zone].findIndex(
      (c) =>
        E.getReferenceEffectRecord(c).officialCardId === target.officialCardId,
    );
    if (i < 0) continue;
    mon = enemy[zone][i];
    if (zone === "prizeCards") enemy[zone][i] = enemy.deck.shift();
    else enemy[zone].splice(i, 1);
    break;
  }
  assert(mon);
  Object.assign(mon, {
    cardId: mon.id,
    damage: 0,
    enteredTurn: 0,
    energyCards: [],
    energies: [],
    tools: [],
  });
  enemy.bench.push(mon);
  const t = E.createUIPort({
    getGame: () => g,
    setGame: (x) => Object.assign(g, x),
  });
  assert(t.loadGame(g).ok);
  const before = t.getSnapshot(),
    action = {
      type: "attack_turn",
      attackIndex: row.index,
      targetIds: [mon.id],
    };
  assert(t.canDispatch("you", action));
  assert(t.dispatch("you", action).ok);
  assert.equal(
    t.getSnapshot().players[1].bench.find((c) => c.id === mon.id).damage,
    0,
  );
  assert.deepEqual(S.identities(before), S.identities(t.getSnapshot()));
  restore(t);
  results.push({
    officialCardId: target.officialCardId,
    mechanic: "OFFICIAL_TERA_RULE",
    status: "PASS",
  });
}
for (const m of wanted)
  assert(
    new Set(
      results.filter((r) => r.mechanic === m).map((r) => r.officialCardId),
    ).size >= 2,
    m + " needs multiple real prints",
  );
assert.equal(
  new Set(
    results
      .filter((r) => r.mechanic === "BASIC_ENERGY")
      .map(
        (r) =>
          records.find((c) => c.officialCardId === r.officialCardId).facts
            .basicEnergyType,
      ),
  ).size,
  8,
);
fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync(
  "test-results/final-shared-effects.json",
  JSON.stringify(
    { status: "PASS", results, blocked, physicalAndroidVerified: false },
    null,
    2,
  ) + "\n",
);
console.log(
  "FINAL_SHARED_EFFECTS PASS",
  results.length,
  "fixtures blocked",
  blocked.length,
);
