/* Decimal fixed point: 12 places, with BigInt to avoid currency floating-point errors. */
(function (root) {
  'use strict';
  const SCALE = 10n ** 12n;
  const defaults = {parts:'0',workers:'0',shipping:'0',materialsRate:'5',removalRate:'3',protectionRate:'2',laborPrice:'58000',workerShipping:'4000',overheadRate:'10',welfareRate:'16.315'};
  const laborCostPrice = 36000n * SCALE;
  const items = [['parts','部品代'],['labor','交換作業費'],['materials','消耗資材費'],['removal','撤去品引取費'],['shipping','部品送料・運搬交通費'],['protection','養生・安全対策費']];
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
  function calculate(input,adopted={}) {
    const p=input, standard={parts:p.parts,materials:percent(p.parts,p.materialsRate),removal:percent(p.parts,p.removalRate),protection:percent(p.parts,p.protectionRate),labor:mul(p.workers,p.laborPrice),shipping:mul(p.workers,p.workerShipping)+p.shipping};
    const rows=items.map(([id,label])=>{const adoption=adopted[id]??null;const booked=adoption??standard[id];return {id,label,standard:standard[id],adopted:adoption,booked,diff:booked-standard[id]};});
    const subtotal=rows.reduce((a,r)=>a+r.booked,0n), standardSubtotal=rows.reduce((a,r)=>a+r.standard,0n);
    const overhead=percent(subtotal,p.overheadRate), welfare=percent(rows.find(r=>r.id==='labor').booked,p.welfareRate)/SCALE*SCALE;
    const total=subtotal+overhead+welfare, standardTotal=standardSubtotal+percent(standardSubtotal,p.overheadRate)+percent(standard.labor,p.welfareRate)/SCALE*SCALE;
    return {rows,subtotal,overhead,welfare,total,standardTotal,diff:total-standardTotal,laborCost:mul(p.workers,laborCostPrice)};
  }
  const api={SCALE,laborCostPrice,defaults,items,decimal,parse,format,yen,signed,ratio,calculate};
  if(typeof module!=='undefined') module.exports=api; else root.Estimate=api;
})(typeof window!=='undefined'?window:globalThis);
