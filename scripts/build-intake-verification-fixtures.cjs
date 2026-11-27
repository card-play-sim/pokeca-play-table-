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
      const option = W.effectOption(t, e);
      if (!(option && (option.ok ?? option.enabled))) continue;
      if (kind === "ability" && !t.trigger && option.action.type !== "use_ability") continue;
      if (t.trigger || ["ATTACK_DISCARD_BENCH_ENERGY_BONUS", "COIN_SEARCH_POKEMON","TRAINER_TOP_TYPED_SEARCH","TRAINER_TOP_POKEMON_TRAINER","ATTACK_DISCARD_TOOL_BEFORE_DAMAGE","ATTACK_BASIC_DAMAGE_PROTECTION","TRAINER_DISCARD_SPECIAL_ENERGY","TOOL_LOW_HP_RETREAT_DISCOUNT","ABILITY_SWITCH_OWN","ABILITY_SEARCH_TYPED_EVOLUTION","TRAINER_SEARCH_TERA","TRAINER_TYPED_DAMAGE_BOOST","MASS_ZONE_TRANSFER","MASS_HEAL_OWN","MASS_PRIZE_DRAW","MASS_PLACE_COUNTERS","MASS_CONTEXT_BONUS","MASS_ENERGY_ROUTE","PASSIVE_TYPED_ATTACK_IMMUNITY","PASSIVE_NAMED_PRIZE_DISCOUNT","TRAINER_SWITCH_OR_EX_V_BOOST","TOOL_EX_ATTACK_BOOST","TOOL_PRIZE_COST_DISCOUNT","MASS_EFFECT_SEQUENCE","MASS_COIN_OUTCOME","MASS_BOARD_BONUS","MASS_HAND_FLOW","MASS_HEAL_SCOPE","MASS_ENERGY_COUNT_DISCARD"].includes(e.plan.mechanic)) {
        const verification = W.verifyCase(W.prepare(r, e, kind), e);
        if (verification.status !== "SUCCEEDED") continue;
      }
      const game = p.getSnapshot();
      if (!p.dispatch("you", option.action).ok) continue;
      const observedDamageEvents = p.getSnapshot().history.slice(game.history.length).filter(event =>
        (event.details?.command === "DAMAGE" && event.details.targetInstanceId) ||
        (event.details?.command === "COIN_FLIP" && typeof event.details.heads === "boolean"));
      const printedDamageEvents = ["VANILLA_DAMAGE", "ATTACK_UNDAMAGED_BONUS", "ATTACK_ATTACHED_TOOL_COUNT", "BENCH_COUNT_DAMAGE", "FULL_BENCH_REQUIRED_DAMAGE", "SELF_COUNTER_DAMAGE", "COIN_BONUS_DAMAGE",
          "ACTIVE_AND_BENCH_DAMAGE", "ATTACK_SPLASH_DAMAGE", "ATTACK_DISCARD_OPPONENT_DECK_TOP",
          "ATTACK_DISCARD_HAND_DRAW", "ATTACK_IGNORE_DAMAGE_RULES", "ATTACK_DISCARD_BENCH_ENERGY_BONUS",
          "PASSIVE_ROCKET_TEAM_ATTACK_GATE", "PASSIVE_INCOMING_ATTACK_DAMAGE_REDUCTION",
          "CONDITIONAL_ATTACK_BONUS", "SCALED_ATTACK_DAMAGE", "ANY_DAMAGE", "FIXED_COIN_HITS","MASS_CONTEXT_BONUS","MASS_BOARD_BONUS","MASS_ENERGY_COUNT_DISCARD"].includes(e.plan.mechanic) || observedDamageEvents.length
        ? observedDamageEvents
        : undefined;
      const sharedAttackEvents = ["ATTACK_DISCARD_FIELD_BASIC","ATTACK_OPTIONAL_DRAW_TO_LIMIT","ATTACK_DISCARD_DEFENDER_ENERGY",
        "ATTACK_HEAL_OWN_TARGET","ATTACK_SPLASH_OWN_BENCH","ATTACK_DISABLE_SELECTED_MOVE","CONTEXT_ATTACK_BONUS","ATTACK_PRIZE_BONUS_RECOIL",
        "ATTACK_BLIND_HAND_CHOICE","ATTACK_SPREAD_DAMAGE","PHANTOM","TRAINER_SWITCH_BOTH",
        "SUPPORTER_SWITCH_THEN_DRAW_TO_LIMIT","SUPPORTER_SEARCH_BY_STAGE","ATTACK_ACCELERATE_BASIC_ENERGY","SEARCH_REVEAL_TO_HAND_ATTACK","SEARCH_BASIC_TO_BENCH_ATTACK"].includes(e.plan.mechanic)
        ? p.getSnapshot().history.slice(game.history.length).filter(event=>event.type==="attack"||event.details?.command&&!event.details.reference)
        : undefined;
      fixtures.push({ r, kind, e, sourceId: t.sourceId, game, option, printedDamageEvents, sharedAttackEvents, trigger: t.trigger });
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
// The local exact-release candidate needs the imported-deck match in addition
// to all changed slots. Public verification remains receipt-only and unchanged.
const localCandidate = process.env.POKECA_INTAKE_LOCAL_CANDIDATE === "1";
if (!previous || (localCandidate && fixtures.length)) {
  const fixed = JSON.parse(fs.readFileSync("data/fixed-test-decks.json"));
  const uniquePrints = [...new Map(fixtures.map(f => [String(f.r.officialCardId), f.r])).values()];
  let selectedPrints = previous ? [...new Map(uniquePrints.map(r=>[r.name,r])).values()].slice(0,8) : fixtures.slice(0,8).map(f=>f.r);
  const makeManifest = require("../tests/fixtures/control-009-extension-manifest.cjs");
  const catalog = JSON.parse(fs.readFileSync("data/reference-effects/catalog.json")).records.concat(records);
  let manifest;
if(previous){
  const accepted=[];
  for(const row of selectedPrints){
    try {
      makeManifest(fixed,[...accepted,row],{catalog});
      accepted.push(row);
    } catch(error) {
      if(!String(error.message).includes('MATCH_DECK_DONOR_UNAVAILABLE:'))throw error;
      console.log('FULL_MATCH_DECK_CAPACITY_SKIP',row.officialCardId,error.message);
    }
  }
  if(!accepted.length)throw Error('NO_LEGAL_IMPORTED_MATCH_DECK');
  selectedPrints=accepted;
  manifest=makeManifest(fixed,selectedPrints,{catalog});
  console.log('FULL_MATCH_DECK_EXACT_PRINTS',selectedPrints.map(r=>r.officialCardId));
}else manifest=makeManifest(fixed,selectedPrints);
  if (previous) {
    const assert = require("node:assert/strict");
    assert(selectedPrints.length > 0);
    for (const deck of manifest.decks) {
      assert.equal(deck.cards.reduce((n, c) => n + c.count, 0), 60);
      for (const row of selectedPrints) assert(deck.cards.some(c =>
        String(c.referenceOfficialCardId) === String(row.officialCardId) && c.count>=1));
      const counts=new Map();
      for(const c of deck.cards)counts.set(c.name,(counts.get(c.name)||0)+c.count);
      for(const [name,n] of counts)assert(/^基本.エネルギー$/.test(name)||n<=4,"SAME_NAME_LIMIT:"+name);
    }
  }
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
