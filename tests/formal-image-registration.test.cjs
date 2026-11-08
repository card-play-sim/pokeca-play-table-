'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {register}=require('../scripts/register-formal-image-candidates.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'formal-reference-test-'));
try{
 fs.mkdirSync(path.join(root,'data/formal-1945-reconciliation'),{recursive:true});
 for(const [src,dest] of [['tests/fixtures/original-27-image-registry.json','data/official-image-registry.json'],['data/fixed-test-decks.json','data/fixed-test-decks.json'],['data/formal-1945-reconciliation/candidate-evidence.json','data/formal-1945-reconciliation/candidate-evidence.json']])fs.copyFileSync(src,path.join(root,dest));
 const first=register({root});assert.equal(first.candidatePrints,57);assert.equal(first.added,40);assert.equal(first.deckPrintsAdopted,0);assert.equal(first.productionPass,false);
 const file=path.join(root,'data/official-image-registry.json'),bytes=fs.readFileSync(file);
 const second=register({root});assert.equal(second.added,0);assert.deepEqual(fs.readFileSync(file),bytes);
 assert.equal(fs.readdirSync(path.join(root,'data/image-automation/formal-1945-receipts')).length,57);
 const input=path.join(root,'data/formal-1945-reconciliation/candidate-evidence.json'),evidence=JSON.parse(fs.readFileSync(input));
 evidence.cards[0].set='CONFLICT';fs.writeFileSync(input,JSON.stringify(evidence));
 assert.throws(()=>register({root}),/CONFLICT/);assert.deepEqual(fs.readFileSync(file),bytes);
 // The additional references must replay their saved official HTML before writing.
 fs.copyFileSync('data/formal-1945-reconciliation/additional-candidate-evidence.json',path.join(root,'data/formal-1945-reconciliation/additional-candidate-evidence.json'));
 const extra=JSON.parse(fs.readFileSync('data/formal-1945-reconciliation/additional-candidate-evidence.json'));
 for(const c of extra.cards){const src=c.officialDetailEvidence.path,dest=path.join(root,src);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
 const current=JSON.parse(fs.readFileSync(file));const known=new Set(current.cards.map(c=>c.officialCardId));const expectedAdded=extra.cards.filter(c=>!known.has(c.officialCardId)).length;
 const third=register({root,evidenceFile:'data/formal-1945-reconciliation/additional-candidate-evidence.json'});assert.equal(third.added,expectedAdded);
 const finalBytes=fs.readFileSync(file),proof=path.join(root,extra.cards[0].officialDetailEvidence.path);fs.appendFileSync(proof,' ');
 assert.throws(()=>register({root,evidenceFile:'data/formal-1945-reconciliation/additional-candidate-evidence.json'}),/CHECKPOINT_CHANGED/);assert.deepEqual(fs.readFileSync(file),finalBytes);
 const lock=path.join(root,'data/image-automation/.lock');fs.mkdirSync(lock);assert.throws(()=>register({root}),/LOCKED/);fs.rmdirSync(lock);
 console.log('PASS formal reference importer: 57 one-record readbacks, preserved 27-print baseline, idempotent resume, print conflict rejection; no deck adoption');
}finally{fs.rmSync(root,{recursive:true,force:true});}
