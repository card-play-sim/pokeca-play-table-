'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const BUILD=fs.readFileSync('index.html','utf8').match(/name="pokeca-build" content="(\d+)"/)[1];
assert.equal(spawnSync(process.execPath,['scripts/build-pwa-release.cjs','--check']).status,0);
const MOBILE_BUILD=fs.readFileSync('ui/mobile.js','utf8').match(/window\.PokecaMobileBuild=['"](\d+)['"]/);
assert(MOBILE_BUILD,'mobile runtime build marker missing');
assert.equal(MOBILE_BUILD[1],BUILD,'HTML and mobile runtime build must match before publishing');
const workerSource=fs.readFileSync('sw.js','utf8');
assert(workerSource.includes('const BUILD='+JSON.stringify(BUILD)+';'),'service worker build must match HTML');

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
 const handlers={},timers=[],events=[];let fail=true,controllerBuild=BUILD,appended=false;
 const node={textContent:'',setAttribute(){}},doc={body:{append(el){assert.equal(el,node);events.push('notice-outside-grid');appended=true;}},querySelector:()=>({content:BUILD}),getElementById:id=>id==='app'?{prepend(){throw Error('UPDATE_NOTICE_MUST_NOT_SHIFT_GRID')}}:id==='app-update-status'&&appended?node:null,createElement:()=>node,addEventListener(){}};
 const worker={postMessage(data,ports){ports[0].reply({build:controllerBuild,files:{},cacheName:'verified-release'});}};
 const sw={controller:null,addEventListener:(k,f)=>handlers[k]=f,register:async()=>({update:async()=>{}})};
 const win={PokecaMobileBuild:BUILD,PokecaMobile:{features:{manualOpening:true},prepareForUpdate:async()=>{events.push('save');if(fail)throw Error('disk failure')}}};
 vm.runInNewContext(fs.readFileSync('ui/app-update.js','utf8'),{window:win,document:doc,navigator:{serviceWorker:sw},isSecureContext:true,location:{reload:()=>events.push('reload')},MessageChannel:class{constructor(){this.port1={close(){}};this.port2={reply:data=>this.port1.onmessage({data})}}},setTimeout:f=>timers.push(f)});
 sw.controller=worker;handlers.controllerchange();await new Promise(setImmediate);assert.deepEqual(events,[],'same-build controller claim must not race a manual reload');assert.equal(win.PokecaUpdateStatus.state,'ready');
 controllerBuild=String(Number(BUILD)+1);handlers.controllerchange();await new Promise(setImmediate);assert.deepEqual(events,['save','notice-outside-grid']);assert.equal(win.PokecaUpdateStatus.state,'save-pending');assert.equal(timers.length,1);
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

async function sameVersionControllerReplacement(){
 const handlers={},events=[],worker=()=>({postMessage(message,ports){ports[0].reply({build:BUILD,files:{},cacheName:'byte-verified-release'});}});
 const sw={controller:worker(),addEventListener:(key,fn)=>handlers[key]=fn,register:async()=>({update:async()=>{}})};
 const win={PokecaMobileBuild:BUILD,PokecaMobile:{features:{manualOpening:true},prepareForUpdate:async()=>events.push('save')}};
 const doc={querySelector:()=>({content:BUILD}),getElementById:()=>null,addEventListener(){},createElement:()=>({setAttribute(){}}),body:{append(){}}};
 vm.runInNewContext(fs.readFileSync('ui/app-update.js','utf8'),{window:win,document:doc,navigator:{serviceWorker:sw},isSecureContext:true,location:{reload:()=>events.push('reload')},MessageChannel:class{constructor(){this.port1={close(){}};this.port2={reply:data=>this.port1.onmessage({data})};}},setTimeout(){}});
 await new Promise(setImmediate);assert.deepEqual(events,[]);sw.controller=worker();handlers.controllerchange();await new Promise(setImmediate);assert.deepEqual(events,['save','reload'],'a replacement release still refreshes even if its visible build number is unchanged');
 console.log('PASS initial coherent claim skips reload while real worker replacement saves and reloads');
}
sameVersionControllerReplacement().catch(e=>{console.error(e);process.exitCode=1;});
