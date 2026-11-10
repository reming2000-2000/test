const assert=require('node:assert/strict');
const E=require('../calc.js'),P=require('../portable.js'),v=E.decimal;
const p=Object.fromEntries(Object.entries({...E.defaults,parts:'850000',workers:'6',shipping:'20000'}).map(([k,n])=>[k,v(n)]));
function source(adopted={},mode='auto',extraItems=[],links={}){const result=E.calculate(p,adopted,mode,extraItems,links);return {p,memos:{materials:'特殊部品 "重量物"：試験'},extraItems,...result};}
const text=s=>P.encode(s,'2026/11/10 10:00:00（日本時間）','auto',false);
for(const [adopted,mode,rounded] of [[{},'auto',false],[E.roundedAdoptions(p),'rounded',true],[{overhead:v('100000')},'manual',true]]){
 const original=source(adopted,mode),copied=P.encode(original,'日時',mode,rounded),decoded=P.decode('メモに貼った場合\n'+copied+'\n別のメモ');
 assert.equal(decoded.result.total,original.total);assert.deepEqual(decoded.p,p);assert.equal(decoded.rounded,rounded);assert.equal(decoded.memos.materials,original.memos.materials);
}
const extra=[{id:'custom_7',label:'試運転調整費 <img src=x>',amount:v('50000')}];
const original=source({materials:v('70000'),overhead:v('140000'),custom_7:0n},'manual',extra);
const copied=P.encode(original,'日時','manual',false),decoded=P.decode(copied),linked=P.forImport(decoded,true);
assert.equal(decoded.extraItems[0].id,'custom_1');assert.equal(decoded.adopted.custom_1,0n);assert.equal(decoded.result.total,original.total);
assert.equal(linked.result.total,original.total);assert.equal(linked.mode,'linked');
const double=E.calculate({...p,parts:v('1700000')},linked.adopted,linked.mode,linked.extraItems,linked.links);
assert.equal(double.rows.find(r=>r.id==='materials').booked,v('140000'));
assert.equal(double.overhead,double.subtotal*v('140000')/original.subtotal);
assert.equal(P.forImport(decoded,false).result.total,original.total);assert.equal(Object.keys(P.forImport(decoded,false).links).length,0);
// Rational links survive repeat exports without rounding the displayed percentage.
for(const parts of ['1234567','850000','0','1700000']){
 const input={...p,parts:v(parts)},result=E.calculate(input,linked.adopted,linked.mode,linked.extraItems,linked.links);
 const next=P.decode(P.encode({p:input,memos:decoded.memos,extraItems:linked.extraItems,...result},'日時',linked.mode,false,linked.links));
 assert.equal(next.result.total,result.total);assert.deepEqual(next.links,linked.links);
}
const zero={...p,parts:0n},zeroResult=E.calculate(zero,{materials:v('10')},'auto');
assert.equal(Object.keys(P.forImport(P.decode(P.encode({p:zero,memos:{},extraItems:[],...zeroResult},'日時','auto',false)),true).links).length,0);
for(const corrupt of [copied.replace('試運転調整費','x'.repeat(50)),copied.replace('部品代：850,000円','部品代：-1円'),copied.replace('部品代：850,000円','部品代：1,23円'),copied.replace('出力日時：日時','出力日時：日時\n部品代：0円'),copied.replace('消耗資材費率：5％','消耗資材費率：abc％'),copied.replace('諸経費連動：手動','諸経費連動：引継率'),copied.replace('採用 部品代：標準\n',''),copied.replace('NekoAssist 簡易シート v1','NekoAssist 簡易シート v2'),copied.replace('見積金額（税別）：','不明項目：'),copied.replace(/見積金額（税別）：[^\n]+/,'見積金額（税別）：0円'),copied+copied,'x'.repeat(50001)])assert.throws(()=>P.decode(corrupt));
const allZero=source({materials:0n,removal:0n,protection:0n},'auto');assert.equal(P.decode(text(allZero)).adopted.materials,0n);
console.log('PASS: 簡易版の全条件復元・任意項目/メモ/採用0・自動/端数/手動・正確な割合連動・再出力・基準0・不正/重複/改変拒否');
