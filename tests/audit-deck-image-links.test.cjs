'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deck-image-link-audit-'));
const script=path.resolve(__dirname,'../scripts/audit-deck-image-links.cjs');
const decks=path.join(dir,'decks.json'),images=path.join(dir,'images.json'),report=path.join(dir,'report.json');
const make=(id,status='CONFIRMED')=>({name:'カードA',count:2,officialCardId:id,identityStatus:status});
function run(cards,registry,expected=0){fs.writeFileSync(decks,JSON.stringify({decks:[{id:'test',cards}]}));fs.writeFileSync(images,JSON.stringify({imageByOfficialCardId:registry}));const p=cp.spawnSync(process.execPath,[script,decks,images,report],{encoding:'utf8'});assert.equal(p.status,expected,p.stderr+p.stdout);return JSON.parse(fs.readFileSync(report));}
try{
 let r=run([make(null,'UNCONFIRMED'),make('48248'),make('48249')],{'48248':{officialCardId:'48248',name:'カードA'}});
 assert.deepEqual(r.counts,{deckSlots:3,cardCopies:6,confirmed:1,unconfirmed:1,missingImage:1,conflicting:0});
 r=run([make('48248')],{'48248':{officialCardId:'48248',name:'別カード'}},2);
 assert.equal(r.rows[0].reason,'NAME_MISMATCH_REQUIRES_REVIEW');
 r=run([make('48248','UNCONFIRMED')],{'48248':{officialCardId:'48248',name:'カードA'}});
 assert.equal(r.counts.confirmed,0,'UNAPPROVED_ID_MUST_NOT_BE_ADOPTED');
 console.log('DECK_IMAGE_LINK_AUDIT PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
