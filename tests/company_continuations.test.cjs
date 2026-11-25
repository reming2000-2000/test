const assert = require('node:assert/strict');
const C = require('../company-import');
const E = require('../calc');
const {mixedSample} = require('./company_sample.cjs');

const yen=E.decimal;
const doc=C.parse(mixedSample);
assert.equal(doc.items.length,13);
assert.ok(doc.items.every(item=>item.status==='auto'));
assert.equal(doc.items.filter(item=>item.amount===0n).length,1);
assert.equal(doc.items.find(item=>item.amount===0n).name,'架空無償部品');
assert.deepEqual(doc.summaries.map(row=>row.amount),[yen('1627000'),yen('1740000')]);
assert.match(C.workersHint(doc).reason,/原価行の備考 12人×58,000 → 12人工/);
const plan=C.plan(doc);
assert.deepEqual(plan.errors,[]);
assert.equal(plan.data.p.parts,yen('858000'));
assert.equal(plan.data.p.workers,yen('12'));
assert.equal(plan.data.adopted.materials,yen('28000'));
assert.equal(plan.data.adopted.shipping,yen('15000'));
assert.equal(plan.data.adopted.removal,yen('6000'));
assert.equal(plan.data.adopted.protection,yen('4000'));
assert.equal(plan.data.adopted.overhead,yen('20000'));
assert.equal(plan.result.welfare,yen('113552'));
assert.equal(plan.discount,yen('-552'));
assert.equal(plan.result.total,yen('1740552'));
assert.equal(plan.difference,0n);
assert.ok(!plan.warnings.some(warning=>warning.includes('一致しません')));

// A named zero-price sale is preserved; FREE alone does not make it a heading.
const zeroSales=[
 '31\tFREE\t無償サービス\t\t\t\t0',
 '32\tFREE\t【無償サービス】\t\t1\t0\t0',
 '33\tFREE\t【有償サービス】\t\t\t\t200',
 '34\t別区分\t架空の売価品\t台\t1\t100\t100',
 '35\t\t区分のない売価品\t台\t1\t100\t100'
];
const more=C.parse(mixedSample+'\n'+zeroSales.join('\n'));
assert.deepEqual(more.items.slice(-5).map(({status,amount})=>[status,amount]),[
 ['unclassified',0n],['unclassified',0n],['unclassified',yen('200')],
 ['unclassified',yen('100')],['unclassified',yen('100')]
]);
const onlyUnknown=C.parse('4\t不明区分\t架空費目\t\t1\t100\t100');
assert.equal(onlyUnknown.items[0].status,'unclassified');
const possiblyTruncated=C.parse('4\tFREE部品\t架空部品\t\t1\t100\t100\n5\t別区分\t架空費目\t台\t1\t100');
assert.equal(possiblyTruncated.items[1].status,'error');

const unknown=[
 '31\t別区分\t売価金額のない費目\t台\t1\t200\t不明',
 '32\tFREE部品\t架空の売価明細\t\t1\t300\t壊れた額',
 'ABC-999\t型式\t台\t200\t200', // no verified sale anchor
 '33\tFREE部品\t後続の架空明細\t\t1\t300\t300',
 'ABC-888\t型式\t台\t不明\t150,000'
];
const damaged=C.parse(mixedSample+'\n'+unknown.join('\n'));
assert.deepEqual(damaged.items.slice(-5).map(({status,raw})=>[status,raw]),[
 ['error',unknown[0]],['error',unknown[1]],['error',unknown[2]],['auto',undefined],['error',unknown[4]]
]);
assert.equal(C.plan(damaged).errors.length,4);
assert.equal(C.plan(damaged).sourceTotal,null);
const reportedWrong=C.plan(C.parse(mixedSample.replace('1,740,000','1,740,001')));
assert.equal(reportedWrong.difference,-yen('1'));
assert.ok(reportedWrong.warnings.some(warning=>warning.includes('一致しません')));

// Keep human evidence separate from price data and require confirmation in ambiguous cases.
assert.equal(C.workersHint(C.parse(mixedSample.replace('12人×58,000','12人×58,000／13人×58,000'))).value,'');
assert.equal(C.workersHint(C.parse(mixedSample.replace('12人×58,000','12人×2日'))).value,'');
assert.equal(C.workersHint(C.parse(mixedSample.replace('12人×58,000','696,000÷58,000'))).value,'');
assert.equal(C.workersHint(C.parse(mixedSample.replace('交換作業費\t\t1','交換作業費\t13日×1名\t1'))).value,'');
assert.equal(C.workersHint(C.parse(mixedSample.replace('交換作業費\t\t1','交換作業費\t12人工\t1'))).value,'12');

const headed='番号\t区分\t品名\t備考\t数量\t単価\t売価金額\t原価\n'+mixedSample;
const withHeader=C.parse(headed);
assert.deepEqual(C.plan(withHeader).errors,[]);
assert.equal(C.plan(withHeader).difference,0n);

console.log('PASS: 型式・単位・番号から始まる原価補助行、FREE見出しと0行、小計・値引・福利費、原価備考の作業人員、実売価0円、未読取の原文、合計照合');
