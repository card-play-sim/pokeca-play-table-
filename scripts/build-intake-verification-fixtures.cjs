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
  patterns = new Map();
const requested = new Set(
  (process.env.POKECA_INTAKE_PATTERNS || "").split(",").filter(Boolean),
);
const perPattern = Number(process.env.POKECA_INTAKE_PER_PATTERN || 1);
const prefix =
  process.env.POKECA_INTAKE_PREFIX || "reports/official-effect-continuation";
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
    if (
      (requested.size && !requested.has(e.plan.mechanic)) ||
      (patterns.get(e.plan.mechanic) || 0) >= perPattern ||
      fixtures.length >= Math.max(10, requested.size * perPattern)
    )
      continue;
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
      patterns.set(e.plan.mechanic, (patterns.get(e.plan.mechanic) || 0) + 1);
    } catch {}
  }
}
if (fixtures.length < (requested.size ? requested.size * perPattern : 5))
  throw Error("INSUFFICIENT_INTAKE_VERIFICATION_CASES");
B.atomic(prefix + "/browser-fixtures.json", fixtures);
const fixed = JSON.parse(fs.readFileSync("data/fixed-test-decks.json")),
  manifestBase =
    require("../tests/fixtures/control-009-extension-manifest.cjs")(
      fixed,
      fixtures.slice(0, 8).map((f) => f.r),
    );
const manifest = require("../tests/fixtures/expanded-energy-manifest.cjs")(
  manifestBase,
  records,
);
B.atomic(prefix + "/example-decks.json", manifest);
console.log(
  JSON.stringify({
    fixtures: fixtures.map((f) => [
      f.r.officialCardId,
      f.kind,
      f.e.plan.mechanic,
    ]),
  }),
);
