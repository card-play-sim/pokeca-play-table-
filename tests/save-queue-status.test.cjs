'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('ui/mobile.js','utf8'),start=source.indexOf('  function saveSession('),end=source.indexOf('  function downloadJSON(',start);
const node={textContent:'',title:'',classList:{add(){},remove(){}}};
let counter=0;const pending=[],written=[];
const context={persistenceReady:true,storageUnavailable:false,saveQueue:Promise.resolve(),saveSequence:0,$:()=>node,port:{getResumeSnapshot:()=>({sequence:++counter})},store:{save:snapshot=>new Promise((resolve,reject)=>pending.push({snapshot,resolve:()=>{written.push(snapshot.sequence);resolve();},reject}))}};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
(async()=>{
 const first=context.saveSession(),last=context.saveSession();
 await new Promise(setImmediate);assert.equal(pending.length,1);pending[0].resolve();await first;await new Promise(setImmediate);
 assert.equal(node.textContent,'保存中','earlier write must never signal that the latest AI state was saved');
 assert.equal(pending.length,2);pending[1].resolve();await last;assert.equal(node.textContent,'自動保存済');assert.deepEqual(written,[1,2]);
 const rejected=context.saveSession();rejected.catch(()=>{});const recovery=context.saveSession();await new Promise(setImmediate);
 pending[2].reject(Error('disk'));await assert.rejects(rejected,/disk/);await new Promise(setImmediate);
 assert.equal(node.textContent,'保存中');pending[3].resolve();await recovery;assert.equal(node.textContent,'自動保存済');assert.equal(context.storageUnavailable,false);
 const failure=context.saveSession();failure.catch(()=>{});await new Promise(setImmediate);pending[4].reject(Error('last disk failure'));await assert.rejects(failure,/last disk/);assert.equal(node.textContent,'端末保存不可・JSON書出し');assert.equal(context.storageUnavailable,true);
 console.log('PASS real save queue: latest-state status, ordered writes, recovery and final failure reporting');
})().catch(e=>{console.error(e);process.exitCode=1;});
