"use strict";
const fs = require("node:fs"),
  W = require("./lib/shared-effect-engine-worker.cjs"),
  B = require("./lib/shared-effect-batch.cjs");
const raw = new Set(
    JSON.parse(
      fs.readFileSync("data/official-effect-intake/checkpoint.json"),
    ).records.map((r) => r.officialCardId),
  ),
  records = JSON.parse(
    fs.readFileSync("data/effect-extensions/compiled.json"),
  ).records,
  fixtures = [],
  patterns = new Set();
for (const r of records.filter((r) => raw.has(r.officialCardId))) {
  const effects =
    r.category === "pokemon"
      ? [
          ...r.attacks.map((e, i) => ({
            kind: "attack",
            e: { ...e, effectIndex: i },
          })),
          ...r.abilities.map((e, i) => ({
            kind: "ability",
            e: { ...e, effectIndex: i },
          })),
        ]
      : [
          {
            kind: r.category,
            e: { name: r.name, text: r.text, plan: r.mainPlan },
          },
        ];
  for (const { kind, e } of effects) {
    if (patterns.has(e.plan.mechanic) || fixtures.length >= 10) continue;
    try {
      const t = W.prepare(r, e, kind);
      if (t.blocked || !t.port) continue;
      const p = t.port,
        option = ["attack", "ability"].includes(kind)
          ? p
              .getPokemonActions("you", t.sourceId)
              .find(
                (o) =>
                  o.kind === kind &&
                  (kind !== "attack" || o.action.attackIndex === e.effectIndex),
              )
          : p.getHandOptions("you", t.sourceId).find((o) => o.ok);
      if (!(option && (option.ok ?? option.enabled))) continue;
      const game = p.getSnapshot();
      if (!p.dispatch("you", option.action).ok) continue;
      fixtures.push({ r, kind, e, sourceId: t.sourceId, game, option });
      patterns.add(e.plan.mechanic);
    } catch {}
  }
}
if (fixtures.length < 5) throw Error("INSUFFICIENT_INTAKE_VERIFICATION_CASES");
B.atomic(
  "reports/official-effect-continuation/browser-fixtures.json",
  fixtures,
);
const fixed = JSON.parse(fs.readFileSync("data/fixed-test-decks.json")),
  manifest = require("../tests/fixtures/control-009-extension-manifest.cjs")(
    fixed,
    fixtures.slice(0, 8).map((f) => f.r),
  );
B.atomic("reports/official-effect-continuation/example-decks.json", manifest);
console.log(
  JSON.stringify({
    fixtures: fixtures.map((f) => [
      f.r.officialCardId,
      f.kind,
      f.e.plan.mechanic,
    ]),
  }),
);
