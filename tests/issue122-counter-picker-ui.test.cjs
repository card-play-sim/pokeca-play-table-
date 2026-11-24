'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ui/mobile.js','utf8');
const start=source.indexOf('  function selectReferenceCounters(request)');
const end=source.indexOf('  async function fixedPracticeMenu()',start);
assert(start>=0&&end>start,'Missing actual mobile counter picker');
function element(){return {children:[],append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes}}}
async function test(required){
 const nodes=Object.fromEntries(['reference-counter-choices','reference-counter-submit'].map(id=>[id,element()]));
 let sheet=null,closed=false;
 const sandbox={
  $:id=>nodes[id],openSheet:(title,html)=>{sheet={title,html}},closeSheet:()=>{closed=true},
  document:{createElement:()=>element(),createTextNode:text=>text},
  selectionArt:()=>'',button:(label,click,options={})=>({label,click,disabled:!!options.disabled})
 };
 vm.createContext(sandbox);
 vm.runInContext(source.slice(start,end),sandbox);
 const pending=sandbox.selectReferenceCounters({kind:'COUNTERS',key:'allocation',min:required,max:required,candidates:[{id:'a',name:'A'},{id:'b',name:'B'}]});
 assert(sheet.title.includes(required+'個'));assert(sheet.html.includes('合計'+required+'個'));
 const submit=()=>nodes['reference-counter-submit'].children.find(b=>b.label==='この配分で決定');
 const plus=i=>nodes['reference-counter-choices'].children[i].children.find(b=>b?.label==='＋');
 const minus=i=>nodes['reference-counter-choices'].children[i].children.find(b=>b?.label==='−');
 assert(submit().disabled);assert(minus(0).disabled);
 for(let i=0;i<required;i++){
  assert(!plus(i%2).disabled);plus(i%2).click();
  assert.equal(submit().disabled,i+1!==required);
 }
 assert(plus(0).disabled&&plus(1).disabled);
 minus(0).click();assert(submit().disabled);assert(!plus(0).disabled);
 plus(0).click();assert(!submit().disabled);submit().click();
 const actual=JSON.parse(JSON.stringify(await pending));
 assert.deepEqual(actual,{a:Math.ceil(required/2),b:Math.floor(required/2)});assert(closed);
 assert.equal(await sandbox.selectReferenceCounters({min:2,max:6,candidates:[{id:'a'}]}),null);
}
(async()=>{for(const total of [1,2,3,6,8])await test(total);console.log('COUNTER_PICKER_UI PASS: 1/2/3/6/8 counters, exact allocation, bounds and invalid request rejection')})().catch(e=>{console.error(e);process.exitCode=1});
