import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-bad-image-'));
try {
 const source=path.join(dir,'source.json'), out=path.join(dir,'out');
 const good={officialCardId:'45159',name:'ワニノコ',imageSourceUrl:'https://www.pokemon-card.com/assets/images/card_images/large/SV5K/045159_P_WANINOKO.jpg'};
 const invalid={officialCardId:'45160',name:'UNKNOWN',imageSourceUrl:'https://example.org/not-official.jpg'};
 fs.writeFileSync(source,JSON.stringify({cards:[good,invalid]}));
 const run=()=>spawnSync(process.execPath,['tools/import-image-registry.mjs',source,out],{encoding:'utf8'});
 let p=run();assert.equal(p.status,1,p.stderr);
 let report=JSON.parse(fs.readFileSync(path.join(out,'import-report.json')));
 assert.equal(report.stored,1);assert.equal(report.invalid,1);
 assert.equal(fs.readdirSync(path.join(out,'quarantine')).length,1);
 const before=fs.readFileSync(path.join(out,'records','45159.json'),'utf8');
 p=run();assert.equal(p.status,1,p.stderr);
 assert.equal(fs.readFileSync(path.join(out,'records','45159.json'),'utf8'),before);
 assert.equal(fs.readdirSync(path.join(out,'quarantine')).length,1);
 fs.writeFileSync(source,JSON.stringify({cards:[good]}));
 p=run();assert.equal(p.status,0,p.stderr);
 report=JSON.parse(fs.readFileSync(path.join(out,'import-report.json')));
 assert.equal(report.unchanged,1);assert.equal(report.invalid,0);
 console.log('PASS: invalid URL quarantine, deterministic retry, preserved valid record, recovery');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
