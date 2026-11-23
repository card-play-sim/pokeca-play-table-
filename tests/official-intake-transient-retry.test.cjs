"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {spawnSync} = require("node:child_process");
const {commands} = require("../scripts/run-atomic-official-battle-intake.cjs");

const source = fs.readFileSync("scripts/continue-official-effect-intake.py","utf8");
const parsed = spawnSync("python",["-c","import ast,sys; ast.parse(sys.stdin.read())"],{input:source,encoding:"utf8"});
assert.equal(parsed.status,0,parsed.stderr);
assert.match(source,/--retry-transient/);
assert.match(source,/state\.get\('reason'\)=='COLLECTOR_EXCEPTION'/);
assert.match(source,/state\.get\('attempts',1\)<2/);
assert.match(source,/old\.get\('attempts',0\)\+1/);
assert.match(source,/fcntl\.LOCK_EX\|fcntl\.LOCK_NB/);

const workflow=fs.readFileSync(".github/workflows/continue-official-effects.yml","utf8");
assert.match(workflow,/node scripts\/run-atomic-official-battle-intake\.cjs/,
  "workflow must use the integrated official-to-battle entrypoint");
const steps=commands({base:"a".repeat(40),limit:400});
const intake=steps.find(([name])=>name==="FETCH_PARSE_AND_COMPILE_WITH_SHARED_ENGINE");
assert(intake,"atomic workflow must retain verified official intake");
assert.equal(intake[1],"python");
assert.equal(intake[2][0],"scripts/continue-official-effect-intake.py");
assert(intake[2].includes("--retry-transient"),"bounded transient retry must be enabled");
assert(intake[2].includes("--adopt"),"intake must feed the compiled battle pipeline");
assert.equal(intake[2][intake[2].indexOf("--limit")+1],"400");
assert(steps.some(([name])=>name==="EXECUTE_ALL_CARD_EFFECTS_IN_REAL_ENGINE"),
  "intake must proceed to actual battle verification");
console.log("Bounded transient intake retry and atomic battle pipeline regression PASS");
