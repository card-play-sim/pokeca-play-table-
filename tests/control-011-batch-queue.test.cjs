"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  { spawn, spawnSync } = require("node:child_process");
const B = require("../scripts/lib/shared-effect-batch.cjs"),
  Q = require("../scripts/lib/shared-effect-queue.cjs"),
  root = path.resolve(__dirname, ".."),
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "control011-")),
  results = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (e) {
    results.push({ name, status: "FAILED", error: e.stack });
  }
}
function invoke(script, args, codes = [0]) {
  const r = spawnSync(
    process.execPath,
    [path.join(root, "scripts", script), ...args],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 120000 },
  );
  assert(codes.includes(r.status), r.stderr || r.error?.message || r.stdout);
  return r;
}
function row(id, text, category = "item", name = "shared") {
  return {
    officialCardId: String(id),
    category,
    effectKind: category === "pokemon" ? "ability" : category,
    effectName: name,
    effectIndex: 0,
    effectText: text,
    officialTextSha256: B.hash(text),
    officialPageUrl:
      "https://www.pokemon-card.com/card-search/details.php/card/" + id,
  };
}
function build(name, rows, partial = false) {
  const input = path.join(tmp, name + ".json"),
    out = path.join(tmp, name + "-batch.json");
  fs.writeFileSync(input, JSON.stringify(rows));
  invoke(
    "build-official-effect-codex-batch.cjs",
    [input, out],
    partial ? [2] : [0],
  );
  return { input, out, batch: JSON.parse(fs.readFileSync(out)) };
}
function selection(name, rows) {
  const f = build(name, rows);
  return B.selectSources([f.out], { limit: 100 });
}
const worker = path.join(tmp, "worker.cjs");
fs.writeFileSync(
  worker,
  `const fs=require('node:fs'),path=require('node:path');module.exports={version:'fixture-1',idempotent:true,async run(t,c){if(t.officialText.includes('FAIL'))throw Error('EXPECTED_FAILURE');if(t.officialText.includes('BLOCK'))return {status:'BLOCKED',reason:'EXPECTED_BLOCKED'};if(t.officialText.includes('TIMEOUT'))await new Promise(()=>{});if(t.officialText.includes('PROTECTED'))fs.writeFileSync(path.join(process.cwd(),'data/fixed-test-decks.json'),'forbidden');if(t.officialText.includes('SLOW'))await new Promise(r=>setTimeout(r,700));const f=path.join(c.queueDirectory,'applied-'+c.idempotencyKey+'.json');if(!fs.existsSync(f))fs.writeFileSync(f,JSON.stringify({ok:true,secretVisible:!!process.env.OPENAI_API_KEY}),{flag:'wx'});return {status:'SUCCEEDED',idempotencyKey:c.idempotencyKey};}};`,
);
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await pause(20);
  }
  throw Error("TEST_WAIT_TIMEOUT");
}
(async () => {
  try {
    await test("batch selector preserves numeric/owner/condition variants as review-only and isolates invalid source", () => {
      const f = build(
        "variants",
        [
          row(70000001, "自分の山札を2枚引く。"),
          row(70000002, "自分の山札を3枚引く。"),
          row(70000003, "相手の山札を3枚引く。"),
          row(70000004, "自分のサイドが3枚なら、山札を2枚引く。"),
          row(70000005, "自分の手札が1枚なら、山札を2枚引く。"),
          { ...row(70000006, "偽造"), officialTextSha256: "0".repeat(64) },
        ],
        true,
      );
      assert.equal(f.batch.tasks.length, 5);
      assert(f.batch.candidateFamilies.length >= 2);
      assert(
        f.batch.candidateFamilies.every(
          (g) =>
            g.status === "REVIEW_REQUIRED" &&
            g.semanticEquivalenceConfirmed === false,
        ),
      );
      const out = path.join(tmp, "variants-selection.json");
      invoke("choose-codex-shared-effect-source.cjs", [
        "AUTO",
        out,
        f.out,
        "--batch",
        "--limit",
        "2",
      ]);
      const chosen = JSON.parse(fs.readFileSync(out));
      assert.equal(chosen.tasks.length, 2);
      assert.equal(chosen.deferred.length, 3);
      assert(chosen.blocked.length);
      invoke("select-codex-shared-effect-task.cjs", [
        out,
        "AUTO",
        path.join(tmp, "rebatch.json"),
        "--batch",
        "--limit",
        "4",
      ]);
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(tmp, "rebatch.json"))).tasks
          .length,
        4,
      );
    });
    await test("same common task merges print coverage across sources and malformed tasks isolate", () => {
      const a = build("merge-a", [row(70000991, "山札を2枚引く。")]);
      const b = build("merge-b", [row(70000992, "山札を2枚引く。")]);
      const raw = JSON.parse(fs.readFileSync(b.out));
      raw.tasks.push(null);
      fs.writeFileSync(b.out, JSON.stringify(raw));
      const merged = B.selectSources([a.out, b.out]);
      assert.equal(merged.tasks.length, 1);
      assert.equal(merged.tasks[0].evidence.length, 2);
      assert.equal(merged.tasks[0].sourcePriority, 0);
      assert.equal(merged.blocked.length, 1);
    });
    await test("conflicting evidence never leaves the first row executable; independent groups continue", () => {
      const f = build(
        "conflict",
        [
          row(70000100, "山札を2枚引く。"),
          row(70000100, "山札を3枚引く。"),
          row(70000101, "自分の山札を4枚引く。"),
        ],
        true,
      );
      const s = B.selectSources([f.out]);
      assert.equal(s.tasks.length, 1);
      assert.deepEqual(s.tasks[0].prints, ["70000101"]);
      assert(s.blocked.some((b) => String(b.reason).includes("CONFLICT")));
    });
    await test("6001 synthetic rows classify in one pass without pretending official corroboration", () => {
      const rows = Array.from({ length: 6001 }, (_, i) =>
        row(
          71000000 + i,
          "自分の山札を" + (i + 1) + "枚引く。",
          ["item", "supporter", "pokemon"][i % 3],
        ),
      );
      rows.push({
        ...row(71999999, "未確認"),
        officialPageUrl: "https://example.com/incorrect",
      });
      const f = build("large", rows, true);
      assert.equal(f.batch.counts.verified, 6001);
      assert.equal(f.batch.counts.blocked, 1);
      assert.equal(f.batch.tasks.length, 6001);
      assert.equal(f.batch.candidateFamilies.length, 1);
      assert.equal(f.batch.candidateFamilies[0].members.length, 6001);
      assert.match(f.batch.evidenceTrust, /REQUIRES_OFFICIAL_CORROBORATION/);
      assert.equal(Object.keys(f.batch.categories).length, 3);
    });
    await test("limits defer rather than lose work, completed jobs and duplicate imports are skipped", async () => {
      const rows = Array.from({ length: 10 }, (_, i) =>
          row(72000000 + i, "work " + i),
        ),
        f = build("resume", rows),
        s = B.selectSources([f.out], { limit: 2 }),
        dir = path.join(tmp, "resume");
      assert.equal(s.deferred.length, 8);
      assert.equal(Q.enqueue(dir, s).added, 10);
      const a = await Q.run(dir, worker, { maxTasks: 3, timeoutMs: 5000 });
      assert.equal(a.counts.SUCCEEDED, 3);
      assert.equal(a.counts.PENDING, 7);
      assert.equal(Q.enqueue(dir, s).duplicates, 10);
      const b = await Q.run(dir, worker, { maxTasks: 20, timeoutMs: 5000 });
      assert.equal(b.processed, 7);
      assert.equal(b.counts.SUCCEEDED, 10);
      const c = await Q.run(dir, worker, { maxTasks: 20, timeoutMs: 5000 });
      assert.equal(c.processed, 0);
      assert.equal(
        fs.readdirSync(dir).filter((f) => f.startsWith("applied-")).length,
        10,
      );
    });
    await test("worker errors, timeouts, BLOCKED and forbidden writes do not stop independent tasks", async () => {
      const dir = path.join(tmp, "isolation"),
        s = selection("isolation", [
          row(73000000, "FAIL"),
          row(73000001, "TIMEOUT"),
          row(73000002, "BLOCK"),
          row(73000003, "PROTECTED"),
          row(73000004, "SUCCESS"),
        ]);
      const before = B.hash(fs.readFileSync("data/fixed-test-decks.json"));
      Q.enqueue(dir, s);
      const r = await Q.run(dir, worker, { maxTasks: 20, timeoutMs: 400 });
      assert.equal(r.counts.SUCCEEDED, 1);
      assert.equal(r.counts.FAILED, 3);
      assert.equal(r.counts.BLOCKED, 1);
      assert.equal(
        B.hash(fs.readFileSync("data/fixed-test-decks.json")),
        before,
      );
      assert.equal(r.counts.PENDING, 0);
      assert.equal(r.counts.RUNNING, 0);
    });
    await test("real SIGKILL interruption resumes unprocessed work and does not repeat completed jobs", async () => {
      const s = selection("kill", [
        row(74000000, "FAST A"),
        row(74000001, "FAST B"),
        row(74000002, "SLOW"),
        row(74000003, "FAST C"),
      ]);
      s.tasks.forEach(
        (t) =>
          (t.sourcePriority =
            t.officialText === "FAST A"
              ? 0
              : t.officialText === "FAST B"
                ? 1
                : t.officialText === "SLOW"
                  ? 2
                  : 3),
      );
      const dir = path.join(tmp, "kill");
      Q.enqueue(dir, s);
      const child = spawn(
        process.execPath,
        [
          "scripts/run-shared-effect-queue.cjs",
          "run",
          dir,
          "--worker",
          worker,
          "--timeout-ms",
          "5000",
        ],
        { cwd: root, stdio: "ignore" },
      );
      const exited = new Promise((resolve) => child.once("exit", resolve));
      const slow = s.tasks.find((t) => t.officialText === "SLOW");
      await until(() => {
        const file = path.join(dir, "journal.ndjson");
        return (
          fs.existsSync(file) &&
          fs
            .readFileSync(file, "utf8")
            .split("\n")
            .filter(Boolean)
            .some((l) => {
              try {
                const e = JSON.parse(l);
                return (
                  e.type === "START" &&
                  e.payload.jobId.startsWith(slow.taskId + ":")
                );
              } catch {
                return false;
              }
            })
        );
      });
      child.kill("SIGKILL");
      await exited;
      await pause(100);
      const run = await Q.run(dir, worker, { maxTasks: 20, timeoutMs: 5000 });
      assert.equal(run.counts.SUCCEEDED, 4);
      assert.equal(run.processed, 2);
      const store = Q.load(dir);
      try {
        assert.equal(
          Object.values(store.state.jobs).find(
            (j) => j.task.officialText === "FAST A",
          ).attempts,
          1,
        );
        assert.equal(
          Object.values(store.state.jobs).find(
            (j) => j.task.officialText === "SLOW",
          ).attempts,
          2,
        );
      } finally {
        store.close();
      }
      assert.equal(
        fs.readdirSync(dir).filter((f) => f.startsWith("applied-")).length,
        4,
      );
    });
    await test("receipt written before interrupted completion recovers without repeating worker", async () => {
      const dir = path.join(tmp, "receipt");
      Q.enqueue(dir, selection("receipt", [row(75000000, "receipt")]));
      await Q.run(dir, worker, { timeoutMs: 5000 });
      const store = Q.load(dir);
      try {
        Object.values(store.state.jobs)[0].status = "RUNNING";
        store.compact();
      } finally {
        store.close();
      }
      const r = await Q.run(dir, worker, { timeoutMs: 5000 });
      assert.equal(r.processed, 0);
      assert.equal(r.counts.SUCCEEDED, 1);
      assert.equal(
        fs.readdirSync(dir).filter((f) => f.startsWith("applied-")).length,
        1,
      );
    });
    await test("partial final journal event is archived; complete checksum corruption stops safely", () => {
      const dir = path.join(tmp, "journal");
      Q.enqueue(dir, selection("journal", [row(76000000, "journal")]));
      fs.appendFileSync(path.join(dir, "journal.ndjson"), '{"seq":');
      assert.equal(Q.inspect(dir).counts.PENDING, 1);
      assert(fs.readdirSync(dir).some((f) => f.startsWith("partial-")));
      fs.appendFileSync(
        path.join(dir, "journal.ndjson"),
        JSON.stringify({
          seq: 2,
          type: "PENDING",
          payload: {},
          checksum: "bad",
        }) + "\n",
      );
      assert.throws(() => Q.inspect(dir), /CHECKSUM/);
    });
    await test("evidence changes are quarantined and protected output/queue directories are refused", async () => {
      const dir = path.join(tmp, "changed");
      Q.enqueue(dir, selection("changed-a", [row(77000000, "old evidence")]));
      await Q.run(dir, worker, { timeoutMs: 5000 });
      Q.enqueue(dir, selection("changed-b", [row(77000000, "new evidence")]));
      const r = await Q.run(dir, worker, {
        retryBlocked: true,
        timeoutMs: 5000,
      });
      assert.equal(r.counts.SUCCEEDED, 1);
      assert.equal(r.counts.BLOCKED, 1);
      assert.equal(r.processed, 0);
      assert.throws(() => Q.lock("data/unsafe-queue"), /PROTECTED/);
      assert.throws(
        () => B.atomic("data/fixed-test-decks.json", {}),
        /PROTECTED/,
      );
      assert.equal(fs.existsSync("data/unsafe-queue"), false);
    });
    await test("one-command pipeline caches classification and resumes bounded runs", () => {
      const f = build("pipeline", [
          row(78000000, "pipeline A"),
          row(78000001, "pipeline B"),
          row(78000002, "pipeline C"),
        ]),
        dir = path.join(tmp, "pipeline");
      let r = invoke("process-shared-effect-batch.cjs", [
        dir,
        f.input,
        "--worker",
        worker,
        "--limit",
        "1",
        "--max-tasks",
        "1",
      ]);
      let d = JSON.parse(r.stdout);
      assert.equal(d.enqueued.added, 3);
      assert.equal(d.run.processed, 1);
      r = invoke("process-shared-effect-batch.cjs", [
        dir,
        f.input,
        "--worker",
        worker,
      ]);
      d = JSON.parse(r.stdout);
      assert.equal(d.classifierCached, 1);
      assert.equal(d.run.processed, 2);
      assert.equal(d.run.counts.SUCCEEDED, 3);
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(
    "test-results/control-011-batch-queue.json",
    JSON.stringify(
      {
        syntheticLoadRows: 6001,
        notClaiming6001CollectedOfficialCards: true,
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.status === "FAILED")) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
