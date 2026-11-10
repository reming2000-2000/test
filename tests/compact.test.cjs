const assert=require('node:assert/strict'),E=require('../calc'),P=require('../portable');
const p=Object.fromEntries(Object.entries({...E.defaults,parts:'381200',workers:'4',shipping:'8000'}).map(([k,v])=>[k,E.decimal(v)]));
for(const mode of ['auto','rounded','manual'])for(const memo of ['オイル2缶','引用"／区切り（ ） \\ "／テスト','NekoAssist 簡易シート v1']){
 const extraItems=[{id:'custom_4',label:'試運転／"調整"',amount:E.decimal('5000')}],adopted={materials:E.decimal('19000'),removal:E.decimal('19400'),custom_4:0n,overhead:E.decimal('68300')};
 const original={p,extraItems,memos:{materials:memo,overhead:memo,custom_4:memo},...E.calculate(p,adopted,mode,extraItems)};
 const text=P.encode(original,'2026/11/10 09:05（日本時間）',mode,true),data=P.decode(text);
 assert.equal(data.result.total,original.total);assert.deepEqual(data.p,p);assert.equal(data.memos.materials,memo);assert.equal(data.memos.overhead,memo);assert.equal(data.memos.custom_1,memo);assert.equal(data.adopted.custom_1,0n);
 const linked=P.forImport(data,true),next={p,extraItems:linked.extraItems,memos:linked.memos,...linked.result};
 assert.deepEqual(P.decode(P.encode(next,'日時',linked.mode,true,linked.links)).links,linked.links);
 assert.equal(P.decode(P.encodeV1(original,'日時',mode,true)).result.total,original.total);
 for(const bad of [text.replace('資材5%','資材abc%'),text.replace('採用：','未対応：'),text+'\n追加99：不正',text.replace('部品381,200','部品1,23')])assert.throws(()=>P.decode(bad));
}
const original={p,extraItems:[],memos:{},...E.calculate(p,{},'auto')};assert.equal(P.encode(original,'日時','auto',false).split('\n').length,5);assert.equal(P.decode(P.encode(original,'日時','auto',false)).result.total,original.total);
console.log('PASS: 5行形式・旧形式互換・全モード・掛率連動・メモの記号/引用符・任意項目/採用0・不正拒否');
