"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const {parse}=require("../scripts/parse-official-pokemon-energy.cjs");
for(const id of ["45305","45357"]){
 const proof=JSON.parse(fs.readFileSync("data/effect-extensions/evidence/"+id+".json","utf8"));
 const result=parse(proof.html);
 assert.equal(result.category,"pokemon");
 assert.equal(result.facts.stage,1);
 assert.equal(result.facts.evolvesFrom,"ビッパ");
 assert.equal(result.facts.basic,false);
}
console.log("OFFICIAL_EVOLUTION_PREDECESSOR_CHAIN PASS");
