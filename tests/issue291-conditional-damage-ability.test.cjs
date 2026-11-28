'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs'),{text}=require('../scripts/parse-official-pokemon-energy.cjs');
const ids=["45755","45852","46751","49142","47689","48060","49224","49656","50051","48392","50831","45877","48766"];
for(const id of ids){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json'));
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 assert.equal(proof.url,'https://www.pokemon-card.com/card-search/details.php/card/'+id);
 const body=proof.html.match(/<h2[^>]*>特性<\/h2>\s*<h4>(.*?)<\/h4>\s*<p>(.*?)<\/p>/s);
 assert(body);const row={officialCardId:id,name:'official',category:'pokemon',abilities:[{name:body[1],text:text(body[2])}],attacks:[]};
 const result=compile({records:[row]}).records[0],plan=result.abilities[0].plan;
 assert(['PASSIVE_CONDITIONAL_DAMAGE','PASSIVE_ENERGY_TEAM_REDUCTION'].includes(plan.mechanic));
 const malformed={...row,abilities:[{...row.abilities[0],text:row.abilities[0].text+'相手の山札を1枚トラッシュする。'}]};
 assert.equal(compile({records:[malformed]}).records[0].abilities[0].plan,null);
}
console.log('公式条件付きダメージ特性13枠 PASS（対戦合格ではない）');
