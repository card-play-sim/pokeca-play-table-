'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const rules=require('../ui/official-image-validation.js');
const {mergeReviewed}=require('../scripts/merge-official-images.cjs');
const {importEvidence,fromCollectorStaging}=require('../scripts/import-verified-image-evidence.cjs');
const {audit}=require('../scripts/check-fixed-120-images.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const registry=read('data/official-image-registry.json'),decks=read('data/fixed-test-decks.json');
const before=JSON.stringify(registry),deckBefore=JSON.stringify(decks);
const original=read('tests/fixtures/original-27-image-registry.json');
assert.equal(original.cards.length,27);
const {preserved}=require('../scripts/automate-official-images.cjs');
for(const card of original.cards)assert(preserved(card,registry.cards.find(r=>r.officialCardId===card.officialCardId)),'original 27-print evidence preserved');
assert.deepEqual(mergeReviewed(registry,{cards:[]}).registry,registry,'all 27 records and every evidence field survive empty merge');
const replay={cards:registry.cards.map(c=>({...c,officialPageUrl:c.officialPageUrl||'https://www.pokemon-card.com/card-search/details.php/card/'+c.officialCardId,verified:true}))};
const replayDecks={decks:[{cards:registry.cards.map(c=>({name:c.name,count:1}))}]};
const imported=importEvidence(replay,registry,replayDecks);
assert.equal(imported.added,0);assert.equal(imported.registry.cards.length,registry.cards.length);
for(const old of registry.cards){const result=imported.registry.cards.find(c=>c.officialCardId===old.officialCardId);for(const key of Object.keys(old))assert.deepEqual(result[key],old[key]);}
assert.equal(JSON.stringify(registry),before);assert.equal(JSON.stringify(decks),deckBefore);
const base={officialCardId:'1',name:'TEST',set:'A',cardNumber:'001/100',imageSourceUrl:'https://www.pokemon-card.com/assets/images/card_images/large/A/000001_P_TEST.jpg',officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/1',verified:true,evidence:{detailSha256:'a'.repeat(64)}};
const small={cards:[base]},smallDeck={decks:[{cards:[{name:'TEST',count:1}]}]};
for(const change of [{name:'OTHER'},{set:'B'},{cardNumber:'002/100'},{imageSourceUrl:base.imageSourceUrl.replace('TEST.jpg','OTHER.jpg')},{evidence:{detailSha256:'b'.repeat(64)}}]){
 assert.throws(()=>mergeReviewed(small,{cards:[{...base,...change}]}),/CONFLICT/);
 const d={decks:[{cards:[{name:'TEST',count:1},{name:'OTHER',count:1}]}]};
 assert.throws(()=>importEvidence({cards:[{...base,...change}]},small,d),/CONFLICT/);
}
for(const url of ['https://example.com/x.jpg','https://www.pokemon-card.com/assets/images/card_images/large/A/../x.jpg',base.imageSourceUrl+'?x=1']){
 assert.throws(()=>rules.validate({...base,imageSourceUrl:url}),/INVALID_URL/);
 assert.throws(()=>mergeReviewed(small,{cards:[{...base,imageSourceUrl:url}]}),/INVALID_URL/);
 assert.throws(()=>importEvidence({cards:[{...base,imageSourceUrl:url}]},small,smallDeck),/INVALID_URL/);
}
assert.throws(()=>rules.validate({...base,officialPageUrl:base.officialPageUrl+'2'}),/PAGE_ID_MISMATCH/);
assert.throws(()=>rules.validate({...base,setCode:'B'}),/CONFLICT/);
assert.deepEqual(mergeReviewed(small,{cards:[{...base,evidence:{imageReferenceSha256:'b'.repeat(64)}}]}).registry.cards[0].evidence,{detailSha256:'a'.repeat(64),imageReferenceSha256:'b'.repeat(64)});
const ctx={window:{}};
for(const file of ['ui/official-image-validation.js','ui/card-image-resolver.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),ctx);
const r=ctx.window.PokecaImageResolver;r.register({'1':base});
assert.equal(r.resolve(base),base.imageSourceUrl);
for(const change of [{set:'B'},{cardNumber:'002/100'},{imageSourceUrl:base.imageSourceUrl.replace('TEST.jpg','OTHER.jpg')},{catalogCardId:'2'}])assert.equal(r.resolve({...base,...change}),'');
assert.equal(r.resolvePreview({name:'TEST',set:'B'}),'');
assert.equal(r.resolvePreview({name:'TEST',cardNumber:'002/100'}),'');
assert.equal(r.resolvePreview({name:'TEST',set:'A',cardNumber:'001/100'}),base.imageSourceUrl);
assert.equal(r.resolvePreview({name:'TEST',officialCardId:'999'}),'');
assert.equal(r.resolve({name:'BASIC',evolutionCards:[base]}),base.imageSourceUrl);
assert.throws(()=>r.register({'2':{...base,officialCardId:'2',officialPageUrl:undefined},'3':{...base,officialCardId:'3',officialPageUrl:undefined,imageSourceUrl:'bad'}}),/INVALID_URL/);
assert.equal(r.count(),1);
assert.throws(()=>r.register({'1':{...base,set:'B'}}),/CONFLICT/);
assert.equal(r.resolve(base),base.imageSourceUrl);
const mobile=fs.readFileSync('ui/mobile.js','utf8');
const start=mobile.indexOf('  function imageURL(card){'),end=mobile.indexOf('  function fallbackArt(',start);
const imageURL=vm.runInNewContext('('+mobile.slice(start,end).trim()+')',ctx);
const artStart=mobile.indexOf('  function cardArt(card){'),artEnd=mobile.indexOf('    // Image hosts',artStart);
ctx.imageURL=imageURL;ctx.energyArt=()=> 'data:image/svg+xml,original';ctx.esc=x=>String(x);ctx.fixedDeckPlaceholder=()=> 'placeholder';
const art=vm.runInNewContext('('+mobile.slice(artStart,artEnd).trim()+')',ctx);
assert(!art({...base,kind:'energy',energyType:'水',set:'B'}).includes('046118'),'identified energy never substitutes the fixed water print');
assert(art({...base,kind:'energy',energyType:'水'}).includes(base.imageSourceUrl),'identified energy uses the exact registry image');
// Build synthetic complete fixed decks without altering the real, unidentified decks.
const cards=Array.from({length:45},(_,i)=>({...base,officialCardId:String(i+1),name:'TEST'+i,officialPageUrl:undefined,count:1,identityStatus:'CONFIRMED'}));
const complete={decks:[{cards:cards.slice(0,30).map(c=>({...c,count:2}))},{cards:cards.slice(30).map(c=>({...c,count:4}))}]};
const fullRegistry={cards:cards.map(({count,identityStatus,...c})=>c)};
assert.equal(audit(complete,fullRegistry).pass,true,'static success is reachable');
assert.equal(audit(complete,fullRegistry).productionPass,false,'static success is never display success');
for(const change of [{set:'B'},{cardNumber:'OTHER'},{imageSourceUrl:base.imageSourceUrl.replace('TEST.jpg','OTHER.jpg')},{identityStatus:'UNCONFIRMED'}]){
 const bad=structuredClone(complete);Object.assign(bad.decks[0].cards[0],change);assert.equal(audit(bad,fullRegistry).pass,false);
}
assert.equal(audit(decks,registry).pass,false);
const cli=spawnSync(process.execPath,['scripts/check-fixed-120-images.cjs'],{encoding:'utf8'});
assert.equal(cli.status,1);assert.equal(JSON.parse(cli.stdout).imageDisplayStatus,'NOT_VERIFIED');
const staging={records:[{officialCardId:'1',cardName:'TEST',imageUrl:base.imageSourceUrl,officialPageUrl:base.officialPageUrl,set:'A',cardNumber:'001/100',reviewStatus:'APPROVED',evidence:{officialDetailVerified:true,imageUrlVerified:true,detailSha256:'a'.repeat(64),imageReferenceSha256:'b'.repeat(64)}}]};
const staged=fromCollectorStaging(staging).cards[0];assert.deepEqual(staged.evidence,staging.records[0].evidence);assert.equal(staged.set,'A');assert.equal(staged.cardNumber,'001/100');
console.log('PASS shared image foundation: 27-record preservation, print/evidence conflicts, atomic rejection, resolver safety, static/display separation');
