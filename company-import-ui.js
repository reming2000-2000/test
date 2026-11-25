/* Company estimate preview. The pasted text and choices live in this page only. */
(function(root){
 'use strict';
 const C=root.CompanyEstimateImport,E=root.Estimate,$=id=>document.getElementById(id);
 const ratioItems=new Set(['materials','shipping','removal','protection']);
 let adapter,source=null,selections={},itemsById=new Map(),workerOverride=null,workerHint=null;
 let parseTimer,receipt=false;

 function clearPreview(){
  clearTimeout(parseTimer);
  source=null;selections={};itemsById.clear();workerOverride=null;workerHint=null;receipt=false;
  for(const id of ['company-issues','company-rows','company-aggregates','company-messages','company-balance'])$(id).replaceChildren();
  for(const id of ['company-error','company-notice'])$(id).textContent='';
  for(const id of ['company-review','company-commit','company-balance'])$(id).hidden=true;
  for(const id of ['company-detail','company-worker-edit'])$(id).open=false;
  $('company-apply').disabled=true;
 }
 function reset(){
  clearPreview();
  $('company-text').value='';$('company-workers').value='';
 }
 function line(element,text,className){
  const node=document.createElement(element);node.textContent=text;
  if(className)node.className=className;
  return node;
 }
 function addAmount(list,label,value,{signed=false,ratio=null,key=null}={}){
  const row=document.createElement('div');
  if(key)row.dataset.amount=key;
  row.append(line('dt',label));
  const number=line('dd',value===null?'確認できません':(signed?E.signed(value):E.yen(value)));
  if(ratio)number.append(line('small',ratio));
  row.append(number);list.append(row);
 }
 function showAggregates(plan){
  const list=$('company-aggregates');
  list.replaceChildren();
  const assigned=new Set(source.items.map(item=>targetOf(item)));
  const parts=plan.data.p.parts;
  for(const row of plan.result.rows){
   if(!row.custom&&!assigned.has(row.id))continue;
   const ratio=parts>0n&&ratioItems.has(row.id)?'部品代比 '+E.ratio(row.booked,parts,2,false):null;
   addAmount(list,row.label,row.booked,{ratio,key:row.id});
  }
  if(assigned.has('welfare')||plan.result.welfare!==0n)addAmount(list,'法定福利費（CAT）',plan.result.welfare,{key:'welfare'});
  list.hidden=!list.childElementCount;
 }
 function showBalance(plan){
  const box=$('company-balance');
  const detailsOpen=box.querySelector('details')?.open??false;
  const detailFocused=document.activeElement===box.querySelector('details > summary');
  box.replaceChildren(line('h3',receipt?'取込時の金額比較':'金額比較'));box.hidden=false;
  const list=document.createElement('dl');list.className='company-comparison';
  addAmount(list,plan.reportedTotal===null?'元データの最終金額（明細から算出）':'元データの最終金額',plan.sourceFinal,{key:'source-final'});
  addAmount(list,plan.discount===0n?'CATの比較用金額':'CATの比較用金額（値引後）',plan.afterDiscount,{key:'cat-final'});
  addAmount(list,'差額',plan.difference,{signed:true,key:'difference'});
  list.dataset.difference=plan.difference===null?'unknown':plan.difference===0n?'equal':'different';
  box.append(list);
  if(plan.errors.length)box.append(line('p','確認待ちの項目があるため、比較は暫定です。','company-comparison-note'));
  else if(plan.difference===0n){
   let note='金額は一致しています。';
   if(plan.sourceTotal===null)note='記載された最終金額と一致。明細合計は確認できません。';
   else if(plan.sourceTotal!==plan.sourceFinal)note='記載された最終金額と一致。明細合計との差は比較の詳細で確認できます。';
   box.append(line('p',note,'company-comparison-note'));
  }

  const details=document.createElement('details');details.className='inline-help';details.open=detailsOpen;
  const summary=line('summary','比較の詳細');details.append(summary);
  const metrics=document.createElement('dl');
  for(const entry of plan.summaries)addAmount(metrics,'元データの'+entry.name,entry.amount);
  if(plan.reportedTotal!==null)addAmount(metrics,'元データの明細合計',plan.sourceTotal);
  addAmount(metrics,'CAT計算総額（値引前）',plan.result.total,{key:'cat-before'});
  if(plan.discount!==0n)addAmount(metrics,'値引（比較のみ）',plan.discount,{signed:true,key:'discount'});
  if(plan.sourceWelfare!==0n||plan.result.welfare!==0n){
   addAmount(metrics,'元データの法定福利費',plan.sourceWelfare);
   addAmount(metrics,'CATの法定福利費',plan.result.welfare);
   addAmount(metrics,'法定福利費の差額',plan.result.welfare-plan.sourceWelfare,{signed:true,key:'welfare-diff'});
  }
  details.append(metrics);
  if(plan.warnings.length){
   const warnings=document.createElement('ul');warnings.append(...plan.warnings.map(warning=>line('li',warning)));
   details.append(warnings);
  }
  box.append(details);
  if(detailFocused)summary.focus();
 }
 function targetOf(item){return selections[item.id]?.target??item.target;}
 function createRow(item){
  const chosen=targetOf(item);
  const row=document.createElement('article');row.className='company-row';row.dataset.sourceId=item.id;
  const name=document.createElement('div');
  name.append(line('strong',item.name));
  if(!chosen){
   const status={review:'要確認',unclassified:'未分類',error:'未読取'};
   name.append(line('span',status[item.status]??'未分類','company-status'));
   name.append(line('small',item.line+'行目｜'+item.reason));
  }else{
   const status=chosen==='exclude'?'対象外を確認済み':selections[item.id]?.target?'手動確認済み':'自動判定';
   name.append(line('small',item.line+'行目・'+status));
  }
  const amount=line('div',item.amount===null?'売価を読取できません':E.yen(item.amount),'company-amount');
  const controls=document.createElement('div');
  const select=document.createElement('select');select.dataset.companyTarget=item.id;
  select.setAttribute('aria-label',item.name+'の振り分け先');
  select.append(new Option('振り分け先を選択',''));
  for(const [id,label] of C.targets){
   const option=new Option(label,id);
   option.disabled=(item.amount===null&&id!=='exclude')||(item.amount<0n&&!['discount','exclude'].includes(id));
   select.append(option);
  }
  select.value=chosen||item.candidate||'';
  controls.append(select);
  if(!chosen&&item.candidate){
   const confirm=line('button','この費目で確定','button secondary company-accept');
   confirm.type='button';confirm.dataset.companyAccept=item.id;controls.append(confirm);
  }
  if(chosen==='extra'){
   const label=document.createElement('label');label.className='company-extra-option';
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.companyLabor=item.id;
   checkbox.checked=!!selections[item.id]?.extraLabor;
   label.append(checkbox,document.createTextNode('法定福利費の対象に含める'));
   controls.append(label);
  }
  row.append(name,amount,controls);
  return row;
 }
 function renderRows(focusId){
  const unresolved=[],classified=[];
  for(const item of source.items)(targetOf(item)?classified:unresolved).push(item);
  const issues=$('company-issues'),rows=$('company-rows'),details=$('company-detail');
  issues.replaceChildren(...unresolved.map(createRow));
  $('company-issue-area').hidden=!unresolved.length;
  $('company-issue-title').textContent='要確認 '+unresolved.length+'項目';
  details.hidden=!classified.length;
  // Most imports never need the individual rows, even when the paste is large.
  rows.replaceChildren(...(details.open?classified.map(createRow):[]));
  if(focusId){
   const control=$('company-review').querySelector(`[data-company-target="${focusId}"]`);
   const next=control??issues.querySelector('select')??$('company-detail-toggle');
   next.focus({preventScroll:true});
   next.scrollIntoView({block:'nearest'});
  }
 }
 function updateWorkerHint(){
  workerHint=C.workersHint(source,selections);
  if(!workerHint.needed)workerOverride=null;
  const details=$('company-worker-edit');
  $('company-worker-fields').hidden=!workerHint.needed;
  $('company-worker-toggle').hidden=!workerHint.value;
  if(!workerHint.value)details.open=true;
  $('company-workers').value=workerOverride??workerHint.value;
  showWorkerBasis();
 }
 function showWorkerBasis(){
  let description=workerHint.reason;
  if(workerOverride!==null){
   const parsed=E.parse(workerOverride,'decimal',true);
   description=parsed.error||parsed.value===null?'有効な作業人員を入力してください。':'手動入力 '+E.format(parsed.value)+'人工';
  }
  $('company-workers-help').textContent=description;
 }
 function makePlan(){
  return C.plan(source,selections,{...adapter.context(),workers:workerOverride??workerHint.value});
 }
 function refresh(){
  if(!source){
   if(receipt){$('company-balance').replaceChildren();$('company-balance').hidden=true;$('company-notice').textContent='';receipt=false;}
   return;
  }
  $('company-error').textContent='';
  try{
   const plan=makePlan();showAggregates(plan);showBalance(plan);
   // Individual classification errors already have a visible control and explanation.
   const messages=plan.errors.filter(error=>!error.endsWith('：振り分け先を選択してください')&&error!=='交換作業費の作業人員を入力してください');
   $('company-messages').replaceChildren(...messages.map(text=>line('li',text)));
   $('company-apply').disabled=!!plan.errors.length;
  }catch(error){
   $('company-error').textContent=error.message;$('company-balance').hidden=true;
   $('company-apply').disabled=true;
  }
 }
 function queueParse(){
  clearPreview();
  const text=$('company-text').value;
  if(!text.trim())return;
  parseTimer=setTimeout(()=>{
   try{
    source=C.parse(text);
    itemsById=new Map(source.items.map(item=>[item.id,item]));
    renderRows();updateWorkerHint();
    $('company-review').hidden=false;$('company-commit').hidden=false;refresh();
   }catch(error){$('company-error').textContent=error.message;}
  },150);
 }
 function choose(id,target){
  const item=itemsById.get(id),previous=targetOf(item);
  selections[id]={target,extraLabor:target==='extra'&&!!selections[id]?.extraLabor};
  if((previous==='labor')!==(target==='labor')){
   updateWorkerHint();
  }
  renderRows(id);refresh();
 }
 function init(options){
  adapter=options;
  $('company-text').addEventListener('input',event=>{if(event.isComposing)clearPreview();else queueParse();});
  $('company-text').addEventListener('compositionend',queueParse);
  $('company-clear').addEventListener('click',()=>{reset();$('company-text').focus();});
  $('company-detail').addEventListener('toggle',()=>{if(source)renderRows();});
  $('company-review').addEventListener('click',event=>{
   const id=event.target.dataset.companyAccept;
   if(id)choose(id,event.target.closest('.company-row').querySelector('select').value);
  });
  $('company-review').addEventListener('change',event=>{
   const {companyTarget,companyLabor}=event.target.dataset;
   if(companyTarget)choose(companyTarget,event.target.value);
   if(companyLabor){
    selections[companyLabor]={target:'extra',extraLabor:event.target.checked};
    refresh();
   }
  });
  $('company-workers').addEventListener('input',()=>{
   workerOverride=$('company-workers').value;
   showWorkerBasis();refresh();
  });
  $('company-apply').addEventListener('click',()=>{
   if(!source)return;
   try{
    const plan=makePlan();
    if(plan.errors.length){refresh();return;}
    if(adapter.hasInput()&&!root.confirm('現在のCAT入力を、取り込んだ見積で置き換えますか？'))return;
    adapter.apply(plan.data);
    receipt=true;showBalance(plan);
    $('company-notice').textContent='CATに反映しました。';$('company-notice').focus();
   }catch(error){$('company-error').textContent=error.message;}
  });
 }
 root.CompanyImportUI={init,reset,refresh};
})(window);
