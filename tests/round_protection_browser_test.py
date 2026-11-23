"""Rounding ownership stays in memory; correction details reconcile to the total."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=ctx.new_page();page.set_default_timeout(7000);errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url));page.on('dialog',lambda d:d.accept())
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,value):page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 def reset():page.locator('#reset').click()
 def base():fill('parts','850000');fill('workers','1.501');fill('shipping','1550')
 def adopt(id):return page.locator('#adopt-'+id).input_value().replace(',','')
 def mode():return page.locator('#row-overhead').get_attribute('data-overhead-mode')
 def round_():page.locator('#round-standard').click();expect(page.locator('#undo-round')).to_be_visible();check_breakdown()
 def snapshot():
  return page.evaluate("""() => ({adopted:[...document.querySelectorAll('input[id^="adopt-"]')].map(el=>[el.id,el.value.replaceAll(',','')]),total:document.querySelector('#grand-total').textContent,mode:document.querySelector('#row-overhead').dataset.overheadMode,warning:!document.querySelector('#overhead-warning').hidden})""")
 def check_breakdown():
  page.evaluate("""() => {
   const ids=['direct','overhead','welfare'];
   // decimal() accepts unsigned input, so parse each signed value explicitly.
   const value=id=>{const s=document.getElementById(id).textContent.replaceAll(',','').replace('円','');return (s.startsWith('－')?-1n:1n)*Estimate.decimal(s.replace('＋','').replace('－',''));};
   const sum=ids.reduce((n,id)=>n+value('correction-'+id),0n);
   if(sum!==value('total-diff')||sum!==value('correction-total'))throw Error('Correction breakdown mismatch');
  }""")
 def copy():
  page.locator('#copy-simple').click();expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました');return page.evaluate('navigator.clipboard.readText()')
 def restore(text,proportional=False):
  page.locator('#import-panel').evaluate('(el)=>el.open=true');fill('import-text',text)
  page.locator('#import-proportional').set_checked(proportional);page.locator('#check-import').click()
  expect(page.locator('#import-preview')).to_be_visible();page.locator('#apply-import').click();check_breakdown()
 # Closed by default, zero reconciliation, keyboard opening and exact example.
 assert not page.locator('#adjustment-breakdown').evaluate('el=>el.open');check_breakdown()
 base();fill('adopt-materials','70000')
 page.locator('#adjustment-breakdown summary').focus();page.keyboard.press('Enter')
 expect(page.locator('#correction-direct')).to_be_visible()
 assert page.locator('#correction-direct').inner_text()=='＋27,500円'
 assert page.locator('#correction-overhead').inner_text()=='＋2,750円'
 assert page.locator('#correction-welfare').inner_text()=='0円'
 assert page.locator('#correction-total').inner_text()=='＋30,250円'
 check_breakdown()
 # Manual, explicit zero, equal-to-standard and fixed overhead all survive rounding.
 fill('adopt-removal','0');fill('adopt-protection','17000');fill('adopt-overhead','55774')
 before=snapshot();round_()
 for id,amount in [('materials','70000'),('removal','0'),('protection','17000'),('overhead','55774')]:assert adopt(id)==amount
 expect(page.locator('#round-notice')).to_contain_text('4項目は変更していません')
 assert mode()=='manual';assert adopt('labor')=='87000'
 round_();page.locator('#undo-round').click();assert snapshot()==before;check_breakdown()
 # Undo also restores source ownership: a previously rounded field remains re-roundable.
 reset();base();round_();fill('workers','2.345');before=snapshot();round_()
 assert adopt('labor')=='136000';page.locator('#undo-round').click();assert snapshot()==before
 round_();assert adopt('labor')=='136000'
 # Re-entering an unchanged rounded amount explicitly makes it manual; clearing releases it.
 fill('adopt-labor','136000');fill('workers','3');round_();assert adopt('labor')=='136000'
 fill('adopt-labor','');round_();assert adopt('labor')=='174000'
 fill('adopt-labor','0');round_();assert adopt('labor')=='0'
 # Memo/settings edits do not turn previously bulk-rounded values into manual values.
 page.locator('#detail-shipping').evaluate('(el)=>el.open=true');fill('memo-shipping','配送条件')
 fill('shipping','1750');round_();assert adopt('shipping')=='13700'
 # Fixed manual overhead keeps its previous return-to-auto mode (not silently changed).
 reset();base();fill('adopt-overhead','0');round_();assert mode()=='manual' and adopt('overhead')=='0'
 page.locator('#overhead-auto').click();assert mode()=='auto';check_breakdown()
 round_();assert mode()=='rounded'
 fill('adopt-overhead','50000');round_();assert mode()=='manual' and adopt('overhead')=='50000'
 page.locator('#overhead-auto').click();assert mode()=='rounded';check_breakdown()
 # Additional labor, zero adoption, name/order changes and removal keep the right source.
 page.locator('#add-custom-item').click();fill('custom-name-custom_1','業者2');fill('custom-amount-custom_1','58055.55')
 page.locator('#edit-items').click();page.locator('#tag-custom_1').select_option('labor')
 round_();assert adopt('custom_1')=='58000'
 fill('custom-amount-custom_1','68155.55');round_();assert adopt('custom_1')=='68100'
 fill('adopt-custom_1','0');round_();assert adopt('custom_1')=='0';check_breakdown()
 fill('custom-name-custom_1','業者2・追加作業');page.locator('[data-move-item="custom_1"][data-direction="-1"]').click()
 round_();assert adopt('custom_1')=='0';check_breakdown()
 page.locator('[data-remove-custom="custom_1"]').click();check_breakdown()
 # Fixed restored adoptions, including old rounded values, must stay protected.
 reset();base();round_();fill('adopt-removal','0');fill('adopt-overhead','55774')
 text=copy();before=snapshot();restore(text)
 assert copy()==text # no source metadata or extra characters in the compact format
 fill('parts','900000');fill('workers','4');round_()
 assert adopt('materials')=='42500' and adopt('labor')=='87000' and adopt('removal')=='0'
 assert adopt('overhead')=='55774' and mode()=='manual'
 # Inherited proportional links remain linked and still follow changes after rounding.
 restore(text,True);round_();expect(page.locator('#link-help-materials')).to_be_visible()
 linked=page.locator('#booked-materials').inner_text();fill('parts','1700000')
 assert page.locator('#booked-materials').inner_text()!=linked
 assert mode()=='linked';round_();assert mode()=='linked';check_breakdown()
 # Expanded/collapsed details do not alter output, input or undo state.
 text=copy();page.locator('#adjustment-breakdown summary').click();assert copy()==text
 before=snapshot();page.locator('#adjustment-breakdown summary').click();assert snapshot()==before
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  page.locator('#adjustment-breakdown').evaluate('el=>el.open=true')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  expect(page.locator('#correction-total')).to_be_visible();check_breakdown()
  if width<=760:assert page.locator('#adjustment-breakdown summary').bounding_box()['height']>=44
  if width in [1440,390]:page.locator('.result-panel').screenshot(path=str(ART/f'correction-details-{width}.png'))
 # Invalid input does not present intermediate correction figures as confirmed values.
 fill('parts','-1');assert page.locator('#correction-total').inner_text()=='—'
 fill('parts','1700000');check_breakdown()
 # Reset/reload clear ownership, undo and expanded details; nothing is persisted/sent.
 reset();assert not page.locator('#adjustment-breakdown').evaluate('el=>el.open')
 base();round_();fill('workers','4');round_();assert adopt('labor')=='232000'
 page.reload();assert adopt('labor')=='' and page.locator('#undo-round').is_hidden()
 assert not page.locator('#adjustment-breakdown').evaluate('el=>el.open')
 assert page.evaluate('localStorage.length+sessionStorage.length')==0 and ctx.cookies()==[]
 assert all(url.startswith('http://127.0.0.1:8000') or url.startswith('blob:') for url in requests)
 assert not errors,errors
 b.close();print('PASS: 手動/0/同額/復元の保護・再調整/編集/解除/取消/タグ/削除・諸経費全モード/引継率維持・補正内訳/0/再計算・簡易形式不変・PC/スマホ/通信/再読込')
