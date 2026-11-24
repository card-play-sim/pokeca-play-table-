"use strict";
// Move only already-captured, immutable official H/I/J evidence into the
// supplemental effect extension intake. This does NOT adopt deck printings.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const read = file => JSON.parse(fs.readFileSync(file,"utf8"));
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const exactEffects = [
  /^このポケモンについているエネルギーを([2-9])個選び、トラッシュする。$/,
  /^コインを1回投げオモテなら、相手のバトルポケモンについている(特殊)?エネルギーを1個選び、トラッシュする。$/
];
const worklist = read("reports/official-effect-continuation/atomic-battle-connection-shared-mechanic-worklist.json");
const source = read("data/official-effect-intake/checkpoint.json");
const intake = read("data/effect-extensions/intake.json");
const legal = new Set(read("data/deck-building/catalog.json").records.filter(r =>
  r.legality === "printed-hij" && ["H","I","J"].includes(r.regulationMark)
).map(r => String(r.officialCardId)));
const target = [...new Set(worklist.groups.filter(g =>
  g.category === "pokemon" && g.effectKind === "attack" && exactEffects.some(re => re.test(g.exampleOfficialText))
).flatMap(g => g.officialCardIds.map(String)))].sort((a,b) => Number(a)-Number(b));
assert(target.length >= 60, "EXPECTED_OFFICIAL_SHARED_MECHANIC_GROUP_NOT_FOUND");
const official = new Map(source.records.map(r => [String(r.officialCardId),r]));
const existing = new Set(intake.records.map(r => String(r.officialCardId)));
const staged = [], rejected = [];
for(const id of target){
 const row = official.get(id);
 if(!row || !legal.has(id) || row.category!=="pokemon" || row.deckPrintAdopted!==false ||
   !row.attacks.some(a => exactEffects.some(re => re.test(String(a.text||"").replace(/\s+/g,""))))) {
  rejected.push({id,reason:"SOURCE_OR_HIJ_PRINT_SCOPE_UNVERIFIED"}); continue;
 }
 const file = "data/effect-extensions/evidence/"+id+".json";
 assert.equal(row.source?.path,file,"OFFICIAL_EVIDENCE_PATH_MISMATCH:"+id);
 assert(fs.existsSync(file),"OFFICIAL_SAVED_PAGE_NOT_FOUND:"+id);
 const evidence=read(file);
 const url="https://www.pokemon-card.com/card-search/details.php/card/"+id;
 assert.equal(evidence.url,url,"OFFICIAL_URL_MISMATCH:"+id);
 assert.equal(row.officialPageUrl,url,"OFFICIAL_PRINT_ID_MISMATCH:"+id);
 assert.equal(evidence.htmlSha256,hash(evidence.html),"OFFICIAL_HTML_HASH_MISMATCH:"+id);
 assert.equal(row.source.sha256,evidence.htmlSha256,"OFFICIAL_SOURCE_HASH_MISMATCH:"+id);
 assert(evidence.html.includes('<meta property="og:url" content="'+url+'"'),
   "OFFICIAL_PAGE_CANONICAL_MISMATCH:"+id);
 if(!existing.has(id)){intake.records.push(row);existing.add(id);staged.push(id);}
}
assert.equal(rejected.length,0,"EXACT_OFFICIAL_SOURCE_NOT_VERIFIED:"+JSON.stringify(rejected));
assert(intake.records.every(r=>r.deckPrintAdopted===false),"NON_SUPPLEMENTAL_PRINT_ADOPTION");
if(staged.length){
 const filename="data/effect-extensions/intake.json",tmp=filename+".tmp";
 fs.writeFileSync(tmp,JSON.stringify(intake,null,2)+"\n");
 fs.renameSync(tmp,filename);
}
const audit={source:"saved-official-HIJ-print-evidence",groupPrints:target.length,
  newlyStaged:staged.length,newlyStagedPrintIds:staged,alreadyInIntake:target.length-staged.length,
  unresolvedPrints:rejected,engineVerified:0,publicBattleVerified:0};
const auditFile="reports/official-effect-continuation/multi-energy-bulk-intake.json";
fs.mkdirSync(path.dirname(auditFile),{recursive:true});
fs.writeFileSync(auditFile,JSON.stringify(audit,null,2)+"\n");
console.log("OFFICIAL_EXACT_ENERGY_INTAKE",JSON.stringify(audit));
