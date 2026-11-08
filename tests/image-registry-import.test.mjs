import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-images-'));
try {
 const input=path.join(root,'input.json'), out=path.join(root,'out');
 const cards=Array.from({length:5001},(_,i)=>({officialCardId:String(60000+i),name:'検査'+i,imageSourceUrl:'https://www.pokemon-card.com/assets/images/card_images/large/TEST/'+(60000+i)+'.jpg'}));
 fs.writeFileSync(input,JSON.stringify({cards}));
 const run=()=>spawnSync(process.execPath,['tools/import-image-registry.mjs',input,out],{encoding:'utf8'});
 let a=run(); assert.equal(a.status,0,a.stderr);
 let report=JSON.parse(fs.readFileSync(path.join(out,'import-report.json')));
 assert.equal(report.stored,5001); assert.equal(report.added,5001);
 a=run(); assert.equal(a.status,0,a.stderr);
 report=JSON.parse(fs.readFileSync(path.join(out,'import-report.json')));
 assert.equal(report.unchanged,5001); assert.equal(report.added,0);
 cards[0].name='conflicting';fs.writeFileSync(input,JSON.stringify({cards}));
 a=run();assert.equal(a.status,1,'conflict must fail');report=JSON.parse(fs.readFileSync(path.join(out,'import-report.json')));
 assert.equal(report.conflicts,1);assert.equal(report.stored,5001);
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'records','60000.json'))).name,'検査0');
 console.log('PASS: 5001 synthetic records, idempotent rerun, conflict quarantine');
} finally {fs.rmSync(root,{recursive:true,force:true});}
