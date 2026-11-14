"use strict";
// Existing official references exercise the real bundled Rule Engine; no new provenance is invented.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  { spawnSync } = require("node:child_process");
const B = require("../scripts/lib/shared-effect-batch.cjs"),
  Q = require("../scripts/lib/shared-effect-queue.cjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "control011-engine-"));
function cli(script, args) {
  const r = spawnSync(process.execPath, ["scripts/" + script, ...args], {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
}
(async () => {
  try {
    const inputs = [
      "data/effect-extensions/compiled.json",
      "data/reference-effects/plans.json",
    ].map((source, i) => {
      const file = path.join(tmp, "evidence-" + i + ".json");
      cli("export-reference-official-effect-evidence.cjs", [source, file]);
      return file;
    });
    const dir = path.join(tmp, "queue"),
      first = JSON.parse(
        cli("process-shared-effect-batch.cjs", [
          dir,
          ...inputs,
          "--limit",
          "2",
          "--max-tasks",
          "2",
        ]),
      );
    assert.equal(first.selection.selected, 2);
    assert.equal(first.selection.deferred, 65);
    assert.equal(first.run.processed, 2);
    assert.equal(first.run.counts.PENDING, 65);
    const resumed = JSON.parse(
      cli("process-shared-effect-batch.cjs", [dir, ...inputs]),
    );
    assert.equal(resumed.enqueued.added, 0);
    assert.equal(resumed.enqueued.duplicates, 67);
    assert.equal(resumed.classifierCached, 2);
    assert.equal(resumed.run.processed, 65);
    assert.equal(resumed.run.counts.FAILED, 0);
    assert.equal(resumed.run.counts.SUCCEEDED, 62);
    assert.equal(resumed.run.counts.BLOCKED, 5);
    const repeat = JSON.parse(
      cli("process-shared-effect-batch.cjs", [dir, ...inputs]),
    );
    assert.equal(repeat.run.processed, 0);
    const store = Q.load(dir),
      jobs = Object.values(store.state.jobs);
    store.close();
    const cases = jobs.flatMap((j) => j.summary.cases);
    assert.equal(cases.length, 139);
    const blocked = cases.filter((c) => c.status === "BLOCKED");
    assert(
      blocked.every((c) =>
        [
          "FIXED_DECK_ENERGY_UNAVAILABLE",
          "NO_LEGAL_VERIFICATION_FIXTURE",
        ].includes(c.reason),
      ),
    );
    assert.equal(Object.keys(resumed.run.categories).length, 6);
    // A self-consistent hash and plausible URL are not official corroboration.
    const text = "未登録の公式原文を推測して実行しない。",
      e = {
        officialCardId: "79999999",
        category: "item",
        effectKind: "item",
        effectName: "unknown",
        effectIndex: 0,
        effectText: text,
        officialTextSha256: B.hash(text),
        officialPageUrl:
          "https://www.pokemon-card.com/card-search/details.php/card/79999999",
      };
    const input = path.join(tmp, "unknown.json");
    fs.writeFileSync(input, JSON.stringify([e]));
    const unknown = JSON.parse(
      cli("process-shared-effect-batch.cjs", [dir, input]),
    );
    assert.equal(unknown.run.processed, 1);
    assert.equal(unknown.run.counts.BLOCKED, 6);
    assert.equal(unknown.run.counts.FAILED, 0);
    const report = {
      status: "PASS",
      officialReferencePrints: 110,
      evidenceSlots: 139,
      registeredTasks: 67,
      counts: resumed.run.counts,
      categories: resumed.run.categories,
      successfulSlots: cases.filter((c) => c.status === "SUCCEEDED").length,
      blocked,
      unknownEvidence: "BLOCKED_OFFICIAL_REFERENCE_NOT_REGISTERED",
      resumeAndDuplicatePrevention: true,
      checks: [
        "BUNDLED_ENGINE",
        "UI_PORT_DISPATCH",
        "AI_LEGAL_ACTION_PARITY",
        "INVALID_ACTION_STATE_AND_RNG_ROLLBACK",
        "CARD_CONSERVATION",
        "EXACT_SAVE_RESTORE",
      ],
      scope: "INTEGRATION_VERIFICATION_NOT_NEW_SEMANTIC_APPROVAL",
    };
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(
      "test-results/control-011-engine-batch.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
