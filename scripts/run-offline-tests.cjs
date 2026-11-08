'use strict';
const {spawnSync}=require('node:child_process'),fs=require('node:fs');
let failed=0;
for(const file of fs.readdirSync('tests').filter(f=>/\.(?:test\.(?:cjs|js|mjs)|cjs)$/.test(f))){
 const result=spawnSync(process.execPath,['tests/'+file],{stdio:'inherit',timeout:900000});
 if(result.status!==0){failed++;console.error('FAIL',file,result.error?.message||result.status);}
}
if(failed)process.exitCode=1;
