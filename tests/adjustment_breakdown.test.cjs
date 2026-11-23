const assert=require('node:assert/strict'),E=require('../calc'),v=E.decimal;
const p=Object.fromEntries(Object.entries({...E.defaults,parts:'850000',workers:'6',shipping:'20000'}).map(([id,n])=>[id,v(n)]));
function check(p,adopted={},mode='auto',extra=[],links={},order=[]){
 const r=E.calculate(p,adopted,mode,extra,links,order),before=E.calculate(p,{},'auto',extra);
 const b=E.adjustmentBreakdown(r,p);
 assert.equal(b.direct,r.subtotal-before.subtotal);
 assert.equal(b.overhead,r.overhead-before.overhead);
 assert.equal(b.welfare,r.welfare-before.welfare);
 assert.equal(b.total,b.direct+b.overhead+b.welfare);assert.equal(b.total,r.diff);
 return b;
}
assert.deepEqual(check(p),{direct:0n,overhead:0n,welfare:0n,total:0n});
assert.deepEqual(check(p,{materials:v('70000')}),{direct:v('27500'),overhead:v('2750'),welfare:0n,total:v('30250')});
const extras=[{id:'custom_1',label:'業者2',amount:v('58000'),tag:'labor'},{id:'custom_2',label:'廃油',amount:v('7350.55'),tag:'removal'}];
for(const input of [p,{...p,parts:0n,workers:v('1.501'),welfareRate:v('16.317')},{...p,parts:v('999999999999.99'),overheadRate:v('999.999')}])
 for(const extra of [[],extras])
  for(const mode of ['auto','rounded','manual'])
   for(const adopted of [{},{materials:v('70000'),labor:v('406000'),custom_1:v('70000')},{parts:0n,labor:0n,overhead:0n,custom_1:0n},{materials:v('42500'),overhead:v('55774'),custom_2:v('7000')},E.roundedAdoptions(input,null,extra)])
    check(input,adopted,mode,extra);
const links={materials:{amount:v('70000'),base:p.parts},overhead:{amount:v('100000'),base:v('1342500')}};
check(p,{},'linked',extras,links,E.defaultOrder(extras).reverse());
check({...p,parts:v('381200')},{},'linked',extras,links);
console.log('PASS: 補正内訳の標準基準・増減/0/小数/上限・諸経費全モード・固定/割合連動・追加/作業費タグ/順序・3項目と総補正額の一致');
