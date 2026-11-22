'use strict';
const fs = require('node:fs');
const read = path => JSON.parse(fs.readFileSync(path,'utf8'));
const catalog = read('data/deck-building/catalog.json');
const plans = new Set([...read('data/reference-effects/plans.json').records,
  ...read('data/effect-extensions/compiled.json').records].map(row=>row.officialCardId));
const ids = catalog.records.filter(row=>row.legality==='printed-hij' &&
  ['H','I','J'].includes(row.regulationMark) && !plans.has(row.officialCardId))
  .map(row=>row.officialCardId);
fs.writeFileSync(process.argv[2],JSON.stringify(ids)+'\n');
