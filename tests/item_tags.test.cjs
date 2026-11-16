const assert=require('node:assert/strict'),E=require('../calc'),P=require('../portable'),v=E.decimal;
const p=Object.fromEntries(Object.entries({...E.defaults,workers:'2'}).map(([k,n])=>[k,v(n)]));
const extras=[{id:'custom_8',label:'交換作業費（業者2）',amount:v('58000'),tag:'labor'},{id:'custom_9',label:'廃油処理／同じ名前 "缶"',amount:v('7000'),tag:'removal'}];
let s=E.calculate(p,{},'auto',extras);
assert.equal(s.welfareBase,v('174000'));assert.equal(s.welfare,v('28388'));assert.equal(s.welfareCost,v('18736'));
assert.equal(s.subtotal,v('189000'));assert.equal(s.overhead,v('18900'));assert.equal(s.total,v('236288'));assert.equal(s.diff,0n);
// Floor once after all labor is summed, not separately for each contractor (which would lose a yen).
assert.equal(E.calculate(p,{custom_8:0n},'auto',extras).welfare,v('18925'));
assert.equal(E.calculate(p,{labor:v('100000'),custom_8:v('10000')},'auto',extras).welfare,v('17946'));
assert.equal(E.calculate(p,{},'auto',extras.map(e=>({...e,tag:'removal'}))).welfare,v('18925'));
assert.equal(E.calculate(p,{},'auto',extras.map(({tag,...e})=>e)).welfare,v('18925'));
assert.equal(E.calculate(p,{},'auto',[{...extras[0],amount:0n}]).welfare,v('18925'));
assert.equal(E.calculate({...p,welfareRate:v('10')},{},'auto',extras).welfare,v('17400'));
const order=['overhead','custom_9','labor','parts','custom_8','materials','shipping','removal','protection'];
let reordered=E.calculate(p,{},'auto',extras,{},order);
for(const key of ['subtotal','welfare','welfareBase','total','standardTotal','diff','laborCost','welfareCost'])assert.equal(reordered[key],s[key],key);
assert.deepEqual(reordered.rows.map(r=>r.id),order);
assert.throws(()=>E.calculate(p,{},'auto',extras,{},order.slice(1)));assert.throws(()=>E.calculate(p,{},'auto',extras,{},order.map(id=>id==='parts'?'labor':id)));
assert.throws(()=>E.calculate(p,{},'auto',[{...extras[0],tag:'unknown'}]));
const memos={custom_8:'作業 "夜間"／追加',custom_9:'オイル2缶',overhead:'調整'},adopted={labor:v('116000'),custom_8:v('70000'),custom_9:0n};
for(const mode of ['auto','rounded','manual']){
 const values={...adopted,overhead:v('15000')},result=E.calculate(p,values,mode,extras,{},order),source={p,extraItems:extras,memos,...result};
 for(const text of [P.encode(source,null,mode,mode==='rounded'),P.encodeV1(source,'日時',mode,mode==='rounded')]){
  const data=P.decode(text);
  assert.equal(data.result.total,result.total);assert.equal(data.result.welfare,result.welfare);
  assert.deepEqual(data.result.rows.map(r=>[r.label,r.tag,r.booked]),result.rows.map(r=>[r.label,r.tag,r.booked]));
  assert.deepEqual(data.result.rows.map(r=>data.memos[r.id]||''),result.rows.map(r=>memos[r.id]||''));
  assert.deepEqual(P.forImport(data,false).result.rows.map(r=>r.id),data.order);
  const next=P.encode({...data,...data.result},null,data.mode,data.rounded,data.links),again=P.decode(next);
  assert.equal(again.result.total,result.total);assert.deepEqual(again.result.rows.map(r=>[r.label,r.tag,r.booked]),data.result.rows.map(r=>[r.label,r.tag,r.booked]));
 }
}
// Tags and full item-order supplements must never be silently dropped on invalid input.
const source={p,extraItems:extras,memos,...reordered},text=P.encode(source,null,'auto',false);
for(const bad of [text.replace('〔交換作業費〕','〔未知〕'),text.replace(/内訳：[^\n]+/,'内訳：部品=0'),text.replace(/内訳：[^\n]+/,m=>m+'／部品=0'),text.replace(/内訳：[^\n]+/,m=>m.replace('諸経費=18,900','諸経費=18,901')),text+'\n'+text.split('\n').find(line=>line.startsWith('内訳：'))])assert.throws(()=>P.decode(bad));
// The standard baseline includes tagged labor too, and adoption differences flow through welfare.
const changed=E.calculate(p,{custom_8:v('70000')},'auto',extras);
assert.equal(changed.standardTotal,s.total);assert.equal(changed.welfare,v('30345'));assert.equal(changed.diff,v('15157'));
console.log('PASS: 複数作業費タグ・採用0/変更・一括切捨て・標準比較・順序非依存・タグ/順序/メモ往復・旧形式互換・不正タグ/重複/欠落/改変拒否');
