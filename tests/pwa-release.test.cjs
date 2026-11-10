'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
assert.equal(spawnSync(process.execPath,['scripts/build-pwa-release.cjs','--check']).status,0);
async function worker({bad=false}={}){
 const handlers={},storage=new Map([['pokeca-first-playable-v240',new Map([['old','saved shell']])],['unrelated-app',new Map([['keep','yes']])]]);let network=0,skipped=false;
 const caches={keys:async()=>[...storage.keys()],delete:async k=>storage.delete(k),open:async k=>{if(!storage.has(k))storage.set(k,new Map());return {put:async(u,r)=>storage.get(k).set(u,r),match:async u=>storage.get(k).get(u)}}};
 const self={registration:{scope:'https://example.test/app/'},location:{origin:'https://example.test'},clients:{claim:async()=>{}},skipWaiting:async()=>{skipped=true},addEventListener:(k,f)=>handlers[k]=f};
 const context={self,caches,URL,Response,crypto:crypto.webcrypto,Uint8Array,Map,fetch:async url=>{network++;const path=new URL(url).pathname.replace('/app/','')||'index.html';return new Response(bad&&path==='ui/mobile.js'?'stale':fs.readFileSync(path));}};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
 let promise;handlers.install({waitUntil:p=>promise=p});
 if(bad){await assert.rejects(promise,/PWA_RELEASE_HASH/);assert(!skipped);assert(storage.has('pokeca-first-playable-v240'));assert(![...storage.keys()].some(k=>k.startsWith('pokeca-first-playable-v241')));return;}
 await promise;assert(skipped);handlers.activate({waitUntil:p=>promise=p});await promise;assert(!storage.has('pokeca-first-playable-v240'));assert(storage.has('unrelated-app'));
 const before=network;let answer;handlers.fetch({request:{method:'GET',url:'https://example.test/app/?home=1',mode:'navigate'},respondWith:p=>answer=p});assert((await (await answer).text()).includes('固定デッキ対戦'));assert.equal(network,before);
 let info;handlers.message({data:{type:'RELEASE_INFO'},ports:[{postMessage:x=>info=x}]});assert.equal(info.build,'241');assert(info.files['./ui/mobile.js?build=241']);
}
(async()=>{await worker({bad:true});await worker();console.log('PASS atomic byte-verified PWA install, stale CDN rejection, navigation pinning and scoped cache cleanup');})().catch(e=>{console.error(e);process.exitCode=1});

async function updateClient(){
 const handlers={},timers=[],events=[];let fail=true;
 const node={textContent:'',setAttribute(){}},doc={body:{append(el){assert.equal(el,node);events.push('notice-outside-grid');}},querySelector:()=>({content:'241'}),getElementById:id=>id==='app'?{prepend(){throw Error('UPDATE_NOTICE_MUST_NOT_SHIFT_GRID')}}:null,createElement:()=>node,addEventListener(){}};
 const sw={controller:{postMessage(){}},addEventListener:(k,f)=>handlers[k]=f,register:async()=>({update:async()=>{}})};
 const win={PokecaMobileBuild:'241',PokecaMobile:{prepareForUpdate:async()=>{events.push('save');if(fail)throw Error('disk failure')}}};
 vm.runInNewContext(fs.readFileSync('ui/app-update.js','utf8'),{window:win,document:doc,navigator:{serviceWorker:sw},isSecureContext:true,location:{reload:()=>events.push('reload')},MessageChannel:class{constructor(){this.port1={};this.port2={}}},setTimeout:f=>timers.push(f)});
 handlers.controllerchange();await new Promise(setImmediate);assert.deepEqual(events,['save','notice-outside-grid']);assert.equal(win.PokecaUpdateStatus.state,'save-pending');assert.equal(timers.length,1);
 fail=false;await timers[0]();assert.deepEqual(events,['save','notice-outside-grid','save','reload']);console.log('PASS update waits for successful session persistence before reloading');
}
updateClient().catch(e=>{console.error(e);process.exitCode=1});
