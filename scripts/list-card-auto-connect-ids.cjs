'use strict';
// Exact, official print IDs only. Never let an invalid catalog identifier abort
// the entire automatic intake queue. I/J are the priority battle scope; H is last.
const fs = require('node:fs');
const read = path => JSON.parse(fs.readFileSync(path,'utf8'));
const priority = {J:0,I:1,H:2};
function selectIds(catalog,connected) {
  const ids=[],invalid=[],seen=new Set();
  const rows=Array.isArray(catalog.records)?catalog.records:[];
  for(const row of rows) {
    if(row.legality!=='printed-hij'||!Object.hasOwn(priority,row.regulationMark))continue;
    const id=String(row.officialCardId??'');
    if(!/^[1-9][0-9]{3,7}$/.test(id)) {
      invalid.push({officialCardId:id,regulationMark:row.regulationMark});
      continue;
    }
    if(connected.has(id)||seen.has(id))continue;
    seen.add(id);
    ids.push({id,mark:row.regulationMark});
  }
  ids.sort((a,b)=>priority[a.mark]-priority[b.mark]||Number(a.id)-Number(b.id));
  return {ids:ids.map(row=>row.id),invalid};
}
if(require.main===module) {
  const catalog=read('data/deck-building/catalog.json');
  const connected=new Set([...read('data/reference-effects/plans.json').records,
    ...read('data/effect-extensions/compiled.json').records].map(row=>String(row.officialCardId)));
  const {ids,invalid}=selectIds(catalog,connected);
  if(!process.argv[2])throw Error('OUTPUT_FILE_REQUIRED');
  fs.writeFileSync(process.argv[2],JSON.stringify(ids)+'\n');
  if(invalid.length)console.warn('Excluded invalid official-print IDs from intake input: '+JSON.stringify(invalid.slice(0,25))+' (total '+invalid.length+')');
  console.log('Battle intake queue: '+ids.length+' verified-format IDs; J/I before H.');
}
module.exports={selectIds};
