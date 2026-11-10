/* Human-readable, versioned copy/paste format. No network or persistent storage. */
(function(root){
 'use strict';
 const E=typeof module!=='undefined'?require('./calc.js'):root.Estimate;
 const fields=[['parts','部品代','円','money'],['workers','作業人員','人','decimal'],['shipping','部品送料','円','money'],['materialsRate','消耗資材費率','％','rate'],['removalRate','撤去品引取費率','％','rate'],['protectionRate','養生・安全対策費率','％','rate'],['laborPrice','交換作業売価単価','円／人','money'],['workerShipping','作業員送料単価','円／人','money'],['overheadRate','諸経費率','％','rate'],['welfareRate','法定福利費率','％','rate']];
 const linkedIds=['materials','removal','protection','overhead'];
 const start='NekoAssist 簡易シート v1',end='NekoAssist 簡易シート 終了';
 const modes={auto:'自動',rounded:'端数自動',manual:'手動',linked:'引継率'};
 function encodeV1(s,time,mode,rounded,links={}){
  const lines=[start,'出力日時：'+time,'【基本条件】'];
  fields.forEach(([id,label,unit],i)=>{if(i===3)lines.push('【掛率・単価】');lines.push(label+'：'+E.format(s.p[id])+unit);});
  lines.push('【採用額・メモ】');
  const names=new Map(E.items);
  s.extraItems.forEach((item,i)=>{const name='追加'+(i+1);names.set(item.id,name);lines.push(name+' 名称：'+JSON.stringify(item.label),name+' 金額：'+E.yen(item.amount));});
  for(const row of s.rows){
   const name=names.get(row.id);
   lines.push('採用 '+name+'：'+(row.adopted===null?'標準':E.yen(row.adopted)));
   if(s.memos[row.id])lines.push('メモ '+name+'：'+JSON.stringify(s.memos[row.id]));
   if(links[row.id])lines.push('引継 '+name+'：'+E.format(links[row.id].amount)+'/'+E.format(links[row.id].base));
  }
  lines.push('諸経費連動：'+modes[mode],'端数調整：'+(rounded?'あり':'なし'),'見積金額（税別）：'+E.yen(s.total),end);
  const text=lines.join('\n');
  if(s.extraItems.length>100||text.length>50000)throw Error('簡易版は追加100項目・50,000文字までです。');
  return text;
 }
 function decodeV1(text){
  if(typeof text!=='string'||text.length>50000)throw Error('簡易版は50,000文字以内で貼り付けてください。');
  const lines=text.replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim());
  const begin=lines.indexOf(start),finish=lines.indexOf(end);
  if(begin<0||finish<=begin||lines.lastIndexOf(start)!==begin||lines.lastIndexOf(end)!==finish)throw Error('「NekoAssist 簡易シート v1」から「終了」までを貼り付けてください。');
  const entries=new Map();
  const sections=new Set(['【基本条件】','【掛率・単価】','【採用額・メモ】']);
  for(const line of lines.slice(begin+1,finish)){
   if(!line||sections.has(line))continue;
   const sep=line.indexOf('：');
   if(sep<1)throw Error('読み取れない行があります：'+line.slice(0,40));
   const key=line.slice(0,sep),value=line.slice(sep+1).trim();
   if(entries.has(key))throw Error('項目が重複しています：'+key);
   entries.set(key,value);
  }
  function take(key,optional=false){if(!entries.has(key)){if(optional)return undefined;throw Error('項目が不足しています：'+key);}const value=entries.get(key);entries.delete(key);return value;}
  function amount(value,key,precise=false){
   const s=value.replace(/円$/,'');if(!s||s.length>40)throw Error(key+'の数値を確認してください。');
   if(!precise){const p=E.parse(s);if(p.error)throw Error(key+'：'+p.error);return p.value;}
   if(!/^\d{1,3}(?:,\d{3})*(?:\.\d{1,12})?$|^\d+(?:\.\d{1,12})?$/.test(s))throw Error(key+'の金額を確認してください。');
   const v=E.decimal(s.replaceAll(',',''));if(v>1000000000000000000n*E.SCALE)throw Error(key+'が上限を超えています。');return v;
  }
  function quoted(value,key,max){let s;try{s=JSON.parse(value);}catch{throw Error(key+'の引用符を確認してください。');}if(typeof s!=='string'||!s.length||s.length>max||/[\r\n]/.test(s))throw Error(key+'は改行なしの1〜'+max+'文字で指定してください。');return s;}
  const time=take('出力日時');if(!time||time.length>100)throw Error('出力日時を確認してください。');
  const p={};
  for(const [id,label,unit,kind] of fields){const raw=take(label);if(!raw.endsWith(unit))throw Error(label+'の単位を確認してください。');const parsed=E.parse(raw.slice(0,-unit.length),kind);if(parsed.error)throw Error(label+'：'+parsed.error);p[id]=parsed.value;}
  const extraItems=[],names=new Map(E.items);
  for(let i=1;i<=100;i++){
   const key='追加'+i,raw=take(key+' 名称',true);if(raw===undefined)break;
   const id='custom_'+i;extraItems.push({id,label:quoted(raw,key+' 名称',40),amount:amount(take(key+' 金額'),key)});names.set(id,key);
  }
  const adopted={},memos={},links={};
  for(const [id,name] of names){
   const raw=take('採用 '+name);adopted[id]=raw==='標準'?null:amount(raw,name,true);
   const memo=take('メモ '+name,true);memos[id]=memo===undefined?'':quoted(memo,'メモ '+name,100);
   const link=take('引継 '+name,true);
   if(link!==undefined){
    if(!linkedIds.includes(id))throw Error('この項目は掛率連動に対応していません。');
    const pieces=link.split('/');if(pieces.length!==2)throw Error('引継率の書式を確認してください。');
    const numerator=amount(pieces[0],name,true),base=amount(pieces[1],name,true);
    if(base===0n||adopted[id]===null)throw Error('引継率の基準額を確認してください。');
    links[id]={amount:numerator,base};
   }
  }
  const modeName=take('諸経費連動'),mode=Object.keys(modes).find(key=>modes[key]===modeName);
  const rounding=take('端数調整');if(!mode||!['あり','なし'].includes(rounding))throw Error('諸経費の連動設定を確認してください。');
  if((mode==='linked')!==!!links.overhead||(mode==='rounded'&&rounding!=='あり'))throw Error('諸経費の連動設定に矛盾があります。');
  const total=amount(take('見積金額（税別）'),'見積金額',true);
  if(entries.size)throw Error('未対応の項目があります：'+entries.keys().next().value);
  for(const [id,value] of Object.entries(adopted))if(value!==null&&!links[id]&&!(id==='overhead'&&mode==='rounded')&&E.parse(E.format(value)).error)throw Error('手動採用額の範囲・小数桁を確認してください。');
  const result=E.calculate(p,adopted,mode,extraItems,links);
  if(result.total!==total||result.rows.some(row=>row.adopted!==adopted[row.id]))throw Error('金額と計算条件が一致しません。コピーした簡易版を省略せず貼り付けてください。');
  return {p,adopted,memos,extraItems,mode,rounded:rounding==='あり',links,time,result};
 }
 function forImport(data,proportional){
  const links={...data.links};let mode=data.mode;
  if(proportional){
   for(const id of linkedIds){
    if(links[id]||data.adopted[id]===null||(id==='overhead'&&data.mode!=='manual'))continue;
    const base=id==='overhead'?data.result.subtotal:data.p.parts;
    if(base>0n){links[id]={amount:data.adopted[id],base};if(id==='overhead')mode='linked';}
   }
  }
  return {...data,links,mode,result:E.calculate(data.p,data.adopted,mode,data.extraItems,links)};
 }

 const shortNames={parts:'部品',labor:'作業',materials:'資材',shipping:'運搬',removal:'撤去',protection:'養生',overhead:'諸経費'};
 const fixedLabels=Object.fromEntries(E.items);
 function splitEntries(text){
  const entries=[];let current='',quoted=false,escaped=false;
  for(const ch of text){if(ch==='／'&&!quoted){entries.push(current);current='';continue;}current+=ch;if(escaped){escaped=false;continue;}if(ch==='\\'&&quoted){escaped=true;continue;}if(ch==='"')quoted=!quoted;}
  if(quoted)throw Error('メモの引用符を確認してください。');entries.push(current);return entries;
 }
 function encode(s,time,mode,rounded,links={}){
  const fmt=E.format,lines=[`見積${fmt(s.total)}円（税別）｜部品${fmt(s.p.parts)}円・${fmt(s.p.workers)}人・部品送料${fmt(s.p.shipping)}円｜${time}`,
   `掛率：資材${fmt(s.p.materialsRate)}%／撤去${fmt(s.p.removalRate)}%／養生${fmt(s.p.protectionRate)}%／諸経費${fmt(s.p.overheadRate)}%／福利${fmt(s.p.welfareRate)}%`,
   `単価：作業${fmt(s.p.laborPrice)}円／人・運搬${fmt(s.p.workerShipping)}円／人`];
  const names={...shortNames};s.extraItems.forEach((item,i)=>names[item.id]='追加'+(i+1));
  const entries=s.rows.filter(r=>r.id!=='overhead'&&(r.adopted!==null||s.memos[r.id])).map(r=>names[r.id]+'='+(r.adopted===null?'標準':fmt(r.adopted))+(s.memos[r.id]?'（'+JSON.stringify(s.memos[r.id])+'）':''));
  lines.push('採用：'+(entries.join('／')||'すべて標準'));
  lines.push('諸経費'+(s.rows.find(r=>r.id==='overhead').adopted===null?'標準':fmt(s.overhead))+'（'+modes[mode]+'）｜端数調整'+(rounded?'あり':'なし')+'｜その他は標準'+(s.memos.overhead?'｜メモ：'+JSON.stringify(s.memos.overhead):''));
  s.extraItems.forEach((item,i)=>lines.push('追加'+(i+1)+'：'+JSON.stringify(item.label)+'／'+fmt(item.amount)+'円'));
  if(Object.keys(links).length)lines.push('連動：'+Object.entries(links).map(([id,link])=>names[id]+E.format(link.amount)+'/'+E.format(link.base)).join('／'));
  const text=lines.join('\n');if(s.extraItems.length>100||text.length>50000)throw Error('簡易版は追加100項目・50,000文字までです。');return text;
 }
 function decode(text){
  if(typeof text!=='string'||text.length>50000)throw Error('簡易版は50,000文字以内で貼り付けてください。');
  if(text.split(/\r?\n/).some(line=>line.trim()===start))return decodeV1(text);
  const lines=text.trim().replace(/\r\n?/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean);
  const header=/^見積([\d,.]+)円（税別）｜部品([\d,.]+)円・([\d,.]+)人・部品送料([\d,.]+)円｜(.+)$/.exec(lines[0]||'');
  const rates=/^掛率：資材([\d,.]+)%／撤去([\d,.]+)%／養生([\d,.]+)%／諸経費([\d,.]+)%／福利([\d,.]+)%$/.exec(lines[1]||'');
  const prices=/^単価：作業([\d,.]+)円／人・運搬([\d,.]+)円／人$/.exec(lines[2]||'');
  const overhead=/^諸経費(標準|[\d,.]+)（(自動|端数自動|手動|引継率)）｜端数調整(あり|なし)｜その他は標準(?:｜メモ：("(?:\\.|[^"\\])*"))?$/.exec(lines[4]||'');
  if(!header||!rates||!prices||!overhead||!lines[3]?.startsWith('採用：'))throw Error('簡易コピー全文（見積金額から最後の行まで）を貼り付けてください。');
  const names=Object.fromEntries(Object.entries(shortNames).map(([id,name])=>[name,fixedLabels[id]]));
  const out=[start,'出力日時：'+header[5],'部品代：'+header[2]+'円','作業人員：'+header[3]+'人','部品送料：'+header[4]+'円',
   '消耗資材費率：'+rates[1]+'％','撤去品引取費率：'+rates[2]+'％','養生・安全対策費率：'+rates[3]+'％','諸経費率：'+rates[4]+'％','法定福利費率：'+rates[5]+'％','交換作業売価単価：'+prices[1]+'円／人','作業員送料単価：'+prices[2]+'円／人'];
  const rest=lines.slice(5);let linkLine;
  for(const line of rest){
   if(line.startsWith('連動：')){if(linkLine)throw Error('連動設定が重複しています。');linkLine=line.slice(3);continue;}
   const extra=/^(追加\d+)：("(?:\\.|[^"\\])*")／([\d,.]+)円$/.exec(line);
   if(!extra||names[extra[1]])throw Error('追加項目の書式を確認してください。');names[extra[1]]=extra[1];out.push(extra[1]+' 名称：'+extra[2],extra[1]+' 金額：'+extra[3]+'円');
  }
  const adopted=new Map(),memos=new Map();
  if(lines[3]!=='採用：すべて標準')for(const entry of splitEntries(lines[3].slice(3))){
   // Parse the quoted memo separately so punctuation inside it is retained.
   const clean=/^(部品|作業|資材|運搬|撤去|養生|追加\d+)=(標準|[\d,.]+)(?:（("(?:\\.|[^"\\])*"）))?$/.exec(entry);
   if(!clean||!names[clean[1]]||adopted.has(clean[1]))throw Error('採用額の書式・重複を確認してください。');
   adopted.set(clean[1],clean[2]);if(clean[3])memos.set(clean[1],clean[3].slice(0,-1));
  }
  adopted.set('諸経費',overhead[1]);if(overhead[4])memos.set('諸経費',overhead[4]);
  for(const [name,label] of Object.entries(names)){const value=adopted.get(name)||'標準';out.push('採用 '+label+'：'+(value==='標準'?value:value+'円'));if(memos.has(name))out.push('メモ '+label+'：'+memos.get(name));}
  if(linkLine)for(const entry of splitEntries(linkLine)){const m=/^(資材|撤去|養生|諸経費)([\d,.]+)\/([\d,.]+)$/.exec(entry);if(!m)throw Error('連動設定の書式を確認してください。');out.push('引継 '+names[m[1]]+'：'+m[2]+'/'+m[3]);}
  out.push('諸経費連動：'+overhead[2],'端数調整：'+overhead[3],'見積金額（税別）：'+header[1]+'円',end);
  return decodeV1(out.join('\n'));
 }
 const api={encode,encodeV1,decode,forImport,linkedIds};
 if(typeof module!=='undefined')module.exports=api;else root.EstimatePortable=api;
})(typeof window!=='undefined'?window:globalThis);
