/* Decimal fixed point: 12 places, with BigInt to avoid currency floating-point errors. */
(function (root) {
  'use strict';
  const SCALE = 10n ** 12n;
  const defaults = {parts:'0',workers:'0',shipping:'0',materialsRate:'5',removalRate:'3',protectionRate:'2',laborPrice:'58000',workerShipping:'4000',overheadRate:'10',welfareRate:'16.315'};
  const expenseCostIds=['materials','removal','protection','overhead'];
  const laborCostPrice = 36000n * SCALE;
  const items = [['parts','部品代'],['labor','交換作業費'],['materials','消耗資材費'],['shipping','部品送料・運搬交通費'],['removal','撤去品引取費'],['protection','養生・安全対策費'],['overhead','諸経費']];
  function decimal(s) { const [a,b=''] = String(s).split('.'); return BigInt(a || '0')*SCALE+BigInt(b.padEnd(12,'0')); }
  const mul=(a,b)=>a*b/SCALE, percent=(a,b)=>a*b/(100n*SCALE);
  function parse(raw, kind='money', optional=false) {
    const s=String(raw).normalize('NFKC').trim();
    if (!s) return {value:optional?null:0n,error:''};
    const cleaned=s.replaceAll(',','');
    if (s.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return {value:0n,error:'カンマの位置を確認してください'};
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return {value:0n,error:'0以上の数値を入力してください'};
    const digits=kind==='decimal'||kind==='rate'?3:2;
    if ((cleaned.split('.')[1]||'').length>digits) return {value:0n,error:`小数${digits}桁まで入力できます`};
    const value=decimal(cleaned), max=kind==='rate'?1000n:kind==='decimal'?1000000n:1000000000000n;
    if(value>max*SCALE) return {value:0n,error:`上限は${max.toLocaleString('ja-JP')}です`};
    return {value,error:''};
  }
  function format(value) { const sign=value<0n?'-':''; const v=value<0n?-value:value; const fraction=(v%SCALE).toString().padStart(12,'0').replace(/0+$/,''); return sign+(v/SCALE).toLocaleString('ja-JP')+(fraction?'.'+fraction:''); }
  const yen=v=>format(v)+'円';
  const signed=v=>(v>0n?'＋':v<0n?'－':'')+yen(v<0n?-v:v);
  function ratio(diff,base,digits=1,signedValue=true) {
    if(base===0n) return '—（基準額0円）';
    const magnitude=diff<0n?-diff:diff, power=10n**BigInt(digits);
    const scaled=(magnitude*100n*power+base/2n)/base;
    return (signedValue?(diff>0n?'＋':diff<0n?'－':''):'')+(scaled/power).toString()+'.'+(scaled%power).toString().padStart(digits,'0')+'％';
  }
  function copyBasis(p,row) {
    const bases={parts:'基本入力の部品代',labor:`${format(p.workers)}人×${format(p.laborPrice)}`,materials:`部品代×${format(p.materialsRate)}％`,removal:`部品代×${format(p.removalRate)}％`,shipping:`${format(p.workers)}人×${format(p.workerShipping)}+${format(p.shipping)}`,protection:`部品代×${format(p.protectionRate)}％`,overhead:`小計×${format(p.overheadRate)}％`};
    const adjustment=row.diff===0n?'':(row.diff>0n?'+':'-')+format(row.diff<0n?-row.diff:row.diff);
    const showPartsRatio=['materials','removal','protection'].includes(row.id)&&row.diff!==0n&&p.parts>0n;
    const partsRatio=showPartsRatio?'（＝部品代'+ratio(row.booked,p.parts,1,false).replace(/\.0％$/,'％')+'）':'';
    return bases[row.id]+adjustment+partsRatio;
  }
  function calculate(input,adopted={},overheadMode='manual') {
    const p=input, standard={parts:p.parts,materials:percent(p.parts,p.materialsRate),removal:percent(p.parts,p.removalRate),protection:percent(p.parts,p.protectionRate),labor:mul(p.workers,p.laborPrice),shipping:mul(p.workers,p.workerShipping)+p.shipping};
    function makeRow([id,label]) {const adoption=id==='overhead'&&overheadMode==='auto'?null:id==='overhead'&&overheadMode==='rounded'?roundStandardAmount(standard[id]):adopted[id]??null;const booked=adoption??standard[id];return {id,label,standard:standard[id],adopted:adoption,booked,diff:booked-standard[id]};}
    // The overhead base comprises only the six direct costs, even when overhead is overridden.
    const rows=items.filter(([id])=>id!=='overhead').map(makeRow);
    const subtotal=rows.reduce((a,r)=>a+r.booked,0n), standardSubtotal=rows.reduce((a,r)=>a+r.standard,0n);
    standard.overhead=percent(subtotal,p.overheadRate);
    const overheadRow=makeRow(items.find(([id])=>id==='overhead'));
    rows.push(overheadRow);
    const overhead=overheadRow.booked, welfare=percent(rows.find(r=>r.id==='labor').booked,p.welfareRate)/SCALE*SCALE;
    const total=subtotal+overhead+welfare, standardTotal=standardSubtotal+percent(standardSubtotal,p.overheadRate)+percent(standard.labor,p.welfareRate)/SCALE*SCALE;
    const laborCost=mul(p.workers,laborCostPrice)/SCALE*SCALE,welfareCost=mul(welfare,decimal('0.66'))/SCALE*SCALE;
    // Margin is profit / selling price: 38% margin means cost is 62% of booked revenue.
    const costs=Object.fromEntries(expenseCostIds.map(id=>[id,percent(rows.find(row=>row.id===id).booked,62n*SCALE)/SCALE*SCALE]));
    Object.assign(costs,{labor:laborCost,welfare:welfareCost});
    return {rows,subtotal,overhead,welfare,total,standardTotal,diff:total-standardTotal,laborCost,welfareCost,costs};
  }
  function roundStandardAmount(value) {
    const unit=(value>=1000000n*SCALE?1000n:100n)*SCALE;
    return value/unit*unit;
  }
  function roundedAdoptions(input,partsAdoption=null) {
    const adopted=Object.fromEntries(calculate(input).rows.filter(row=>row.id!=='overhead'&&row.id!=='parts').map(row=>[row.id,roundStandardAmount(row.standard)]));
    // Keep the current parts amount; use it with the five rounded costs as the overhead base.
    adopted.overhead=roundStandardAmount(calculate(input,{...adopted,parts:partsAdoption}).rows.find(row=>row.id==='overhead').standard);
    return adopted;
  }
  function calculateDiscount(total,value,mode) {
    if(total<0n||value<0n||!['rate','amount'].includes(mode))throw new RangeError('値引の条件を確認してください');
    if(mode==='rate'&&value>100n*SCALE)throw new RangeError('値引率は100％以下で入力してください');
    const amount=mode==='rate'?percent(total,value):value;
    if(amount>total)throw new RangeError('値引額は見積金額以下で入力してください');
    return {amount,after:total-amount,rate:total===0n?'—':ratio(amount,total,2,false).replace(/\.00％$/,'％').replace(/(\.\d)0％$/,'$1％')};
  }
  const api={SCALE,expenseCostIds,laborCostPrice,defaults,items,decimal,parse,format,yen,signed,ratio,calculate,copyBasis,roundStandardAmount,roundedAdoptions,calculateDiscount};
  if(typeof module!=='undefined') module.exports=api; else root.Estimate=api;
})(typeof window!=='undefined'?window:globalThis);
