const assert = require('node:assert/strict');
const E = require('../calc');
const P = require('../portable');

const decimalFields = values => Object.fromEntries(Object.entries(values).map(([id, value]) => [id, E.decimal(value)]));
const p = decimalFields({...E.defaults, parts:'11599000', workers:'60', shipping:'400000', materialsRate:'2', removalRate:'1'});
const adopted = decimalFields({
 labor:'3480000', materials:'314400', shipping:'650000', removal:'180000',
 protection:'173000', custom_1:'1102000', custom_2:'756000', overhead:'1825400'
});
const extras = [
 {id:'custom_1', label:'試運転調整費', amount:E.decimal('1102000'), tag:'other'},
 {id:'custom_2', label:'現場管理費', amount:E.decimal('756000'), tag:'other'}
];
// Exact output from v1.5.0 for the example, including the old redundant breakdown.
const old = `見積20,647,562円（税別）｜部品11,599,000円・60人・部品送料400,000円
掛率：資材2%／撤去1%／養生2%／諸経費10%／福利16.315%
単価：作業58,000円／人・運搬4,000円／人
採用：作業=3,480,000／資材=314,400／運搬=650,000／撤去=180,000／養生=173,000／追加1=1,102,000／追加2=756,000
諸経費1,825,400（手動）｜端数調整なし｜その他は標準
追加1："試運転調整費"／1,102,000円
追加2："現場管理費"／756,000円
内訳：部品=11,599,000／作業=3,480,000／資材=314,400／運搬=650,000／撤去=180,000／養生=173,000／追加1=1,102,000／追加2=756,000／諸経費=1,825,400`;

function roundTrip({input=p, amounts=adopted, items=extras, memos={}, mode='manual', rounded=false, links={}, order}={}){
 const result=E.calculate(input,amounts,mode,items,links,order);
 const text=P.encode({p:input,extraItems:items,memos,...result},null,mode,rounded,links);
 const decoded=P.decode(text);
 const restored=P.forImport(decoded,false);
 assert.deepEqual(restored.p,input);
 assert.deepEqual(restored.links,links);
 assert.equal(restored.mode,mode);
 assert.equal(restored.rounded,rounded);
 // Custom IDs are assigned from the serialized order. Compare the displayed rows and their data.
 const snapshot=(rows,notes)=>rows.map(row=>[row.label,row.standard,row.adopted,row.booked,row.tag,notes[row.id]??'']);
 assert.deepEqual(snapshot(restored.result.rows,restored.memos),snapshot(result.rows,memos));
 assert.deepEqual(restored.order,restored.result.rows.map(row=>row.id));
 for(const extra of restored.extraItems){
  const row=restored.result.rows.find(item=>item.id===extra.id);
  assert.deepEqual([extra.label,extra.amount,extra.tag],[row.label,row.standard,row.tag]);
 }
 for(const key of ['total','subtotal','standardTotal','overhead','welfare','welfareBase','costs'])assert.deepEqual(restored.result[key],result[key]);
 assert.equal(P.encode({...restored,...restored.result},null,restored.mode,restored.rounded,restored.links),text);
 return {text,decoded};
}

const {text,decoded}=roundTrip();
assert.deepEqual(decoded,P.decode(old));
assert.deepEqual(P.decode(text.replace('(2.71%)','(99.99%)')),decoded);
assert.equal(P.forImport(P.decode(text.replace('(2.71%)','(99.99%)')),true).links.materials.amount,adopted.materials);
assert.equal(P.forImport(decoded,true).links.materials.base,p.parts);
assert.equal(old.length,385);
assert.equal(text.length,292);
assert.ok(!text.includes('内訳：'));
assert.match(text,/資材=314,400\(2\.71%\)／運搬=650,000／撤去=180,000\(1\.55%\)／養生=173,000\(1\.49%\)/);
assert.match(text,/追加1=1,102,000／追加2=756,000/);
assert.match(text,/掛率：資材2%／撤去1%／養生2%/);

// Standard, amount fixed at the standard, explicit zero, and trailing zero omission.
const standard = roundTrip({amounts:{},items:[],mode:'auto',input:{...p,materialsRate:E.decimal('5.3')},memos:{materials:'標準のまま／補足(5%)'}});
assert.match(standard.text,/採用：資材=標準（"標準のまま／補足\(5%\)"）/);
const fixed = roundTrip({
 input:{...p,parts:E.decimal('100000'),materialsRate:E.decimal('5')},
 amounts:decimalFields({parts:'200000',materials:'5000',removal:'0',protection:'2500'}),
 items:[],mode:'auto'
});
assert.match(fixed.text,/資材=5,000／撤去=0\(0%\)／養生=2,500\(2\.5%\)/);
assert.equal(fixed.decoded.adopted.materials,E.decimal('5000'));
assert.equal(fixed.decoded.adopted.removal,0n);
assert.match(roundTrip({input:{...p,parts:0n},items:[]}).text,/資材=314,400／運搬/);
assert.match(roundTrip({input:{...p,parts:E.decimal('100000')},amounts:decimalFields({materials:'10000'}),items:[],mode:'auto'}).text,/資材=10,000\(10%\)/);

// Exercise all overhead modes, exact fractional links, explicit extra adoptions, tags and display order.
const tagged = [
 {id:'custom_3',label:'追加調整 "A"／夜間',amount:E.decimal('1102000'),tag:'labor'},
 {id:'custom_9',label:'追加調整 "A"／夜間',amount:E.decimal('756000'),tag:'other'},
 {id:'custom_5',label:'引取',amount:E.decimal('7200.25'),tag:'removal'}
];
const notes={custom_3:'標準額のまま／共有',custom_9:'同額で固定 "確認済み"',custom_5:'0円に調整',materials:'途中の\"記号／(1%)',overhead:'諸経費メモ'};
const values={...adopted,custom_9:tagged[1].amount,custom_5:0n};
const links={materials:{amount:E.decimal('314400'),base:E.decimal('11692000')},overhead:{amount:E.decimal('100000'),base:E.decimal('1000111')}};
for(const mode of ['auto','rounded','manual','linked']){
 for(const order of [E.defaultOrder(tagged),E.defaultOrder([...tagged].reverse()),['overhead',...E.defaultOrder(tagged).slice(0,-1)]]){
  const activeLinks=mode==='linked'?links:{};
  for(const rounded of mode==='rounded'?[true]:[false,true]){
   const options={items:tagged,amounts:values,memos:notes,mode,rounded,links:activeLinks,order};
   const {text:current,decoded:data}=roundTrip(options);
   assert.equal(current.includes('内訳：'),order[0]==='overhead');
   const previousLegacy=P.encodeV1({p,extraItems:tagged,memos:notes,...E.calculate(p,values,mode,tagged,activeLinks,order)},'日時',mode,rounded,activeLinks);
   const legacy=P.decode(previousLegacy);
   assert.deepEqual(legacy.result.rows.map(row=>[row.label,row.tag,row.booked,row.adopted,legacy.memos[row.id]]),data.result.rows.map(row=>[row.label,row.tag,row.booked,row.adopted,data.memos[row.id]]));
   if(mode==='linked')assert.deepEqual(P.decode(current.replace(/(資材=[\d,.]+)\([\d.]+%\)/,'$1(99%)')).links,links);
  }
 }
}

for(const corrupt of [
 text.replace('資材=314,400','資材=31,44,00'),text.replace('資材=314,400','資材=標準'),
 text.replace('資材=314,400','資材=314,401'),text.replace('(2.71%)','(2.711%)'),
 text.replace('運搬=650,000','運搬=650,000(3%)'),text.replace('(2.71%)','(未入力%)'),
 text.replace(/\n追加1：[^\n]+/,''),text.replace(/\n掛率：[^\n]+/,''),
 old.replace('内訳：部品=11,599,000','内訳：部品=11,599,001'),old.replace('／追加2=756,000／諸経費=','／諸経費=')
])assert.throws(()=>P.decode(corrupt));

// Escaped text can expand beyond 50,000 characters during internal conversion.
const longItems=Array.from({length:58},(_,index)=>({
 id:'custom_'+(index+1),label:'調'+String.fromCharCode(1).repeat(39),amount:0n,tag:'other'
}));
const longMemos=Object.fromEntries(longItems.map(({id})=>[id,String.fromCharCode(2).repeat(100)]));
const long=roundTrip({items:longItems,memos:longMemos,amounts:{},mode:'auto'}).text;
assert.ok(long.length<50000);
assert.throws(()=>P.decode(long+' '.repeat(50001-long.length)),/50,000文字/);

console.log('PASS: 実質掛率の対象・桁数・参考値無視／固定・0円・タグ・メモ・順序・諸経費全モード・端数設定の完全復元／旧形式・破損検出・再出力／385→292文字');
