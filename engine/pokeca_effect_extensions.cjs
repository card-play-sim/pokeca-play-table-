'use strict';
// Generated, provenance-gated records only. No runtime registration of self-certified JSON.
const data=require('./pokeca_effect_extension_data');
function catalog(base){const used=new Set(base.records.map(r=>r.officialCardId));for(const r of data.records){if(used.has(r.officialCardId)||r.deckPrintAdopted!==false||!(r.category==='pokemon'?r.attacks.length&&[...r.attacks,...r.abilities].every(e=>e.plan):r.mainPlan))throw Error('INVALID_EFFECT_EXTENSION');used.add(r.officialCardId);}return {...base,records:[...base.records,...data.records],extensionScope:data.scope,blockedExtensions:data.blocked};}
module.exports={catalog};
