"use strict";
// Compile verified saved HTML, preserve unsupported candidates, enqueue all explicit text.
const fs = require("node:fs"),
  { spawnSync } = require("node:child_process"),
  B = require("./lib/shared-effect-batch.cjs");
const raw = JSON.parse(
  fs.readFileSync("data/official-effect-intake/checkpoint.json"),
);
const ext = JSON.parse(fs.readFileSync("data/effect-extensions/intake.json"));
const input = {
  ...ext,
  records: [
    ...new Map(
      [...ext.records, ...raw.records].map((r) => [r.officialCardId, r]),
    ).values(),
  ],
};
const compiled = require("./build-effect-extensions.cjs").build(input),
  accepted = new Set(compiled.records.map((r) => r.officialCardId));
// A raw record is usable only if its exact HTML, ID, name, facts and text pass the existing gate.
const semanticOnly = new Set([
  "UNSUPPORTED_POKEMON_OR_ENERGY_EFFECT_PATTERN",
  "UNSUPPORTED_EFFECT_PATTERN",
]);
const invalid = new Set(
  compiled.blocked
    .filter((r) => !semanticOnly.has(r.reason))
    .map((r) => r.officialCardId),
);
const evidence = [];
let noExplicitText = 0;
for (const r of input.records) {
  if (invalid.has(r.officialCardId)) continue;
  const add = (kind, e, index) => {
    if (!e.text?.trim()) {
      noExplicitText++;
      return;
    }
    evidence.push({
      officialCardId: r.officialCardId,
      category: r.category,
      effectKind: kind,
      effectName: e.name,
      effectIndex: index,
      effectText: e.text.trim(),
      officialTextSha256: B.hash(e.text.trim()),
      officialPageUrl: r.officialPageUrl,
    });
  };
  if (r.category === "pokemon") {
    r.attacks.forEach((e, i) => add("attack", e, i));
    r.abilities.forEach((e, i) => add("ability", e, i));
  } else add(r.category, r, 0);
}
fs.mkdirSync("reports/official-effect-continuation", { recursive: true });
const base = JSON.parse(fs.readFileSync("data/reference-effects/plans.json"));
const exported = spawnSync(
  process.execPath,
  [
    "scripts/export-reference-official-effect-evidence.cjs",
    "data/reference-effects/plans.json",
    "reports/official-effect-continuation/base-evidence.json",
  ],
  { encoding: "utf8" },
);
if (exported.status) throw Error(exported.stderr);
evidence.push(
  ...JSON.parse(
    fs.readFileSync("reports/official-effect-continuation/base-evidence.json"),
  ),
);
for (const r of base.records) accepted.add(r.officialCardId);
B.atomic("reports/official-effect-continuation/evidence.json", evidence);
const previous = fs.existsSync(
  "reports/official-effect-continuation/status.json",
)
  ? JSON.parse(
      fs.readFileSync("reports/official-effect-continuation/status.json"),
    )
  : {};
const registryHash = B.hash(
  JSON.stringify(compiled.records) +
    B.hash(fs.readFileSync("ui/engine.bundle.js")) +
    B.hash(fs.readFileSync("scripts/lib/shared-effect-engine-worker.cjs")) +
    B.hash(fs.readFileSync("tests/fixtures/control-005-scenarios.js")),
);
const repair =
  previous.registryHash === registryHash
    ? []
    : ["--retry-blocked", "--retry-failed", "--recheck"];
const result = spawnSync(
  process.execPath,
  [
    "scripts/process-shared-effect-batch.cjs",
    "reports/official-effect-continuation/queue",
    "reports/official-effect-continuation/evidence.json",
    "--max-tasks",
    process.argv[2] || "10000",
    ...repair,
    "--retry-transient",
  ],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
if (result.status) throw Error(result.stderr || result.stdout);
const queue = JSON.parse(result.stdout),
  categories = {};
for (const r of [...input.records, ...base.records]) {
  const c = (categories[r.category] ||= {
    prints: 0,
    compiled: 0,
    notImplemented: 0,
    blocked: 0,
  });
  c.prints++;
  c[
    invalid.has(r.officialCardId)
      ? "blocked"
      : accepted.has(r.officialCardId)
        ? "compiled"
        : "notImplemented"
  ]++;
}
const persisted = JSON.parse(
  fs.readFileSync("reports/official-effect-continuation/queue/queue.json"),
);
const executed = new Set(
  Object.values(persisted.jobs).flatMap((j) =>
    (j.summary?.cases || [])
      .filter((c) => c.status === "SUCCEEDED")
      .map((c) => c.slot.split(":")[0]),
  ),
);
for (const r of [...input.records, ...base.records]) {
  const c = categories[r.category];
  c.executionVerifiedPrints ||= 0;
  if (executed.has(r.officialCardId)) c.executionVerifiedPrints++;
}
const report = {
  schemaVersion: 1,
  registryHash,
  source: "OFFICIAL_SAVED_HTML_HASH_AND_EXISTING_COMPILER",
  referenceOnly: true,
  physicalAndroidVerified: false,
  officialPages: input.records.length + base.records.length,
  collectedNewPages: raw.records.length,
  explicitEffects: evidence.length,
  noExplicitText,
  processingPolicy:
    "COMPILED_IS_NOT_EXECUTION_VERIFIED; UNKNOWN_SEMANTICS_NOT_IMPLEMENTED",
  categories,
  commandCoverage: [
    ...new Set(
      compiled.records.flatMap((r) =>
        [
          r.mainPlan,
          ...r.attacks.map((e) => e.plan),
          ...r.abilities.map((e) => e.plan),
        ]
          .filter(Boolean)
          .flatMap((p) => p.commands),
      ),
    ),
  ].sort(),
  fetchBlocked: raw.blocked,
  compilerBlocked: compiled.blocked,
  queue: queue.run,
  resumeCommand:
    "python scripts/continue-official-effect-intake.py --limit 100 --adopt",
  checkpoint: "data/official-effect-intake/checkpoint.json",
  queueDirectory: "reports/official-effect-continuation/queue",
  automaticRepairPolicy:
    "TRANSIENT_FETCH_ON_EXPLICIT_RETRY; VERIFIED_NEW_REGISTRATION_RECHECK; UNKNOWN_SEMANTICS_REMAIN_CANDIDATES",
};
B.atomic("reports/official-effect-continuation/status.json", report);
console.log(JSON.stringify(report, null, 2));
