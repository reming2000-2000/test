const assert=require('node:assert/strict'),E=require('../calc'),v=E.decimal;
for(const [standard,booked,review] of [
 ['1550','1500',false],['100','0',true],['99.99','0',false],
 ['10000','10100',true],['10000','9900',true],['10000','10099.99',false],['10000','9900.01',false],
 ['9999.99','10099.99',true],['10000.01','10100.01',false],
 ['100000','99900',false],['100000','99000',true],
 ['42500','70000',true],['52000','50000',true],['10000','10000',false],
 ['1000000','1001000',false],['1000000','1010000',true],['1000000','990000',true],
 ['1000000','1009999.99',false],['1000000','990000.01',false],
 ['1552110','1552000',false],['0','0',false],['0','99.99',false],['0','100',true],['0','10000',true],
 ['1000000000000','990000000000',true],['1000000000000','990000000000.01',false]
])assert.equal(E.needsChangeReview(v(standard),v(booked)),review,`${standard} → ${booked}`);
assert.equal(E.needsChangeReview(-1n,100n),false);assert.equal(E.needsChangeReview(100n,-1n),false);
assert.equal(E.roundingUnit(v('999999.99')),v('100'));assert.equal(E.roundingUnit(v('1000000')),v('1000'));
// The existing floor operation always stays within the non-warning amount range.
for(const raw of ['0.01','99.99','1550','15521','155211','999999.99','1000000','1552110','10000999.99']){
 const amount=v(raw);assert.equal(E.needsChangeReview(amount,E.roundStandardAmount(amount)),false,raw);
}
console.log('PASS: 正負の1%境界・100円/1,000円・100万円境界・小数の丸め誤判定防止・基準0・上限・端数調整除外');
