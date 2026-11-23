'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const script=fs.readFileSync('ui/pwa-recovery.js','utf8');
const worker=fs.readFileSync('sw.js','utf8');
const build=worker.match(/^const BUILD="(\d+)";$/m)?.[1];
const release=worker.match(/^const CACHE='([^']+)';$/m)?.[1];
assert(build&&release,'current release must be machine-readable');
const old='pokeca-first-playable-v'+build+'-0000000000000000';
assert.notEqual(old,release);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function test(){
 let active=old,updating=0,replaced=null,fetchChecked=false;
 const progress={textContent:''},button={disabled:false,onclick:null};
 class Channel{
  constructor(){this.port1={onmessage:null,close(){}};this.port2={receiver:this.port1};}
 }
 const registration={
  waiting:null,installing:null,
  active:{postMessage(data,ports){if(data.type==='RELEASE_INFO'){
   queueMicrotask(()=>ports[0].receiver.onmessage?.({data:{
    build,cacheName:active,files:{
     ['./data/effect-extensions/compiled.json']:'sha',
     ['./ui/saved-decks.js?build='+build]:'sha'
    }
   }}));
  }}},
  async update(){updating++;}
 };
 const context={window:{},document:{
  querySelector:()=>({content:build}),
  getElementById:id=>id==='update-progress'?progress:button
 },isSecureContext:true,navigator:{onLine:true,serviceWorker:{
  register:async()=>registration
 }},MessageChannel:Channel,
 location:{replace:url=>{replaced=url;}},Date,Number,Error,Promise,encodeURIComponent,
 setTimeout,clearTimeout,
 fetch:async (url,options)=>{assert.match(url,/^\.\/sw\.js\?recovery-check=/);assert.equal(options.cache,'no-store');fetchChecked=true;return {ok:true,text:async()=>worker};}
 };
 vm.runInNewContext(script,context,{filename:'ui/pwa-recovery.js'});
 await sleep(150);
 assert.equal(fetchChecked,true,'live worker script must be fetched with no-store');
 assert.equal(updating,1,'a real service worker update must start');
 assert.equal(replaced,null,'same-build stale release must never be accepted');
 assert.equal(button.disabled,true,'still checking the incomplete release');
 active=release;
 await sleep(650);
 assert(replaced&&replaced.includes(encodeURIComponent(release)),'only exact activated release may return to the app');
 assert.equal(context.window.PokecaRecoveryResult?.releaseVerified,true);
 assert.equal(context.window.PokecaRecoveryResult?.savedDataTouched,false);
 assert.equal(progress.textContent.includes('保存データ'),true);
 console.log('PASS recovery rejects same-build stale SW until exact verified release activates; saved data untouched');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
