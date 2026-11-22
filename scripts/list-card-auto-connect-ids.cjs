'use strict';
// Exact, official print IDs only. Never let an invalid catalog identifier abort
// the entire automatic intake queue. I/J are the priority battle scope; H is last.
const fs = require('node:fs');
const read = path => JSON.parse(fs.readFileSync(path,'utf8'));
const priority = {J:1,I:2,H:3};
const basicName = /^基本[草炎水雷超闘悪鋼]エネルギー$/;
// The official standard rules explicitly permit basic-energy print exceptions.
// Require the same independently catalogued official-print identity that the
// deck-builder uses; never infer an arbitrary old card from a shared name.
function verifiedBasicException(row) {
  return row.legality === 'official-basic-energy-exception' &&
    row.category === 'energy' && row.basicEnergy === true &&
    row.source?.heading === '基本エネルギー' && basicName.test(row.name || '');
}
function selectIds(catalog,connected) {
  const ids=[],invalid=[],seen=new Set();
  const rows=Array.isArray(catalog.records)?catalog.records:[];
  for(const row of rows) {
    const basicException = verifiedBasicException(row);
    if(!basicException && !(row.legality === 'printed-hij' &&
      Object.hasOwn(priority,row.regulationMark)))continue;
    const id=String(row.officialCardId??'');
    if(!/^[1-9][0-9]{3,7}$/.test(id)) {
      invalid.push({officialCardId:id,regulationMark:row.regulationMark});
      continue;
    }
    if(connected.has(id)||seen.has(id))continue;
    seen.add(id);
    ids.push({id,rank:basicException ? 0 : priority[row.regulationMark]});
  }
  ids.sort((a,b)=>a.rank-b.rank||Number(a.id)-Number(b.id));
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
  console.log('Battle intake queue: '+ids.length+' verified-format IDs; official basic-energy exceptions, then J/I/H.');
}
module.exports={selectIds,verifiedBasicException};
