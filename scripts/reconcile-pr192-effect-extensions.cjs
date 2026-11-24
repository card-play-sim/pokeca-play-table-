"use strict";
/**
 * PR192 deterministic release-artifact reconciliation.
 * The official HTML proof and current fail-closed parser are the only sources
 * for regenerated extension records. No blocked printing is promoted.
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { build } = require("./build-effect-extensions.cjs");
const intakePath = "data/effect-extensions/intake.json";
const compiledPath = "data/effect-extensions/compiled.json";
const auditPath = "reports/official-effect-continuation/pr192-derived-reconciliation.json";
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const hash = o => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const old = read(compiledPath);
const intake = read(intakePath);
const regenerated = build(intake);
const before = new Map(old.records.map(r => [String(r.officialCardId), r]));
const after = new Map(regenerated.records.map(r => [String(r.officialCardId), r]));
const blocked = new Map(regenerated.blocked.map(r => [String(r.officialCardId), r]));
const newlyRejected = [...before.keys()].filter(id => !after.has(id));
const unexpectedAdditions = [...after.keys()].filter(id => !before.has(id));
const expectedAmbiguousEvolution = new Set(["50096", "50399", "50585", "48055", "45470", "45600", "46411"]);
assert.deepEqual([...newlyRejected].sort(), [...expectedAmbiguousEvolution].sort(),
  "Official parser reconciliation affected unexpected accepted printings");
assert.deepEqual(unexpectedAdditions, [],
  "Unexpected new accepted printing; review its proof in a separate batch");
for (const id of newlyRejected) {
  assert.equal(blocked.get(id)?.reason, "UNSUPPORTED_EVOLUTION_CHAIN",
    "An accepted printing was removed for a reason other than ambiguous evolution");
}
const modified = [];
for (const [id, next] of after) {
  const prior = before.get(id);
  if (JSON.stringify(prior) === JSON.stringify(next)) continue;
  assert.equal(prior.category, next.category, "Category changed without independent review: " + id);
  assert.deepEqual(prior.source, next.source, "Official evidence changed without review: " + id);
  modified.push(id);
}
assert.equal(regenerated.records.length + regenerated.blocked.length,
  intake.records.length + (intake.blocked || []).length,
  "One official printing did not receive exactly one resolution");
const audit = {
  schemaVersion: 1,
  source: "official-page-proof-and-current-parser",
  originalAccepted: old.records.length,
  currentAccepted: regenerated.records.length,
  originalBlocked: old.blocked.length,
  currentBlocked: regenerated.blocked.length,
  newlyRejected,
  newlyRejectedReason: "UNSUPPORTED_EVOLUTION_CHAIN",
  changedAcceptedIds: modified,
  previousSha256: hash(old),
  regeneratedSha256: hash(regenerated),
  noBlockedPrintingReleased: true
};
fs.mkdirSync("reports/official-effect-continuation", { recursive: true });
fs.writeFileSync(compiledPath, JSON.stringify(regenerated, null, 2) + "\n");
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + "\n");
console.log("OFFICIAL_DERIVED_RECONCILIATION", JSON.stringify(audit));
