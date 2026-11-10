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
const record=code===0?null:{causeId:result.error?'TEST_RUNNER_ERROR':result.signal?'TEST_TERMINATED':'TEST_ASSERTION_OR_RUNTIME_FAILURE',command:'UNKNOWN',test,error:String(result.error?.message||result.stderr||result.signal||'nonzero exit').slice(0,400),exitCode:code};
const line=record?'REFERENCE_RUNTIME_FAILURE_JSON:'+JSON.stringify(record)+'\n':'';
if(line)process.stdout.write(line);
const log=process.env.REFERENCE_RUNTIME_LOG||'reports/reference-effect-runtime.log';
fs.mkdirSync(path.dirname(path.resolve(log)),{recursive:true});
fs.appendFileSync(log,(result.stdout||'')+'\n'+(result.stderr||'')+'\n'+line);
process.exitCode=code;
