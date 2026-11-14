"use strict";
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { spawnSync } = require("node:child_process"),
  B = require("../scripts/lib/shared-effect-batch.cjs");
const raw = JSON.parse(
    fs.readFileSync("data/official-effect-intake/checkpoint.json"),
  ),
  compiled = JSON.parse(
    fs.readFileSync("data/effect-extensions/compiled.json"),
  );
assert(raw.records.length >= 211);
assert(raw.blocked.length >= 109);
assert(compiled.records.length >= 83);
for (const r of raw.records) {
  const proof = JSON.parse(fs.readFileSync(r.source.path));
  assert.equal(B.hash(proof.html), proof.htmlSha256);
  assert.equal(proof.htmlSha256, r.source.sha256);
  assert.equal(proof.url, r.officialPageUrl);
}
const baseline = JSON.parse(
  fs.readFileSync("data/reference-effects/plans.json"),
);
assert.equal(baseline.records.length, 89);
const before = fs.readFileSync(
    "data/official-effect-intake/checkpoint.json",
    "utf8",
  ),
  ids = "work/control013-test-existing-ids.json";
fs.mkdirSync("work", { recursive: true });
fs.writeFileSync(ids, JSON.stringify(raw.records.map((r) => r.officialCardId)));
const hashes = [
  "data/fixed-test-decks.json",
  "data/official-image-registry.json",
  "data/reference-effects/plans.json",
].map((p) => [p, B.hash(fs.readFileSync(p))]);
const run = spawnSync(
  "python",
  [
    "scripts/continue-official-effect-intake.py",
    "--ids",
    ids,
    "--limit",
    "100",
  ],
  { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
);
assert.equal(run.status, 0, run.stderr);
const tail = JSON.parse(run.stdout.trim().split("\n").at(-1));
assert.equal(tail.newAttempts, 0);
assert.equal(tail.newNetworkRequests, 0);
assert.equal(
  fs.readFileSync("data/official-effect-intake/checkpoint.json", "utf8"),
  before,
);
let report = JSON.parse(
  fs.readFileSync("reports/official-effect-continuation/status.json"),
);
assert.equal(report.queue.counts.FAILED, 0);
assert(report.queue.counts.SUCCEEDED >= 25);
assert(report.queue.counts.BLOCKED > 0);
assert(report.categories.pokemon.compiled > 8);
assert(report.commandCoverage.includes("DAMAGE"));
assert(report.commandCoverage.includes("DRAW"));
assert.equal(Object.keys(report.categories).length, 6);
// A second unchanged pass executes no completed or previously blocked candidate again.
const again = spawnSync(
  process.execPath,
  ["scripts/connect-official-effect-intake.cjs"],
  { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
);
assert.equal(again.status, 0, again.stderr);
report = JSON.parse(again.stdout);
assert.equal(report.queue.processed, 0);
for (const [file, hash] of hashes)
  assert.equal(B.hash(fs.readFileSync(file)), hash);
// Real official evidence: bounded stop, checkpoint resume and a new-card delta.
const tmp = fs.mkdtempSync(
  require("node:path").join(require("node:os").tmpdir(), "control013-real-"),
);
try {
  const evidence = JSON.parse(
    fs.readFileSync("reports/official-effect-continuation/evidence.json"),
  );
  const input = require("node:path").join(tmp, "real.json"),
    dir = require("node:path").join(tmp, "queue");
  const run = (extra = []) => {
    const r = spawnSync(
      process.execPath,
      ["scripts/process-shared-effect-batch.cjs", dir, input, ...extra],
      { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  fs.writeFileSync(input, JSON.stringify(evidence.slice(0, 12)));
  const stopped = run(["--max-tasks", "1"]);
  assert.equal(stopped.run.processed, 1);
  assert(stopped.run.counts.PENDING > 0);
  const resumed = run();
  assert.equal(resumed.enqueued.added, 0);
  assert.equal(resumed.run.counts.PENDING, 0);
  assert.equal(run().run.processed, 0);
  fs.writeFileSync(
    input,
    JSON.stringify([...evidence.slice(0, 12), ...evidence.slice(-4)]),
  );
  const delta = run();
  assert(delta.enqueued.added > 0);
  assert.equal(delta.run.counts.FAILED, 0);
  assert.equal(run().run.processed, 0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync(
  "test-results/control-013-continuation.json",
  JSON.stringify(
    {
      status: "PASS",
      newOfficialPages: raw.records.length,
      blockedParsing: raw.blocked.length,
      registeredSupplementalPrints: compiled.records.length,
      categories: report.categories,
      queue: report.queue,
      incrementalNoNetworkRepeat: true,
      realEvidenceCheckpointResumeAndDelta: true,
      duplicateExecutionSkipped: true,
      protectedFilesUnchanged: true,
    },
    null,
    2,
  ) + "\n",
);
console.log("CONTROL_013_CONTINUATION PASS");
