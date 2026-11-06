const assert=require('node:assert/strict');
const E=require('../calc.js');
const v=n=>E.decimal(String(n));
const p=Object.fromEntries(Object.entries({...E.defaults,parts:'850000',workers:'6',shipping:'20000'}).map(([k,n])=>[k,v(n)]));
let s=E.calculate(p);
assert.deepEqual(s.rows.map(r=>r.label),['部品代','交換作業費','消耗資材費','部品送料・運搬交通費','撤去品引取費','養生・安全対策費','諸経費']);
assert.deepEqual(s.rows.map(r=>E.format(r.standard)),['850,000','348,000','42,500','44,000','25,500','17,000','132,700']);
for(const [k,n] of Object.entries({subtotal:1327000,overhead:132700,welfare:56776,total:1516476,laborCost:216000}))assert.equal(s[k],v(n),k);
s=E.calculate(p,{materials:v(70000)});
for(const [k,n] of Object.entries({subtotal:1354500,overhead:135450,welfare:56776,total:1546726,diff:30250}))assert.equal(s[k],v(n),k);
assert.equal(s.rows.find(r=>r.id==='materials').diff,v(27500));assert.equal(E.ratio(s.rows.find(r=>r.id==='materials').diff,s.rows.find(r=>r.id==='materials').standard),'＋64.7％');assert.equal(E.ratio(s.rows.find(r=>r.id==='materials').booked,p.parts,2,false),'8.24％');
// One fractional headcount drives labor revenue, shipping and reference cost.
s=E.calculate({...p,workers:v(1.5)});
for(const [k,n] of Object.entries({subtotal:1048000,overhead:104800,welfare:14194,total:1166994,laborCost:54000}))assert.equal(s[k],v(n),k);
assert.equal(s.rows.find(r=>r.id==='labor').standard,v(87000));assert.equal(s.rows.find(r=>r.id==='shipping').standard,v(26000));
const changed=E.calculate({...p,workers:v(1.5)},{labor:v(100000)});
assert.equal(changed.welfare,v(16315));assert.equal(changed.laborCost,v(54000));assert.equal(changed.diff,v(16421));
// No additional reference cost is added to the estimate total.
assert.equal(s.total,s.subtotal+s.overhead+s.welfare);
s=E.calculate({...p,workers:0n});assert.equal(s.laborCost,0n);assert.equal(s.rows.find(r=>r.id==='labor').standard,0n);assert.equal(s.rows.find(r=>r.id==='shipping').standard,p.shipping);
s=E.calculate({...p,workers:v(.001)});assert.equal(s.laborCost,v(36));assert.equal(s.rows.find(r=>r.id==='labor').standard,v(58));assert.equal(s.rows.find(r=>r.id==='shipping').standard,v(20004));
assert.equal(E.calculate(p,{parts:0n}).rows.find(r=>r.id==='materials').standard,v(42500));
assert.equal(E.parse('', 'money',true).value,null);assert.equal(E.parse('0','money',true).value,0n);
for(const [raw,kind] of [['-1','money'],['abc','decimal'],['Infinity','money'],['1.234','money'],['1.2345','decimal'],['1000000.001','decimal'],['1e9','money'],['1,2','money'],['1000000000001','money']])assert.ok(E.parse(raw,kind).error,raw);
assert.equal(E.parse('１．５','decimal').value,v(1.5));assert.equal(E.parse('1.5','decimal').error,'');
assert.equal(E.ratio(v(100),0n),'—（基準額0円）');
assert.equal(E.calculate({...p,workers:v(1),laborPrice:v(100),welfareRate:v(29)}).welfare,v(29));
assert.equal(E.calculate({...p,parts:v(.1),materialsRate:v(5)}).rows.find(r=>r.id==='materials').standard,v(.005));
console.log('PASS: 共通作業人員・1.5人・小数3桁・売価/原価・採用変更・法定福利費・0・入力制限');
// Copy strings retain current rates and exact signed adjustments, without currency units.
const copyInput={...p,parts:v(150000),workers:v(1.5)};
const copied=(id,adopted={},input=copyInput)=>{const out=E.calculate(input,adopted);return E.copyBasis(input,out.rows.find(r=>r.id===id));};
assert.equal(copied('materials',{materials:v(10000)}),'部品代×5％+2,500（＝部品代6.7％）');
assert.equal(copied('materials',{materials:v(5000)}),'部品代×5％-2,500（＝部品代3.3％）');
assert.equal(copied('materials'),'部品代×5％');
assert.equal(copied('materials',{materials:v(7500)}),'部品代×5％');
assert.equal(copied('materials',{materials:0n}),'部品代×5％-7,500（＝部品代0％）');
assert.equal(copied('materials',{materials:v(10000)},{...copyInput,materialsRate:v(7)}),'部品代×7％-500（＝部品代6.7％）');
assert.equal(copied('materials',{materials:v(2500)},{...copyInput,parts:0n}),'部品代×5％+2,500');
assert.equal(copied('labor',{labor:v(100000)}),'1.5人×58,000+13,000');
assert.equal(copied('shipping',{shipping:v(20000)}),'1.5人×4,000+20,000-6,000');
assert.equal(copied('parts',{parts:v(150100)}),'基本入力の部品代+100');
assert.equal(copied('removal'),'部品代×3％');assert.equal(copied('protection'),'部品代×2％');
console.log('PASS: 転記用算定根拠の増額・減額・同額・未採用・採用0・率変更・基準0・全6費目');

// Rounded adopted overhead is independent of its own base and is added exactly once.
const overheadInput={...p,parts:v(500000),workers:0n,shipping:v(57740),materialsRate:0n,removalRate:0n,protectionRate:0n};
let adjusted=E.calculate(overheadInput,{overhead:v(55700)});
assert.equal(adjusted.subtotal,v(557740));assert.equal(adjusted.overhead,v(55700));
assert.equal(adjusted.rows.find(r=>r.id==='overhead').standard,v(55774));
assert.equal(adjusted.total,v(613440));assert.equal(adjusted.standardTotal,v(613514));assert.equal(adjusted.diff,v(-74));
assert.equal(E.copyBasis(overheadInput,adjusted.rows.find(r=>r.id==='overhead')),'小計×10％-74');
assert.equal(E.calculate(overheadInput,{overhead:0n}).total,v(557740));
assert.equal(E.calculate(overheadInput).total,v(613514));
adjusted=E.calculate({...overheadInput,shipping:v(57750)},{overhead:v(55700)});
assert.equal(adjusted.overhead,v(55700));assert.equal(adjusted.subtotal,v(557750));assert.equal(adjusted.total,v(613450));
assert.equal(adjusted.rows.find(r=>r.id==='overhead').diff,v(-75));
assert.equal(E.calculate(p).welfareCost,v(37472));
assert.equal(E.calculate({...p,workers:v(1.5)}).welfareCost,v(9368));
assert.equal(E.calculate(p,{labor:v(100000)}).welfareCost,v(10767));
assert.equal(E.calculate({...p,workers:0n}).welfareCost,0n);
console.log('PASS: 諸経費上書き・空欄・0・小計除外・二重計上なし・標準比較・福利原価0.66');
// Batch adoption rounding: specified examples, boundary amounts, dependent overhead and repeatability.
for(const [before,after] of [[1552110,1552000],[155211,155200],[15521,15500],[1550,1500],[1000000,1000000],[999999.99,999900],[100.99,100],[99.99,0],[0,0]])assert.equal(E.roundStandardAmount(v(before)),v(after));
const roundingInput={...p,parts:v(155211),workers:v(1.501),shipping:v(1550)};
const rounded=E.roundedAdoptions(roundingInput);
assert.deepEqual(Object.fromEntries(Object.entries(rounded).map(([k,n])=>[k,E.format(n)])),{labor:'87,000',materials:'7,700',removal:'4,600',shipping:'7,500',protection:'3,100',overhead:'26,500'});
const roundedResult=E.calculate(roundingInput,rounded);
assert.equal(roundedResult.subtotal,v(265111));assert.equal(roundedResult.total,v(305805));assert.equal(roundedResult.welfare,v(14194));assert.equal(roundedResult.welfareCost,v(9368));
assert.deepEqual(E.roundedAdoptions(roundingInput),rounded);
const cascading={...p,parts:v(199),workers:v(.001),shipping:v(195),materialsRate:v(100),removalRate:v(100),protectionRate:v(100)};
assert.equal(E.calculate(cascading).overhead,v(105.3));assert.equal(E.roundedAdoptions(cascading).overhead,0n);
console.log('PASS: 指定4例・100万円境界・100円未満・一括入力・諸経費の再計算順・原価切り捨て');

assert.equal(Object.hasOwn(rounded,'parts'),false);
const keptParts=v(154321),keptRounded=E.roundedAdoptions(roundingInput,keptParts);
assert.equal(Object.hasOwn(keptRounded,'parts'),false);
const keptResult=E.calculate(roundingInput,{...keptRounded,parts:keptParts});
assert.equal(keptResult.subtotal,v(264221));assert.equal(keptResult.overhead,v(26400));assert.equal(keptResult.total,v(304815));
const zeroPartsRounded=E.roundedAdoptions(roundingInput,0n);
const zeroPartsResult=E.calculate(roundingInput,{...zeroPartsRounded,parts:0n});
assert.equal(zeroPartsResult.subtotal,v(109900));assert.equal(zeroPartsResult.overhead,v(10900));
console.log('PASS: 部品代は一括対象外・手動採用額/採用0を保持・保持した部品代から諸経費再計算');

assert.equal(copied('protection',{protection:v(12694)},{...copyInput,parts:v(288500)}),'部品代×2％+6,924（＝部品代4.4％）');
assert.equal(copied('removal',{removal:v(15000)}),'部品代×3％+10,500（＝部品代10％）');
console.log('PASS: 部品代比のコピー注記・小数1桁丸め・整数比率・部品代0・無補正');
// Reference expenses use booked revenue and a gross margin of 38%, not a 38% markup.
const costsBaseline=E.calculate(p);
assert.deepEqual(costsBaseline.costs,{materials:v(26350),removal:v(15810),protection:v(10540),overhead:v(82274),labor:v(216000),welfare:v(37472)});
for(const id of E.expenseCostIds){
 for(const [booked,cost] of [[100000,62000],[10000.99,6200],[0.01,0],[0,0]])assert.equal(E.calculate(p,{[id]:v(booked)}).costs[id],v(cost),id);
}
const revisedCosts=E.calculate(p,{materials:v(70000),overhead:v(55700)});
assert.equal(revisedCosts.costs.materials,v(43400));assert.equal(revisedCosts.costs.overhead,v(34534));
assert.equal(revisedCosts.laborCost,v(216000));assert.equal(revisedCosts.welfareCost,v(37472));
assert.equal(revisedCosts.total,revisedCosts.subtotal+revisedCosts.overhead+revisedCosts.welfare);
assert.equal(E.calculate(p).costs.materials,v(26350));
console.log('PASS: 利益率38％の原価62％・採用額追従・小数切り捨て・0・原価の二重加算なし');
// Independent discount conversions, preserving the existing estimate and reference costs.
assert.deepEqual(E.calculateDiscount(v(500000),v(5),'rate'),{amount:v(25000),after:v(475000),rate:'5％'});
assert.deepEqual(E.calculateDiscount(v(500000),v(30000),'amount'),{amount:v(30000),after:v(470000),rate:'6％'});
assert.equal(E.calculateDiscount(v(500001),v(5),'rate').amount,v(25000.05));
assert.equal(E.calculateDiscount(v(500000.99),v(100),'rate').after,0n);
assert.equal(E.calculateDiscount(v(500000),0n,'rate').after,v(500000));
assert.equal(E.calculateDiscount(0n,0n,'amount').rate,'—');
assert.equal(E.calculateDiscount(v(3),v(1),'amount').rate,'33.33％');
for(const args of [[v(100),v(101),'rate'],[v(100),v(101),'amount'],[v(100),v(-1),'amount'],[0n,v(1),'amount']])assert.throws(()=>E.calculateDiscount(...args),RangeError);
console.log('PASS: 50万円の5％/3万円引き・小数円・0/100％・基準0・見積超過・負数');
