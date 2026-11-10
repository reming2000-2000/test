"""Independent and combined checks for the seven workflow improvements."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=ctx.new_page();page.set_default_timeout(7000);errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.on('dialog',lambda d:d.accept())
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,value):page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 def reset():page.locator('#reset').click()
 def settings():page.locator('details.settings').evaluate('(el)=>el.open=true')
 def base():
  fill('parts','850000');fill('workers','1.5');fill('shipping','20000')
 def tick(id,kind,yes=True):
  button=page.locator('#copy-'+kind+'-'+id)
  assert ('is-copied' in (button.get_attribute('class') or ''))==yes,(id,kind,yes)
  assert ('コピー済み' in button.get_attribute('aria-label'))==yes
 def copy(id,kind):
  page.locator('#copy-'+kind+'-'+id).click()
  expect(page.locator('#copy-'+kind+'-'+id)).to_have_class('row-copy-button is-copied')
 def round_():page.locator('#round-standard').click();expect(page.locator('#undo-round')).to_be_visible()
 def snapshot():
  return page.evaluate("""() => ({adopted:[...document.querySelectorAll('input[id^="adopt-"]')].map(e=>[e.id,e.value.replaceAll(',','')]),total:document.querySelector('#grand-total').textContent,subtotal:document.querySelector('#subtotal').textContent,overhead:document.querySelector('#booked-overhead').textContent,welfare:document.querySelector('#welfare').textContent,cost:document.querySelector('#welfare-cost').textContent,mode:document.querySelector('#row-overhead').dataset.overheadMode,warning:!document.querySelector('#overhead-warning').hidden,notes:[...document.querySelectorAll('.note-input')].map(e=>e.value)})""")
 def simple_copy():
  page.locator('#copy-simple').click();expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
  return page.evaluate('navigator.clipboard.readText()')
 def restore(text,proportional=True):
  page.locator('#import-panel').evaluate('(el)=>el.open=true');fill('import-text',text)
  page.locator('#import-proportional').set_checked(proportional);page.locator('#check-import').click()
  expect(page.locator('#import-preview')).to_be_visible();page.locator('#apply-import').click()
 assert page.locator('#undo-round').is_hidden()
 assert page.locator('#setting-changes').is_hidden()
 # 1: all explicit adopted amounts, including equal/zero values, show a fixed badge.
 base();fill('adopt-materials','70000')
 expect(page.locator('#fixed-adoption-materials')).to_be_visible()
 fill('parts','900000');assert page.locator('#booked-materials').inner_text()=='70,000円'
 fill('adopt-materials','-1');assert page.locator('#fixed-adoption-materials').is_hidden()
 fill('adopt-materials','');assert page.locator('#fixed-adoption-materials').is_hidden()
 fill('adopt-parts','0');expect(page.locator('#fixed-adoption-parts')).to_be_visible()
 fill('adopt-labor','87000');expect(page.locator('#fixed-adoption-labor')).to_be_visible()
 assert page.locator('#fixed-adoption-overhead').is_hidden()
 fill('adopt-overhead','0');expect(page.locator('#fixed-adoption-overhead')).to_be_visible()
 page.locator('#overhead-auto').click();assert page.locator('#fixed-adoption-overhead').is_hidden()
 # 2/4: independent successful markers; unchanged values retain them, changed payloads clear only affected markers.
 reset();base();fill('adopt-materials','70000')
 for button in page.locator('[data-copy]').all():
  button.click();expect(button).to_have_class('row-copy-button is-copied')
 assert page.locator('.is-copied').count()==21
 fill('memo-materials','メモだけ変更');assert page.locator('.is-copied').count()==21
 fill('adopt-materials','70000.01');tick('materials','amount',False);tick('materials','basis',False);tick('materials','cost')
 tick('labor','amount');tick('labor','cost');tick('welfare','amount')
 copy('materials','amount');copy('materials','basis');fill('parts','900000')
 tick('materials','amount');tick('materials','cost');tick('materials','basis',False)
 amount_color=page.locator('#copy-amount-materials').evaluate('el=>getComputedStyle(el).color')
 cost_color=page.locator('#copy-cost-materials').evaluate('el=>getComputedStyle(el).color')
 assert amount_color!=cost_color
 fill('workers','2');tick('labor','cost',False);tick('labor','amount',False)
 fill('parts','-1');assert page.locator('.is-copied').count()==0
 fill('parts','900000');assert page.locator('.is-copied').count()==0
 # Refusal creates selectable text, never a false successful mark.
 page.evaluate("() => {window.realWrite=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw Error('denied')};}")
 page.locator('#copy-amount-materials').click();expect(page.locator('#row-copy-area-materials')).to_be_visible();tick('materials','amount',False)
 page.evaluate('() => {navigator.clipboard.writeText=window.realWrite;}')
 # Copy promises resolving after edits, removal or reset must not mark stale/current data incorrectly.
 page.evaluate("() => {navigator.clipboard.writeText=()=>new Promise(resolve=>window.finishCopy=resolve);}")
 page.locator('#copy-amount-materials').click();fill('adopt-materials','80000');page.evaluate('() => window.finishCopy()')
 expect(page.locator('#copy-amount-materials')).to_be_enabled();tick('materials','amount',False)
 assert page.locator('#row-copy-feedback-materials').is_hidden()
 reset();page.locator('#copy-amount-parts').click();reset();page.evaluate('() => window.finishCopy()')
 expect(page.locator('#copy-amount-parts')).to_be_enabled();tick('parts','amount',False)
 assert page.locator('#row-copy-feedback-parts').is_hidden()
 page.locator('#add-custom-item').click();page.locator('#copy-amount-custom_1').click()
 page.locator('[data-remove-custom="custom_1"]').click();page.evaluate('() => window.finishCopy()')
 page.evaluate('() => {navigator.clipboard.writeText=window.realWrite;}')
 # Compact-copy completion also distinguishes an older result from the current one.
 page.evaluate("() => {navigator.clipboard.writeText=()=>new Promise(resolve=>window.finishCopy=resolve);}")
 page.locator('#copy-simple').click();fill('parts','400000');page.evaluate('() => window.finishCopy()')
 expect(page.locator('#notice')).to_contain_text('入力変更前の簡易版')
 page.locator('#copy-simple').click();reset();page.evaluate('() => window.finishCopy()')
 expect(page.locator('#copy-simple')).to_be_enabled();assert page.locator('#notice').inner_text()==''
 page.evaluate('() => {navigator.clipboard.writeText=window.realWrite;}')
 # 3: exact undo for auto/manual/rounded modes, including zero, fractional workers and an additional item.
 for mode in ['auto','manual','rounded']:
  reset();base();fill('adopt-parts','0');fill('adopt-materials','70000');fill('memo-materials','端数の前のメモ')
  page.locator('#add-custom-item').click();fill('custom-name-custom_1','試運転');fill('custom-amount-custom_1','12345.67');fill('adopt-custom_1','0')
  if mode=='rounded':round_();fill('adopt-materials','70000')
  if mode=='manual':fill('adopt-overhead','55774');fill('shipping','21000')
  before=snapshot();round_();round_() # repeated rounding keeps the useful pre-round snapshot
  copy('materials','amount');page.locator('#preview').click();fill('discount-rate','5')
  expect(page.locator('#undo-round')).to_be_visible();page.locator('#undo-round').click()
  assert snapshot()==before,(mode,before,snapshot())
  assert page.locator('#discount-rate').input_value()=='5'
  assert page.locator('#undo-round').is_hidden()
  if mode=='manual':assert page.locator('#overhead-warning').is_visible()
 # Undo restores rational links, not just the visible adopted numbers.
 reset();base();fill('adopt-materials','70000');fill('adopt-overhead','100000');linked=simple_copy();restore(linked)
 before=snapshot();round_();assert page.locator('#link-help-materials').is_hidden()
 page.locator('#undo-round').click();assert snapshot()==before
 expect(page.locator('#link-help-materials')).to_be_visible();expect(page.locator('#link-help-overhead')).to_be_visible()
 assert page.locator('#fixed-adoption-materials').is_hidden()
 fill('parts','1700000');assert page.locator('#booked-materials').inner_text()=='140,000円'
 # Any later estimate edit or mode/row change invalidates the undo, without reverting the new edit.
 for action in ['memo','amount','setting','add','remove','overhead','rates','import','reset']:
  reset();base();page.locator('#add-custom-item').click();fill('custom-amount-custom_1','5000');settings();fill('materialsRate','6');round_()
  if action=='memo':page.locator('#detail-materials').evaluate('(el)=>el.open=true');fill('memo-materials','あとからのメモ')
  elif action=='amount':fill('adopt-materials','99999')
  elif action=='setting':fill('protectionRate','3')
  elif action=='add':page.locator('#add-custom-item').click()
  elif action=='remove':page.locator('[data-remove-custom="custom_1"]').click()
  elif action=='overhead':fill('adopt-overhead','12345');page.locator('#overhead-auto').click()
  elif action=='rates':page.locator('#reset-parts-rates').click()
  elif action=='import':restore(linked)
  else:reset()
  assert page.locator('#undo-round').is_hidden(),action
  after=snapshot();page.locator('#undo-round').evaluate('el=>el.click()');assert snapshot()==after,action
 # 6: current tier is the baseline; automatic rates are not shown as manual changes.
 reset();base();assert page.locator('#setting-changes').is_hidden();settings()
 fill('materialsRate','9');fill('overheadRate','12')
 expect(page.locator('#setting-change-list')).to_contain_text('消耗資材費率：規定 5％ → 手動 9％')
 expect(page.locator('#setting-change-list')).to_contain_text('諸経費率：初期値 10％ → 手動 12％')
 page.locator('details.settings').evaluate('(el)=>el.open=false')
 expect(page.locator('#setting-changes')).to_be_visible();expect(page.locator('#changes')).to_contain_text('採用額の変更はありません')
 page.locator('#preview').click();expect(page.locator('#summary-text')).to_contain_text('【標準設定の変更】')
 saved=simple_copy();restore(saved,False)
 expect(page.locator('#setting-change-list')).to_contain_text('復元 9％')
 fill('parts','1500000');expect(page.locator('#setting-change-list')).to_contain_text('規定 3％ → 復元 9％')
 settings();page.locator('#reset-parts-rates').click();fill('overheadRate','10');assert page.locator('#setting-changes').is_hidden()
 # 7: compact preview matches the clipboard without an automatic timestamp.
 reset();base();page.locator('#simple-preview').evaluate('(el)=>el.open=true')
 expect(page.locator('#simple-text')).to_contain_text('見積')
 assert '日本時間' not in page.locator('#simple-text').inner_text()
 assert len(page.locator('#simple-text').inner_text().splitlines())==5
 fill('adopt-materials','70000');fill('memo-materials','特殊条件 "確認"／追加')
 text=simple_copy();assert page.locator('#simple-text').inner_text()==text
 page.locator('#add-custom-item').click();fill('custom-name-custom_1','<img src=x onerror=alert(1)>');fill('custom-amount-custom_1','5000')
 expect(page.locator('#simple-text')).to_contain_text('<img src=x onerror=alert(1)>');assert page.locator('#simple-preview img').count()==0
 fill('parts','-1');expect(page.locator('#simple-text')).to_contain_text('入力内容を確認してください')
 assert page.locator('#copy-simple').is_disabled()
 fill('parts','850000');expect(page.locator('#simple-text')).to_contain_text('見積')
 with page.expect_download() as download:page.locator('#save-image').click()
 download.value.save_as(ART/'workflow-result.png')
 # 8: Enter stays within visible inputs, skips collapsed panels, validates numbers and respects IME/textarea.
 reset();page.locator('details.settings').evaluate('(el)=>el.open=false');fill('parts','850000')
 page.locator('#parts').press('Enter');expect(page.locator('#workers')).to_be_focused()
 assert page.locator('#parts').input_value()=='850,000'
 fill('workers','-1');page.locator('#workers').press('Enter');expect(page.locator('#workers')).to_be_focused()
 fill('workers','1.5');page.locator('#workers').dispatch_event('keydown',{'key':'Enter','isComposing':True});expect(page.locator('#workers')).to_be_focused()
 page.locator('#workers').press('Enter');expect(page.locator('#shipping')).to_be_focused()
 page.locator('#shipping').press('Shift+Enter');expect(page.locator('#workers')).to_be_focused()
 fill('shipping','20000');page.locator('#shipping').press('Enter');expect(page.locator('#adopt-parts')).to_be_focused()
 assert page.locator('#undo-round').is_hidden()
 settings();page.locator('#shipping').focus();page.locator('#shipping').press('Enter');expect(page.locator('#materialsRate')).to_be_focused()
 fill('adopt-materials','70000');page.locator('#adopt-materials').press('Enter');expect(page.locator('#memo-materials')).to_be_focused()
 fill('memo-materials','理由');page.locator('#memo-materials').press('Enter');expect(page.locator('#adopt-shipping')).to_be_focused()
 page.locator('#add-custom-item').click();page.locator('#custom-name-custom_1').press('Enter');expect(page.locator('#custom-amount-custom_1')).to_be_focused()
 page.locator('#custom-amount-custom_1').press('Enter');expect(page.locator('#adopt-custom_1')).to_be_focused()
 fill('adopt-overhead','');page.locator('#detail-overhead').evaluate('(el)=>el.open=false');page.locator('#adopt-overhead').focus()
 assert page.locator('#adopt-overhead').get_attribute('enterkeyhint')=='done'
 fill('adopt-overhead','0');assert page.locator('#adopt-overhead').get_attribute('enterkeyhint')=='next'
 page.locator('#adopt-overhead').press('Enter');expect(page.locator('#memo-overhead')).to_be_focused()
 assert page.locator('#memo-overhead').get_attribute('enterkeyhint')=='done'
 fill('discount-rate','5');page.locator('#discount-rate').press('Enter');expect(page.locator('#discount-amount')).to_be_focused()
 page.locator('#discount-amount').press('Enter');assert page.locator('#discount-amount').evaluate('el=>document.activeElement!==el')
 page.locator('#import-panel').evaluate('(el)=>el.open=true');fill('import-text','メモ');page.locator('#import-text').press('End');page.locator('#import-text').press('Enter')
 assert page.locator('#import-text').input_value()=='メモ\n'
 page.evaluate("() => document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))")
 # Combined layout on PC and mobile, with all new status indicators simultaneously visible.
 settings();fill('materialsRate','9');round_();copy('materials','amount');copy('materials','cost')
 page.locator('#simple-preview').evaluate('(el)=>el.open=true')
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [1440,390]:
   for id in ['row-materials','simple-preview','setting-changes']:
    page.locator('#'+id).screenshot(path=str(ART/f'workflow-{id}-{width}.png'))
 assert page.locator('.is-copied').count()>=2
 page.reload();assert page.locator('.is-copied').count()==0
 assert page.locator('#undo-round').is_hidden() and page.locator('#setting-changes').is_hidden()
 assert page.locator('#fixed-adoption-materials').is_hidden()
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 assert ctx.cookies()==[]
 assert all(url.startswith('blob:') or url.startswith('http://127.0.0.1:8000') for url in requests)
 assert not errors,errors
 b.close();print('PASS: 固定採用・コピー済み/非同期/拒否・売価原価色分け・取り消し全モード/連動復元/編集競合・設定差分・簡易プレビュー・Enter/IME・PC/スマホ・既存出力/通信/リセット')
