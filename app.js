'use strict';
const E=window.Estimate;
const $=id=>document.getElementById(id);
function catFeedback(type){document.dispatchEvent(new CustomEvent('estimate:feedback',{detail:{type}}));}
const basic=[['parts','部品代','円','money'],['workers','作業人員','人','decimal'],['shipping','部品送料','円','money']];
const settings=[['materialsRate','消耗資材費率','％','rate'],['removalRate','撤去品引取費率','％','rate'],['protectionRate','養生・安全対策費率','％','rate'],['laborPrice','交換作業売価単価','円／人','money'],['workerShipping','作業員交通費単価','円／人','money'],['overheadRate','諸経費率','％','rate'],['welfareRate','法定福利費率','％','rate']];
const partRatioIds=['materials','removal','protection','shipping'];
const descriptors=[...basic,...settings];
let customItems=[],nextCustomId=1;
let rowOrder=E.defaultOrder(),editingItems=false,itemDrag=null;
let rateLinks={};
let roundUndo=null,copyEpoch=0,updateRevision=0;
let roundedItems=new Set(); // Only adoptions written by rounding in this page session.
const copiedValues=new Map();
let settingSources={};
const partsRateIds=["materialsRate","removalRate"];
let partsRateModes={materialsRate:"auto",removalRate:"auto"};
function itemDefinitions(){
 const labels=new Map(E.items);for(const item of customItems)labels.set(item.id,$('custom-name-'+item.id).value.trim()||item.label);
 return rowOrder.map(id=>[id,labels.get(id)]);
}
function resetCustomItems(){
 for(const item of customItems){clearTimeout(copyFeedbackTimers.get(item.id));copyFeedbackTimers.delete(item.id);$('row-'+item.id).remove();}
 customItems=[];nextCustomId=1;rowOrder=E.defaultOrder();syncRowDOM();
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
$('reset-parts-rates').addEventListener('click',()=>{finishItemDrag(true,false);invalidateRoundUndo();resetPartsRateModes();syncPartsRates();update();});
const copyIcon='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"></path></svg>';
// Decorative inline SVGs: fixed local paths, never interactive or included in copies.
const expenseIconPaths={
 parts:'<path d="m12 3 9 5-9 5-9-5 9-5Z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5"/>',
 labor:'<path d="M14 6a5 5 0 0 0-6 6L3 17a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>',
 materials:'<path d="m12 3 10 5-10 5L2 8l10-5Z M2 12l10 5 10-5 M2 16l10 5 10-5"/>',
 shipping:'<path d="M3 5h11v12H3V5Z M14 9h4l3 4v4h-7 M14 13h7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 removal:'<path d="M4 8a8 8 0 0 1 14-3l2 3 M20 3v5h-5 M20 16a8 8 0 0 1-14 3l-2-3 M4 21v-5h5"/>',
 protection:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z m-4 9 3 3 5-6"/>',
 overhead:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z M9 7h6 M9 11h6 M9 15h3"/>',
 welfare:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3 M16 4a3 3 0 0 1 0 6 M18 13a5 5 0 0 1 3 5v3"/>',
 other:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8 M8 12h8 M8 16h5"/>'
};
function expenseIcon(tag){const key=Object.hasOwn(expenseIconPaths,tag)?tag:'other';return `<span class="expense-icon" data-icon="${key}" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">${expenseIconPaths[key]}</svg></span>`;}
$('welfare-heading').insertAdjacentHTML('afterbegin',expenseIcon('welfare'));
function rowCopyButton(id,label,kind){return `<button type="button" class="row-copy-button" id="copy-${kind}-${id}" data-copy="${kind}" data-item="${id}" aria-label="${label}の${kind==='cost'?'参考原価':kind==='amount'?'見積計上額':'算定根拠'}をコピー">${copyIcon}</button>`;}
function createCostRow(id,label,custom=false){
 const row=document.createElement('article');row.className='cost-row'+(custom?' custom-cost-row':'');row.id='row-'+id;row.setAttribute('aria-label',label);
 row.innerHTML=`
 <div class="cost-title">${custom?'<div class="custom-name-line"><label for="custom-name-'+id+'" class="custom-label cost-heading">'+expenseIcon('other')+'追加項目</label><button type="button" class="custom-remove" data-remove-custom="'+id+'" aria-label="'+label+'を削除">削除</button></div><input id="custom-name-'+id+'" class="custom-name-input" type="text" maxlength="40" placeholder="例：試運転調整費" aria-label="'+label+'の名称">':'<span class="cost-heading">'+expenseIcon(id)+'<span class="cost-name">'+label+'</span></span>'}${id==='overhead'?'<div class="overhead-controls"><span id="overhead-mode-label" class="tag"></span><button id="overhead-auto" type="button" class="overhead-auto" hidden>自動に戻す</button></div>':''}
  <span id="item-tag-${id}" class="item-tag-badge" hidden></span><div class="basis-inline"><span id="basis-${id}" class="basis"></span>${rowCopyButton(id,label,'basis')}</div>
 </div>
 ${custom?'<div class="money-cell standard-cell"><label class="custom-label" for="custom-amount-'+id+'">金額（円）</label><input id="custom-amount-'+id+'" type="text" data-kind="money" inputmode="decimal" value="0" aria-label="'+label+'の金額（円）" aria-describedby="custom-amount-'+id+'-error"><span id="custom-amount-'+id+'-error" class="input-error"></span></div>':'<div class="money-cell standard-cell"><span class="cell-label">標準額</span><span id="standard-'+id+'"></span></div>'}
 <div class="adoption"><label for="adopt-${id}" class="input-label">${label}の採用額（円）</label><input id="adopt-${id}" type="text" data-kind="money" data-optional="true" inputmode="decimal" placeholder="標準額を使用" aria-label="${label}の採用額（円）" aria-describedby="adopt-${id}-error"><span id="adopt-${id}-error" class="input-error"></span><small id="link-help-${id}" class="link-help" hidden></small><small id="fixed-adoption-${id}" class="fixed-adoption" title="採用額を空欄にすると標準額に戻ります" hidden>採用額を固定中</small>${id==='overhead'?'<small id="overhead-help" class="overhead-help">入力で手動固定・空欄で自動に戻る</small>':''}</div>
 <div class="money-cell booked-cell"><span class="cell-label">見積計上額</span><div class="amount-inline"><strong id="booked-${id}"></strong>${rowCopyButton(id,label,'amount')}</div>${E.expenseCostIds.includes(id)||id==='labor'?'<div class="expense-cost-line" id="cost-info-'+id+'" title="'+(id==='labor'?'作業人員×36,000円、1円未満切り捨て':'見積計上額×62％（利益率38％）、1円未満切り捨て')+'"><span>参考原価</span><span id="'+(id==='labor'?'labor-cost':'cost-'+id)+'"></span>'+rowCopyButton(id,label,'cost')+'</div>':''}${id==='labor'?'<p id="labor-cost-warning" class="cost-warning" role="status" hidden>参考原価を下回っています</p>':''}</div>
 <div id="adjustment-${id}" class="adjustment-summary" hidden><span>標準からの補正</span><strong id="diff-${id}"></strong><span id="ratio-${id}"></span></div>
 ${itemEditorMarkup(id,custom)}
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
 finishItemDrag(true,false);invalidateRoundUndo();
 const item={id:'custom_'+nextCustomId,label:'追加項目'+nextCustomId};nextCustomId++;
 customItems.push(item);rowOrder.splice(rowOrder.indexOf('overhead'),0,item.id);$('cost-rows').append(createCostRow(item.id,item.label,true));syncRowDOM();
 update();$('custom-name-'+item.id).focus();
});
function syncRowDOM(){
 for(const id of rowOrder){if(id==='overhead')$('cost-rows').append(customToolbar);$('cost-rows').append($('row-'+id));}
}
function itemEditorMarkup(id,custom){
 const options=E.itemTags.map(([code,label])=>`<option value="${code}">${label}${code==='labor'?'（法定対象）':''}</option>`).join('');
 return `<div class="row-editor" id="editor-${id}" hidden><div class="row-order-controls"><button type="button" class="item-move-handle" data-drag-item="${id}" aria-label="行をドラッグして移動">⠿</button><button type="button" class="item-move-button" data-move-item="${id}" data-direction="-1" aria-label="上へ移動">↑</button><button type="button" class="item-move-button" data-move-item="${id}" data-direction="1" aria-label="下へ移動">↓</button></div><div class="row-classification">${custom?`<label for="tag-${id}">費目タグ</label><select id="tag-${id}" data-extra-tag="${id}" aria-describedby="item-tag-help tag-${id}-error">${options}</select><span id="tag-${id}-error" class="input-error"></span>`:`<span class="fixed-category" id="category-${id}"></span>`}</div></div>`;
}
function renderItemEditors(){
 $('edit-items').textContent=editingItems?'編集を終える':'タグ・順番を編集';$('edit-items').setAttribute('aria-expanded',String(editingItems));
 $('item-edit-help').hidden=!editingItems;
 for(const row of state.rows){
  $('editor-'+row.id).hidden=!editingItems;
  const badge=$('item-tag-'+row.id);badge.hidden=!row.custom||row.tag==='other';
  badge.textContent=(new Map(E.itemTags).get(row.tag)||row.label)+(row.tag==='labor'?'・法定福利費対象':'');
  if(!row.custom)$('category-'+row.id).textContent=row.label+(row.tag==='labor'?'（法定福利費対象）':'');
  const position=rowOrder.indexOf(row.id);
  for(const button of $('editor-'+row.id).querySelectorAll('[data-move-item]')){
   const direction=Number(button.dataset.direction);button.disabled=direction<0?position===0:position===rowOrder.length-1;
   button.setAttribute('aria-label',row.label+'を'+(direction<0?'上':'下')+'へ移動');
  }
  $('editor-'+row.id).querySelector('[data-drag-item]').setAttribute('aria-label',row.label+'をドラッグして移動（'+(position+1)+'番目）。上下ボタンでも移動できます');
 }
}
function repositionItem(id,index){
 const current=rowOrder.indexOf(id);if(current<0)return false;
 const next=Math.max(0,Math.min(rowOrder.length-1,index));if(current===next)return false;
 rowOrder.splice(current,1);rowOrder.splice(next,0,id);syncRowDOM();return true;
}
function announceItemMove(id){const row=state.rows.find(row=>row.id===id);$('item-order-status').textContent=row.label+'を'+(rowOrder.indexOf(id)+1)+'番目へ移動しました。';}
$('edit-items').addEventListener('click',()=>{
 finishItemDrag(true);editingItems=!editingItems;renderItemEditors();$('item-order-status').textContent='';
});
$('cost-rows').addEventListener('click',event=>{
 const button=event.target.closest('[data-move-item]');if(!button||!editingItems)return;
 finishItemDrag(true,false);
 const id=button.dataset.moveItem;
 if(repositionItem(id,rowOrder.indexOf(id)+Number(button.dataset.direction))){invalidateRoundUndo();update();announceItemMove(id);(button.disabled?$('editor-'+id).querySelector('[data-drag-item]'):button).focus({preventScroll:true});$('row-'+id).scrollIntoView({block:'nearest'});}
});
function previewItemDrag(){
 if(!itemDrag?.active)return;
 const center=itemDrag.y-itemDrag.offset;
 const others=rowOrder.filter(id=>id!==itemDrag.id);
 const target=others.filter(id=>{const rect=$('row-'+id).getBoundingClientRect();return center>rect.top+rect.height/2;}).length;
 if(repositionItem(itemDrag.id,target)){
  try{itemDrag.handle.setPointerCapture(itemDrag.pointerId);}catch{}
 }
}
function dragScroll(){
 if(!itemDrag?.active)return;
 const top=$('pixel-companion').closest('header').getBoundingClientRect().bottom+48,bottom=innerHeight-72;
 const speed=itemDrag.y<top?-Math.min(16,(top-itemDrag.y)/3):itemDrag.y>bottom?Math.min(16,(itemDrag.y-bottom)/3):0;
 if(speed){window.scrollBy(0,speed);previewItemDrag();}
 itemDrag.frame=requestAnimationFrame(dragScroll);
}
function finishItemDrag(cancel=false,refresh=true){
 if(!itemDrag)return;
 const saved=itemDrag;itemDrag=null;cancelAnimationFrame(saved.frame);
 $('row-'+saved.id)?.classList.remove('is-moving');
 try{if(saved.handle.hasPointerCapture(saved.pointerId))saved.handle.releasePointerCapture(saved.pointerId);}catch{}
 const changed=rowOrder.join('|')!==saved.order.join('|');
 if(cancel&&changed){rowOrder=saved.order;syncRowDOM();}
 if(refresh){
  if(changed&&!cancel)invalidateRoundUndo();
  if(changed&&!cancel){update();announceItemMove(saved.id);}else{renderItemEditors();refreshNavigationHint();}
  saved.handle.focus({preventScroll:true});
 }
}
$('cost-rows').addEventListener('pointerdown',event=>{
 const handle=event.target.closest('[data-drag-item]');
 if(!handle||!editingItems||event.button!==0||!event.isPrimary||itemDrag)return;
 const id=handle.dataset.dragItem,rect=$('row-'+id).getBoundingClientRect();
 event.preventDefault();handle.focus({preventScroll:true});
 itemDrag={id,handle,pointerId:event.pointerId,startY:event.clientY,y:event.clientY,offset:event.clientY-(rect.top+rect.height/2),order:rowOrder.slice(),active:false,frame:0};
 handle.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
 if(!itemDrag||event.pointerId!==itemDrag.pointerId)return;
 itemDrag.y=event.clientY;
 if(!itemDrag.active&&Math.abs(itemDrag.y-itemDrag.startY)>6){itemDrag.active=true;$('row-'+itemDrag.id).classList.add('is-moving');itemDrag.frame=requestAnimationFrame(dragScroll);}
 if(itemDrag.active){event.preventDefault();previewItemDrag();}
},{passive:false});
document.addEventListener('pointerup',event=>{if(!itemDrag||event.pointerId!==itemDrag.pointerId)return;itemDrag.y=event.clientY;if(Math.abs(itemDrag.y-itemDrag.startY)>6){itemDrag.active=true;previewItemDrag();}finishItemDrag();});
document.addEventListener('pointercancel',event=>{if(itemDrag&&event.pointerId===itemDrag.pointerId)finishItemDrag(true);});
document.addEventListener('keydown',event=>{if(!itemDrag)return;if(event.key==='Escape'){event.preventDefault();finishItemDrag(true);}else if(event.key==='Tab')finishItemDrag(true);});
window.addEventListener('blur',()=>finishItemDrag(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishItemDrag(true);});
$('cost-rows').addEventListener('contextmenu',event=>{if(event.target.closest('[data-drag-item]'))event.preventDefault();});
let state, invalid=false, imageUrl;
let overheadRounded=false,overheadManual=false,overheadFixedBasis=null;
function overheadMode(){if(rateLinks.overhead)return 'linked';return overheadManual?'manual':overheadRounded?'rounded':'auto';}
function overheadModeLabel(){if(rateLinks.overhead)return '引継掛率で自動連動';return overheadManual?'手動固定':overheadRounded?'自動連動・端数調整':'自動連動';}
function resetOverhead(){rateLinks={};overheadRounded=false;overheadManual=false;overheadFixedBasis=null;}
const copyingButtons=new Set();
const copyFeedbackTimers=new Map();
// Transient UI state only. These helpers never change the calculation formulas.
function invalidateRoundUndo(){roundUndo=null;$('undo-round').hidden=true;$('undo-round-help').hidden=true;}
function resetWorkflow(){finishItemDrag(true,false);window.CompanyImportUI?.reset();editingItems=false;$('item-order-status').textContent='';invalidateRoundUndo();roundedItems.clear();$('adjustment-breakdown').open=false;copiedValues.clear();copyEpoch++;settingSources={};}
function captureRoundState(){
 return {adopted:Object.fromEntries(itemDefinitions().map(([id])=>[id,$('adopt-'+id).value])),roundedItems:new Set(roundedItems),links:structuredClone(rateLinks),rounded:overheadRounded,manual:overheadManual,basis:overheadFixedBasis,details:Object.fromEntries(itemDefinitions().map(([id])=>[id,$('detail-'+id).open]))};
}
$('undo-round').addEventListener('click',()=>{
 if(!roundUndo)return;const saved=roundUndo;invalidateRoundUndo();
 for(const [id,value] of Object.entries(saved.adopted))$('adopt-'+id).value=value;
 roundedItems=saved.roundedItems;rateLinks=saved.links;overheadRounded=saved.rounded;overheadManual=saved.manual;overheadFixedBasis=saved.basis;
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
function readItemTag(id){
 const input=$('tag-'+id),valid=E.itemTags.some(([tag])=>tag===input.value);input.setAttribute('aria-invalid',String(!valid));$('tag-'+id+'-error').textContent=valid?'':'費目タグを選択してください';if(!valid)invalid=true;return valid?input.value:'other';
}
function read(input){const result=E.parse(input.value,input.dataset.kind,input.dataset.optional==='true');input.setAttribute('aria-invalid',String(!!result.error));$(input.id+'-error').textContent=result.error; if(result.error)invalid=true;return result.value;}
function basis(p,result){return {overhead:`小計 × ${E.format(p.overheadRate)}％`,parts:'基本入力の部品代',materials:`部品代 × ${E.format(p.materialsRate)}％`,removal:`部品代 × ${E.format(p.removalRate)}％`,protection:`部品代 × ${E.format(p.protectionRate)}％`,labor:`売価：${E.format(p.workers)}人 × ${E.yen(p.laborPrice)} ＝ ${E.yen(result.rows.find(r=>r.id==='labor').standard)}`,shipping:`${E.format(p.workers)}人 × ${E.yen(p.workerShipping)} ＋ ${E.yen(p.shipping)}`};}
function diffClass(node,value){node.classList.toggle('increase',value>0n);node.classList.toggle('decrease',value<0n);}
function update(){
 updateRevision++;
 renderPartsRateModes();
 invalid=false;const p={},adopted={},memos={};
 descriptors.forEach(([id])=>p[id]=read($(id)));
 const extraInputs=customItems.map(item=>({id:item.id,label:$('custom-name-'+item.id).value.trim()||item.label,amount:read($('custom-amount-'+item.id)),tag:readItemTag(item.id)}));
 itemDefinitions().forEach(([id])=>{
  const input=$('adopt-'+id);
  if(rateLinks[id]||(id==='overhead'&&!overheadManual)){adopted[id]=null;input.setAttribute('aria-invalid','false');$('adopt-'+id+'-error').textContent='';}
  else adopted[id]=read(input);
  memos[id]=$('memo-'+id).value;
 });
 const result=E.calculate(p,adopted,overheadMode(),extraInputs,rateLinks,rowOrder);
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
  const row=$('row-'+r.id);row.dataset.itemTag=r.tag;
  const icon=row.querySelector('.expense-icon');if(icon.dataset.icon!==r.tag)icon.outerHTML=expenseIcon(r.tag);
  const wasChanged=row.classList.contains('changed'),changed=r.diff!==0n;
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
 $('labor-cost-warning').hidden=invalid||result.rows.find(row=>row.id==='labor').booked>=result.laborCost;
 for(const id of ['subtotal','welfare'])$(id).textContent=E.yen(result[id]);
 $('welfare-cost').textContent=E.yen(result.welfareCost);
 $('cost-info-welfare').title=`法定福利費 ${E.yen(result.welfare)} × 0.66 ＝ ${E.yen(result.welfareCost)}（1円未満切り捨て）`;
 $('copy-amount-welfare').title='法定福利費の金額をコピー：'+E.format(result.welfare);
 $('copy-cost-welfare').title='法定福利費の参考原価をコピー：'+E.format(result.costs.welfare);
 clearTimeout(copyFeedbackTimers.get('welfare'));copyFeedbackTimers.delete('welfare');
 $('row-copy-feedback-welfare').hidden=true;$('row-copy-feedback-welfare').replaceChildren();
 const extraLabor=extraInputs.some(item=>item.tag==='labor');
 $('welfare-basis').textContent=extraLabor?`対象作業費合計 ${E.yen(result.welfareBase)} × ${E.format(p.welfareRate)}％・1円未満切り捨て`:`採用交換作業費 × ${E.format(p.welfareRate)}％・1円未満切り捨て`;
 $('welfare-basis').title=result.rows.filter(row=>row.tag==='labor').map(row=>row.label+'：'+E.yen(row.booked)).join('／');
 $('grand-total').textContent=E.yen(result.total);$('standard-total').textContent=E.yen(result.standardTotal);$('current-total').textContent=E.yen(result.total);$('total-diff').textContent=E.signed(result.diff);diffClass($('total-diff'),result.diff);$('total-rate').textContent=E.ratio(result.diff,result.standardTotal,2);
 const breakdown=E.adjustmentBreakdown(result,p);
 for(const id of ['direct','overhead','welfare','total'])$('correction-'+id).textContent=invalid?'—':E.signed(breakdown[id]);
 updateDiscounts();
 renderSettingChanges();renderChanges();$('validation-banner').hidden=!invalid;
 for(const id of ['save-image','copy-text','copy-simple','preview','round-standard'])$(id).disabled=invalid;
 document.querySelectorAll('[data-copy]').forEach(button=>button.disabled=invalid||copyingButtons.has(button));
 $('round-notice').textContent='';
 $('summary-preview').hidden=true;$('image-fallback').hidden=true;$('copy-fallback').hidden=true;$('notice').textContent='';
 if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;$('export-image').removeAttribute('src');}
 renderItemEditors();renderCopyMarks();renderSimplePreview();refreshNavigationHint();
 $('undo-round').hidden=!roundUndo;$('undo-round-help').hidden=!roundUndo;
 catFeedback(invalid?'error':'typing');
 window.CompanyImportUI?.refresh();
}
function changeLines(r){const p=state.p;return [`標準 ${E.yen(r.standard)} → 採用 ${E.yen(r.adopted)}`,`差額 ${E.signed(r.diff)}　標準比 ${E.ratio(r.diff,r.standard)}`,...(partRatioIds.includes(r.id)?[`部品代比 ${E.ratio(r.booked,p.parts,2,false)}`]:[]),`理由：${state.memos[r.id]||'記入なし'}`];}
function renderChanges(){
 const changed=state.rows.filter(r=>r.diff!==0n);$('change-count').textContent=state.settingChanges.length?'採用額 '+changed.length+'項目・設定 '+state.settingChanges.length+'項目':changed.length+'項目';$('changes').replaceChildren();
 $('review-guide').hidden=!changed.length;
 if(!changed.length){const p=document.createElement('p');p.className='empty-changes';p.textContent=state.settingChanges.length?'採用額の変更はありません':'標準設定からの変更はありません';$('changes').append(p);return;}
 for(const r of changed){
  const review=!invalid&&E.needsChangeReview(r.standard,r.booked);
  const article=document.createElement('article');article.className='change-card';article.classList.toggle('needs-review',review);article.dataset.itemId=r.id;
  const heading=document.createElement('div');heading.className='change-card-heading';
  const title=document.createElement('h3');title.textContent=r.label;heading.append(title);
  if(review){const badge=document.createElement('span');badge.className='review-badge';badge.textContent=r.standard===0n?'標準額0円・要確認':'標準比'+E.ratio(r.diff,r.standard)+'・要確認';heading.append(badge);}
  article.append(heading);
  changeLines(r).forEach((line,i)=>{const p=document.createElement('p');p.textContent=line;if(!i)p.className='transition';article.append(p);});$('changes').append(article);
 }
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
  roundedItems.delete(id);
  clearTimeout(copyFeedbackTimers.get(id));copyFeedbackTimers.delete(id);
  finishItemDrag(true,false);customItems=customItems.filter(item=>item.id!==id);rowOrder=rowOrder.filter(item=>item!==id);$('row-'+id).remove();syncRowDOM();update();$('add-custom-item').focus();return;
 }
 const button=event.target.closest('button[data-copy]');
 if(button)copyRow(button);
});
$('estimate-form').addEventListener('submit',e=>e.preventDefault());
$('estimate-form').addEventListener('input',event=>{
 finishItemDrag(true,false);invalidateRoundUndo();
 if(settings.some(([id])=>id===event.target.id))settingSources[event.target.id]='manual';
 if(partsRateIds.includes(event.target.id))partsRateModes[event.target.id]='manual';
 if(event.target.id==='parts')syncPartsRates();
 if(event.target.id.startsWith('adopt-')){const id=event.target.id.slice(6);delete rateLinks[id];roundedItems.delete(id);}
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
function resetToOverheadAuto(){finishItemDrag(true,false);invalidateRoundUndo();delete rateLinks.overhead;overheadManual=false;overheadFixedBasis=null;update();}

$('estimate-form').addEventListener('focusin',e=>{
 const el=e.target;if(!el.dataset.kind || !el.value.includes(','))return;
 const before=el.value,start=el.selectionStart,end=el.selectionEnd;
 el.value=before.replaceAll(',','');
 if(start!==null && end!==null)el.setSelectionRange(before.slice(0,start).replaceAll(',','').length,before.slice(0,end).replaceAll(',','').length);
});
$('estimate-form').addEventListener('focusout',e=>{const el=e.target;if(!el.dataset.kind)return;const r=E.parse(el.value,el.dataset.kind,el.dataset.optional==='true');if(!r.error && el.value.trim() && r.value!==null)el.value=E.format(r.value);});
$('round-standard').addEventListener('click',()=>{
 if(invalid)return;
 const targets=state.rows.filter(row=>row.id!=='parts'&&row.id!=='overhead'&&!rateLinks[row.id]&&(row.adopted===null||roundedItems.has(row.id)));
 const adopted=Object.fromEntries(state.rows.map(row=>[row.id,row.adopted]));
 for(const row of targets)adopted[row.id]=E.roundStandardAmount(row.standard);
 const keepOverhead=overheadManual||!!rateLinks.overhead;
 const preview=E.calculate(state.p,adopted,keepOverhead?overheadMode():'rounded',state.extraItems,rateLinks,rowOrder);
 const limit=1000000000000n*E.SCALE;
 if(targets.some(row=>adopted[row.id]>limit)||(!keepOverhead&&preview.overhead>limit)){
  $('round-notice').textContent='計算結果が採用額の入力上限（1兆円）を超えるため、一括入力できません。基本入力・標準設定を確認してください。';return;
 }
 if(!roundUndo)roundUndo=captureRoundState();
 const kept=state.rows.filter(row=>row.id!=='parts'&&(row.id==='overhead'?keepOverhead:!targets.includes(row))).length;
 for(const row of targets){$('adopt-'+row.id).value=E.format(adopted[row.id]);roundedItems.add(row.id);}
 if(!keepOverhead){overheadRounded=true;overheadFixedBasis=null;}
 update();
 $('round-notice').textContent='端数調整を実行しました。'+(kept?'手動・復元設定済みの'+kept+'項目は変更していません。':'');
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
$('discount-form').addEventListener('input',()=>{updateDiscounts();window.CompanyImportUI?.refresh();catFeedback('typing');});
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
 sections.push(['見積内訳',[...s.rows.map(r=>`${r.label}：${E.yen(r.booked)}`),`小計（諸経費・法定福利費を除く）：${E.yen(s.subtotal)}`,`法定福利費（${s.extraItems.some(item=>item.tag==='labor')?'対象作業費合計':'採用交換作業費'} × ${E.format(s.p.welfareRate)}％・切り捨て）：${E.yen(s.welfare)}`,`見積金額（税別）：${E.yen(s.total)}`]]);
 if(s.extraItems.some(item=>item.tag!=='other'))sections.push(['追加項目のタグ',s.rows.filter(row=>row.custom&&row.tag!=='other').map(row=>row.label+'：'+new Map(E.itemTags).get(row.tag)+(row.tag==='labor'?'（法定福利費対象）':''))]);
 if(s.extraItems.some(item=>item.tag==='labor'))sections.push(['法定福利費の算定対象',[...s.rows.filter(row=>row.tag==='labor').map(row=>row.label+'：'+E.yen(row.booked)),'対象作業費合計：'+E.yen(s.welfareBase)]]);
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
  $('import-summary').textContent=[...(data.time?['出力日時：'+data.time]:[]),...basic.map(([id,label,unit])=>label+'：'+E.format(data.p[id])+unit),...settings.map(([id,label,unit])=>label+'：'+E.format(data.p[id])+unit),'追加項目：'+data.extraItems.length+'項目',...data.result.rows.map(row=>row.label+'：'+E.yen(row.booked)+(row.custom?'〔'+new Map(E.itemTags).get(row.tag)+'〕':'')),...(data.extraItems.some(item=>item.tag==='labor')?['法定福利費の対象作業費合計：'+E.yen(data.result.welfareBase),'法定福利費：'+E.yen(data.result.welfare)]:[]),'復元後の見積金額（税別）：'+E.yen(data.result.total),'諸経費：'+({auto:'自動連動',rounded:'端数調整付き自動連動',manual:'手動固定',linked:'引継掛率で自動連動'}[data.mode]),...linkLines,...fixed.map(r=>r.label+'：'+E.yen(r.booked)+'（手動固定）'),...data.result.rows.filter(r=>data.memos[r.id]).map(r=>r.label+' メモ：'+data.memos[r.id]),'反映後、基本入力の部品代などを変更して再計算できます。'].join('\n');
  pendingImport=data;$('import-preview').hidden=false;
 }catch(error){$('import-error').textContent=error.message;}
});
function restoreConditions(data){
 resetWorkflow();settingSources=data.settingSources??Object.fromEntries(settings.map(([id])=>[id,'imported']));
 resetCustomItems();resetOverhead();resetDiscounts();
 descriptors.forEach(([id])=>$(id).value=E.format(data.p[id]));
 for(const item of data.extraItems){
  const definition={id:item.id,label:'追加項目'+nextCustomId};nextCustomId++;
  customItems.push(definition);$('cost-rows').insertBefore(createCostRow(item.id,definition.label,true),customToolbar);
  $('custom-name-'+item.id).value=item.label;$('custom-amount-'+item.id).value=E.format(item.amount);$('tag-'+item.id).value=item.tag;
 }
 rowOrder=data.order.slice();syncRowDOM();
 for(const [id] of itemDefinitions()){$('adopt-'+id).value=data.adopted[id]===null?'':E.format(data.adopted[id]);$('memo-'+id).value=data.memos[id];$('detail-'+id).open=false;}
 partsRateModes=data.partsRateModes??{materialsRate:'imported',removalRate:'imported'};
 rateLinks={...data.links};overheadRounded=data.rounded;overheadManual=data.mode==='manual';overheadFixedBasis=null;
 update();
}
$('apply-import').addEventListener('click',()=>{
 if(!pendingImport)return;const data=pendingImport;
 restoreConditions(data);resetImport();$('import-notice').textContent='計算条件を反映しました。復元した掛率を保持して再計算します。';$('basic-title').scrollIntoView({block:'start'});catFeedback('copy');
});
$('copy-simple').addEventListener('click',async()=>{
 if(invalid)return;finishItemDrag(false);const button=$('copy-simple'),epoch=copyEpoch,revision=updateRevision;button.disabled=true;
 try{
  const text=simpleText();if($('simple-preview').open)$('simple-text').textContent=text;
  try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(text);if(epoch!==copyEpoch)return;$('notice').textContent=revision===updateRevision?'簡易版をコピーしました。後日、画面上部に貼り付けて再計算できます。':'入力変更前の簡易版をコピーしました。現在の結果が必要な場合は、もう一度コピーしてください。';catFeedback('copy');}
  catch{if(epoch!==copyEpoch||revision!==updateRevision)return;$('copy-area').value=text;$('copy-fallback').hidden=false;$('copy-area').focus();$('copy-area').select();$('notice').textContent='自動コピーが利用できません。選択された簡易版をコピーしてください。';}
 }catch(error){$('notice').textContent=error.message;}
 finally{button.disabled=invalid;}
});
$('preview').addEventListener('click',()=>{finishItemDrag(false);const out=summary(stamp());$('summary-text').textContent=out.text;$('summary-preview').hidden=false;});
$('copy-text').addEventListener('click',async()=>{
 finishItemDrag(false);const out=summary(stamp());const button=$('copy-text');button.disabled=true;
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
 ctx.fillStyle='#245b86';ctx.fillRect(0,0,width,12);ctx.font='bold 15px system-ui, sans-serif';ctx.fillText('CAT / 計算結果',margin,60);
 ctx.fillStyle='#263a4d';ctx.font='bold 34px system-ui, sans-serif';ctx.fillText('見積計算結果の確認シート',margin,113);ctx.font='20px system-ui, sans-serif';ctx.fillStyle='#61778b';ctx.fillText('出力日時：'+time.display,margin,152);
 ctx.fillStyle='#eaf3fa';ctx.fillRect(margin,181,width-2*margin,86);ctx.fillStyle='#204c6d';ctx.font='bold 25px system-ui, sans-serif';const total='見積金額（税別） '+E.yen(state.total);let fontSize=25;while(ctx.measureText(total).width>width-2*margin-40){ctx.font=`bold ${--fontSize}px system-ui, sans-serif`;}ctx.fillText(total,margin+20,234);
 let y=300;
 for(const b of blocks){ctx.fillStyle='#eef3f7';ctx.fillRect(margin,y,width-2*margin,48);ctx.fillStyle='#355976';ctx.font='bold 24px system-ui, sans-serif';ctx.fillText(b.title,margin+16,y+33);y+=74;ctx.font='24px system-ui, sans-serif';ctx.fillStyle='#263a4d';for(const line of b.lines){ctx.fillText(line,margin+16,y+24);y+=lineHeight;}y+=18;}
 ctx.fillStyle='#8192a0';ctx.font='18px system-ui, sans-serif';ctx.fillText('税別 / 法定福利費・原価は1円未満切り捨て / 入力内容の自動保存なし',margin,height-35);
 return canvas;
}
$('save-image').addEventListener('click',async()=>{
 finishItemDrag(false);const button=$('save-image');button.disabled=true;
 try{const time=stamp(),out=summary(time),canvas=canvasSummary(out,time);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG生成失敗');if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(blob);const a=$('image-link');a.href=imageUrl;a.download=time.file;$('export-image').src=imageUrl;$('image-fallback').hidden=false;a.click();catFeedback('export');$('notice').textContent='PNG画像を生成しました。保存が始まらない場合は、表示された画像から保存できます。';}
 catch{$('notice').textContent='画像を生成できませんでした。テキストコピーをご利用ください。';}
 finally{button.disabled=invalid;}
});
// Browser back/forward caches must not retain previous input values.
window.addEventListener('pageshow',()=>{resetWorkflow();resetCustomItems();descriptors.forEach(([id])=>$(id).value=E.defaults[id]);E.items.forEach(([id])=>{$('adopt-'+id).value='';$('memo-'+id).value='';$('detail-'+id).open=false;});resetOverhead();resetDiscounts();resetImport();resetPartsRateModes();update();});
update();
window.CompanyImportUI.init({
 context:()=>{
  const values={};for(const [id,, ,kind] of settings){const parsed=E.parse($(id).value,kind);if(parsed.error)throw Error('CATの標準設定を確認してください');values[id]=parsed.value;}
  return {settings:values,autoRates:Object.fromEntries(partsRateIds.map(id=>[id,partsRateModes[id]==='auto']))};
 },
 hasInput:()=>invalid||overheadRounded||customItems.length>0||Object.keys(settingSources).length>0||
  basic.some(([id])=>$(id).value.replaceAll(',','')!==E.defaults[id])||
  state.rows.some(row=>row.adopted!==null||state.memos[row.id])||
  settings.some(([id])=>$(id).value.replaceAll(',','')!==E.defaults[id])||
  ['discount-rate','discount-amount'].some(id=>$(id).value.trim()!==''),
 apply:data=>{const modes={...partsRateModes},sources={...settingSources};restoreConditions({...data,partsRateModes:modes,settingSources:sources});resetImport();catFeedback('copy');}
});
