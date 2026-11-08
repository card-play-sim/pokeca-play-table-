import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-verified-'));
try {
 const output=path.join(temp,'registry');
 const source='data/official-image-registry.json';
 const raw=JSON.parse(fs.readFileSync(source,'utf8'));
 const expected=raw.cards.length;
 const run=()=>spawnSync(process.execPath,['tools/import-image-registry.mjs',source,output],{encoding:'utf8'});
 let result=run(); assert.equal(result.status,0,result.stderr);
 let report=JSON.parse(fs.readFileSync(path.join(output,'import-report.json')));
 assert.equal(report.stored,expected);
 assert.equal(report.added,expected);
 const registry=JSON.parse(fs.readFileSync(path.join(output,'official-image-registry.json')));
 assert.equal(registry.cards.length,expected);
 for(const original of raw.cards){const saved=registry.cards.find(c=>c.officialCardId===original.officialCardId);assert.deepEqual(saved,original,'all existing print metadata and evidence must survive import');}
 result=run(); assert.equal(result.status,0,result.stderr);
 report=JSON.parse(fs.readFileSync(path.join(output,'import-report.json')));
 assert.equal(report.unchanged,expected);
 assert.equal(report.added,0);
 console.log('PASS: existing verified image registry imported, '+expected+' records, idempotent rerun');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
