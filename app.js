'use strict';
const E=window.Estimate;
const $=id=>document.getElementById(id);
function catFeedback(type){document.dispatchEvent(new CustomEvent('estimate:feedback',{detail:{type}}));}
const basic=[['parts','部品代','円','money'],['workers','作業人員','人','decimal'],['shipping','部品送料','円','money']];
const settings=[['materialsRate','消耗資材費率','％','rate'],['removalRate','撤去品引取費率','％','rate'],['protectionRate','養生・安全対策費率','％','rate'],['laborPrice','交換作業売価単価','円／人','money'],['workerShipping','作業員送料単価','円／人','money'],['overheadRate','諸経費率','％','rate'],['welfareRate','法定福利費率','％','rate']];
const partRatioIds=['materials','removal','protection','shipping'];
const descriptors=[...basic,...settings];
let customItems=[],nextCustomId=1;
let rateLinks={};
let roundUndo=null,copyEpoch=0,updateRevision=0;
const copiedValues=new Map();
let settingSources={};
const partsRateIds=["materialsRate","removalRate"];
let partsRateModes={materialsRate:"auto",removalRate:"auto"};
function itemDefinitions(){
 return E.items.flatMap(item=>item[0]==='overhead'?[...customItems.map(extra=>[extra.id,$('custom-name-'+extra.id).value.trim()||extra.label]),item]:[item]);
}
function resetCustomItems(){
 for(const item of customItems){clearTimeout(copyFeedbackTimers.get(item.id));copyFeedbackTimers.delete(item.id);$('row-'+item.id).remove();}
 customItems=[];nextCustomId=1;
}

function field([id,label,unit,kind]) {
 const box=document.createElement('div');
 box.innerHTML=`<label class="input-label" for="${id}">${label}</label><div class="input-shell"><input id="${id}" data-kind="${kind}" inputmode="decimal" type="text" value="${E.defaults[id]}" aria-describedby="${id}-error" spellcheck="false"><span class="unit">${unit}</span></div><span id="${id}-error" class="input-error"></span>${partsRateIds.includes(id)?'<small id="mode-'+id+'" class="parts-rate-mode"></small>':''}`;
 return box;
}
basic.forEach(d=>$('basic-fields').append(field(d)));
settings.forEach(d=>$('setting-fields').append(field(d)));
function resetPartsRateModes(){partsRateModes={materialsRate:'auto',removalRate:'auto'};}
function syncPartsRates(){
 const parsed=E.parse($('parts').value);
 if(parsed.error||parsed.value===0n)return;
 const rates=E.partsRates(parsed.value);
 for(const id of partsRateIds)if(partsRateModes[id]==='auto')$(id).value=E.format(rates[id]);
}
function renderPartsRateModes(){
 const parsed=E.parse($('parts').value),valid=!parsed.error&&parsed.value>0n;
 for(const id of partsRateIds){
  const mode=partsRateModes[id],node=$('mode-'+id);
  node.textContent=mode==='auto'?(valid?'部品代に自動連動':'部品代の入力待ち'):mode==='imported'?'復元した掛率を保持':'手動の掛率を保持';
  node.dataset.mode=mode;
 }
 $('reset-parts-rates').hidden=partsRateIds.every(id=>partsRateModes[id]==='auto');
 document.querySelectorAll('[data-reference-band]').forEach(row=>row.classList.toggle('current-band',valid&&Number(row.dataset.referenceBand)===E.partsRates(parsed.value).band));
}
$('reset-parts-rates').addEventListener('click',()=>{invalidateRoundUndo();resetPartsRateModes();syncPartsRates();update();});
const copyIcon='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"></path></svg>';
function rowCopyButton(id,label,kind){return `<button type="button" class="row-copy-button" id="copy-${kind}-${id}" data-copy="${kind}" data-item="${id}" aria-label="${label}の${kind==='cost'?'参考原価':kind==='amount'?'見積計上額':'算定根拠'}をコピー">${copyIcon}</button>`;}
function createCostRow(id,label,custom=false){
 const row=document.createElement('article');row.className='cost-row'+(custom?' custom-cost-row':'');row.id='row-'+id;row.setAttribute('aria-label',label);
 row.innerHTML=`
 <div class="cost-title">${custom?'<div class="custom-name-line"><label for="custom-name-'+id+'" class="custom-label">追加項目</label><button type="button" class="custom-remove" data-remove-custom="'+id+'" aria-label="'+label+'を削除">削除</button></div><input id="custom-name-'+id+'" class="custom-name-input" type="text" maxlength="40" placeholder="例：試運転調整費" aria-label="'+label+'の名称">':'<span class="cost-name">'+label+'</span>'}${id==='overhead'?'<div class="overhead-controls"><span id="overhead-mode-label" class="tag"></span><button id="overhead-auto" type="button" class="overhead-auto" hidden>自動に戻す</button></div>':''}
  <div class="basis-inline"><span id="basis-${id}" class="basis"></span>${rowCopyButton(id,label,'basis')}</div>
 </div>
 ${custom?'<div class="money-cell standard-cell"><label class="custom-label" for="custom-amount-'+id+'">金額（円）</label><input id="custom-amount-'+id+'" type="text" data-kind="money" inputmode="decimal" value="0" aria-label="'+label+'の金額（円）" aria-describedby="custom-amount-'+id+'-error"><span id="custom-amount-'+id+'-error" class="input-error"></span></div>':'<div class="money-cell standard-cell"><span class="cell-label">標準額</span><span id="standard-'+id+'"></span></div>'}
 <div class="adoption"><label for="adopt-${id}" class="input-label">${label}の採用額（円）</label><input id="adopt-${id}" type="text" data-kind="money" data-optional="true" inputmode="decimal" placeholder="標準額を使用" aria-label="${label}の採用額（円）" aria-describedby="adopt-${id}-error"><span id="adopt-${id}-error" class="input-error"></span><small id="link-help-${id}" class="link-help" hidden></small><small id="fixed-adoption-${id}" class="fixed-adoption" title="採用額を空欄にすると標準額に戻ります" hidden>採用額を固定中</small>${id==='overhead'?'<small id="overhead-help" class="overhead-help">入力で手動固定・空欄で自動に戻る</small>':''}</div>
 <div class="money-cell booked-cell"><span class="cell-label">見積計上額</span><div class="amount-inline"><strong id="booked-${id}"></strong>${rowCopyButton(id,label,'amount')}</div>${E.expenseCostIds.includes(id)||id==='labor'?'<div class="expense-cost-line" id="cost-info-'+id+'" title="'+(id==='labor'?'作業人員×36,000円、1円未満切り捨て':'見積計上額×62％（利益率38％）、1円未満切り捨て')+'"><span>参考原価</span><span id="'+(id==='labor'?'labor-cost':'cost-'+id)+'"></span>'+rowCopyButton(id,label,'cost')+'</div>':''}</div>
 <div id="adjustment-${id}" class="adjustment-summary" hidden><span>標準からの補正</span><strong id="diff-${id}"></strong><span id="ratio-${id}"></span></div>
 <details id="detail-${id}" class="row-details"><summary>詳細・メモ</summary><div class="row-details-content"><p id="parts-ratio-${id}" class="detail-ratio"></p><label class="memo-label" for="memo-${id}">補正理由・メモ <span>任意</span></label><input class="note-input" id="memo-${id}" maxlength="100" placeholder="理由を入力" aria-label="${label}の補正理由・メモ"></div></details>
 ${id==='overhead'?'<div id="overhead-warning" class="overhead-warning" role="status" hidden>小計または諸経費率が変わりました。手動固定の諸経費を確認してください。</div>':''}
 <div id="row-copy-feedback-${id}" class="row-copy-feedback" role="status" hidden></div>`;
 return row;
}
for(const [id,label] of E.items)$('cost-rows').append(createCostRow(id,label));
const customToolbar=document.createElement('div');customToolbar.className='custom-add-toolbar';
customToolbar.innerHTML='<button id="add-custom-item" type="button" class="button secondary">＋ 項目を追加</button>';
$('cost-rows').insertBefore(customToolbar,$('row-overhead'));
$('add-custom-item').addEventListener('click',()=>{
 invalidateRoundUndo();
 const item={id:'custom_'+nextCustomId,label:'追加項目'+nextCustomId};nextCustomId++;
 customItems.push(item);$('cost-rows').insertBefore(createCostRow(item.id,item.label,true),customToolbar);
 update();$('custom-name-'+item.id).focus();
});
let state, invalid=false, imageUrl;
let overheadRounded=false,overheadManual=false,overheadFixedBasis=null;
function overheadMode(){if(rateLinks.overhead)return 'linked';return overheadManual?'manual':overheadRounded?'rounded':'auto';}
function overheadModeLabel(){if(rateLinks.overhead)return '引継掛率で自動連動';return overheadManual?'手動固定':overheadRounded?'自動連動・端数調整':'自動連動';}
function resetOverhead(){rateLinks={};overheadRounded=false;overheadManual=false;overheadFixedBasis=null;}
const copyingButtons=new Set();
const copyFeedbackTimers=new Map();
// Transient UI state only. These helpers never change the calculation formulas.
function invalidateRoundUndo(){roundUndo=null;$('undo-round').hidden=true;$('undo-round-help').hidden=true;}
function resetWorkflow(){invalidateRoundUndo();copiedValues.clear();copyEpoch++;settingSources={};}
function captureRoundState(){
 return {adopted:Object.fromEntries(itemDefinitions().map(([id])=>[id,$('adopt-'+id).value])),links:structuredClone(rateLinks),rounded:overheadRounded,manual:overheadManual,basis:overheadFixedBasis,details:Object.fromEntries(itemDefinitions().map(([id])=>[id,$('detail-'+id).open]))};
}
$('undo-round').addEventListener('click',()=>{
 if(!roundUndo)return;const saved=roundUndo;invalidateRoundUndo();
 for(const [id,value] of Object.entries(saved.adopted))$('adopt-'+id).value=value;
 rateLinks=saved.links;overheadRounded=saved.rounded;overheadManual=saved.manual;overheadFixedBasis=saved.basis;
 update();for(const [id,open] of Object.entries(saved.details))$('detail-'+id).open=open;
 $('round-notice').textContent='端数調整前の採用額・諸経費の連動状態に戻しました。';
});
function copyValue(button){
 const id=button.dataset.item,kind=button.dataset.copy,row=state.rows.find(r=>r.id===id);
 return kind==='cost'?E.format(state.costs[id]):kind==='amount'?E.format(id==='welfare'?state.welfare:row.booked):E.copyBasis(state.p,row);
}
function renderCopyMarks(){
 for(const id of copiedValues.keys())if(!$(id))copiedValues.delete(id);
 for(const button of document.querySelectorAll('[data-copy]')){
  const id=button.dataset.item,kind=button.dataset.copy,row=state.rows.find(r=>r.id===id);
  const name=id==='welfare'?'法定福利費':row.label,label=kind==='cost'?'参考原価':kind==='amount'?'見積計上額':'算定根拠';
  const value=copyValue(button);
  if(invalid||copiedValues.get(button.id)!==value)copiedValues.delete(button.id);
  const copied=copiedValues.has(button.id);
  button.classList.toggle('is-copied',copied);
  button.setAttribute('aria-label',name+'の'+label+'をコピー'+(copied?'（コピー済み）':''));
  button.title=name+'の'+label+'をコピー：'+value+(copied?'（コピー済み）':'');
 }
}
function renderSettingChanges(){
 const rates=state.p.parts>0n?E.partsRates(state.p.parts):null,lines=[];
 for(const [id,label,unit,kind] of settings){
  const parsed=E.parse($(id).value,kind);if(parsed.error)continue;
  const priceRate=partsRateIds.includes(id),source=priceRate?partsRateModes[id]:settingSources[id];
  if(priceRate&&source==='auto')continue;
  const baseline=priceRate&&rates?rates[id]:E.decimal(E.defaults[id]);
  if(parsed.value===baseline)continue;
  lines.push(label+'：'+(priceRate?'規定 ':'初期値 ')+E.format(baseline)+unit+' → '+(source==='imported'?'復元 ':'手動 ')+E.format(parsed.value)+unit);
 }
 state.settingChanges=lines;$('setting-changes').hidden=!lines.length;$('setting-change-list').replaceChildren();
 for(const line of lines){const li=document.createElement('li');li.textContent=line;$('setting-change-list').append(li);}
}
function simpleText(){return window.EstimatePortable.encode(state,null,overheadMode(),overheadRounded,rateLinks);}
function renderSimplePreview(){
 if(!$('simple-preview').open){$('simple-text').textContent='';return;}
 if(invalid){$('simple-text').textContent='入力内容を確認してください。修正後にコピー内容を表示します。';return;}
 try{$('simple-text').textContent=simpleText();}catch(error){$('simple-text').textContent=error.message;}
}
$('simple-preview').addEventListener('toggle',renderSimplePreview);
function navigationFields(form){return [...form.querySelectorAll('input')].filter(input=>input.type==='text'&&!input.disabled&&!input.readOnly&&!input.closest('details:not([open]),[hidden]')&&input.getClientRects().length);}
function navigationForm(input){const form=input.closest('form');return form&&['estimate-form','discount-form'].includes(form.id)?form:null;}
function refreshNavigationHint(input=document.activeElement){
 if(!(input instanceof HTMLInputElement)||input.type!=='text')return;
 const form=navigationForm(input);if(!form)return;
 const fields=navigationFields(form);input.enterKeyHint=fields.indexOf(input)===fields.length-1?'done':'next';
}
document.addEventListener('focusin',event=>refreshNavigationHint(event.target));
document.addEventListener('keydown',event=>{
 if(event.key!=='Enter'||event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey)return;
 const input=event.target;if(!(input instanceof HTMLInputElement)||input.type!=='text'||input.readOnly)return;
 const form=navigationForm(input);if(!form)return;
 event.preventDefault();
 if(input.dataset.kind&&E.parse(input.value,input.dataset.kind,input.dataset.optional==='true').error)return;
 const fields=navigationFields(form),next=fields[fields.indexOf(input)+(event.shiftKey?-1:1)];
 if(next){next.focus();if(next.dataset.kind)next.select();}else if(!event.shiftKey)input.blur();
});
function read(input){const result=E.parse(input.value,input.dataset.kind,input.dataset.optional==='true');input.setAttribute('aria-invalid',String(!!result.error));$(input.id+'-error').textContent=result.error; if(result.error)invalid=true;return result.value;}
function basis(p,result){return {overhead:`小計 × ${E.format(p.overheadRate)}％`,parts:'基本入力の部品代',materials:`部品代 × ${E.format(p.materialsRate)}％`,removal:`部品代 × ${E.format(p.removalRate)}％`,protection:`部品代 × ${E.format(p.protectionRate)}％`,labor:`売価：${E.format(p.workers)}人 × ${E.yen(p.laborPrice)} ＝ ${E.yen(result.rows.find(r=>r.id==='labor').standard)}`,shipping:`${E.format(p.workers)}人 × ${E.yen(p.workerShipping)} ＋ ${E.yen(p.shipping)}`};}
function diffClass(node,value){node.classList.toggle('increase',value>0n);node.classList.toggle('decrease',value<0n);}
function update(){
 updateRevision++;
 renderPartsRateModes();
 invalid=false;const p={},adopted={},memos={};
 descriptors.forEach(([id])=>p[id]=read($(id)));
 const extraInputs=customItems.map(item=>({id:item.id,label:$('custom-name-'+item.id).value.trim()||item.label,amount:read($('custom-amount-'+item.id))}));
 itemDefinitions().forEach(([id])=>{
  const input=$('adopt-'+id);
  if(rateLinks[id]||(id==='overhead'&&!overheadManual)){adopted[id]=null;input.setAttribute('aria-invalid','false');$('adopt-'+id+'-error').textContent='';}
  else adopted[id]=read(input);
  memos[id]=$('memo-'+id).value;
 });
 const result=E.calculate(p,adopted,overheadMode(),extraInputs,rateLinks);
 if(!overheadManual&&!rateLinks.overhead)$('adopt-overhead').value=overheadRounded?E.format(result.overhead):'';
 const currentBasis=result.subtotal.toString()+':'+p.overheadRate.toString();
 if(overheadManual&&!invalid&&overheadFixedBasis===null)overheadFixedBasis=currentBasis;
 $('overhead-warning').hidden=!overheadManual||invalid||overheadFixedBasis===currentBasis;
 $('overhead-mode-label').textContent=overheadModeLabel();
 $('row-overhead').dataset.overheadMode=overheadMode();
 $('overhead-auto').hidden=!overheadManual&&!rateLinks.overhead;
 $('overhead-auto').textContent=overheadRounded?'端数調整付き自動に戻す':'自動に戻す';
 state={p,memos,extraItems:extraInputs,...result};const bases=basis(p,result);
 for(const r of result.rows){
  const link=rateLinks[r.id],help=$('link-help-'+r.id);help.hidden=!link;
  $('fixed-adoption-'+r.id).hidden=r.adopted===null||!!link||$('adopt-'+r.id).getAttribute('aria-invalid')==='true'||(r.id==='overhead'&&!overheadManual);
  if(link){$('adopt-'+r.id).value=E.format(r.booked);help.textContent=(r.id==='overhead'?'小計':'部品代')+'比 約'+E.ratio(link.amount,link.base,4,false)+'で連動。手入力で固定・空欄で標準に戻ります。';}
  $('basis-'+r.id).textContent=r.custom?'手入力':bases[r.id];if(!r.custom)$('standard-'+r.id).textContent=E.yen(r.standard);$('booked-'+r.id).textContent=E.yen(r.booked);$('diff-'+r.id).textContent=E.signed(r.diff);diffClass($('diff-'+r.id),r.diff);
  $('ratio-'+r.id).textContent=r.adopted!==null?'標準比 '+E.ratio(r.diff,r.standard):'';
  $('parts-ratio-'+r.id).textContent=partRatioIds.includes(r.id)?'部品代比 '+E.ratio(r.booked,p.parts,2,false):'';
  const row=$('row-'+r.id),wasChanged=row.classList.contains('changed'),changed=r.diff!==0n;
  row.classList.toggle('changed',changed);
  $('adjustment-'+r.id).hidden=!changed;
  const details=$('detail-'+r.id);
  if(changed&&!wasChanged)details.open=true;
  if(!changed&&wasChanged&&!memos[r.id])details.open=false;
  details.querySelector('summary').textContent=changed?'補正理由・詳細':'詳細・メモ';
  if(r.custom){$('row-'+r.id).setAttribute('aria-label',r.label);$('copy-amount-'+r.id).setAttribute('aria-label',r.label+'の見積計上額をコピー');$('copy-basis-'+r.id).setAttribute('aria-label',r.label+'の算定根拠をコピー');}
  $('copy-amount-'+r.id).title=r.label+'の金額をコピー：'+E.format(r.booked);
  $('copy-basis-'+r.id).title=r.label+'の算定根拠をコピー：'+E.copyBasis(p,r);
  if(Object.hasOwn(result.costs,r.id))$(r.id==='labor'?'labor-cost':'cost-'+r.id).textContent=E.yen(result.costs[r.id]);
  if(Object.hasOwn(result.costs,r.id))$('copy-cost-'+r.id).title=r.label+'の参考原価をコピー：'+E.format(result.costs[r.id]);
  clearTimeout(copyFeedbackTimers.get(r.id));copyFeedbackTimers.delete(r.id);
  $('row-copy-feedback-'+r.id).hidden=true;
  $('row-copy-feedback-'+r.id).replaceChildren();
 }
 $('cost-info-labor').title=`作業人員 ${E.format(p.workers)}人 × ${E.yen(E.laborCostPrice)} ＝ ${E.yen(result.laborCost)}（1円未満切り捨て）`;
 for(const id of ['subtotal','welfare'])$(id).textContent=E.yen(result[id]);
 $('welfare-cost').textContent=E.yen(result.welfareCost);
 $('cost-info-welfare').title=`法定福利費 ${E.yen(result.welfare)} × 0.66 ＝ ${E.yen(result.welfareCost)}（1円未満切り捨て）`;
 $('copy-amount-welfare').title='法定福利費の金額をコピー：'+E.format(result.welfare);
 $('copy-cost-welfare').title='法定福利費の参考原価をコピー：'+E.format(result.costs.welfare);
 clearTimeout(copyFeedbackTimers.get('welfare'));copyFeedbackTimers.delete('welfare');
 $('row-copy-feedback-welfare').hidden=true;$('row-copy-feedback-welfare').replaceChildren();
 $('welfare-basis').textContent=`採用交換作業費 × ${E.format(p.welfareRate)}％・1円未満切り捨て`;
 $('grand-total').textContent=E.yen(result.total);$('standard-total').textContent=E.yen(result.standardTotal);$('current-total').textContent=E.yen(result.total);$('total-diff').textContent=E.signed(result.diff);diffClass($('total-diff'),result.diff);$('total-rate').textContent=E.ratio(result.diff,result.standardTotal,2);
 updateDiscounts();
 renderSettingChanges();renderChanges();$('validation-banner').hidden=!invalid;
 for(const id of ['save-image','copy-text','copy-simple','preview','round-standard'])$(id).disabled=invalid;
 document.querySelectorAll('[data-copy]').forEach(button=>button.disabled=invalid||copyingButtons.has(button));
 $('round-notice').textContent='';
 $('summary-preview').hidden=true;$('image-fallback').hidden=true;$('copy-fallback').hidden=true;$('notice').textContent='';
 if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;$('export-image').removeAttribute('src');}
 renderCopyMarks();renderSimplePreview();refreshNavigationHint();
 $('undo-round').hidden=!roundUndo;$('undo-round-help').hidden=!roundUndo;
 catFeedback(invalid?'error':'typing');
}
function changeLines(r){const p=state.p;return [`標準 ${E.yen(r.standard)} → 採用 ${E.yen(r.adopted)}`,`差額 ${E.signed(r.diff)}　標準比 ${E.ratio(r.diff,r.standard)}`,...(partRatioIds.includes(r.id)?[`部品代比 ${E.ratio(r.booked,p.parts,2,false)}`]:[]),`理由：${state.memos[r.id]||'記入なし'}`];}
function renderChanges(){
 const changed=state.rows.filter(r=>r.diff!==0n);$('change-count').textContent=state.settingChanges.length?'採用額 '+changed.length+'項目・設定 '+state.settingChanges.length+'項目':changed.length+'項目';$('changes').replaceChildren();
 if(!changed.length){const p=document.createElement('p');p.className='empty-changes';p.textContent=state.settingChanges.length?'採用額の変更はありません':'標準設定からの変更はありません';$('changes').append(p);return;}
 for(const r of changed){const article=document.createElement('article');article.className='change-card';const title=document.createElement('h3');title.textContent=r.label;article.append(title);changeLines(r).forEach((line,i)=>{const p=document.createElement('p');p.textContent=line;if(!i)p.className='transition';article.append(p);});$('changes').append(article);}
}
async function copyRow(button){
 if(invalid||copyingButtons.has(button))return;
 const id=button.dataset.item,kind=button.dataset.copy,text=copyValue(button),epoch=copyEpoch;
 const copyLabel=kind==='cost'?'原価':kind==='amount'?'金額':'算定根拠';
 const feedback=$('row-copy-feedback-'+id);
 const current=()=>epoch===copyEpoch&&button.isConnected&&!invalid&&copyValue(button)===text;
 clearTimeout(copyFeedbackTimers.get(id));copyFeedbackTimers.delete(id);
 copyingButtons.add(button);button.disabled=true;feedback.hidden=true;
 try{
  if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
  await navigator.clipboard.writeText(text);
  if(!current())return;
  copiedValues.set(button.id,text);renderCopyMarks();catFeedback('copy');
  clearTimeout(copyFeedbackTimers.get(id));
  feedback.textContent=`${copyLabel}をコピーしました：${text}`;feedback.hidden=false;
  copyFeedbackTimers.set(id,setTimeout(()=>{feedback.hidden=true;copyFeedbackTimers.delete(id);},4000));
 }catch{
  if(!current())return;
  const label=document.createElement('label'),area=document.createElement('textarea');
  area.id='row-copy-area-'+id;area.value=text;area.readOnly=true;area.rows=2;
  label.htmlFor=area.id;label.textContent='自動コピーが利用できません。以下を選択してコピーしてください。';
  feedback.replaceChildren(label,area);feedback.hidden=false;area.focus();area.select();
 }finally{copyingButtons.delete(button);button.disabled=invalid;}
}
$('estimate-form').addEventListener('click',event=>{
 const remove=event.target.closest('button[data-remove-custom]');
 if(remove){
  invalidateRoundUndo();
  const id=remove.dataset.removeCustom;
  clearTimeout(copyFeedbackTimers.get(id));copyFeedbackTimers.delete(id);
  customItems=customItems.filter(item=>item.id!==id);$('row-'+id).remove();update();$('add-custom-item').focus();return;
 }
 const button=event.target.closest('button[data-copy]');
 if(button)copyRow(button);
});
$('estimate-form').addEventListener('submit',e=>e.preventDefault());
$('estimate-form').addEventListener('input',event=>{
 invalidateRoundUndo();
 if(settings.some(([id])=>id===event.target.id))settingSources[event.target.id]='manual';
 if(partsRateIds.includes(event.target.id))partsRateModes[event.target.id]='manual';
 if(event.target.id==='parts')syncPartsRates();
 if(event.target.id.startsWith('adopt-'))delete rateLinks[event.target.id.slice(6)];
 const settingLink={materialsRate:'materials',removalRate:'removal',protectionRate:'protection',overheadRate:'overhead'}[event.target.id];
 if(settingLink&&rateLinks[settingLink]){delete rateLinks[settingLink];$('adopt-'+settingLink).value='';}
 if(event.target.id==='adopt-overhead'){
  overheadManual=event.target.value.normalize('NFKC').trim()!=='';
  overheadFixedBasis=null;
 }
 update();
});
$('overhead-auto').addEventListener('click',()=>{
 resetToOverheadAuto();
});
function resetToOverheadAuto(){invalidateRoundUndo();delete rateLinks.overhead;overheadManual=false;overheadFixedBasis=null;update();}

$('estimate-form').addEventListener('focusin',e=>{
 const el=e.target;if(!el.dataset.kind || !el.value.includes(','))return;
 const before=el.value,start=el.selectionStart,end=el.selectionEnd;
 el.value=before.replaceAll(',','');
 if(start!==null && end!==null)el.setSelectionRange(before.slice(0,start).replaceAll(',','').length,before.slice(0,end).replaceAll(',','').length);
});
$('estimate-form').addEventListener('focusout',e=>{const el=e.target;if(!el.dataset.kind)return;const r=E.parse(el.value,el.dataset.kind,el.dataset.optional==='true');if(!r.error && el.value.trim() && r.value!==null)el.value=E.format(r.value);});
$('round-standard').addEventListener('click',()=>{
 if(invalid)return;
 const adopted=E.roundedAdoptions(state.p,state.rows.find(row=>row.id==='parts').adopted,state.extraItems);
 if(Object.values(adopted).some(value=>value>1000000000000n*E.SCALE)){
  $('round-notice').textContent='計算結果が採用額の入力上限（1兆円）を超えるため、一括入力できません。基本入力・標準設定を確認してください。';return;
 }
 if(!roundUndo)roundUndo=captureRoundState();
 rateLinks={};
 for(const [id,value] of Object.entries(adopted))if(id!=='overhead')$('adopt-'+id).value=E.format(value);
 overheadRounded=true;overheadManual=false;overheadFixedBasis=null;
 update();
 $('round-notice').textContent='部品代以外の標準額の端数を調整して、採用額に一括入力しました。';
 catFeedback('round');
});
function resetDiscounts(){for(const mode of ['rate','amount'])$('discount-'+mode).value='';}
function updateDiscounts(){
 $('discount-base').textContent=invalid?'—':E.yen(state.total);
 for(const mode of ['rate','amount']){
  const input=$('discount-'+mode),parsed=E.parse(input.value,mode==='rate'?'rate':'money',true);
  let error=parsed.error,result=null;
  if(!invalid&&!error&&parsed.value!==null){
   try{result=E.calculateDiscount(state.total,parsed.value,mode);}catch(e){error=e.message;}
  }
  input.setAttribute('aria-invalid',String(!!error));$('discount-'+mode+'-error').textContent=error;
  $('discount-'+mode+'-result').textContent=result?(mode==='rate'?E.yen(result.amount)+'（'+E.format(result.amount/10000n)+'万円）':result.rate):'—';
  $('discount-'+mode+'-after').textContent=result?E.yen(result.after):'—';
 }
}
$('discount-form').addEventListener('submit',event=>event.preventDefault());
$('discount-form').addEventListener('input',()=>{updateDiscounts();catFeedback('typing');});
$('discount-form').addEventListener('focusin',event=>{const el=event.target;if(el.dataset.kind&&el.value.includes(',')){
 const before=el.value,start=el.selectionStart,end=el.selectionEnd;el.value=before.replaceAll(',','');
 if(start!==null&&end!==null)el.setSelectionRange(before.slice(0,start).replaceAll(',','').length,before.slice(0,end).replaceAll(',','').length);
}});
$('discount-form').addEventListener('focusout',event=>{const el=event.target;if(!el.dataset.kind)return;const parsed=E.parse(el.value,el.dataset.kind,true);if(!parsed.error&&parsed.value!==null)el.value=E.format(parsed.value);});
$('reset').addEventListener('click',()=>{if(!window.confirm('基本入力・採用額・メモ・標準設定をすべて初期状態に戻しますか？'))return;resetWorkflow();resetCustomItems();descriptors.forEach(([id])=>$(id).value=E.defaults[id]);E.items.forEach(([id])=>{$('adopt-'+id).value='';$('memo-'+id).value='';$('detail-'+id).open=false;});resetOverhead();resetDiscounts();resetImport();resetPartsRateModes();update();$('parts').focus();catFeedback('reset');});
function stamp(date=new Date()){
 const f=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});const p=Object.fromEntries(f.formatToParts(date).map(v=>[v.type,v.value]));
 return {display:`${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second}（日本時間）`,file:`estimate_${p.year}${p.month}${p.day}_${p.hour}${p.minute}${p.second}.png`};
}
function summary(time){
 const s=state, sections=[];
 sections.push(['基本条件',basic.map(([id,label,unit])=>`${label}：${E.format(s.p[id])}${unit}`)]);
 sections.push(['標準設定',settings.map(([id,label,unit])=>`${label}：${E.format(s.p[id])}${unit}`)]);
 if(s.settingChanges.length)sections.push(['標準設定の変更',s.settingChanges]);
 sections.push(['見積内訳',[...s.rows.map(r=>`${r.label}：${E.yen(r.booked)}`),`小計（諸経費・法定福利費を除く）：${E.yen(s.subtotal)}`,`法定福利費（採用交換作業費 × ${E.format(s.p.welfareRate)}％・切り捨て）：${E.yen(s.welfare)}`,`見積金額（税別）：${E.yen(s.total)}`]]);
 sections.push(['交換作業費の売価・原価',[basis(s.p,s).labor,`見積計上額：${E.yen(s.rows.find(r=>r.id==='labor').booked)}`,`原価（参考）：${E.format(s.p.workers)}人 × ${E.yen(E.laborCostPrice)} ＝ ${E.yen(s.laborCost)}`, '原価は1円未満切り捨て。確認用の表示で、見積総額には加算しません。']]);
 sections.push(['作業経費の参考原価（利益率38％）',[...s.rows.filter(row=>E.expenseCostIds.includes(row.id)).map(row=>`${row.label}：売価 ${E.yen(row.booked)} → 参考原価 ${E.yen(s.costs[row.id])}`),'参考原価＝見積計上額×62％、1円未満切り捨て。見積総額には加算しません。']]);
 sections.push(['法定福利費の原価',[`売価（見積計上額）：${E.yen(s.welfare)}`,`原価（参考）：${E.yen(s.welfare)} × 0.66 ＝ ${E.yen(s.welfareCost)}`, '原価は1円未満切り捨て。確認用の表示で、見積総額には加算しません。']]);
 if(Object.keys(rateLinks).length)sections.push(['引継掛率で連動する費目',s.rows.filter(r=>rateLinks[r.id]).map(r=>r.label+'：'+(r.id==='overhead'?'小計':'部品代')+'比 約'+E.ratio(rateLinks[r.id].amount,rateLinks[r.id].base,4,false))]);
 sections.push(['諸経費の連動状態',[overheadModeLabel(),...(!$('overhead-warning').hidden?['小計または諸経費率が変更されています。手動固定の諸経費を確認してください。']:[])]]);
 sections.push(['標準との比較',[`標準見積総額：${E.yen(s.standardTotal)}`,`現在の採用見積総額：${E.yen(s.total)}`,`総補正額：${E.signed(s.diff)}`,`標準見積に対する増減率：${E.ratio(s.diff,s.standardTotal,2)}`]]);
 const changes=s.rows.filter(r=>r.diff!==0n);
 sections.push(['標準から変更した項目',changes.length?changes.flatMap(r=>[r.label,...changeLines(r),'']):[s.settingChanges.length?'採用額の変更はありません':'標準設定からの変更はありません']]);
 const other=s.rows.filter(r=>r.diff===0n && s.memos[r.id]);if(other.length)sections.push(['その他のメモ',other.map(r=>`${r.label}：${s.memos[r.id]}`)]);
 return {sections,text:`見積計算結果の確認シート\n出力日時：${time.display}\n\n`+sections.map(([title,lines])=>`【${title}】\n${lines.join('\n')}`).join('\n\n')};
}
let pendingImport=null;
function resetImport(){pendingImport=null;$('import-text').value='';$('import-preview').hidden=true;$('import-error').textContent='';$('import-notice').textContent='';$('import-proportional').checked=true;}
function clearImportPreview(){pendingImport=null;$('import-preview').hidden=true;$('import-error').textContent='';$('import-notice').textContent='';}
$('import-text').addEventListener('input',clearImportPreview);
$('import-proportional').addEventListener('change',clearImportPreview);
$('check-import').addEventListener('click',()=>{
 clearImportPreview();
 try{
  const data=window.EstimatePortable.forImport(window.EstimatePortable.decode($('import-text').value),$('import-proportional').checked);
  const linkLines=E.items.filter(([id])=>data.links[id]).map(([id,label])=>label+'：'+(id==='overhead'?'小計':'部品代')+'比 約'+E.ratio(data.links[id].amount,data.links[id].base,4,false));
  const fixed=data.result.rows.filter(r=>r.adopted!==null&&!data.links[r.id]&&!(r.id==='overhead'&&data.mode==='rounded'));
  $('import-summary').textContent=[...(data.time?['出力日時：'+data.time]:[]),...basic.map(([id,label,unit])=>label+'：'+E.format(data.p[id])+unit),...settings.map(([id,label,unit])=>label+'：'+E.format(data.p[id])+unit),'追加項目：'+data.extraItems.length+'項目',...data.extraItems.map(item=>item.label+'：'+E.yen(data.result.rows.find(r=>r.id===item.id).booked)),'復元後の見積金額（税別）：'+E.yen(data.result.total),'諸経費：'+({auto:'自動連動',rounded:'端数調整付き自動連動',manual:'手動固定',linked:'引継掛率で自動連動'}[data.mode]),...linkLines,...fixed.map(r=>r.label+'：'+E.yen(r.booked)+'（手動固定）'),...data.result.rows.filter(r=>data.memos[r.id]).map(r=>r.label+' メモ：'+data.memos[r.id]),'反映後、基本入力の部品代などを変更して再計算できます。'].join('\n');
  pendingImport=data;$('import-preview').hidden=false;
 }catch(error){$('import-error').textContent=error.message;}
});
$('apply-import').addEventListener('click',()=>{
 if(!pendingImport)return;const data=pendingImport;
 resetWorkflow();settingSources=Object.fromEntries(settings.map(([id])=>[id,'imported']));
 resetCustomItems();resetOverhead();resetDiscounts();
 descriptors.forEach(([id])=>$(id).value=E.format(data.p[id]));
 for(const item of data.extraItems){
  const definition={id:item.id,label:'追加項目'+nextCustomId};nextCustomId++;
  customItems.push(definition);$('cost-rows').insertBefore(createCostRow(item.id,definition.label,true),customToolbar);
  $('custom-name-'+item.id).value=item.label;$('custom-amount-'+item.id).value=E.format(item.amount);
 }
 for(const [id] of itemDefinitions()){$('adopt-'+id).value=data.adopted[id]===null?'':E.format(data.adopted[id]);$('memo-'+id).value=data.memos[id];$('detail-'+id).open=false;}
 partsRateModes={materialsRate:'imported',removalRate:'imported'};
 rateLinks={...data.links};overheadRounded=data.rounded;overheadManual=data.mode==='manual';overheadFixedBasis=null;
 update();resetImport();$('import-notice').textContent='計算条件を反映しました。復元した掛率を保持して再計算します。';$('basic-title').scrollIntoView({block:'start'});catFeedback('copy');
});
$('copy-simple').addEventListener('click',async()=>{
 if(invalid)return;const button=$('copy-simple'),epoch=copyEpoch,revision=updateRevision;button.disabled=true;
 try{
  const text=simpleText();if($('simple-preview').open)$('simple-text').textContent=text;
  try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(text);if(epoch!==copyEpoch)return;$('notice').textContent=revision===updateRevision?'簡易版をコピーしました。後日、画面上部に貼り付けて再計算できます。':'入力変更前の簡易版をコピーしました。現在の結果が必要な場合は、もう一度コピーしてください。';catFeedback('copy');}
  catch{if(epoch!==copyEpoch||revision!==updateRevision)return;$('copy-area').value=text;$('copy-fallback').hidden=false;$('copy-area').focus();$('copy-area').select();$('notice').textContent='自動コピーが利用できません。選択された簡易版をコピーしてください。';}
 }catch(error){$('notice').textContent=error.message;}
 finally{button.disabled=invalid;}
});
$('preview').addEventListener('click',()=>{const out=summary(stamp());$('summary-text').textContent=out.text;$('summary-preview').hidden=false;});
$('copy-text').addEventListener('click',async()=>{
 const out=summary(stamp());const button=$('copy-text');button.disabled=true;
 try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(out.text);catFeedback('copy');$('notice').textContent='結果をコピーしました';}
 catch{ $('copy-area').value=out.text;$('copy-fallback').hidden=false;$('copy-area').focus();$('copy-area').select();$('notice').textContent='自動コピーが利用できません。選択されたテキストをコピーしてください。'; }
 finally{button.disabled=invalid;}
});
function canvasSummary(out,time){
 const width=1120,scale=2,margin=64,lineHeight=38;const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
 // Lay out every line before sizing: long memos and large numbers never clip.
 ctx.font='24px system-ui, sans-serif';
 function wrap(text,max){const lines=[];let line='';for(const ch of text){if(ctx.measureText(line+ch).width>max && line){lines.push(line);line=ch;}else line+=ch;}lines.push(line);return lines;}
 const blocks=out.sections.map(([title,lines])=>({title,lines:lines.flatMap(t=>wrap(t,width-2*margin-32))}));
 const height=300+blocks.reduce((h,b)=>h+92+b.lines.length*lineHeight,0)+70;
 canvas.width=width*scale;canvas.height=height*scale;ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#245b86';ctx.fillRect(0,0,width,12);ctx.font='bold 15px system-ui, sans-serif';ctx.fillText('ESTIMATE / 計算結果',margin,60);
 ctx.fillStyle='#263a4d';ctx.font='bold 34px system-ui, sans-serif';ctx.fillText('見積計算結果の確認シート',margin,113);ctx.font='20px system-ui, sans-serif';ctx.fillStyle='#61778b';ctx.fillText('出力日時：'+time.display,margin,152);
 ctx.fillStyle='#eaf3fa';ctx.fillRect(margin,181,width-2*margin,86);ctx.fillStyle='#204c6d';ctx.font='bold 25px system-ui, sans-serif';const total='見積金額（税別） '+E.yen(state.total);let fontSize=25;while(ctx.measureText(total).width>width-2*margin-40){ctx.font=`bold ${--fontSize}px system-ui, sans-serif`;}ctx.fillText(total,margin+20,234);
 let y=300;
 for(const b of blocks){ctx.fillStyle='#eef3f7';ctx.fillRect(margin,y,width-2*margin,48);ctx.fillStyle='#355976';ctx.font='bold 24px system-ui, sans-serif';ctx.fillText(b.title,margin+16,y+33);y+=74;ctx.font='24px system-ui, sans-serif';ctx.fillStyle='#263a4d';for(const line of b.lines){ctx.fillText(line,margin+16,y+24);y+=lineHeight;}y+=18;}
 ctx.fillStyle='#8192a0';ctx.font='18px system-ui, sans-serif';ctx.fillText('税別 / 法定福利費・原価は1円未満切り捨て / 入力内容の自動保存なし',margin,height-35);
 return canvas;
}
$('save-image').addEventListener('click',async()=>{
 const button=$('save-image');button.disabled=true;
 try{const time=stamp(),out=summary(time),canvas=canvasSummary(out,time);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG生成失敗');if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(blob);const a=$('image-link');a.href=imageUrl;a.download=time.file;$('export-image').src=imageUrl;$('image-fallback').hidden=false;a.click();catFeedback('export');$('notice').textContent='PNG画像を生成しました。保存が始まらない場合は、表示された画像から保存できます。';}
 catch{$('notice').textContent='画像を生成できませんでした。テキストコピーをご利用ください。';}
 finally{button.disabled=invalid;}
});
// Browser back/forward caches must not retain previous input values.
window.addEventListener('pageshow',()=>{resetWorkflow();resetCustomItems();descriptors.forEach(([id])=>$(id).value=E.defaults[id]);E.items.forEach(([id])=>{$('adopt-'+id).value='';$('memo-'+id).value='';$('detail-'+id).open=false;});resetOverhead();resetDiscounts();resetImport();resetPartsRateModes();update();});
update();
