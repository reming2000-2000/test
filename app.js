'use strict';
const E=window.Estimate;
const $=id=>document.getElementById(id);
const basic=[['parts','部品代','円','money'],['workers','作業人員','人','decimal'],['shipping','部品送料','円','money']];
const settings=[['materialsRate','消耗資材費率','％','rate'],['removalRate','撤去品引取費率','％','rate'],['protectionRate','養生・安全対策費率','％','rate'],['laborPrice','交換作業売価単価','円／人','money'],['workerShipping','作業員送料単価','円／人','money'],['overheadRate','諸経費率','％','rate'],['welfareRate','法定福利費率','％','rate']];
const partRatioIds=['materials','removal','protection','shipping'];
const descriptors=[...basic,...settings];
function field([id,label,unit,kind]) {
 const box=document.createElement('div');
 box.innerHTML=`<label class="input-label" for="${id}">${label}</label><div class="input-shell"><input id="${id}" data-kind="${kind}" inputmode="decimal" type="text" value="${E.defaults[id]}" aria-describedby="${id}-error" spellcheck="false"><span class="unit">${unit}</span></div><span id="${id}-error" class="input-error"></span>`;
 return box;
}
basic.forEach(d=>$('basic-fields').append(field(d)));
settings.forEach(d=>$('setting-fields').append(field(d)));
for(const [id,label] of E.items){
 const row=document.createElement('article');row.className='cost-row';row.id='row-'+id;row.setAttribute('aria-label',label);
 row.innerHTML=`<div class="cost-title"><span class="cost-name">${label}</span><span id="basis-${id}" class="basis"></span>${id==='labor'?'<span id="labor-cost" class="basis cost-basis"></span>':''}</div><div class="money-cell"><span class="cell-label">標準額</span><span id="standard-${id}"></span></div><div class="adoption"><label for="adopt-${id}" class="input-label">${label}の採用額（円）</label><input id="adopt-${id}" type="text" data-kind="money" data-optional="true" inputmode="decimal" placeholder="標準額を使用" aria-label="${label}の採用額（円）" aria-describedby="adopt-${id}-error"><span id="adopt-${id}-error" class="input-error"></span></div><div class="money-cell diff-cell"><span class="cell-label">差額 / 標準比</span><span id="diff-${id}"></span><small id="ratio-${id}"></small><small id="parts-ratio-${id}"></small></div><div class="money-cell"><span class="cell-label">見積計上額</span><strong id="booked-${id}"></strong></div><div class="note-cell"><label class="cell-label" for="memo-${id}">補正理由・メモ</label><input class="note-input" id="memo-${id}" maxlength="100" placeholder="理由を入力（任意）" aria-label="${label}の補正理由・メモ"></div>`;
 $('cost-rows').append(row);
}
let state, invalid=false, imageUrl;
function read(input){const result=E.parse(input.value,input.dataset.kind,input.dataset.optional==='true');input.setAttribute('aria-invalid',String(!!result.error));$(input.id+'-error').textContent=result.error; if(result.error)invalid=true;return result.value;}
function basis(p,result){return {parts:'基本入力の部品代',materials:`部品代 × ${E.format(p.materialsRate)}％`,removal:`部品代 × ${E.format(p.removalRate)}％`,protection:`部品代 × ${E.format(p.protectionRate)}％`,labor:`売価：${E.format(p.workers)}人 × ${E.yen(p.laborPrice)} ＝ ${E.yen(result.rows.find(r=>r.id==='labor').standard)}`,shipping:`${E.format(p.workers)}人 × ${E.yen(p.workerShipping)} ＋ ${E.yen(p.shipping)}`};}
function diffClass(node,value){node.classList.toggle('increase',value>0n);node.classList.toggle('decrease',value<0n);}
function update(){
 invalid=false;const p={},adopted={},memos={};
 descriptors.forEach(([id])=>p[id]=read($(id)));
 E.items.forEach(([id])=>{adopted[id]=read($('adopt-'+id));memos[id]=$('memo-'+id).value;});
 const result=E.calculate(p,adopted);state={p,memos,...result};const bases=basis(p,result);
 for(const r of result.rows){
  $('basis-'+r.id).textContent=bases[r.id];$('standard-'+r.id).textContent=E.yen(r.standard);$('booked-'+r.id).textContent=E.yen(r.booked);$('diff-'+r.id).textContent=E.signed(r.diff);diffClass($('diff-'+r.id),r.diff);
  $('ratio-'+r.id).textContent=r.adopted!==null?'標準比 '+E.ratio(r.diff,r.standard):'';
  $('parts-ratio-'+r.id).textContent=partRatioIds.includes(r.id)?'部品代比 '+E.ratio(r.booked,p.parts,2,false):'';
  $('row-'+r.id).classList.toggle('changed',r.diff!==0n);
 }
 $('labor-cost').textContent=`原価（参考）：${E.format(p.workers)}人 × ${E.yen(E.laborCostPrice)} ＝ ${E.yen(result.laborCost)}`;
 for(const id of ['subtotal','overhead','welfare'])$(id).textContent=E.yen(result[id]);
 $('overhead-basis').textContent=`採用小計 × ${E.format(p.overheadRate)}％`;
 $('welfare-basis').textContent=`採用交換作業費 × ${E.format(p.welfareRate)}％・1円未満切り捨て`;
 $('grand-total').textContent=E.yen(result.total);$('standard-total').textContent=E.yen(result.standardTotal);$('current-total').textContent=E.yen(result.total);$('total-diff').textContent=E.signed(result.diff);diffClass($('total-diff'),result.diff);$('total-rate').textContent=E.ratio(result.diff,result.standardTotal,2);
 renderChanges();$('validation-banner').hidden=!invalid;
 for(const id of ['save-image','copy-text','preview'])$(id).disabled=invalid;
 $('summary-preview').hidden=true;$('image-fallback').hidden=true;$('copy-fallback').hidden=true;$('notice').textContent='';
 if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;$('export-image').removeAttribute('src');}
}
function changeLines(r){const p=state.p;return [`標準 ${E.yen(r.standard)} → 採用 ${E.yen(r.adopted)}`,`差額 ${E.signed(r.diff)}　標準比 ${E.ratio(r.diff,r.standard)}`,...(partRatioIds.includes(r.id)?[`部品代比 ${E.ratio(r.booked,p.parts,2,false)}`]:[]),`理由：${state.memos[r.id]||'記入なし'}`];}
function renderChanges(){
 const changed=state.rows.filter(r=>r.diff!==0n);$('change-count').textContent=changed.length+'項目';$('changes').replaceChildren();
 if(!changed.length){const p=document.createElement('p');p.className='empty-changes';p.textContent='標準設定からの変更はありません';$('changes').append(p);return;}
 for(const r of changed){const article=document.createElement('article');article.className='change-card';const title=document.createElement('h3');title.textContent=r.label;article.append(title);changeLines(r).forEach((line,i)=>{const p=document.createElement('p');p.textContent=line;if(!i)p.className='transition';article.append(p);});$('changes').append(article);}
}
$('estimate-form').addEventListener('submit',e=>e.preventDefault());
$('estimate-form').addEventListener('input',update);
$('estimate-form').addEventListener('focusin',e=>{
 const el=e.target;if(!el.dataset.kind || !el.value.includes(','))return;
 const before=el.value,start=el.selectionStart,end=el.selectionEnd;
 el.value=before.replaceAll(',','');
 if(start!==null && end!==null)el.setSelectionRange(before.slice(0,start).replaceAll(',','').length,before.slice(0,end).replaceAll(',','').length);
});
$('estimate-form').addEventListener('focusout',e=>{const el=e.target;if(!el.dataset.kind)return;const r=E.parse(el.value,el.dataset.kind,el.dataset.optional==='true');if(!r.error && el.value.trim() && r.value!==null)el.value=E.format(r.value);});
$('reset').addEventListener('click',()=>{if(!window.confirm('基本入力・採用額・メモ・標準設定をすべて初期状態に戻しますか？'))return;descriptors.forEach(([id])=>$(id).value=E.defaults[id]);E.items.forEach(([id])=>{$('adopt-'+id).value='';$('memo-'+id).value='';});update();$('parts').focus();});
function stamp(date=new Date()){
 const f=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});const p=Object.fromEntries(f.formatToParts(date).map(v=>[v.type,v.value]));
 return {display:`${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second}（日本時間）`,file:`estimate_${p.year}${p.month}${p.day}_${p.hour}${p.minute}${p.second}.png`};
}
function summary(time){
 const s=state, sections=[];
 sections.push(['基本条件',basic.map(([id,label,unit])=>`${label}：${E.format(s.p[id])}${unit}`)]);
 sections.push(['標準設定',settings.map(([id,label,unit])=>`${label}：${E.format(s.p[id])}${unit}`)]);
 sections.push(['見積内訳',[...s.rows.map(r=>`${r.label}：${E.yen(r.booked)}`),`小計（諸経費・法定福利費を除く）：${E.yen(s.subtotal)}`,`諸経費（採用小計 × ${E.format(s.p.overheadRate)}％）：${E.yen(s.overhead)}`,`法定福利費（採用交換作業費 × ${E.format(s.p.welfareRate)}％・切り捨て）：${E.yen(s.welfare)}`,`見積金額（税別）：${E.yen(s.total)}`]]);
 sections.push(['交換作業費の売価・原価',[basis(s.p,s).labor,`見積計上額：${E.yen(s.rows.find(r=>r.id==='labor').booked)}`,`原価（参考）：${E.format(s.p.workers)}人 × ${E.yen(E.laborCostPrice)} ＝ ${E.yen(s.laborCost)}`, '原価は確認用の表示です。見積総額には加算しません。']]);
 sections.push(['標準との比較',[`標準見積総額：${E.yen(s.standardTotal)}`,`現在の採用見積総額：${E.yen(s.total)}`,`総補正額：${E.signed(s.diff)}`,`標準見積に対する増減率：${E.ratio(s.diff,s.standardTotal,2)}`]]);
 const changes=s.rows.filter(r=>r.diff!==0n);
 sections.push(['標準から変更した項目',changes.length?changes.flatMap(r=>[r.label,...changeLines(r),'']):['標準設定からの変更はありません']]);
 const other=s.rows.filter(r=>r.diff===0n && s.memos[r.id]);if(other.length)sections.push(['その他のメモ',other.map(r=>`${r.label}：${s.memos[r.id]}`)]);
 return {sections,text:`見積計算結果の確認シート\n出力日時：${time.display}\n\n`+sections.map(([title,lines])=>`【${title}】\n${lines.join('\n')}`).join('\n\n')};
}
$('preview').addEventListener('click',()=>{const out=summary(stamp());$('summary-text').textContent=out.text;$('summary-preview').hidden=false;});
$('copy-text').addEventListener('click',async()=>{
 const out=summary(stamp());const button=$('copy-text');button.disabled=true;
 try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(out.text);$('notice').textContent='結果をコピーしました';}
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
 ctx.fillStyle='#8192a0';ctx.font='18px system-ui, sans-serif';ctx.fillText('税別 / 法定福利費のみ1円未満切り捨て / 入力内容の自動保存なし',margin,height-35);
 return canvas;
}
$('save-image').addEventListener('click',async()=>{
 const button=$('save-image');button.disabled=true;
 try{const time=stamp(),out=summary(time),canvas=canvasSummary(out,time);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG生成失敗');if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(blob);const a=$('image-link');a.href=imageUrl;a.download=time.file;$('export-image').src=imageUrl;$('image-fallback').hidden=false;a.click();$('notice').textContent='PNG画像を生成しました。保存が始まらない場合は、表示された画像から保存できます。';}
 catch{$('notice').textContent='画像を生成できませんでした。テキストコピーをご利用ください。';}
 finally{button.disabled=invalid;}
});
// Browser back/forward caches must not retain previous input values.
window.addEventListener('pageshow',()=>{descriptors.forEach(([id])=>$(id).value=E.defaults[id]);E.items.forEach(([id])=>{$('adopt-'+id).value='';$('memo-'+id).value='';});update();});
update();
