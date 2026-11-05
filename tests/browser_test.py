"""Integration checks; requires Python Playwright and a local HTTP server on port 8000."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

def fill(locator,value):
 locator.focus()
 locator.fill(value)
BASE='http://127.0.0.1:8000'
ART=Path('/tmp/estimate-verification'); ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=context.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.goto(BASE);page.wait_for_load_state('networkidle')
 assert page.locator('#cost-rows .note-input:visible').count()==0
 assert page.locator('#cost-rows .adjustment-summary:visible').count()==0
 assert page.locator('#cost-rows details[open]').count()==0
 assert page.locator('.table-head>span').count()==4
 assert all(not t.strip() for t in page.locator('[data-copy]').all_text_contents())
 for k,v in [('parts','850000'),('workers','6'),('shipping','20000')]:fill(page.locator('#'+k),v)
 expected_order=['部品代','交換作業費','消耗資材費','撤去品引取費','部品送料・運搬交通費','養生・安全対策費','諸経費']
 assert page.locator('#cost-rows .cost-name').all_text_contents()==expected_order
 assert page.locator('#grand-total').inner_text()=='1,516,476円'
 fill(page.locator('#adopt-materials'),'70000');fill(page.locator('#memo-materials'),'特殊部品のため・重量物')
 assert page.locator('#cost-rows .adjustment-summary:visible').count()==1
 assert page.locator('#detail-materials').get_attribute('open') is not None
 assert page.locator('#detail-removal').get_attribute('open') is None
 assert page.locator('#grand-total').inner_text()=='1,546,726円'
 assert page.locator('#total-diff').inner_text()=='＋30,250円'
 assert page.locator('#ratio-materials').inner_text()=='標準比 ＋64.7％'
 assert page.locator('#parts-ratio-materials').inner_text()=='部品代比 8.24％'
 page.locator('#parts').focus();page.locator('#workers').focus();assert page.locator('#parts').input_value()=='850,000'
 page.screenshot(path=str(ART/'desktop.png'),full_page=True)
 start=len(requests)
 page.locator('#preview').click();text=page.locator('#summary-text').inner_text()
 detail=text.split('【見積内訳】')[1].split('【交換作業費の売価・原価】')[0]
 assert [line.split('：')[0] for line in detail.strip().splitlines()[:7]]==expected_order
 for expected in ['1,546,726円','1,516,476円','特殊部品のため・重量物','出力日時：','日本時間','16.315％','＋30,250円']:assert expected in text,expected
 page.locator('#copy-text').click();page.wait_for_function("() => document.querySelector('#notice').textContent === '結果をコピーしました'")
 copied=page.evaluate('navigator.clipboard.readText()');assert '特殊部品のため・重量物' in copied
 with page.expect_download() as info: page.locator('#save-image').click()
 download=info.value;assert download.suggested_filename.startswith('estimate_');download.save_as(ART/'result.png')
 assert (ART/'result.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
 assert all(u.startswith('blob:') for u in requests[start:]),requests[start:]
 # No browser storage or cookies.
 assert page.evaluate('localStorage.length + sessionStorage.length')==0
 assert context.cookies()==[]
 # Negative, overprecision, text and oversized amounts disable exports without NaN.
 for value in ['-1','abc','1000000000001','1.234']:
  fill(page.locator('#parts'),value);assert page.locator('#parts').get_attribute('aria-invalid')=='true';assert page.locator('#save-image').is_disabled();assert 'NaN' not in page.locator('body').inner_text()
 fill(page.locator('#parts'),'850000');fill(page.locator('#workers'),'1.2345');assert page.locator('#workers').get_attribute('aria-invalid')=='true';fill(page.locator('#workers'),'6')
 fill(page.locator('#adopt-labor'),'100000');assert page.locator('#welfare').inner_text()=='16,315円';fill(page.locator('#adopt-labor'),'')
 fill(page.locator('#adopt-materials'),'0');assert page.locator('#booked-materials').inner_text()=='0円',page.locator('#booked-materials').inner_text();fill(page.locator('#adopt-materials'),'70000')
 fill(page.locator('#memo-materials'),'<img src=x onerror=alert(1)>');assert page.locator('#changes img').count()==0;fill(page.locator('#memo-materials'),'特殊部品のため・重量物')
 # Fractional personnel drives both sales and shipping; reference cost is not an estimate charge.
 assert page.locator('#basic-fields input').count()==3
 assert page.locator('#labor').count()==0
 fill(page.locator('#adopt-materials'),'')
 fill(page.locator('#workers'),'1.5')
 assert page.locator('#standard-labor').inner_text()=='87,000円'
 assert page.locator('#standard-shipping').inner_text()=='26,000円'
 assert page.locator('#grand-total').inner_text()=='1,166,994円'
 assert page.locator('#basis-labor').inner_text()=='売価：1.5人 × 58,000円 ＝ 87,000円'
 assert page.locator('#labor-cost').inner_text()=='原価（参考）：1.5人 × 36,000円 ＝ 54,000円'
 assert page.locator('#welfare-cost').inner_text()=='原価（参考）：14,194円 × 0.66 ＝ 9,368円'
 page.locator('#preview').click()
 text=page.locator('#summary-text').inner_text()
 for expected in ['作業人員：1.5人','原価（参考）：1.5人 × 36,000円 ＝ 54,000円','見積計上額：87,000円','原価（参考）：14,194円 × 0.66 ＝ 9,368円']:
  assert expected in text
 assert '交換作業人工' not in text and '作業員人数' not in text
 start=len(requests)
 page.locator('#copy-text').click()
 page.wait_for_function("() => document.querySelector('#notice').textContent === '結果をコピーしました'")
 assert '原価（参考）：1.5人 × 36,000円 ＝ 54,000円' in page.evaluate('navigator.clipboard.readText()')
 with page.expect_download() as info:page.locator('#save-image').click()
 info.value.save_as(ART/'fractional-result.png')
 assert all(u.startswith('blob:') for u in requests[start:])
 fill(page.locator('#workers'),'6');fill(page.locator('#adopt-materials'),'70000')
 # Mobile layout across narrow widths, including output previews.
 for width in [320,375,390,768]:
  page.set_viewport_size({'width':width,'height':844});page.locator('#preview').click()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
  if width==390:page.screenshot(path=str(ART/'mobile.png'),full_page=True)
 page.locator('details.settings').evaluate('(el)=>el.open=true');fill(page.locator('#overheadRate'),'12');assert page.locator('#booked-overhead').inner_text()=='162,540円'
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click()
 assert page.locator('#parts').input_value()=='0';assert page.locator('#overheadRate').input_value()=='10';assert page.locator('#memo-materials').input_value()=='';assert page.locator('#adopt-materials').input_value()=='';assert page.locator('#grand-total').inner_text()=='0円'
 fill(page.locator('#parts'),'999');page.reload();assert page.locator('#parts').input_value()=='0';assert page.locator('#grand-total').inner_text()=='0円'
 assert page.locator('#workers').input_value()=='0'
 assert '0円' in page.locator('#labor-cost').inner_text()
 # Details can be opened without adoption; collapsing must preserve memo and exports.
 page.locator('#detail-removal summary').click()
 fill(page.locator('#memo-removal'),'条件確認のためのメモ')
 page.locator('#detail-removal summary').click()
 assert not page.locator('#memo-removal').is_visible()
 page.locator('#preview').click()
 assert '条件確認のためのメモ' in page.locator('#summary-text').inner_text()
 fill(page.locator('#adopt-materials'),'100')
 assert page.locator('#memo-materials').is_visible()
 page.locator('#detail-materials summary').click()
 fill(page.locator('#shipping'),'10')
 assert not page.locator('#memo-materials').is_visible()
 fill(page.locator('#adopt-materials'),'')
 assert not page.locator('#adjustment-materials').is_visible()
 page.locator('#reset').click()
 assert page.locator('#cost-rows details[open]').count()==0
 # Batch rounding button sits directly below settings and rounds all adopted values.
 assert page.locator('details.settings + .rounding-toolbar #round-standard').count()==1
 for before,after in [('1552110','1,552,000'),('155211','155,200'),('15521','15,500'),('1550','1,500')]:
  fill(page.locator('#parts'),before);page.locator('#round-standard').click()
  assert page.locator('#adopt-parts').input_value()==after
 fill(page.locator('#parts'),'155211');fill(page.locator('#workers'),'1.501');fill(page.locator('#shipping'),'1550')
 fill(page.locator('#adopt-parts'),'7');fill(page.locator('#memo-parts'),'端数調整のメモ')
 page.locator('#round-standard').click()
 assert page.locator('#adopt-parts').input_value()=='155,200'
 assert page.locator('#adopt-overhead').input_value()=='26,500'
 assert page.locator('#subtotal').inner_text()=='265,100円'
 assert page.locator('#grand-total').inner_text()=='305,794円'
 assert page.locator('#memo-parts').input_value()=='端数調整のメモ'
 assert page.locator('#welfare-cost').inner_text()=='原価（参考）：14,194円 × 0.66 ＝ 9,368円'
 assert '一括入力しました' in page.locator('#round-notice').inner_text()
 first_values=page.locator('[id^="adopt-"]').evaluate_all('(els)=>els.map(el=>el.value)')
 page.locator('#round-standard').click()
 assert page.locator('[id^="adopt-"]').evaluate_all('(els)=>els.map(el=>el.value)')==first_values
 page.locator('#preview').click()
 for expected in ['部品代：155,200円','端数調整のメモ','原価（参考）：14,194円 × 0.66 ＝ 9,368円']:
  assert expected in page.locator('#summary-text').inner_text()
 with page.expect_download() as info:page.locator('#save-image').click()
 info.value.save_as(ART/'rounded-result.png')
 fill(page.locator('#parts'),'-1');assert page.locator('#round-standard').is_disabled()
 fill(page.locator('#parts'),'155211')
 page.locator('details.settings').evaluate('(el)=>el.open=true')
 fill(page.locator('#laborPrice'),'1000000000000');fill(page.locator('#workers'),'1000000')
 page.locator('#round-standard').click()
 assert '上限' in page.locator('#round-notice').inner_text()
 assert page.locator('[id^="adopt-"]').evaluate_all('(els)=>els.map(el=>el.value)')==first_values
 page.locator('#reset').click()
 assert page.locator('#adopt-overhead').input_value()==''
 assert page.locator('#round-notice').inner_text()==''
 # Clipboard fallback when the API is unavailable.
 page.evaluate("Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true})")
 page.locator('#copy-text').click();assert page.locator('#copy-fallback').is_visible();assert '出力日時' in page.locator('#copy-area').input_value()
 assert errors==[],errors
 assert all(u.startswith(BASE) or u.startswith('blob:') for u in requests),requests
 print(json.dumps({'result':'PASS','checks':['共通人員6人・1.5人と売価/原価','採用0円・空欄','人工費変更','設定変更','リセット','再読込','320/375/390/768/1440幅','PNGダウンロード','Clipboard実コピー・代替','メモ・日時反映','出力時通信0件','Storage/Cookieなし','コンソールエラーなし'],'artifacts':str(ART)},ensure_ascii=False))
 browser.close()
