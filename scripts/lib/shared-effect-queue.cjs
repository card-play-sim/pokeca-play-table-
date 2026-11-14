"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto"),
  { fork, spawnSync } = require("node:child_process");
const B = require("./shared-effect-batch.cjs"),
  clone = (x) => JSON.parse(JSON.stringify(x));
const startToken = (pid) => {
  try {
    return fs
      .readFileSync("/proc/" + pid + "/stat", "utf8")
      .split(") ")[1]
      .split(" ")[19];
  } catch {
    return null;
  }
};
function safeDirectory(dir) {
  let p = path.resolve(dir),
    tail = [];
  while (!fs.existsSync(p)) {
    tail.unshift(path.basename(p));
    p = path.dirname(p);
  }
  const resolved = path.join(fs.realpathSync(p), ...tail),
    root = fs.realpathSync(process.cwd()),
    rel = path.relative(root, resolved);
  if (
    !rel ||
    !path.relative(resolved, root).startsWith("..") ||
    (!rel.startsWith("..") &&
      !path.isAbsolute(rel) &&
      !["work", "reports", "artifacts", "test-results"].includes(
        rel.split(path.sep)[0],
      ))
  )
    throw Error("PROTECTED_QUEUE_DIRECTORY");
  return resolved;
}
function lock(dir) {
  dir = safeDirectory(dir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "lock.json"),
    owner = {
      pid: process.pid,
      host: os.hostname(),
      start: startToken(process.pid),
      token: crypto.randomUUID(),
    };
  for (let i = 0; i < 2; i++)
    try {
      fs.writeFileSync(file, JSON.stringify(owner), { flag: "wx" });
      return () => {
        const now = JSON.parse(fs.readFileSync(file));
        if (now.token !== owner.token) throw Error("QUEUE_LOCK_OWNER_CHANGED");
        fs.unlinkSync(file);
      };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let prior;
      try {
        prior = JSON.parse(fs.readFileSync(file));
      } catch {
        throw Error("INVALID_QUEUE_LOCK");
      }
      if (prior.host !== owner.host) throw Error("QUEUE_LOCK_OTHER_HOST");
      let alive = true;
      try {
        process.kill(prior.pid, 0);
      } catch (err) {
        if (err.code === "ESRCH") alive = false;
        else throw err;
      }
      if (alive && (!prior.start || prior.start === startToken(prior.pid)))
        throw Error("QUEUE_LOCKED");
      fs.unlinkSync(file);
    }
  throw Error("QUEUE_LOCK_RACE");
}
function load(dir) {
  const snapshot = path.join(dir, "queue.json"),
    journal = path.join(dir, "journal.ndjson");
  let state = fs.existsSync(snapshot)
    ? JSON.parse(fs.readFileSync(snapshot))
    : {
        schemaVersion: 1,
        purpose: "OFFICIAL_EFFECT_PERSISTENT_QUEUE",
        seq: 0,
        jobs: {},
        blockedInputs: {},
      };
  if (
    state.schemaVersion !== 1 ||
    state.purpose !== "OFFICIAL_EFFECT_PERSISTENT_QUEUE" ||
    !state.jobs ||
    !state.blockedInputs
  )
    throw Error("INVALID_QUEUE_SNAPSHOT");
  function apply(e) {
    if (e.type === "ENQUEUE") state.jobs[e.payload.job.jobId] = e.payload.job;
    else if (e.type === "BLOCK_INPUT")
      state.blockedInputs[e.payload.key] = e.payload.value;
    else {
      const job = state.jobs[e.payload.jobId];
      if (!job) throw Error("JOURNAL_UNKNOWN_JOB");
      if (e.type === "START") {
        job.status = "RUNNING";
        job.attempt = e.payload.attempt;
        job.attempts = (job.attempts || 0) + 1;
      } else if (e.type === "FINISH") {
        job.status = e.payload.status;
        job.receipt = e.payload.receipt;
        job.summary = e.payload.summary;
      } else if (e.type === "PENDING") {
        job.status = "PENDING";
        job.recovery = e.payload.reason;
      } else throw Error("UNKNOWN_QUEUE_EVENT");
    }
    state.seq = e.seq;
  }
  if (fs.existsSync(journal)) {
    let data = fs.readFileSync(journal, "utf8");
    if (data && !data.endsWith("\n")) {
      const end = data.lastIndexOf("\n") + 1;
      fs.writeFileSync(
        path.join(dir, "partial-" + Date.now() + ".json"),
        JSON.stringify({ discardedTail: data.slice(end) }),
      );
      fs.truncateSync(journal, Buffer.byteLength(data.slice(0, end)));
      data = data.slice(0, end);
    }
    for (const line of data.split("\n").filter(Boolean)) {
      const e = JSON.parse(line),
        { checksum, ...body } = e;
      if (checksum !== B.hash(JSON.stringify(body)))
        throw Error("QUEUE_JOURNAL_CHECKSUM");
      if (e.seq <= state.seq) continue;
      if (e.seq !== state.seq + 1) throw Error("QUEUE_JOURNAL_GAP");
      apply(e);
    }
  }
  for (const j of Object.values(state.jobs)) {
    B.validateTask(j.task);
    if (
      j.fingerprint !== B.fingerprint(j.task) ||
      j.jobId !== j.task.taskId + ":" + j.fingerprint
    )
      throw Error("QUEUE_TASK_FINGERPRINT");
    if (
      !["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "BLOCKED"].includes(
        j.status,
      )
    )
      throw Error("INVALID_QUEUE_STATUS");
  }
  const fd = fs.openSync(journal, "a");
  return {
    state,
    append(type, payload) {
      const body = { seq: state.seq + 1, type, payload },
        event = { ...body, checksum: B.hash(JSON.stringify(body)) };
      fs.writeFileSync(fd, JSON.stringify(event) + "\n");
      fs.fsyncSync(fd);
      apply(event);
    },
    close() {
      fs.closeSync(fd);
    },
    compact() {
      B.atomic(snapshot, state);
      fs.ftruncateSync(fd, 0);
      fs.fsyncSync(fd);
    },
  };
}
function summary(state) {
  const counts = {
      PENDING: 0,
      RUNNING: 0,
      SUCCEEDED: 0,
      FAILED: 0,
      BLOCKED: 0,
    },
    categories = {};
  for (const j of Object.values(state.jobs)) {
    counts[j.status]++;
    const c = (categories[j.task.category] ||= {
      PENDING: 0,
      RUNNING: 0,
      SUCCEEDED: 0,
      FAILED: 0,
      BLOCKED: 0,
    });
    c[j.status]++;
  }
  return {
    inputBlocked: Object.keys(state.blockedInputs).length,
    seq: state.seq,
    totalJobs: Object.keys(state.jobs).length,
    counts,
    categories,
    blockedInputs: Object.values(state.blockedInputs),
  };
}
function enqueue(dir, selection) {
  const release = lock(dir);
  let store;
  try {
    store = load(dir);
    const state = store.state,
      slots = new Map();
    for (const j of Object.values(state.jobs))
      for (const e of j.task.evidence)
        if (j.status !== "BLOCKED") {
          const prior = slots.get(B.slot(e));
          if (!prior)
            slots.set(B.slot(e), e.officialTextSha256 + ":" + e.category);
        }
    let added = 0,
      duplicates = 0;
    for (const t of [
      ...(selection.tasks || []),
      ...(selection.deferred || []),
    ]) {
      try {
        B.validateTask(t);
        const fingerprint = B.fingerprint(t),
          jobId = t.taskId + ":" + fingerprint;
        if (state.jobs[jobId]) {
          duplicates++;
          continue;
        }
        const conflict = t.evidence.some(
          (e) =>
            slots.has(B.slot(e)) &&
            slots.get(B.slot(e)) !== e.officialTextSha256 + ":" + e.category,
        );
        store.append("ENQUEUE", {
          job: {
            jobId,
            fingerprint,
            task: clone(t),
            priority: {
              source: t.sourcePriority ?? 0,
              prints: t.prints.length,
            },
            status: conflict ? "BLOCKED" : "PENDING",
            summary: conflict
              ? { reason: "PERSISTED_EVIDENCE_CONFLICT" }
              : null,
            attempts: 0,
          },
        });
        added++;
        if (!conflict)
          for (const e of t.evidence)
            slots.set(B.slot(e), e.officialTextSha256 + ":" + e.category);
      } catch (e) {
        const value = { taskId: t?.taskId, reason: e.message },
          key = B.hash(JSON.stringify(value));
        if (!state.blockedInputs[key])
          store.append("BLOCK_INPUT", { key, value });
      }
    }
    for (const value of selection.blocked || []) {
      const key = B.hash(JSON.stringify(B.canonical(value)));
      if (!state.blockedInputs[key])
        store.append("BLOCK_INPUT", { key, value });
    }
    store.compact();
    return { added, duplicates, ...summary(state) };
  } finally {
    store?.close();
    release();
  }
}
function receiptPath(dir, j) {
  return path.join(dir, "receipts", B.hash(j.jobId) + ".json");
}
function readReceipt(file, j, executionFingerprint) {
  if (!fs.existsSync(file)) return null;
  const e = JSON.parse(fs.readFileSync(file)),
    { checksum, ...body } = e;
  if (
    checksum !== B.hash(JSON.stringify(body)) ||
    e.jobId !== j.jobId ||
    e.taskFingerprint !== j.fingerprint ||
    e.executionFingerprint !== executionFingerprint ||
    e.attemptId !== j.attempt?.id ||
    !["SUCCEEDED", "FAILED", "BLOCKED"].includes(e.status)
  )
    throw Error("INVALID_QUEUE_RECEIPT");
  return e;
}
function workerClient(modulePath, timeout, dir) {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw Error("NODE_22_REQUIRED");
  let child, ready, version, pinned;
  function start() {
    child = fork(
      path.join(__dirname, "shared-effect-worker-entry.cjs"),
      [path.resolve(modulePath)],
      {
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        execArgv: [
          "--permission",
          "--allow-fs-read=" + process.cwd(),
          "--allow-fs-read=" + path.dirname(path.resolve(modulePath)),
          "--allow-fs-read=" + path.resolve(dir),
          "--allow-fs-write=" + path.resolve(dir),
        ],
        env: Object.fromEntries(
          ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "WINDIR"]
            .filter((k) => process.env[k] !== undefined)
            .map((k) => [k, process.env[k]]),
        ),
      },
    );
    let errors = "";
    child.stderr.on("data", (d) => {
      errors = (errors + d).slice(-4000);
    });
    ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(Error("WORKER_START_TIMEOUT"));
      }, timeout);
      const receive = (m) => {
        if (m.ready) {
          clearTimeout(timer);
          child.off("message", receive);
          version = m;
          resolve(m);
        } else if (m.startError) {
          clearTimeout(timer);
          reject(Error(m.startError));
        }
      };
      child.on("message", receive);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error("WORKER_START_EXIT:" + code + ":" + errors));
      });
    });
  }
  start();
  return {
    async version() {
      pinned = JSON.stringify(await ready);
      return JSON.parse(pinned);
    },
    async run(task, context) {
      if (!child || !child.connected || child.killed) {
        start();
      }
      if (JSON.stringify(await ready) !== pinned)
        throw Error("WORKER_CONTEXT_CHANGED");
      const current = child;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          current.kill("SIGKILL");
          cleanup();
          reject(Error("WORKER_TASK_TIMEOUT"));
        }, timeout);
        const done = (m) => {
          if (m.requestId === context.attemptId) {
            cleanup();
            m.error ? reject(Error(m.error)) : resolve(m.result);
          }
        };
        const exit = (code) => {
          cleanup();
          reject(Error("WORKER_EXIT:" + code));
        };
        function cleanup() {
          clearTimeout(timer);
          current.off("message", done);
          current.off("exit", exit);
        }
        current.on("message", done);
        current.once("exit", exit);
        current.send({ task, context });
      });
    },
    stop() {
      if (child && !child.killed) child.kill("SIGTERM");
    },
  };
}
async function run(
  dir,
  modulePath,
  {
    maxTasks = 100,
    timeoutMs = 120000,
    retryFailed = false,
    retryBlocked = false,
    recheck = false,
  } = {},
) {
  if (
    !Number.isInteger(maxTasks) ||
    maxTasks < 1 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 20
  )
    throw Error("INVALID_QUEUE_RUN_LIMIT");
  const release = lock(dir);
  let store,
    worker,
    stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    store = load(dir);
    worker = workerClient(modulePath, timeoutMs, dir);
    const ready = await worker.version();
    const revision = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).stdout.trim();
    const executionFingerprint = B.hash(
      JSON.stringify({
        worker: B.hash(fs.readFileSync(modulePath)),
        version: ready.version,
        context: ready.contextFingerprint || "",
        revision,
      }),
    );
    for (const j of Object.values(store.state.jobs))
      if (j.status === "RUNNING") {
        let receipt;
        try {
          receipt = readReceipt(receiptPath(dir, j), j, executionFingerprint);
        } catch (e) {
          store.append("FINISH", {
            jobId: j.jobId,
            status: "FAILED",
            receipt: null,
            summary: { reason: e.message },
          });
          continue;
        }
        if (receipt)
          store.append("FINISH", {
            jobId: j.jobId,
            status: receipt.status,
            receipt: path.relative(dir, receiptPath(dir, j)),
            summary: receipt.result,
          });
        else
          store.append("PENDING", {
            jobId: j.jobId,
            reason: "INTERRUPTED_IDEMPOTENT_WORK_RETRY",
          });
      }
    for (const j of Object.values(store.state.jobs))
      if (
        (retryFailed && j.status === "FAILED") ||
        (retryBlocked &&
          j.status === "BLOCKED" &&
          j.summary?.reason !== "PERSISTED_EVIDENCE_CONFLICT") ||
        (recheck &&
          j.status === "SUCCEEDED" &&
          j.attempt?.executionFingerprint !== executionFingerprint)
      )
        store.append("PENDING", {
          jobId: j.jobId,
          reason: "EXPLICIT_RECHECK_OR_RETRY",
        });
    const jobs = Object.values(store.state.jobs)
      .filter((j) => j.status === "PENDING")
      .sort(
        (a, b) =>
          a.priority.source - b.priority.source ||
          b.priority.prints - a.priority.prints ||
          a.jobId.localeCompare(b.jobId),
      );
    let processed = 0;
    for (const j of jobs) {
      if (stopping || processed >= maxTasks) break;
      B.validateTask(j.task);
      const attempt = { id: crypto.randomUUID(), executionFingerprint };
      store.append("START", { jobId: j.jobId, attempt });
      let result;
      try {
        result = await worker.run(j.task, {
          jobId: j.jobId,
          attemptId: attempt.id,
          idempotencyKey: B.hash(j.jobId + ":" + executionFingerprint),
          executionFingerprint,
          queueDirectory: path.resolve(dir),
        });
        if (
          !result ||
          !["SUCCEEDED", "BLOCKED", "FAILED"].includes(result.status)
        )
          throw Error("INVALID_WORKER_RESULT");
      } catch (e) {
        result = { status: "FAILED", reason: e.message };
      }
      const body = {
          jobId: j.jobId,
          taskFingerprint: j.fingerprint,
          executionFingerprint,
          attemptId: attempt.id,
          status: result.status,
          result,
        },
        receipt = { ...body, checksum: B.hash(JSON.stringify(body)) };
      B.atomic(receiptPath(dir, j), receipt);
      store.append("FINISH", {
        jobId: j.jobId,
        status: result.status,
        receipt: path.relative(dir, receiptPath(dir, j)),
        summary: result,
      });
      processed++;
    }
    store.compact();
    return {
      processed,
      stopped: stopping,
      executionFingerprint,
      staleSuccesses: Object.values(store.state.jobs).filter(
        (j) =>
          j.status === "SUCCEEDED" &&
          j.attempt?.executionFingerprint !== executionFingerprint,
      ).length,
      ...summary(store.state),
    };
  } catch (e) {
    B.atomic(path.join(dir, "last-run-error.json"), {
      status: "FAILED",
      reason: e.message,
      at: new Date().toISOString(),
      queue: store ? summary(store.state) : null,
    });
    throw e;
  } finally {
    worker?.stop();
    store?.close();
    release();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
function inspect(dir, { compact = false } = {}) {
  const release = lock(dir);
  let s;
  try {
    s = load(dir);
    if (compact) s.compact();
    return summary(s.state);
  } finally {
    s?.close();
    release();
  }
}
module.exports = {
  safeDirectory,
  lock,
  load,
  enqueue,
  run,
  inspect,
  summary,
  receiptPath,
};
