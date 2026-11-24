"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),crypto=require("node:crypto");
const {compile}=require("../engine/reference-effect-plans.cjs");
const read=path=>JSON.parse(fs.readFileSync(path,"utf8"));
const matches=a=>a.plan?.mechanic==='ATTACK_ACCELERATE_BASIC_ENERGY';
const worklist=read("reports/official-effect-continuation/atomic-battle-connection-shared-mechanic-worklist.json");
const checkpoint=read("data/official-effect-intake/checkpoint.json"),intake=read("data/effect-extensions/intake.json");
const legal=new Set(read("data/deck-building/catalog.json").records.filter(r=>r.legality==="printed-hij"&&["H","I","J"].includes(r.regulationMark)).map(r=>String(r.officialCardId)));
const official=new Map(checkpoint.records.map(r=>[String(r.officialCardId),r]));
const ids=new Set();
for(const g of worklist.groups){
 if(g.category!=="pokemon"||g.effectKind!=="attack")continue;
 const sample={officialCardId:"46235",name:"REGRESSION",category:"pokemon",facts:{basic:true},attacks:[{name:"ATTACK",text:g.exampleOfficialText,damage:g.printedDamage,cost:g.energyCost||[]}],abilities:[]};
 if(compile({records:[sample]}).records[0]?.attacks.some(matches))for(const id of g.officialCardIds)ids.add(String(id));
}
const existing=new Set(intake.records.map(r=>String(r.officialCardId))),staged=[],blocked=[],already=[];
for(const id of [...ids].sort((a,b)=>Number(a)-Number(b))){
 const row=official.get(id);
 try{
  assert(/^[1-9]\d{3,7}$/.test(id)&&legal.has(id)&&row?.category==="pokemon"&&row.deckPrintAdopted===false,"UNVERIFIED_HIJ_SOURCE");
  assert(compile({records:[row]}).records[0]?.attacks.some(matches),"NO_EXACT_OFFICIAL_MATCH");
  const file="data/effect-extensions/evidence/"+id+".json",url="https://www.pokemon-card.com/card-search/details.php/card/"+id;
  assert.equal(row.source.path,file,"EVIDENCE_PATH");
  const proof=read(file);
  assert.equal(proof.url,url,"EVIDENCE_URL");assert.equal(row.officialPageUrl,url,"OFFICIAL_URL");
  assert.equal(proof.htmlSha256,crypto.createHash("sha256").update(proof.html).digest("hex"),"HTML_HASH");
  assert.equal(row.source.sha256,proof.htmlSha256,"SOURCE_HASH");
  assert(proof.html.includes('<meta property="og:url" content="'+url+'"'),"CANONICAL_URL");
  if(existing.has(id)){already.push(id);continue;}
  intake.records.push(row);existing.add(id);staged.push(id);
 }catch(e){blocked.push({id,reason:String(e.message)});}
}
assert(intake.records.every(r=>r.deckPrintAdopted===false),"NON_SUPPLEMENTAL_PRINT_ADOPTION");
if(staged.length){const f="data/effect-extensions/intake.json";fs.writeFileSync(f+".tmp",JSON.stringify(intake,null,2)+"\n");fs.renameSync(f+".tmp",f);}
const audit={targetPrintIds:[...ids],newlyStagedPrintIds:staged,alreadyInIntake:already,blocked,engineVerified:0,publicBattleVerified:0};
fs.writeFileSync("reports/official-effect-continuation/energy-acceleration-bulk-intake.json",JSON.stringify(audit,null,2)+"\n");
console.log("ENERGY_ACCELERATION_EXACT_INTAKE",JSON.stringify(audit));
