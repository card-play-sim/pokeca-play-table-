'use strict';
const assert=require('node:assert/strict'),UI=require('../ui/table-components.js');
assert.deepEqual(UI.marks([{ok:true,action:{type:'bench_basic'}},{enabled:false,action:{type:'attack'}},{action:{type:'use_ability'}},{ok:false,enabled:true,action:{type:'play_item'}}]),['出す']);
assert.deepEqual(UI.marks([{enabled:true,kind:'ability'},{enabled:true,kind:'attack'},{ok:true,action:{type:'evolve'}},{ok:true,action:{type:'attach_energy'}}]),['特性','ワザ','進化','つける']);
assert.deepEqual(UI.energyGroups([{energyType:'悪'},{energyType:'悪'},{energyType:'炎'},{energyType:'無色',isSpecial:true,name:'イグニッションエネルギー'},{energyType:'無色',isSpecial:true,name:'ロケット団のエネルギー'}]),[{label:'悪',special:false,count:2},{label:'炎',special:false,count:1},{label:'イグニッションエネルギー',special:true,count:1},{label:'ロケット団のエネルギー',special:true,count:1}]);
console.log('PASS unavailable/unknown actions never marked; physical energy groups preserve distinct special names');
