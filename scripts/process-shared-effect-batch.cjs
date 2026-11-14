"use strict";
// No API keys or code-generation service: classify, persist and execute local verified work.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  B = require("./lib/shared-effect-batch.cjs"),
  Q = require("./lib/shared-effect-queue.cjs");
(async () => {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(
      "node scripts/process-shared-effect-batch.cjs QUEUE_DIRECTORY EVIDENCE.json [EVIDENCE2.json ...] [--limit N] [--max-tasks N] [--worker LOCAL_MODULE.cjs] [--timeout-ms N] [--retry-failed] [--retry-blocked] [--recheck]\nDefault worker verifies registered official references with the existing engine. Unknown semantics remain BLOCKED. Workers must export version, idempotent:true and run(task, context). Only queue-directory writes are permitted; no inherited API credentials.",
    );
    return;
  }
  const options = {},
    pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (
      [
        "--retry-failed",
        "--retry-transient",
        "--retry-blocked",
        "--recheck",
      ].includes(argv[i])
    )
      options[argv[i]] = true;
    else if (argv[i].startsWith("--")) {
      if (
        !["--limit", "--max-tasks", "--worker", "--timeout-ms"].includes(
          argv[i],
        ) ||
        argv[i + 1] === undefined
      )
        throw Error("INVALID_PIPELINE_OPTION");
      options[argv[i]] = argv[++i];
    } else pos.push(argv[i]);
  }
  const [directory, ...inputs] = pos;
  if (!directory || !inputs.length) throw Error("PIPELINE_INPUTS_REQUIRED");
  const dir = Q.safeDirectory(directory);
  fs.mkdirSync(dir, { recursive: true });
  const sources = [],
    errors = [],
    classifier = B.hash(
      fs.readFileSync("scripts/build-official-effect-codex-batch.cjs") +
        fs.readFileSync("scripts/lib/shared-effect-batch.cjs", "utf8"),
    );
  let cached = 0;
  for (const input of inputs) {
    try {
      const text = fs.readFileSync(input, "utf8"),
        identity = B.hash(
          path.resolve(input) + ":" + B.hash(text) + ":" + classifier,
        ),
        out = path.join(dir, "classifications", identity + ".json");
      if (!fs.existsSync(out)) {
        const result = spawnSync(
          process.execPath,
          ["scripts/build-official-effect-codex-batch.cjs", input, out],
          { encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
        );
        if (![0, 2].includes(result.status))
          throw Error(
            "CLASSIFICATION_FAILED:" +
              (result.stderr || result.error?.message || result.status).slice(
                -2000,
              ),
          );
      } else cached++;
      const batch = JSON.parse(fs.readFileSync(out));
      if (batch.inputSha256 !== B.hash(text))
        throw Error("SOURCE_CHANGED_DURING_CLASSIFICATION");
      sources.push(out);
    } catch (e) {
      errors.push({ source: input, reason: e.message });
    }
  }
  const limit = Number(options["--limit"] || 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000)
    throw Error("INVALID_BATCH_LIMIT");
  const selected = B.selectSources(sources, { limit });
  selected.blocked.push(...errors);
  selected.counts.blocked = selected.blocked.length;
  B.atomic(path.join(dir, "selection.json"), selected);
  const enqueued = Q.enqueue(dir, selected);
  const run = await Q.run(
    dir,
    path.resolve(
      options["--worker"] || "scripts/lib/shared-effect-engine-worker.cjs",
    ),
    {
      maxTasks: Number(options["--max-tasks"] || Number.MAX_SAFE_INTEGER),
      timeoutMs: Number(options["--timeout-ms"] || 120000),
      retryFailed: !!options["--retry-failed"],
      retryTransient: !!options["--retry-transient"],
      retryBlocked: !!options["--retry-blocked"],
      recheck: !!options["--recheck"],
    },
  );
  const result = {
    purpose: "CONTINUOUS_SHARED_EFFECT_PROCESSING",
    classifierCached: cached,
    selection: selected.counts,
    enqueued,
    run,
  };
  B.atomic(path.join(dir, "last-run.json"), result);
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
