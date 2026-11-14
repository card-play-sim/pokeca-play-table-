"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex"),
  norm = (s) => String(s).normalize("NFKC").replace(/\s+/g, " ").trim();
const fail = (ok, message) => {
  if (!ok) throw Error(message);
};
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .map((k) => [k, canonical(x[k])]),
    );
  return x;
}
const fingerprint = (t) =>
  hash(
    JSON.stringify(
      canonical({
        taskId: t.taskId,
        category: t.category,
        effectKind: t.effectKind,
        officialText: t.officialText,
        evidence: [...t.evidence].sort((a, b) =>
          slot(a).localeCompare(slot(b)),
        ),
      }),
    ),
  );
const slot = (e) =>
  [e.officialCardId, e.effectKind, e.effectName || "", e.effectIndex ?? 0].join(
    ":",
  );
function validateTask(t) {
  fail(
    t &&
      t.status === "CODEX_REVIEW_REQUIRED" &&
      Array.isArray(t.evidence) &&
      t.evidence.length &&
      Array.isArray(t.prints) &&
      t.prints.length,
    "INVALID_CODEX_TASK_EVIDENCE",
  );
  fail(
    typeof t.officialText === "string" &&
      t.officialText.trim() &&
      ["pokemon", "item", "supporter", "stadium", "tool", "energy"].includes(
        t.category,
      ) &&
      [
        "attack",
        "ability",
        "item",
        "supporter",
        "stadium",
        "tool",
        "energy",
        "rule",
      ].includes(t.effectKind),
    "INVALID_CODEX_TASK_CONTENT",
  );
  fail(
    t.normalizedTextHash === hash(norm(t.officialText)),
    "CODEX_TASK_TEXT_HASH_MISMATCH",
  );
  fail(
    t.taskId ===
      "OFFICIAL_SHARED_EFFECT_" +
        hash(t.category + ":" + t.effectKind + ":" + t.normalizedTextHash)
          .slice(0, 16)
          .toUpperCase(),
    "CODEX_TASK_ID_CONTENT_MISMATCH",
  );
  fail(
    new Set(t.prints).size === t.prints.length &&
      Array.isArray(t.acceptance) &&
      t.acceptance.every((a) => typeof a === "string"),
    "INVALID_CODEX_TASK_PRINT_COVERAGE",
  );
  const prints = new Set(t.prints),
    covered = new Set(),
    seen = new Set();
  for (const e of t.evidence) {
    fail(
      /^\d{4,8}$/.test(String(e.officialCardId)) &&
        prints.has(e.officialCardId),
      "INVALID_CODEX_PRINT_ID",
    );
    fail(
      typeof e.officialPageUrl === "string" &&
        new RegExp(
          "^https://www[.]pokemon-card[.]com/card-search/details[.]php/card/" +
            e.officialCardId +
            "(?:/|$)",
        ).test(e.officialPageUrl),
      "INVALID_CODEX_EVIDENCE_URL",
    );
    fail(
      typeof e.effectText === "string" &&
        hash(e.effectText) === e.officialTextSha256 &&
        norm(e.effectText) === norm(t.officialText) &&
        e.category === t.category &&
        e.effectKind === t.effectKind,
      "INVALID_CODEX_EVIDENCE_ROW",
    );
    fail(
      Number.isInteger(e.effectIndex ?? 0) && (e.effectIndex ?? 0) >= 0,
      "INVALID_EFFECT_INDEX",
    );
    fail(
      ["attack", "ability"].includes(e.effectKind)
        ? e.category === "pokemon"
        : e.effectKind === "rule" || e.effectKind === e.category,
      "EFFECT_KIND_CATEGORY_MISMATCH",
    );
    fail(!seen.has(slot(e)), "DUPLICATE_CODEX_EVIDENCE_SLOT:" + slot(e));
    seen.add(slot(e));
    covered.add(e.officialCardId);
  }
  fail(covered.size === prints.size, "INVALID_CODEX_TASK_PRINT_COVERAGE");
  return t;
}
function atomic(file, value) {
  const dest = path.resolve(file);
  let ancestor = path.dirname(dest),
    tail = [path.basename(dest)];
  while (!fs.existsSync(ancestor)) {
    tail.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  const actual = path.join(fs.realpathSync(ancestor), ...tail),
    rel = path.relative(fs.realpathSync(process.cwd()), actual);
  if (
    !rel.startsWith("..") &&
    !path.isAbsolute(rel) &&
    !["work", "reports", "artifacts", "test-results"].includes(
      rel.split(path.sep)[0],
    )
  )
    throw Error("PROTECTED_ARTIFACT_OUTPUT");
  if (fs.existsSync(dest) && fs.lstatSync(dest).isSymbolicLink())
    throw Error("SYMLINK_ARTIFACT_OUTPUT");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp =
    dest + ".tmp-" + process.pid + "-" + crypto.randomBytes(6).toString("hex");
  let fd;
  try {
    fd = fs.openSync(tmp, "wx");
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, dest);
    const dir = fs.openSync(path.dirname(dest), "r");
    try {
      fs.fsyncSync(dir);
    } finally {
      fs.closeSync(dir);
    }
  } finally {
    if (fd !== null && fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
function args(values) {
  const positional = [],
    options = {};
  for (let i = 0; i < values.length; i++) {
    const s = values[i];
    if (s === "--batch") {
      options.batch = true;
      continue;
    }
    if (s.startsWith("--")) {
      fail(
        ["--limit"].includes(s) && values[i + 1] !== undefined,
        "INVALID_BATCH_OPTION:" + s,
      );
      options[s.slice(2)] = values[++i];
    } else positional.push(s);
  }
  const limit = Number(options.limit ?? 100);
  fail(
    Number.isInteger(limit) && limit > 0 && limit <= 100000,
    "INVALID_BATCH_LIMIT",
  );
  return { positional, limit };
}
function classify(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    let text = norm(t.officialText),
      originalCondition = text.match(/^[^。]*?なら、/)?.[0],
      parameters = { numbers: [], targets: [], conditions: [] };
    text = text.replace(/[0-9]+/g, (n) => {
      parameters.numbers.push(n);
      return "{NUMBER}";
    });
    text = text.replace(
      /自分の|相手の|おたがいの|バトルポケモン|ベンチポケモン/g,
      (x) => {
        parameters.targets.push(x);
        return x.endsWith("の") ? "{OWNER}" : "{POSITION}";
      },
    );
    text = text.replace(/^[^。]*?なら、/, (c) => {
      parameters.conditions.push(originalCondition || c);
      return "{CONDITION}";
    });
    const key = hash(text),
      g = groups.get(key) || {
        candidateId: "REVIEW_FAMILY_" + key.slice(0, 20),
        skeleton: text,
        status: "REVIEW_REQUIRED",
        semanticEquivalenceConfirmed: false,
        members: [],
        categories: [],
      };
    g.members.push({
      taskId: t.taskId,
      category: t.category,
      effectKind: t.effectKind,
      parameters,
    });
    if (!g.categories.includes(t.category)) g.categories.push(t.category);
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.members.length > 1)
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}
function summarize(tasks, blocked = []) {
  const categories = {};
  const get = (c) =>
    (categories[c] ||= { tasks: 0, evidence: 0, prints: 0, blocked: 0 });
  const prints = new Map();
  for (const t of tasks) {
    const c = get(t.category);
    c.tasks++;
    c.evidence += t.evidence.length;
    const set = prints.get(t.category) || new Set();
    for (const p of t.prints) set.add(p);
    prints.set(t.category, set);
  }
  for (const [k, v] of prints) get(k).prints = v.size;
  for (const b of blocked) get(b.category || "unknown").blocked++;
  return categories;
}
function selectSources(sources, { selector = "AUTO", limit = 100 } = {}) {
  const blocked = [],
    candidates = [],
    seenIds = new Map(),
    conflicts = new Set(),
    slots = new Map();
  for (const [priority, source] of sources.entries()) {
    if (!fs.existsSync(source)) continue;
    let batch;
    try {
      batch = JSON.parse(fs.readFileSync(source));
      fail(
        batch.purpose === "OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH" &&
          Array.isArray(batch.tasks) &&
          ["READY_FOR_CODEX_REVIEW", "PARTIAL_BLOCKED"].includes(batch.status),
        "INVALID_TASK_SOURCE",
      );
    } catch (e) {
      blocked.push({ source, reason: e.message });
      continue;
    }
    const byId = new Map();
    for (const t of batch.tasks) {
      if (!t || typeof t !== "object") continue;
      if (byId.has(t.taskId)) {
        conflicts.add(t.taskId);
        blocked.push({
          source,
          taskId: t.taskId,
          reason: "DUPLICATE_TASK_ID_IN_SOURCE",
        });
      }
      byId.set(t.taskId, t);
    }
    for (const t of batch.tasks) {
      try {
        validateTask(t);
        const quarantine = (batch.blocked || []).filter(
          (b) =>
            !(b.reasons || []).every((r) => r === "DUPLICATE_EFFECT_EVIDENCE"),
        );
        const evidence = t.evidence.filter(
          (e) =>
            !quarantine.some(
              (b) =>
                b.officialCardId === e.officialCardId &&
                (!b.effectKind || b.effectKind === e.effectKind) &&
                (b.effectName === undefined || b.effectName === e.effectName) &&
                (b.effectIndex === undefined ||
                  b.effectIndex === (e.effectIndex ?? 0)),
            ),
        );
        if (!evidence.length) throw Error("QUARANTINED_SOURCE_EVIDENCE");
        const safe = {
          ...t,
          evidence,
          prints: [...new Set(evidence.map((e) => e.officialCardId))],
        };
        validateTask(safe);
        for (const e of safe.evidence) {
          const prior = slots.get(slot(e));
          if (prior && prior.sha !== e.officialTextSha256 + ":" + e.category) {
            conflicts.add(safe.taskId);
            for (const id of prior.ids) conflicts.add(id);
            blocked.push({
              source,
              taskId: safe.taskId,
              reason: "CROSS_SOURCE_EFFECT_CONFLICT",
              slot: slot(e),
            });
          }
          if (prior) prior.ids.add(safe.taskId);
          else
            slots.set(slot(e), {
              sha: e.officialTextSha256 + ":" + e.category,
              ids: new Set([safe.taskId]),
            });
        }
        const prior = seenIds.get(safe.taskId);
        if (
          prior &&
          (prior.normalizedTextHash !== safe.normalizedTextHash ||
            prior.category !== safe.category ||
            prior.effectKind !== safe.effectKind ||
            prior.officialText !== safe.officialText)
        ) {
          conflicts.add(safe.taskId);
          throw Error("TASK_ID_SOURCE_COLLISION");
        }
        if (!prior) {
          const candidate = { ...safe, source, sourcePriority: priority };
          seenIds.set(safe.taskId, candidate);
          candidates.push(candidate);
        } else {
          const existing = new Set(prior.evidence.map(slot));
          for (const evidence of safe.evidence)
            if (!existing.has(slot(evidence))) {
              prior.evidence.push(evidence);
              existing.add(slot(evidence));
            }
          prior.prints = [
            ...new Set(prior.evidence.map((e) => e.officialCardId)),
          ];
          validateTask(prior);
        }
      } catch (e) {
        blocked.push({
          source,
          taskId: t?.taskId,
          category: t?.category,
          reason: e.message,
        });
      }
    }
    blocked.push(
      ...(batch.blocked || []).map((b) => ({
        ...b,
        source,
        reason: (b.reasons || []).join("|") || b.reason || "SOURCE_BLOCKED",
      })),
    );
  }
  const requested = selector === "AUTO" ? null : new Set(selector.split(","));
  const eligible = candidates
      .filter(
        (t) =>
          !conflicts.has(t.taskId) && (!requested || requested.has(t.taskId)),
      )
      .sort(
        (a, b) =>
          a.sourcePriority - b.sourcePriority ||
          b.prints.length - a.prints.length ||
          a.taskId.localeCompare(b.taskId),
      ),
    tasks = eligible.slice(0, limit),
    deferred = eligible.slice(limit);
  if (requested)
    for (const id of requested)
      if (!eligible.some((t) => t.taskId === id))
        blocked.push({ taskId: id, reason: "REQUESTED_TASK_NOT_SELECTED" });
  return {
    schemaVersion: 1,
    purpose: "OFFICIAL_EFFECT_BATCH_SELECTION",
    selectionPolicy: "SOURCE_PRIORITY_THEN_PRINT_COVERAGE",
    semanticPolicy: "EXACT_TASKS_ONLY_CANDIDATE_FAMILIES_REQUIRE_REVIEW",
    tasks,
    deferred,
    blocked,
    counts: {
      selected: tasks.length,
      deferred: deferred.length,
      eligible: eligible.length,
      blocked: blocked.length,
    },
    categories: summarize(tasks, blocked),
    candidateFamilies: classify(eligible),
  };
}
function chooseCLI(argv) {
  const {
    positional: [selector, out, ...sources],
    limit,
  } = args(argv);
  fail(selector && out && sources.length, "TASK_SOURCE_ARGS_REQUIRED");
  fail(
    sources.every((s) => path.resolve(s) !== path.resolve(out)),
    "INPUT_OUTPUT_MUST_DIFFER",
  );
  const result = selectSources(sources, { selector, limit });
  atomic(out, result);
  console.log(
    JSON.stringify({
      selected: result.tasks.length,
      blocked: result.blocked.length,
      output: out,
    }),
  );
  if (!result.tasks.length) process.exitCode = 2;
}
function selectCLI(argv) {
  const {
    positional: [input, selector, out],
    limit,
  } = args(argv);
  fail(
    input && selector && out && path.resolve(input) !== path.resolve(out),
    "BATCH_SELECTION_ARGS_REQUIRED",
  );
  const data = JSON.parse(fs.readFileSync(input));
  let selected;
  if (data.purpose === "OFFICIAL_EFFECT_BATCH_SELECTION") {
    const valid = [],
      blocked = [...(data.blocked || [])];
    for (const t of [...(data.tasks || []), ...(data.deferred || [])])
      try {
        validateTask(t);
        if (selector === "AUTO" || selector.split(",").includes(t.taskId))
          valid.push(t);
      } catch (e) {
        blocked.push({ taskId: t?.taskId, reason: e.message });
      }
    selected = {
      ...data,
      tasks: valid.slice(0, limit),
      deferred: valid.slice(limit),
      blocked,
    };
  } else selected = selectSources([input], { selector, limit });
  selected.counts = {
    selected: selected.tasks.length,
    deferred: selected.deferred?.length || 0,
    eligible: selected.tasks.length + (selected.deferred?.length || 0),
    blocked: selected.blocked.length,
  };
  selected.categories = summarize(selected.tasks, selected.blocked);
  atomic(out, selected);
  console.log(JSON.stringify(selected.counts));
  if (!selected.tasks.length) process.exitCode = 2;
}
module.exports = {
  hash,
  norm,
  canonical,
  fingerprint,
  slot,
  validateTask,
  atomic,
  classify,
  summarize,
  selectSources,
  chooseCLI,
  selectCLI,
};
