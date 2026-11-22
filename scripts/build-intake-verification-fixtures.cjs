"use strict";
const { execFileSync } = require("node:child_process");
const fs = require("node:fs"),
  W = require("./lib/shared-effect-engine-worker.cjs"),
  B = require("./lib/shared-effect-batch.cjs");
const releaseBase = process.env.POKECA_INTAKE_RELEASE_BASE;
const intakeSource = releaseBase ? "data/effect-extensions/intake.json"
  : "data/official-effect-intake/checkpoint.json";
const raw = new Set(
    JSON.parse(
      fs.readFileSync(intakeSource),
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
// A release run must cover every slot for each changed intake print.
const compiledPath = "data/effect-extensions/compiled.json";
const previous = releaseBase
  ? new Map(JSON.parse(execFileSync("git", ["show", releaseBase + ":" + compiledPath],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })).records
      .map(record => [record.officialCardId, JSON.stringify(record)]))
  : null;
const selected = records.filter(record => raw.has(record.officialCardId) &&
  (!previous || previous.get(record.officialCardId) !== JSON.stringify(record)));
const missing = [];
for (const r of selected) {
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
  if (!effects.length) missing.push(r.officialCardId + ":no-slots");
  for (const { kind, e } of effects) {
    if (
      !previous && ((requested.size && !requested.has(e.plan.mechanic)) ||
      (patterns.get(e.plan.mechanic) || 0) >= perPattern ||
      fixtures.length >= Math.max(10, requested.size * perPattern))
    )
      continue;
    const count = fixtures.length;
    try {
      const t = W.prepare(r, e, kind);
      if (t.blocked || !t.port) continue;
      const p = t.port;
      const option = ["attack", "ability"].includes(kind)
        ? p.getPokemonActions("you", t.sourceId).find(o =>
            o.kind === kind && (kind === "attack"
              ? o.action.attackIndex === e.effectIndex
              : o.label === e.name))
        : p.getHandOptions("you", t.sourceId).find(o => o.ok);
      if (!(option && (option.ok ?? option.enabled))) continue;
      const game = p.getSnapshot();
      if (!p.dispatch("you", option.action).ok) continue;
      const printedDamageEvents = ["VANILLA_DAMAGE", "SELF_COUNTER_DAMAGE", "COIN_BONUS_DAMAGE"].includes(e.plan.mechanic)
        ? p.getSnapshot().history.slice(game.history.length).filter(event =>
            (event.details?.command === "DAMAGE" && event.details.targetInstanceId) ||
            (event.details?.command === "COIN_FLIP" && typeof event.details.heads === "boolean"))
        : undefined;
      fixtures.push({ r, kind, e, sourceId: t.sourceId, game, option, printedDamageEvents });
      patterns.set(e.plan.mechanic, (patterns.get(e.plan.mechanic) || 0) + 1);
    } catch (error) {
      if (previous) console.error(error);
    } finally {
      if (previous && fixtures.length === count) {
        missing.push(r.officialCardId + ":" + kind + ":" + (e.effectIndex ?? 0));
      }
    }
  }
}
if (previous && missing.length)
  throw Error("MISSING_RELEASE_BROWSER_FIXTURE " + missing.join(", "));
if (!previous && fixtures.length < (requested.size ? requested.size * perPattern : 5))
  throw Error("INSUFFICIENT_INTAKE_VERIFICATION_CASES");
B.atomic(prefix + "/browser-fixtures.json", fixtures);
if (!previous) {
  const fixed = JSON.parse(fs.readFileSync("data/fixed-test-decks.json")),
    manifest = require("../tests/fixtures/control-009-extension-manifest.cjs")(
      fixed,
      fixtures.slice(0, 8).map((f) => f.r),
    );
  B.atomic(prefix + "/example-decks.json", manifest);
}
console.log(
  JSON.stringify({
    fixtures: fixtures.map((f) => [
      f.r.officialCardId,
      f.kind,
      f.e.plan.mechanic,
    ]),
  }),
);
