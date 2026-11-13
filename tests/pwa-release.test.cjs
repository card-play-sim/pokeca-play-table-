'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const BUILD=fs.readFileSync('index.html','utf8').match(/name="pokeca-build" content="(\d+)"/)[1];
assert.equal(spawnSync(process.execPath,['scripts/build-pwa-release.cjs','--check']).status,0);
async function worker({bad=false}={}){
 const handlers={},storage=new Map([['pokeca-first-playable-v240',new Map([['old','saved shell']])],['unrelated-app',new Map([['keep','yes']])]]);let network=0,skipped=false;
 const caches={keys:async()=>[...storage.keys()],delete:async k=>storage.delete(k),open:async k=>{if(!storage.has(k))storage.set(k,new Map());return {put:async(u,r)=>storage.get(k).set(u,r),match:async u=>storage.get(k).get(u)}}};
 const self={registration:{scope:'https://example.test/app/'},location:{origin:'https://example.test'},clients:{claim:async()=>{}},skipWaiting:async()=>{skipped=true},addEventListener:(k,f)=>handlers[k]=f};
 const context={self,caches,URL,Response,crypto:crypto.webcrypto,Uint8Array,Map,fetch:async url=>{network++;const path=new URL(url).pathname.replace('/app/','')||'index.html';return new Response(bad&&path==='ui/mobile.js'?'stale':fs.readFileSync(path));}};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
 let promise;handlers.install({waitUntil:p=>promise=p});
 if(bad){await assert.rejects(promise,/PWA_RELEASE_HASH/);assert(!skipped);assert(storage.has('pokeca-first-playable-v240'));assert(![...storage.keys()].some(k=>k.startsWith('pokeca-first-playable-v'+BUILD)));return;}
 await promise;assert(skipped);handlers.activate({waitUntil:p=>promise=p});await promise;assert(!storage.has('pokeca-first-playable-v240'));assert(storage.has('unrelated-app'));
 const before=network;let answer;handlers.fetch({request:{method:'GET',url:'https://example.test/app/?home=1',mode:'navigate'},respondWith:p=>answer=p});assert((await (await answer).text()).includes('固定デッキ対戦'));assert.equal(network,before);
 let info;handlers.message({data:{type:'RELEASE_INFO'},ports:[{postMessage:x=>info=x}]});assert.equal(info.build,BUILD);assert(info.files['./ui/mobile.js?build='+BUILD]);
}
(async()=>{await worker({bad:true});await worker();console.log('PASS atomic byte-verified PWA install, stale CDN rejection, navigation pinning and scoped cache cleanup');})().catch(e=>{console.error(e);process.exitCode=1});

async function updateClient(){
 const handlers={},timers=[],events=[];let fail=true;
 const node={textContent:'',setAttribute(){}},doc={body:{append(el){assert.equal(el,node);events.push('notice-outside-grid');}},querySelector:()=>({content:BUILD}),getElementById:id=>id==='app'?{prepend(){throw Error('UPDATE_NOTICE_MUST_NOT_SHIFT_GRID')}}:null,createElement:()=>node,addEventListener(){}};
 const sw={controller:{postMessage(){}},addEventListener:(k,f)=>handlers[k]=f,register:async()=>({update:async()=>{}})};
 const win={PokecaMobileBuild:BUILD,PokecaMobile:{prepareForUpdate:async()=>{events.push('save');if(fail)throw Error('disk failure')}}};
 vm.runInNewContext(fs.readFileSync('ui/app-update.js','utf8'),{window:win,document:doc,navigator:{serviceWorker:sw},isSecureContext:true,location:{reload:()=>events.push('reload')},MessageChannel:class{constructor(){this.port1={};this.port2={}}},setTimeout:f=>timers.push(f)});
 handlers.controllerchange();await new Promise(setImmediate);assert.deepEqual(events,['save','notice-outside-grid']);assert.equal(win.PokecaUpdateStatus.state,'save-pending');assert.equal(timers.length,1);
 fail=false;await timers[0]();assert.deepEqual(events,['save','notice-outside-grid','save','reload']);console.log('PASS update waits for successful session persistence before reloading');
}
updateClient().catch(e=>{console.error(e);process.exitCode=1});

async function coherentUpdateClient(){
 const channels=[],messages=[],timers=[];let updateCalls=0,networkFailure=false;
 const node={setAttribute(){},set textContent(value){messages.push(value);}},doc={body:{append(){}},querySelector:()=>({content:BUILD}),getElementById:()=>null,createElement:()=>node,addEventListener(){}};
 const nav={onLine:true,serviceWorker:{controller:{postMessage(){}},addEventListener(){},register:async()=>({update:async()=>{updateCalls++;if(networkFailure)throw Error('network unavailable');}})}};
 const win={PokecaMobileBuild:BUILD,PokecaMobile:{features:{manualOpening:false}}};
 vm.runInNewContext(fs.readFileSync('ui/app-update.js','utf8'),{window:win,document:doc,navigator:nav,isSecureContext:true,location:{reload(){}},MessageChannel:class{constructor(){this.port1={close(){}};this.port2={};channels.push(this);}},setTimeout:f=>{timers.push(f);return timers.length;}});
 await new Promise(setImmediate);
 const reply=build=>channels.at(-1).port1.onmessage({data:{build,files:{},cacheName:'verified-release'}});
 reply(BUILD);assert.equal(win.PokecaUpdateStatus.state,'mismatch','matching labels alone do not prove manual preparation');
 win.PokecaMobile.features.manualOpening=true;await win.PokecaUpdates.checkForUpdate({userInitiated:true});reply(BUILD);assert.equal(win.PokecaUpdateStatus.state,'ready');
 await win.PokecaUpdates.checkForUpdate();reply('246');assert.equal(win.PokecaUpdateStatus.state,'mismatch');
 networkFailure=true;assert.equal((await win.PokecaUpdates.checkForUpdate()).ok,false);assert.equal(win.PokecaUpdateStatus.state,'update-failed');assert(messages.at(-1).includes('保存対戦はそのまま'));assert.equal(timers.length,1);
 nav.onLine=false;const before=updateCalls;await win.PokecaUpdates.checkForUpdate({userInitiated:true});assert.equal(updateCalls,before);assert.equal(win.PokecaUpdateStatus.state,'offline');
 console.log('PASS capability/version coherence, visible update failure, bounded retry and offline update guard');
}
coherentUpdateClient().catch(e=>{console.error(e);process.exitCode=1;});
