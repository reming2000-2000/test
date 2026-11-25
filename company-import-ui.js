/* Separate, ephemeral review UI for company data. Existing portable import is untouched. */
(function(root){
 'use strict';
 const C=root.CompanyEstimateImport,E=root.Estimate,$=id=>document.getElementById(id);
 let adapter,documentData=null,selections={},workersEdited=false,reviewRevision=null,receipt=false;
 function reset(){
  documentData=null;selections={};workersEdited=false;reviewRevision=null;receipt=false;
  for(const id of ['company-text','company-workers'])$(id).value='';
  for(const id of ['company-rows','company-messages','company-balance','company-skipped'])$(id).replaceChildren();
  for(const id of ['company-error','company-notice'])$(id).textContent='';
  $('company-review').hidden=true;$('company-commit').hidden=true;$('company-balance').hidden=true;
  $('company-workers-confirmed').checked=false;$('company-replace').checked=false;$('company-apply').disabled=true;
 }
 function message(list,text){const li=document.createElement('li');li.textContent=text;list.append(li);}
 function addAmount(list,label,value,signed=false){
  const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
  dt.textContent=label;dd.textContent=value===null?'確認できません':(signed?E.signed(value):E.yen(value));row.append(dt,dd);list.append(row);
 }
 function balance(plan){
  const box=$('company-balance');box.replaceChildren();box.hidden=false;
  const heading=document.createElement('h3');heading.textContent='金額比較（取込時点）';box.append(heading);
  const list=document.createElement('dl');
  for(const summary of plan.summaries)addAmount(list,'元データの'+summary.name,summary.amount);
  addAmount(list,'元データ明細合計（値引後）',plan.sourceTotal);
  if(plan.reportedTotal!==null)addAmount(list,'元データ記載の最終金額',plan.reportedTotal);
  addAmount(list,'CAT計算総額（値引前）',plan.result.total);
  addAmount(list,'値引（比較のみ）',plan.discount,true);
  addAmount(list,'比較用の値引後金額',plan.afterDiscount);
  addAmount(list,'差額（比較用 − 元明細合計）',plan.difference,true);
  if(plan.reportedTotal!==null)addAmount(list,'差額（比較用 − 記載最終金額）',plan.afterDiscount-plan.reportedTotal,true);
  addAmount(list,'元データの法定福利費',plan.sourceWelfare);
  addAmount(list,'CATの法定福利費',plan.result.welfare);
  addAmount(list,'法定福利費の差額',plan.result.welfare-plan.sourceWelfare,true);
  box.append(list);
  if(plan.errors.length){const p=document.createElement('p');p.className='field-guide';p.textContent='未確認の項目を含む暫定計算です。確認を終えるまで反映できません。';box.append(p);}
  if(plan.warnings.length){const ul=document.createElement('ul');plan.warnings.forEach(text=>message(ul,text));box.append(ul);}
 }
 function rowState(item,row){
  const target=selections[item.id]?.target??item.target;
  row.querySelector('.company-status').textContent=target==='exclude'?'対象外を確認済み':selections[item.id]?.target?'手動確認済み':({auto:'自動判定',review:'要確認',unclassified:'未分類',error:'未読取'}[item.status]);
  row.dataset.status=target?'resolved':item.status;
  row.querySelector('.company-extra-option').hidden=target!=='extra';
 }
 function renderRows(){
  const rows=$('company-rows');rows.replaceChildren();
  for(const item of documentData.items){
   const row=document.createElement('article');row.className='company-row';row.dataset.sourceId=item.id;
   const name=document.createElement('div'),title=document.createElement('strong'),status=document.createElement('span'),reason=document.createElement('small');
   title.textContent=item.name;status.className='company-status';reason.textContent=item.line+'行目'+(item.category?'・'+item.category:'')+(item.status==='auto'?'':'｜'+item.reason);name.append(title,status,reason);
   const amount=document.createElement('div');amount.className='company-amount';amount.textContent=item.amount===null?'売価を読取できません':E.yen(item.amount);
   const controls=document.createElement('div'),select=document.createElement('select');select.dataset.companyTarget=item.id;select.setAttribute('aria-label',item.name+'の振り分け先');
   const empty=new Option('振り分け先を選択','');select.append(empty);
   for(const [id,label] of C.targets){const option=new Option(label,id);option.disabled=(item.amount===null&&id!=='exclude')||(item.amount<0n&&!['discount','exclude'].includes(id));select.append(option);}
   select.value=item.target;
   const label=document.createElement('label');label.className='company-extra-option';
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.companyLabor=item.id;
   label.append(checkbox,document.createTextNode('法定福利費の対象作業費に含める'));
   controls.append(select,label);row.append(name,amount,controls);rowState(item,row);rows.append(row);
  }
 }
 function workerHint(){
  const hint=C.workersHint(documentData,selections);$('company-worker-fields').hidden=!hint.needed;
  if(!hint.needed){workersEdited=false;$('company-workers').value='0';$('company-workers-confirmed').checked=false;}
  else if(!workersEdited)$('company-workers').value=hint.value;
  $('company-workers-help').textContent=hint.reason;
 }
 function makePlan(){
  const context=adapter.context();
  return C.plan(documentData,selections,{...context,workers:$('company-workers').value,workersConfirmed:$('company-workers-confirmed').checked});
 }
 function refresh(){
  if(!documentData){if(receipt){$('company-balance').hidden=true;$('company-balance').replaceChildren();$('company-notice').textContent='';receipt=false;}return;}
  $('company-error').textContent='';
  try{
   if(reviewRevision!==adapter.revision()){$('company-replace').checked=false;reviewRevision=adapter.revision();}
   const plan=makePlan();balance(plan);
   const messages=$('company-messages');messages.replaceChildren();plan.errors.forEach(text=>message(messages,text));
   const replace=adapter.hasInput();$('company-replace-option').hidden=!replace;
   $('company-apply').disabled=!!plan.errors.length||(replace&&!$('company-replace').checked);
  }catch(error){$('company-error').textContent=error.message;$('company-balance').hidden=true;$('company-apply').disabled=true;}
 }
 function init(options){
  adapter=options;
  $('company-parse').addEventListener('click',()=>{
   const text=$('company-text').value;reset();$('company-text').value=text;
   try{
    documentData=C.parse(text);renderRows();workerHint();$('company-review').hidden=false;$('company-commit').hidden=false;
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent='原価・補助行の扱い（'+documentData.notices.length+'行）';details.append(summary);
    const ul=document.createElement('ul');documentData.notices.forEach(note=>message(ul,note.line+'行目：'+note.text));details.append(ul);$('company-skipped').append(details);
    refresh();
   }catch(error){$('company-error').textContent=error.message;}
  });
  $('company-text').addEventListener('input',()=>{const text=$('company-text').value;reset();$('company-text').value=text;});
  $('company-clear').addEventListener('click',reset);
  $('company-rows').addEventListener('change',event=>{
   const id=event.target.dataset.companyTarget??event.target.dataset.companyLabor;if(!id)return;
   const row=event.target.closest('.company-row');
   selections[id]={target:row.querySelector('select').value,extraLabor:row.querySelector('input').checked};
   rowState(documentData.items.find(item=>item.id===id),row);
   if(event.target.dataset.companyTarget){$('company-workers-confirmed').checked=false;workerHint();}
   refresh();
  });
  $('company-workers').addEventListener('input',()=>{workersEdited=true;$('company-workers-confirmed').checked=false;refresh();});
  for(const id of ['company-workers-confirmed','company-replace'])$(id).addEventListener('change',refresh);
  $('company-apply').addEventListener('click',()=>{
   if(!documentData)return;
   try{
    const plan=makePlan();if(plan.errors.length||(adapter.hasInput()&&!$('company-replace').checked)){refresh();return;}
    adapter.apply(plan.data); // The adapter clears drafts before replacing the estimate.
    balance(plan);receipt=true;
    $('company-notice').textContent='CATに反映しました。比較用の値引は本体の合計・出力に含めません。貼り付けた明細は消去しました。';
   }catch(error){$('company-error').textContent=error.message;}
  });
 }
 root.CompanyImportUI={init,reset,refresh};
})(window);
