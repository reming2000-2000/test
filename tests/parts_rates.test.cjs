const assert=require('node:assert/strict'),E=require('../calc.js'),v=E.decimal;
for(const [price,materials,removal,band] of [['0',7,5,0],['0.01',7,5,0],['499999.99',7,5,0],['500000',7,5,0],['500000.01',5,3,1],['999999.99',5,3,1],['1000000',3,2,2],['1000000.01',3,2,2],['2999999.99',3,2,2],['3000000',2,1,3],['1000000000000',2,1,3]]){
 const rates=E.partsRates(v(price));assert.deepEqual(rates,{band,materialsRate:v(String(materials)),removalRate:v(String(removal))},price);
}
const p=Object.fromEntries(Object.entries({...E.defaults,parts:'400000'}).map(([id,n])=>[id,v(n)]));
Object.assign(p,E.partsRates(p.parts));const s=E.calculate(p,{},'auto');
assert.equal(s.rows.find(r=>r.id==='materials').standard,v('28000'));assert.equal(s.rows.find(r=>r.id==='removal').standard,v('20000'));assert.equal(s.total,v('501600'));
assert.equal(E.calculate(p,{materials:v('30000')},'auto').total,v('503800'));
console.log('PASS: 部品価格の区分・50万/100万/300万の境界と小数・上限・掛率適用後の合計/採用補正');
