'use strict';
const assert=require('node:assert/strict');
const {run}=require('../scripts/validate-reference-matches.cjs');
run().then(matches=>{
 assert.equal(matches.length,2);
 for(const match of matches){assert(match.completed,JSON.stringify(match));assert(match.saveReloadExact);assert(match.attacks>0);assert(match.knockouts>0);assert.equal(match.adoptedDeckPrints,0);}
 console.log('PASS two real fixed120 reference AI matches, both deck orientations, exact save/restore');
}).catch(error=>{console.error(error);process.exitCode=1;});
