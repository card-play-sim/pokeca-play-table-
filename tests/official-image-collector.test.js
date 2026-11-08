'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseDetail,collect}=require('../scripts/collect-official-image-evidence.cjs');
const name='ドロンチ',id='45771';
const image='https://www.pokemon-card.com/assets/images/card_images/large/SV6/045771_P_DORONCHI.jpg';
const html=(n=name,u=image,num='066/101',set='SV6')=>`<html><h1 class="Heading1 mt20">${n}</h1><div class="LeftBox"><img class="fit" src="${u}"><div class="subtext"><img class="img-regulation" alt="${set}">${num}</div></div></html>`;
assert.equal(parseDetail(html(),id,name).imageSourceUrl,image);
assert.equal(parseDetail(html(),'45772',name).status,'HOLD');
assert.equal(parseDetail(html('別カード'),id,name).status,'HOLD');
assert.equal(parseDetail(html(name,image.replace('https://www.pokemon-card.com','')),id,name).status,'CANDIDATE');
assert.equal(parseDetail(html()+html(),id,name).status,'HOLD');
assert.equal(parseDetail(html(),id,name,{set:'OTHER',cardNumber:'066/101'}).reason,'PRINT_MISMATCH');
assert.equal(parseDetail(html(),id,name,{set:'SV6',cardNumber:'067/101'}).reason,'PRINT_MISMATCH');
assert.equal(parseDetail(`<html>${name}<script>${image}</script></html>`,id,name).status,'HOLD');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-image-'));
 try{
 const candidate={officialCardId:id,name,set:'SV6',cardNumber:'066/101'};
 let calls=0;const fetcher=async()=>{calls++;return {ok:true,status:200,headers:{get:()=> 'text/html'},text:async()=>html()};};
 const first=await collect([candidate],fetcher,{state:root,interval:0});
 assert.equal(first.cards.length,1);assert.equal(first.cards[0].verified,false);assert.equal(first.cards[0].deckPrintAdopted,false);
 const second=await collect([candidate],fetcher,{state:root,interval:0});
 assert.equal(second.resumed,1);assert.equal(calls,1);
 await assert.rejects(collect([candidate,{...candidate,name:'other'}],fetcher,{interval:0}),/CONFLICT/);
 const error=await collect([candidate,{...candidate,officialCardId:'45772'}],async()=>({ok:false,status:403,headers:{get:()=> 'text/html'}}),{interval:0});
 assert.equal(error.requestsAttempted,1);assert.equal(error.holds[1].reason,'SAFE_STOP');
 const file=path.join(root,id+'.json'),saved=JSON.parse(fs.readFileSync(file));saved.record.imageSourceUrl='https://evil.invalid/a.jpg';fs.writeFileSync(file,JSON.stringify(saved));
 await assert.rejects(collect([candidate],fetcher,{state:root,interval:0}),/CHECKPOINT_CONFLICT/);
 console.log('PASS collector: exact ID/name/print, observed URL only, atomic readback, resume, collision and 403 stop');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
