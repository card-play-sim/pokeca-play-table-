'use strict';
// CI runner emits a machine-readable failure even for an unstructured assertion.
// It never converts a failed test to success.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const test=process.argv[2];
if(!test||!/^tests\/[a-z0-9-]+\.test\.cjs$/.test(test))throw Error('INVALID_TEST_PATH');
const result=spawnSync(process.execPath,[test],{encoding:'utf8',maxBuffer:8*1024*1024});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
const code=result.status===null?1:result.status;
const stderr=String(result.error?.message||result.stderr||result.signal||'nonzero exit');
const codes=[...stderr.matchAll(/(?:UNCONNECTED_EFFECT|INVALID_REFERENCE_RNG_STATE|REFERENCE_[A-Z_]+|FIRST_PLAYER_FIRST_TURN_ATTACK|PWA_RELEASE_STALE|STALE_BUNDLE_MODULE|REFERENCE_PRINT_CONFLICT|INVALID_REFERENCE_CHOICE)/g)].map(x=>x[0]);
const causeId=result.error?'TEST_RUNNER_ERROR':result.signal?'TEST_TERMINATED':codes[0]||'TEST_ASSERTION_OR_RUNTIME_FAILURE';
const record=code===0?null:{causeId,command:'UNKNOWN',test,error:stderr.slice(0,400),exitCode:code};
// Tests may already emit precise, structured causes. Do not duplicate those
// records with a generic wrapper failure; preserve their source details.
const childHasStructuredFailure=String(result.stdout||'').split(/\r?\n/).concat(String(result.stderr||'').split(/\r?\n/)).some(x=>x.startsWith('REFERENCE_RUNTIME_FAILURE_JSON:'));
const effectiveCode=code===0&&childHasStructuredFailure?2:code;
const line=record&&!childHasStructuredFailure?'REFERENCE_RUNTIME_FAILURE_JSON:'+JSON.stringify(record)+'\n':'';
if(line)process.stdout.write(line);
const log=process.env.REFERENCE_RUNTIME_LOG||'reports/reference-effect-runtime.log';
fs.mkdirSync(path.dirname(path.resolve(log)),{recursive:true});
fs.appendFileSync(log,(result.stdout||'')+'\n'+(result.stderr||'')+'\n'+line);
process.exitCode=effectiveCode;
