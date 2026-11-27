/* Company-system import: deterministic parsing and preview only; no I/O or storage. */
(function(root){
 'use strict';
 const E=typeof module!=='undefined'?require('./calc.js'):root.Estimate;
 const targets=[...E.items,['extra','追加項目'],['welfare','法定福利費（比較のみ）'],['discount','値引（比較のみ）'],['exclude','取込対象外']];
 const unitPattern=/^(?:式|台|個|缶|枚|冊|本|組|セット|人|名|人工|人日|日|m|kg)$/i;
 const saleCategory=/^(?:FREE(?:\s*部品)?|部品|経費|小計|中計|合計|総合計)$/i;
 const itemNumber=/^\d+$/;
 const modelCode=/^(?=[a-z0-9._/()-]*[a-z])[a-z0-9][a-z0-9._/()-]*$|^(?:型式|仕様).+/i;
 const norm=s=>String(s??'').normalize('NFKC').trim();
 const compact=s=>norm(s).replace(/[\s　]/g,'');
 function amount(raw){
  let s=norm(raw).replace(/^[¥￥]/,''),negative=false;
  if(s.length>80)return null;
  if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1);}
  if(/^[−－▲△-]/.test(s)){negative=true;s=s.slice(1);}
  s=s.replace(/^[¥￥]/,'').replace(/円$/,'').trim();
  if(!s)return null;
  const parsed=E.parse(s);return parsed.error?null:(negative?-parsed.value:parsed.value);
 }
 function classify(name,category,value){
  const n=compact(name).replace(/[・,、.。/／:：;；()「」\[\]【】_-]/g,''),c=compact(category);
  const rules=[['materials',/消耗資材|諸材料/],['shipping',/交通費|輸送費|送料|運搬費|運搬交通/],['protection',/養生|安全対策/],['removal',/撤去品引取|撤去処分/],['labor',/交換作業費/],['overhead',/諸経費/],['welfare',/法定福利/],['extra',/試運転調整/]];
  const found=rules.filter(([,pattern])=>pattern.test(n)).map(([id])=>id);
  if(/値引|端数調整/.test(n)){
   if(found.length||/工事機材費/.test(n))return {target:'',status:'review',reason:'値引と別の費目のキーワードが混在しています'};
   if(value!==null&&value<0n)return {target:'discount',status:'auto',reason:'値引として比較のみ'};
   return {target:'',candidate:'discount',status:'review',reason:'値引の符号・扱いを確認してください'};
  }
  if(value!==null&&value<0n)return {target:'',status:'review',reason:'負額はCAT費目に入力できません。値引または対象外を選択'};
  if(/FREE部品/i.test(c)||c==='部品')return {target:'parts',status:'auto',reason:'部品区分'};
  if(/工事機材費/.test(n)&&!found.includes('materials')){
   if(found.length)return {target:'',status:'review',reason:'工事機材費と別の費目のキーワードが混在しています'};
   return {target:'',candidate:'materials',status:'review',reason:'工事機材費の振り分け先を確認してください'};
  }
  if(found.length>1)return {target:'',status:'review',reason:'複数の費目に該当するため確認が必要'};
  return found.length?{target:found[0],status:'auto',reason:'費目名のキーワード'}:{target:'',status:'unclassified',reason:'振り分け先を選択してください'};
 }
 function summaryKind(name,category){
  const n=compact(name||category).replace(/[()（）]/g,'');
  if(/^(小計|中計)(?:税別)?$/.test(n))return 'subtotal';
  if(/^(?:総合計|合計|最終金額|見積合計|見積金額)(?:税別)?$/.test(n))return 'total';
  return null;
 }
 function isSectionHeading(data,value){
  return /^FREE$/i.test(data.category)&&/^【[^】]+】$/.test(data.name)&&
   value===0n&&!data.quantity&&!data.price;
 }
 function zeroContinuation(cells,section){
  const nonempty=cells.filter(Boolean);
  if(!section)return cells.length>=2&&nonempty.length>0&&nonempty.every(value=>amount(value)===0n);
  // A section footer has a number (possibly different from the heading), blanks and a zero.
  return itemNumber.test(cells[0])&&cells.length>=5&&cells.slice(1,4).every(value=>!value)&&
   nonempty.length===2&&amount(nonempty[1])===0n;
 }
 function costContinuation(cells,previous,columns){
  if(!previous)return null;
  if(previous.section)return zeroContinuation(cells,true)||zeroContinuation(cells,false)?[]:null;
  if(previous.summary&&zeroContinuation(cells,false))return [];
  if(previous.discount&&cells.length>=3&&unitPattern.test(cells[0])&&!cells[1]&&
    amount(cells[2])===0n&&cells.slice(3).every(value=>!value))return [];

  const get=key=>cells[columns?.[key]]||'';
  const category=columns?get('category'):cells[1]||'';
  const name=columns?get('name'):cells[2]||'';
  const number=columns?get('number'):cells[0]||'';
  if(columns&&/^原価(?:行)?$/.test(category||name))return [get('memo')];
  // A recognized selling category or a full numbered sale is never inferred to be a cost row.
  if(saleCategory.test(category)||(
   itemNumber.test(number)&&name&&cells.length>(columns?.amount??6)
  ))return null;
  if(columns&&!category&&unitPattern.test(get('quantity'))&&(!name||
   (number&&number===previous.number)))return [get('memo')];
  if(columns&&columns.number===undefined)return null;

  // Preserve the established numbered layout with blank cost cells.
  if(itemNumber.test(cells[0])&&!cells[2]&&unitPattern.test(cells[3])&&cells.length>=6&&
   cells.slice(4,6).every(value=>!value||amount(value)!==null)&&cells.slice(7).every(value=>!value)){
   return [cells[1]||'',cells[6]||''];
  }
  // A compact continuation starts with a number, a model, or the unit itself.
  // A compact numbered row must match its sale; the established layout above can differ.
  const first=cells[0]||'';
  if(itemNumber.test(first)&&first!==previous.number)return null;
  // Require the unit and both adjacent cost amounts. Remaining text is evidence only.
  const hasPrefix=itemNumber.test(first)||modelCode.test(first);
  if(!hasPrefix&&!unitPattern.test(first))return null;
  const start=unitPattern.test(first)?0:1;
  const end=unitPattern.test(first)?1:cells.length-2;
  for(let i=start;i<end;i++){
   if(unitPattern.test(cells[i])&&amount(cells[i+1])!==null&&amount(cells[i+2])!==null){
    return [...cells.slice(1,i),...cells.slice(i+3)].filter(Boolean);
   }
  }
  return null;
 }
 // TSV supports quoted cells, escaped quotes and line breaks in a quoted memo.
 function records(text,delimiter){
  if(delimiter!=='\t')return text.split('\n').map((raw,i)=>({line:i+1,raw,cells:delimiter==='|'?raw.replace(/^\s*\||\|\s*$/g,'').split('|').map(norm):raw.trim().split(/ {2,}/).map(norm)}));
  const out=[];let cells=[],cell='',quoted=false,line=1,start=1,offset=0;
  for(let i=0;i<=text.length;i++){
   const ch=text[i];
   if(ch==='"'&&(quoted||cell==='')){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;continue;}
   if(ch==='\n')line++;
   if(!quoted&&(ch==='\t'||ch==='\n'||ch===undefined)){
    cells.push(norm(cell));cell='';
    if(ch!=='\t'){out.push({line:start,raw:text.slice(offset,i),cells});cells=[];start=line;offset=i+1;}
   }else if(ch!==undefined)cell+=ch;
  }
  if(quoted)throw Error('引用符が閉じていません。コピーした表全体を貼り付け直してください。');
  return out;
 }
 const aliases={number:['連番','項番','項目番号','番号','No','No.'],category:['区分','種別'],name:['品名','費目名','費目名称','項目名','名称'],quantity:['数量','人工数'],unit:['単位'],price:['単価','売価単価'],amount:['売価金額','金額','売価','税別金額'],memo:['備考','コメント','算定根拠']};
 function header(cells){
  const columns={};for(const [key,names] of Object.entries(aliases)){const index=cells.findIndex(cell=>names.some(name=>compact(cell).toLowerCase()===compact(name).toLowerCase()));if(index>=0)columns[key]=index;}
  return columns.name!==undefined&&columns.amount!==undefined?columns:null;
 }
 function parse(text){
  if(typeof text!=='string'||!text.trim())throw Error('社内見積の明細を貼り付けてください。');
  if(text.length>200000)throw Error('貼付内容は200,000文字までです。');
  text=text.replace(/\r\n?/g,'\n');
  const delimiter=text.includes('\t')?'\t':text.includes('|')?'|':'spaces';
  const rows=records(text,delimiter).filter(row=>row.cells.some(Boolean));
  if(rows.length>2000)throw Error('貼付内容は2,000行までです。');
  const headerIndex=rows.findIndex(row=>header(row.cells));
  const columns=headerIndex>=0?header(rows[headerIndex].cells):null;
  const legacy=!columns&&rows.some(({cells:c})=>itemNumber.test(c[0])&&c.length>=7&&(
   saleCategory.test(c[1])||(c[1]&&c[2]&&amount(c[4])!==null&&amount(c[5])!==null)
  ));
  if(!columns&&!legacy)throw Error('列を判定できません。社内システムの明細全体、または「品名・売価金額」列のあるタブ区切り表を貼り付けてください。');
  const items=[],summaries=[],seen=new Set();let previous=null;
  const headings=columns?rows[headerIndex].cells:null;
  function unread(row,reason,data={}){
   items.push({...data,id:'source_'+(items.length+1),line:row.line,raw:row.raw,
    name:data.name||'読取できない行（'+row.line+'行目）',amount:null,target:'',status:'error',reason});
   previous=null;
  }
  for(let index=0;index<rows.length;index++){
   const row=rows[index],c=row.cells;
   if(index===headerIndex||(headings&&headings.length===c.length&&headings.every((cell,i)=>cell===c[i]))||c.every(cell=>/^:?[\-─━—=]+:?$/.test(cell)||!cell))continue;
   const costNotes=costContinuation(c,previous,columns);
   if(costNotes!==null){
    if(previous.item)previous.item.costNotes=costNotes;
    if(!previous.section)previous=null;
    continue;
   }
   if(columns&&index===headerIndex+1&&/^(?:原価|原単価)$/.test(c[columns.amount])&&c.every(cell=>!cell||/^(?:原価|原単価|単位|コメント|仕様|定価|型式|項番)$/.test(cell)))continue;
   let data;
   if(legacy){
    if(!itemNumber.test(c[0])||c.length<7||!c[2]){unread(row,'社内表の売価行・原価補助行のどちらにも一致しません');continue;}
    data={number:c[0],category:c[1],name:c[2],memo:c[3]||'',quantity:c[4]||'',price:c[5]||'',unit:'',rawAmount:c[6]};
   }else{
    if(c.slice(rows[headerIndex].cells.length).some(Boolean)){unread(row,'見出しより列数が多いため、売価列を確定できません');continue;}
    const get=key=>columns[key]===undefined?'':c[columns[key]]||'';
    if(!get('name')){unread(row,'費目名称が空欄の行です');continue;}
    data={number:get('number'),category:get('category'),name:get('name'),memo:get('memo'),quantity:get('quantity'),price:get('price'),unit:get('unit')||(compact(rows[headerIndex].cells[columns.quantity])==='人工数'?'人工':''),rawAmount:get('amount')};
   }
   const value=amount(data.rawAmount),summary=summaryKind(data.name,data.category);
   if(isSectionHeading(data,value)){previous={section:true};continue;}
   if(summary){
    if(value===null){unread(row,'小計・合計の金額を読み取れません');continue;}
    summaries.push({line:row.line,name:data.name,kind:summary,amount:value});
    previous={number:data.number,summary};
   }else{
    if(value===null){unread(row,'売価金額を読み取れません。備考から金額を推測しません',data);continue;}
    if(data.number&&seen.has(data.number)){unread(row,'売価明細の番号が重複しています。元データを確認',data);continue;}
    const item={...data,id:'source_'+(items.length+1),line:row.line,amount:value,...classify(data.name,data.category,value)};
    if(data.number)seen.add(data.number);
    items.push(item);
    previous={number:data.number,item,discount:/値引|端数調整/.test(data.name)};
   }
  }
  if(!items.length)throw Error('取り込める売価明細がありません。');
  return {items,summaries};
 }
 function selected(item,selections){return selections[item.id]??{target:item.target,extraLabor:false};}
 function costWorkerEvidence(note){
  // Read the stated headcount from a labor note with an identifiable currency multiplier.
  const formula=/^(\d+(?:\.\d+)?)\s*(人|名)\s*[x×*]\s*([¥￥]?[\d,.]+(?:円)?)(?:\s*\/\s*人)?$/i.exec(note);
  if(!formula||!/[¥￥,円]/.test(formula[3])||!(amount(formula[3])>0n))return null;
  const count=E.parse(formula[1],'decimal');
  if(count.error)return null;
  return {value:count.value,basis:'原価行の備考 '+E.format(count.value)+formula[2]+'×'+formula[3]};
 }
 function memoWorkerEvidence(memo,fromCost=false){
  if(fromCost){
   if(!/\d\s*(?:日|名|人)/.test(memo))return [];
   const costEvidence=costWorkerEvidence(memo);
   if(costEvidence)return [costEvidence];
  }
  if(memo.length>2000||/または|もしくは|別案|未定|要確認|\d\s*(?:日|名|人)?\s*[~〜～]\s*\d|(?:\d|名|人)\s*[+\-−×*/]\s*\d/.test(memo))return null;
  const formulas=[...memo.matchAll(/(?<![\d.,+−-])(\d+(?:\.\d+)?)\s*日\s*[x×*]\s*(\d+(?:\.\d+)?)(?![\d.,])\s*(名|人(?![工日])|(?![名人]))(?!\s*[+\-−×x*/])/gi)];
  if(formulas.length>1)return null;
  const evidence=[];
  for(const match of memo.matchAll(/(?<![\d.,+−-])(\d+(?:\.\d+)?)\s*(?:人工|人日)(?![数])/g)){
   const count=E.parse(match[1],'decimal');
   if(count.error)return null;
   evidence.push({value:count.value,basis:E.format(count.value)+'人工'});
  }
  for(const match of formulas){
   const days=E.parse(match[1],'decimal'),people=E.parse(match[2],'decimal');
   if(days.error||people.error)return null;
   const value=days.value*people.value/E.SCALE;
   evidence.push({value,basis:E.format(days.value)+'日×'+E.format(people.value)+(match[3]?.trim()||'')+'＝'+E.format(value)+'人工'});
  }
  return evidence;
 }
 function workersHint(document,selections={}){
  const labor=document.items.filter(item=>selected(item,selections).target==='labor');
  if(!labor.length)return {needed:false,value:'0',reason:''};
  const manual=reason=>({needed:true,value:'',reason});
  let sum=0n;const bases=[];
  for(const item of labor){
   const evidence=[];
   if(/^(人工|人日)$/.test(compact(item.unit))&&norm(item.quantity)){
    const parsed=E.parse(item.quantity,'decimal');
    if(parsed.error)return manual('人工の表記を確認して入力してください。');
    evidence.push({value:parsed.value,basis:E.format(parsed.value)+'人工'});
   }
   const saleEvidence=memoWorkerEvidence(norm(item.memo));
   if(!saleEvidence)return manual('作業人員を確認して入力してください。');
   evidence.push(...saleEvidence);
   const hasSaleEvidence=evidence.length>0;
   for(const note of item.costNotes??[]){
    const costEvidence=memoWorkerEvidence(norm(note),true);
    if(!costEvidence)return manual('原価行の備考に複数の解釈があります。作業人員を確認して入力してください。');
    evidence.push(...costEvidence);
   }
   if(!evidence.length)return manual('数量・備考から確定できません。作業人員を入力してください。');
   if(evidence.some(entry=>entry.value!==evidence[0].value))return manual('作業人員の表記が一致しません。確認して入力してください。');
   sum+=evidence[0].value;
   bases.push(hasSaleEvidence?(saleEvidence.at(-1)??evidence[0]).basis:evidence.at(-1).basis+' → '+E.format(evidence[0].value)+'人工');
  }
  const raw=E.format(sum).replaceAll(',',''),check=E.parse(raw,'decimal');
  if(check.error)return manual('作業人員がCATの入力範囲外です。');
  const basis=bases.length===1?bases[0]:`${bases.length}明細の合計 ${E.format(sum)}人工`;
  return {needed:true,value:raw,reason:basis};
 }
 function plan(document,selections={},options={}){
  const errors=[],warnings=[],totals=Object.fromEntries(E.items.map(([id])=>[id,0n])),extras=[],excluded=[];
  const presentItemIds=new Set();
  let sourceTotal=0n,sourceValid=true,sourceWelfare=0n,discount=0n;
  for(const item of document.items){
   const choice=selected(item,selections),target=choice.target;
   if(item.amount!==null&&(item.target==='welfare'||target==='welfare'))sourceWelfare+=item.amount;
   if(item.amount===null)sourceValid=false;
   else sourceTotal+=target==='discount'?(item.amount<0n?item.amount:-item.amount):item.amount;
   if(target==='exclude'){excluded.push(item);continue;}
   if(item.amount===null){errors.push(item.name+'：形式を確認してください');continue;}
   if(!targets.some(([id])=>id===target)){errors.push(item.name+'：振り分け先を選択してください');continue;}
   if(target==='discount'){discount-=item.amount<0n?-item.amount:item.amount;continue;}
   if(item.amount<0n){errors.push(item.name+'：負額は値引または取込対象外にしてください');continue;}
   if(target==='welfare')continue;
   if(target==='extra'){
    if(item.name.length>40||/[\r\n]/.test(item.name)){errors.push('追加項目の名称は改行なし・40文字以内にしてください');continue;}
    const id='custom_'+(extras.length+1);
    extras.push({id,label:item.name,amount:item.amount,tag:choice.extraLabor?'labor':'other'});
    presentItemIds.add(id);
   }else{
    totals[target]+=item.amount;
    presentItemIds.add(target);
   }
  }
  if(extras.length>100)errors.push('追加項目は100項目までです');
  for(const [id,total] of Object.entries(totals))if(total>1000000000000n*E.SCALE)errors.push(new Map(E.items).get(id)+'の合計がCATの入力上限を超えています');
  const hint=workersHint(document,selections),rawWorkers=hint.needed?(options.workers??hint.value):'0';
  const workers=E.parse(rawWorkers,'decimal');
  if(hint.needed&&(!norm(rawWorkers)||workers.error))errors.push('交換作業費の作業人員を入力してください');
  const p={...Object.fromEntries(Object.entries(E.defaults).map(([id,n])=>[id,E.decimal(n)])),...options.settings,parts:totals.parts,workers:workers.error?0n:workers.value,shipping:0n};
  const rates=E.partsRates(p.parts);
  for(const id of ['materialsRate','removalRate'])if(options.autoRates?.[id]&&p.parts>0n)p[id]=rates[id];
  const adopted={...totals,parts:null},memos=Object.fromEntries([...E.items,...extras.map(item=>[item.id,item.label])].map(([id])=>[id,'']));
  for(const item of extras)adopted[item.id]=item.amount;
  const result=E.calculate(p,adopted,'manual',extras),afterDiscount=result.total+discount;
  if(afterDiscount<0n)warnings.push('値引がCAT計算総額を超えています');
  if(excluded.length)warnings.push(excluded.length+'項目を取込対象外にしています。元明細合計には、読取できた対象外金額も含みます。');
  if(!sourceValid)warnings.push('読取できない金額があるため、元データ全体の合計は確認できません。');
  if(result.welfare!==sourceWelfare)warnings.push('法定福利費の差額：'+E.signed(result.welfare-sourceWelfare)+'。CATは対象作業費から自動計算します。');
  if(discount!==0n)warnings.push('値引は比較にのみ使用します。CAT本体の合計・コピー・PNGには反映しません。');
  for(const summary of document.summaries){
   const prior=document.items.filter(item=>item.line<summary.line);
   const expected=prior.some(item=>item.amount===null)?null:prior.reduce((sum,item)=>sum+(selected(item,selections).target==='discount'?-(item.amount<0n?-item.amount:item.amount):item.amount),0n);
   if(expected!==null&&expected!==summary.amount)warnings.push(summary.name+'（'+summary.line+'行目）が、それ以前の読取明細合計と一致しません。売価金額や読取できない行を確認してください。');
  }
  const reportedTotal=document.summaries.filter(row=>row.kind==='total').at(-1)?.amount??null;
  if(reportedTotal!==null&&sourceValid&&reportedTotal!==sourceTotal)warnings.push('記載された最終合計と読取明細合計が一致しません。');
  const sourceFinal=reportedTotal??(sourceValid?sourceTotal:null);
  return {errors,warnings,summaries:document.summaries.map(({name,amount})=>({name,amount})),sourceTotal:sourceValid?sourceTotal:null,reportedTotal,sourceFinal,sourceWelfare,discount,result,afterDiscount,difference:sourceFinal===null?null:afterDiscount-sourceFinal,data:{p,adopted,memos,extraItems:extras,links:{},mode:'manual',rounded:false,order:E.defaultOrder(extras),presentItemIds:[...presentItemIds]}};
 }
 const api={parse,amount,classify,workersHint,plan,targets};
 if(typeof module!=='undefined')module.exports=api;else root.CompanyEstimateImport=api;
})(typeof window!=='undefined'?window:globalThis);
