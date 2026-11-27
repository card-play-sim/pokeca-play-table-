"use strict";
const assert=require("node:assert/strict");
const {firstReservable,requiredCopies,tryReserveChain,evolutionLines}=require("../scripts/lib/shared-effect-engine-worker.cjs");
const a={officialCardId:"1",category:"pokemon"},b={officialCardId:"2",category:"pokemon"},c={officialCardId:"3",category:"energy"},source={officialCardId:"4",category:"pokemon"};
const tried=[];
assert.equal(firstReservable([null,source,a,a,c,b],r=>r.category==="pokemon",r=>{tried.push(r.officialCardId);return r===b;},source.officialCardId),b);
assert.deepEqual(tried,["1","2"]);
assert.equal(firstReservable([a,b],()=>true,()=>false),null);
assert.equal(firstReservable([a,b],()=>true,()=>true),a);
assert.equal(firstReservable([source],()=>true,()=>{throw Error("SOURCE_MUST_NOT_BE_RESERVED");},source.officialCardId),null);
const req=[{side:0,zone:"hand",printId:"1"},{side:0,zone:"bench",printId:"1"},{side:1,zone:"deck",printId:"1"}];
assert.equal(requiredCopies(req,0,"1"),3);
assert.equal(requiredCopies(req,1,"1"),2);
assert.equal(requiredCopies(req,0,"2"),1);
const deck={cards:[{name:"donor",count:4}]},reserved=new Map([[0,new Set(["old"])]]);
const ensure=(index,record)=>{deck.cards[0].count--;reserved.get(index).add(record.officialCardId);return record===a;};
assert.equal(tryReserveChain(deck,reserved,0,[a,b],ensure),false);
assert.deepEqual(deck.cards,[{name:"donor",count:4}]);
assert.deepEqual([...reserved.get(0)],["old"]);
assert.throws(()=>tryReserveChain(deck,reserved,0,[a,b],(i,r)=>{ensure(i,r);throw Error("unexpected");}),/unexpected/);
assert.deepEqual(deck.cards,[{name:"donor",count:4}]);
assert.deepEqual([...reserved.get(0)],["old"]);
assert.equal(tryReserveChain(deck,reserved,0,[a],ensure),true);
assert.equal(deck.cards[0].count,3);
assert.deepEqual([...reserved.get(0)],["old","1"]);
const basic=(id,name)=>({officialCardId:id,name,category:"pokemon",facts:{basic:true,stage:0}});
const evolved=(id,name,from,stage)=>({officialCardId:id,name,category:"pokemon",facts:{basic:false,stage,evolvesFrom:from}});
const p1=basic("p1","Base"),p2=basic("p2","Base"),bad=basic("bad","Other"),mid=evolved("mid","Mid","Base",1),end=evolved("end","End","Mid",2);
assert.deepEqual([...evolutionLines(end,[bad,p1,p2,mid])].map(line=>line.map(r=>r.officialCardId)),[["p1","mid","end"],["p2","mid","end"]]);
assert.deepEqual([...evolutionLines(end,[p1,p2])],[]);
const retryDeck={cards:[{name:"donor",count:4}]},retryReserved=new Map();
let chosen;
for(const line of evolutionLines(end,[p1,p2,mid])){
 if(tryReserveChain(retryDeck,retryReserved,0,line,(i,r)=>{
  retryDeck.cards[0].count--;
  if(!retryReserved.has(i))retryReserved.set(i,new Set());
  retryReserved.get(i).add(r.officialCardId);
  return r!==p1;
 })){chosen=line;break;}
}
assert.deepEqual(chosen.map(r=>r.officialCardId),["p2","mid","end"]);
assert.equal(retryDeck.cards[0].count,1);
assert.deepEqual([...retryReserved.get(0)],["p2","mid","end"]);
console.log("FIXTURE_RESERVATION_FALLBACK PASS");
