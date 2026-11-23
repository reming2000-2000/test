"""Display-only category marks, help and labor-cost caution; formats stay compatible."""
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
 def copy():
  page.locator('#copy-simple').click();expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
  return page.evaluate('navigator.clipboard.readText()')
 def restore(text,proportional):
  page.locator('#import-panel').evaluate('(el)=>el.open=true');fill('import-text',text)
  page.locator('#import-proportional').set_checked(proportional);page.locator('#check-import').click()
  expect(page.locator('#import-preview')).to_be_visible();page.locator('#apply-import').click()
 def warning(visible):
  expect(page.locator('#labor-cost-warning')).to_be_visible() if visible else expect(page.locator('#labor-cost-warning')).to_be_hidden()
 # All built-in categories have unique, decorative marks next to their names.
 for id in ['parts','labor','materials','shipping','removal','protection','overhead']:
  icon=page.locator('#row-'+id+' .cost-title .expense-icon')
  expect(icon).to_have_attribute('data-icon',id);expect(icon).to_have_attribute('aria-hidden','true')
  assert icon.locator('svg').count()==1 and icon.locator('button,a').count()==0
  expect(page.locator('#row-'+id+' .cost-name')).not_to_be_empty()
 expect(page.locator('#welfare-heading .expense-icon')).to_have_attribute('data-icon','welfare')
 assert page.locator('button[data-copy] svg').count()==21
 warning(False)
 # Help is collapsed and accessible with the keyboard; no calculations or undo are changed.
 expect(page.locator('#amount-help dd').first).not_to_be_visible()
 page.locator('#amount-help summary').focus();page.keyboard.press('Enter')
 expect(page.locator('#amount-help')).to_contain_text('実際に見積総額へ加算される金額')
 page.keyboard.press('Space');assert not page.locator('#amount-help').evaluate('el=>el.open')
 page.locator('details.settings').evaluate('(el)=>el.open=true')
 expect(page.locator('label[for="workerShipping"]')).to_have_text('作業員交通費単価')
 assert not page.locator('#cost-help').evaluate('el=>el.open')
 page.locator('#cost-help summary').click();expect(page.locator('#cost-help')).to_contain_text('36,000円')
 # Exact comparison uses existing truncated cost, for adoption, headcount and default-price edits.
 fill('parts','850000');fill('workers','1.5');fill('shipping','20000')
 for value,show in [('54000',False),('54000.01',False),('53999.99',True),('0',True),('',False)]:
  fill('adopt-labor',value);warning(show)
 fill('adopt-labor','50000');warning(True)
 expect(page.locator('#copy-amount-labor')).to_be_enabled();expect(page.locator('#save-image')).to_be_enabled()
 page.locator('#copy-cost-labor').click();assert page.evaluate('navigator.clipboard.readText()')=='54,000'
 page.locator('#copy-amount-labor').click();assert page.evaluate('navigator.clipboard.readText()')=='50,000'
 fill('workers','1');warning(False);fill('workers','1.5');warning(True)
 fill('adopt-labor','-1');warning(False);expect(page.locator('#validation-banner')).to_be_visible()
 fill('adopt-labor','');fill('laborPrice','35000');warning(True)
 fill('laborPrice','58000');warning(False)
 fill('workers','1.501');fill('adopt-labor','54036');warning(False)
 fill('adopt-labor','54035.99');warning(True)
 fill('workers','0');fill('adopt-labor','0');warning(False)
 # First release: protection, undo and correction details still work with help/caution visible.
 fill('workers','1.5');fill('adopt-labor','50000')
 page.locator('#round-standard').click();assert page.locator('#adopt-labor').input_value()=='50,000';warning(True)
 before=page.locator('#grand-total').inner_text()
 page.locator('#amount-help summary').click();page.locator('#cost-help summary').click()
 assert page.locator('#grand-total').inner_text()==before
 expect(page.locator('#undo-round')).to_be_visible();page.locator('#undo-round').click();warning(True)
 page.locator('#adjustment-breakdown summary').click();expect(page.locator('#correction-total')).to_be_visible()
 assert page.locator('#correction-total').inner_text()==page.locator('#total-diff').inner_text()
 # Generic extras acquire matching marks when tagged; ordering/amounts and custom names stay intact.
 page.locator('#add-custom-item').click();fill('custom-name-custom_1','追加費目・試運転調整費（業者別）');fill('custom-amount-custom_1','58000')
 expect(page.locator('#row-custom_1 .expense-icon')).to_have_attribute('data-icon','other')
 page.locator('#edit-items').click();page.locator('#tag-custom_1').select_option('labor')
 expect(page.locator('#row-custom_1 .expense-icon')).to_have_attribute('data-icon','labor')
 total=page.locator('#grand-total').inner_text()
 page.locator('[data-move-item="custom_1"][data-direction="-1"]').click()
 assert page.locator('#grand-total').inner_text()==total;warning(True)
 # Expanded help, caution, copy controls and category icons fit at all supported widths.
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1100})
  page.locator('#amount-help').evaluate('el=>el.open=true')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert page.locator('#row-labor .expense-icon').bounding_box()['width']==24
  expect(page.locator('#copy-cost-labor')).to_be_visible();warning(True)
  if width in [1440,390]:
   for id in ['row-labor','row-shipping','row-custom_1','amount-help']:
    page.locator('#'+id).screenshot(path=str(ART/f'clarity-{id}-{width}.png'))
 # Legacy identification names stay unchanged even though the visible field name has improved.
 legacy=page.evaluate("""() => {const p=Object.fromEntries(Object.entries({...Estimate.defaults,parts:'850000',workers:'1.5',shipping:'20000'}).map(([id,n])=>[id,Estimate.decimal(n)]));const adopted={materials:Estimate.decimal('70000')};const s={p,memos:{},extraItems:[],...Estimate.calculate(p,adopted,'auto')};return EstimatePortable.encodeV1(s,'旧メモ','auto',false);} """)
 assert '作業員送料単価：4,000円／人' in legacy and '交通費単価' not in legacy
 restore(legacy,False)
 assert page.locator('#booked-materials').inner_text()=='70,000円'
 fill('parts','1700000');assert page.locator('#booked-materials').inner_text()=='70,000円'
 restore(legacy,True);fill('parts','1700000');assert page.locator('#booked-materials').inner_text()=='140,000円'
 text=copy();assert '交通費単価' not in text and '参考原価を下回っています' not in text
 restore(text,False);assert copy()==text # already-linked copies retain their state when unchecked
 expect(page.locator('#link-help-materials')).to_be_visible()
 page.locator('#import-panel').evaluate('el=>el.open=true')
 page.locator('#import-help summary').click();expect(page.locator('#import-help')).to_contain_text('チェックなしでも連動状態を復元')
 for width in [1440,390,320]:
  page.set_viewport_size({'width':width,'height':1100})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [1440,390]:page.locator('#import-panel').screenshot(path=str(ART/f'clarity-import-{width}.png'))
 # Caution never leaks into text or changes exported contents or downloads.
 fill('adopt-labor','50000');warning(True)
 page.locator('#copy-text').click();expect(page.locator('#notice')).to_have_text('結果をコピーしました')
 detailed=page.evaluate('navigator.clipboard.readText()')
 assert '参考原価を下回っています' not in detailed and '作業員交通費単価' in detailed
 with page.expect_download() as download:page.locator('#save-image').click()
 download.value.save_as(ART/'clarity-result.png');assert (ART/'clarity-result.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
 page.locator('#reset').click();warning(False);assert page.locator('#import-proportional').is_checked()
 page.reload();warning(False);assert page.locator('#import-proportional').is_checked()
 assert page.locator('#cost-rows .expense-icon').count()==7
 assert page.evaluate('localStorage.length+sessionStorage.length')==0 and ctx.cookies()==[]
 assert all(url.startswith('http://127.0.0.1:8000') or url.startswith('blob:') for url in requests)
 assert not errors,errors
 b.close();print('PASS: 費目アイコン/追加タグ/順序・説明開閉/キーボード・交通費名称/旧形式互換・原価割れの境界/0/小数/自動更新/出力継続・第一弾維持・PC/スマホ・通信なし')
