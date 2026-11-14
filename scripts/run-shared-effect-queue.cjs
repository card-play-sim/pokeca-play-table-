"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  Q = require("./lib/shared-effect-queue.cjs");
(async () => {
  const [mode, ...args] = process.argv.slice(2),
    options = {},
    pos = [];
  for (let i = 0; i < args.length; i++) {
    if (["--retry-failed", "--retry-blocked", "--recheck"].includes(args[i]))
      options[
        {
          "--retry-failed": "retryFailed",
          "--retry-blocked": "retryBlocked",
          "--recheck": "recheck",
        }[args[i]]
      ] = true;
    else if (args[i].startsWith("--")) {
      if (
        !["--worker", "--max-tasks", "--timeout-ms"].includes(args[i]) ||
        args[i + 1] === undefined
      )
        throw Error("INVALID_QUEUE_OPTION");
      options[args[i].slice(2)] = args[++i];
    } else pos.push(args[i]);
  }
  let result;
  if (mode === "enqueue") {
    if (pos.length !== 2)
      throw Error("USAGE: enqueue selection.json queue-directory");
    result = Q.enqueue(pos[1], JSON.parse(fs.readFileSync(pos[0])));
  } else if (mode === "run") {
    if (pos.length !== 1)
      throw Error(
        "USAGE: run queue-directory [--worker local-module.cjs] [--max-tasks N] [--timeout-ms N] [--retry-failed]",
      );
    result = await Q.run(
      pos[0],
      path.resolve(
        options.worker || "scripts/lib/shared-effect-engine-worker.cjs",
      ),
      {
        maxTasks: Number(options["max-tasks"] || 100),
        timeoutMs: Number(options["timeout-ms"] || 120000),
        retryFailed: options.retryFailed,
        retryBlocked: options.retryBlocked,
        recheck: options.recheck,
      },
    );
  } else if (["status", "compact"].includes(mode) && pos.length === 1)
    result = Q.inspect(pos[0], { compact: mode === "compact" });
  else throw Error("UNKNOWN_QUEUE_COMMAND");
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
