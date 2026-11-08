#!/usr/bin/env node
// Import verified official image references; no discovery or guessed URLs.
// Usage: node tools/import-image-registry.mjs verified-input.json [output-directory]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const rules=require('../ui/official-image-validation.js');

const [input, output = 'data/image-registry-import'] = process.argv.slice(2);
if (!input) { console.error('Usage: node tools/import-image-registry.mjs verified-input.json [output-directory]'); process.exit(2); }
const valid=x=>{try{rules.validate(x);return true;}catch{return false;}};
function atomicWrite(filename, value) {
  const tmp = filename + '.tmp-' + process.pid;
  const fd=fs.openSync(tmp,'wx');
  try{fs.writeFileSync(fd,value);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.renameSync(tmp,filename);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  if(fs.readFileSync(filename,'utf8')!==value)throw Error('READBACK_FAILED');
}
const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const records = Array.isArray(raw) ? raw : raw.cards;
if (!Array.isArray(records)) throw Error('INPUT_CARDS_ARRAY_REQUIRED');
fs.mkdirSync(output, { recursive: true });
const recordDir = path.join(output, 'records');
const quarantineDir = path.join(output, 'quarantine');
fs.mkdirSync(recordDir, { recursive: true });
fs.mkdirSync(quarantineDir, { recursive: true });
const lock=path.join(output,'.lock');fs.mkdirSync(lock);
try{
let added = 0, unchanged = 0, conflicts = 0, invalid = 0, enriched = 0;
for (let index = 0; index < records.length; index++) {
  const item = records[index];
  if (!valid(item)) {
    invalid++;
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0,16);
    atomicWrite(path.join(quarantineDir, 'invalid-' + index + '-' + fingerprint + '.json'), JSON.stringify({index,reason:'INVALID_VERIFIED_REFERENCE',record:item},null,2) + '\n');
    continue;
  } // invalid records are never accepted
  const id = String(item.officialCardId);
  const canonical=rules.validate(item);
  let serialized=JSON.stringify(canonical)+'\n';
  const target = path.join(recordDir, id + '.json');
  if (fs.existsSync(target)) {
    const original=JSON.parse(fs.readFileSync(target,'utf8'));
    try{
      const merged=rules.merge(original,canonical);
      serialized=JSON.stringify(merged)+'\n';
      if(JSON.stringify(original)===JSON.stringify(merged)){unchanged++;continue;}
      atomicWrite(target,serialized);enriched++;continue;
    }catch(error){
      if(!String(error.message).startsWith('IMAGE_REGISTRY_CONFLICT'))throw error;
      conflicts++;
      const fingerprint=crypto.createHash('sha256').update(serialized).digest('hex').slice(0,16);
      atomicWrite(path.join(quarantineDir,id+'-'+fingerprint+'.json'),serialized);continue;
    }
  }
  atomicWrite(target, serialized); // persist each verified record before processing next
  if (fs.readFileSync(target, 'utf8') !== serialized) throw Error('READBACK_FAILED_' + id);
  added++;
}
const files = fs.readdirSync(recordDir).filter(f=>/^\d+\.json$/.test(f)).sort((a,b)=>Number(a.slice(0,-5))-Number(b.slice(0,-5)));
const cards = files.map(f=>rules.validate(JSON.parse(fs.readFileSync(path.join(recordDir,f),'utf8'))));
atomicWrite(path.join(output,'official-image-registry.json'),JSON.stringify({schemaVersion:1,source:'verified-card-art',cards},null,2)+'\n');
const summary={input:records.length,stored:cards.length,added,enriched,unchanged,conflicts,invalid,success:conflicts===0&&invalid===0};
atomicWrite(path.join(output,'import-report.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if (!summary.success) process.exitCode=1;

}finally{fs.rmdirSync(lock);}
