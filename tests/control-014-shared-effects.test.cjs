"use strict";
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  B = require("../scripts/lib/shared-effect-batch.cjs");
const c = { window: {}, console, performance, Math, setTimeout };
vm.runInNewContext(fs.readFileSync("ui/engine.bundle.js", "utf8"), c);
const E = c.window.Pokeca,
  W = require("../scripts/lib/shared-effect-engine-worker.cjs"),
  S = vm.runInNewContext(
    fs.readFileSync("tests/fixtures/control-005-scenarios.js", "utf8"),
    { console },
  );
const catalog = E.getReferenceEffectCatalog({ includeExtensions: true }),
  wanted = new Set([
    "RECOIL_DAMAGE",
    "HEAL_SELF_ATTACK",
    "FIXED_COIN_HITS",
    "RECOVER_TYPED_DISCARD",
  ]),
  results = [],
  blocked = [];
for (const r of catalog.records) {
  const effects =
    r.category === "pokemon"
      ? r.attacks.map((e, i) => ({
          e: { ...e, effectIndex: i },
          kind: "attack",
        }))
      : [
          {
            e: { name: r.name, text: r.text, plan: r.mainPlan },
            kind: r.category,
          },
        ];
  for (const { e, kind } of effects) {
    if (!wanted.has(e.plan?.mechanic)) continue;
    const t = W.prepare(r, e, kind);
    if (t.blocked) {
      blocked.push({ id: r.officialCardId, reason: t.blocked });
      continue;
    }
    const p = t.port,
      option =
        kind === "attack"
          ? p
              .getPokemonActions("you", t.sourceId)
              .find(
                (o) =>
                  o.kind === kind && o.action.attackIndex === e.effectIndex,
              )
          : p.getHandOptions("you", t.sourceId).find((o) => o.ok);
    if (!(option && (option.ok ?? option.enabled))) {
      blocked.push({ id: r.officialCardId, reason: "NO_LEGAL_FIXTURE" });
      continue;
    }
    const before = p.getSnapshot(),
      serialized = JSON.stringify(before),
      ai = E.getLegalActions(before, "you").actions;
    assert(
      ai.some(
        (a) =>
          JSON.stringify(B.canonical(a)) ===
          JSON.stringify(B.canonical(option.action)),
      ),
    );
    const bad =
      kind === "attack"
        ? { ...option.action, attackIndex: 999 }
        : {
            ...option.action,
            selections: { cards: [before.players[1].active.id] },
          };
    assert.equal(p.dispatch("you", bad).ok, false);
    assert.equal(JSON.stringify(p.getSnapshot()), serialized);
    assert.equal(p.dispatch("ai", option.action).ok, false);
    assert.equal(JSON.stringify(p.getSnapshot()), serialized);
    if (kind === "attack" || r.category === "supporter") {
      const forbidden = JSON.parse(serialized);
      forbidden.turnNumber = 1;
      assert(p.loadGame(forbidden).ok);
      const snapshot = JSON.stringify(p.getSnapshot());
      assert.equal(p.dispatch("you", option.action).ok, false);
      assert.equal(JSON.stringify(p.getSnapshot()), snapshot);
      assert(p.loadGame(before).ok);
    }
    if (e.plan.mechanic === "RECOVER_TYPED_DISCARD") {
      const duplicate = {
        ...option.action,
        selections: {
          cards: [
            option.action.selections.cards[0],
            option.action.selections.cards[0],
          ],
        },
      };
      assert.equal(p.dispatch("you", duplicate).ok, false);
      assert.equal(JSON.stringify(p.getSnapshot()), serialized);
    }
    assert(p.dispatch("you", option.action).ok);
    const after = p.getSnapshot();
    assert.deepEqual(S.identities(after), S.identities(before));
    const own = after.players[0].active;
    if (e.plan.mechanic === "RECOIL_DAMAGE" && own?.id === t.sourceId)
      assert.equal(own.damage, before.players[0].active.damage + e.plan.amount);
    if (e.plan.mechanic === "HEAL_SELF_ATTACK")
      assert.equal(
        own.damage,
        Math.max(0, before.players[0].active.damage - e.plan.amount),
      );
    if (e.plan.mechanic === "FIXED_COIN_HITS") {
      const flips = after.history
        .slice(before.history.length)
        .filter(
          (x) =>
            x.details?.command === "COIN_FLIP" &&
            typeof x.details.heads === "boolean",
        );
      assert.equal(flips.length, e.plan.flips);
      let state = before.referenceRngState;
      for (const flip of flips) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        assert.equal(flip.details.heads, state / 4294967296 < 0.5);
      }
      const defender = before.players[1].active,
        dr = E.getReferenceEffectRecord(defender),
        sr = E.getReferenceEffectRecord(before.players[0].active);
      let expected = flips.filter((f) => f.details.heads).length * e.plan.unit;
      if (dr.facts.weakness?.types.some((t) => sr.facts.types.includes(t)))
        expected *= 2;
      if (dr.facts.resistance?.types.some((t) => sr.facts.types.includes(t)))
        expected = Math.max(0, expected + Number(dr.facts.resistance.value));
      const damage = after.history
        .slice(before.history.length)
        .find(
          (x) =>
            x.details?.command === "DAMAGE" &&
            x.details.targetInstanceId === defender.id &&
            Number.isFinite(x.details.amount),
        );
      assert.equal(damage.details.amount, expected);
    }
    if (e.plan.mechanic === "RECOVER_TYPED_DISCARD")
      for (const id of option.action.selections.cards) {
        assert(after.players[0].hand.some((c) => c.id === id));
        assert(!after.players[0].discard.some((c) => c.id === id));
      }
    const save = p.getResumeSnapshot();
    assert(p.restoreSession(save).ok);
    assert.equal(JSON.stringify(p.getSnapshot()), JSON.stringify(after));
    results.push({
      id: r.officialCardId,
      mechanic: e.plan.mechanic,
      kind,
      status: "PASS",
    });
  }
}
for (const m of wanted)
  assert(
    results.filter((r) => r.mechanic === m).length >= 2,
    m + " requires multiple official prints",
  );
const { compile } = require("../engine/reference-effect-plans.cjs");
for (const r of catalog.records.filter(
  (r) => r.mainPlan?.mechanic === "RECOVER_TYPED_DISCARD",
))
  assert.equal(
    compile({ records: [{ ...r, text: r.text + "さらに山札を引く。" }] })
      .records[0].mainPlan,
    null,
  );
fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync(
  "test-results/control-014-shared-effects.json",
  JSON.stringify(
    {
      status: "PASS",
      results,
      blocked,
      scope: "OFFICIAL_MULTI_PRINT_SHARED_EFFECTS",
      physicalAndroidVerified: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "CONTROL_014_SHARED_EFFECTS PASS",
  results.length,
  "blocked fixtures",
  blocked.length,
);
