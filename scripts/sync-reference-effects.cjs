'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs'),{compile}=require('../engine/reference-effect-plans.cjs');
const catalog=compile(JSON.parse(fs.readFileSync('data/reference-effects/catalog.json','utf8')));
catalog.rulingEvidence={};
for(const [mechanic,file,needles]of [
 ['CIRCULATOR','circulator',['ダブルターボエネルギー','新しくバトル場に出てきたポケモン','いいえ、できません。']],
 ['IGNORE_DEFENDER_EFFECTS','ignore-effects',['スパイクホッパー','ワザのダメージを受けない','計算せずに']]
]){
 const path='data/reference-effects/rulings/'+file+'.json',saved=JSON.parse(fs.readFileSync(path,'utf8'));
 if(crypto.createHash('sha256').update(saved.html).digest('hex')!==saved.sha256||!needles.every(n=>saved.html.includes(n)))throw Error('OFFICIAL_RULING_EVIDENCE_MISMATCH');
 catalog.rulingEvidence[mechanic]={path,url:saved.url,sha256:saved.sha256};
}
const plans=JSON.stringify(catalog,null,2)+'\n';
let bundle=fs.readFileSync('ui/engine.bundle.js','utf8');
function put(name,source){
 const marker='},"'+name+'":function(require,module,exports){\n',i=bundle.indexOf(marker);
 if(i<0){const anchor=bundle.indexOf('},"pokeca_effect_data":function');if(anchor<0)throw Error('BUNDLE_MODULE_ANCHOR');bundle=bundle.slice(0,anchor)+marker+source.trimEnd()+'\n\n'+bundle.slice(anchor);}
 else {const a=i+marker.length,b=bundle.indexOf('\n},"',a);if(b<0)throw Error('BUNDLE_MODULE_END');bundle=bundle.slice(0,a)+source.trimEnd()+'\n'+bundle.slice(b);}
}
put('pokeca_reference_effect_data','module.exports='+JSON.stringify(catalog)+';');
put('pokeca_reference_effect_runtime',fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8'));
put('pokeca_reference_validation_adapter',fs.readFileSync('engine/pokeca_reference_validation_adapter.cjs','utf8'));
if(process.argv.includes('--check')){
 if(bundle!==fs.readFileSync('ui/engine.bundle.js','utf8')||plans!==fs.readFileSync('data/reference-effects/plans.json','utf8'))throw Error('REFERENCE_BUNDLE_STALE');
}else{fs.writeFileSync('ui/engine.bundle.js',bundle);fs.writeFileSync('data/reference-effects/plans.json',plans);}
