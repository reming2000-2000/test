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
 for k,v in [('parts','850000'),('labor','6'),('workers','3'),('shipping','20000')]:fill(page.locator('#'+k),v)
 assert page.locator('#grand-total').inner_text()=='1,503,276円'
 fill(page.locator('#adopt-materials'),'70000');fill(page.locator('#memo-materials'),'特殊部品のため・重量物')
 assert page.locator('#grand-total').inner_text()=='1,533,526円'
 assert page.locator('#total-diff').inner_text()=='＋30,250円'
 assert page.locator('#ratio-materials').inner_text()=='標準比 ＋64.7％'
 assert page.locator('#parts-ratio-materials').inner_text()=='部品代比 8.24％'
 page.locator('#parts').focus();page.locator('#labor').focus();assert page.locator('#parts').input_value()=='850,000'
 page.screenshot(path=str(ART/'desktop.png'),full_page=True)
 start=len(requests)
 page.locator('#preview').click();text=page.locator('#summary-text').inner_text()
 for expected in ['1,533,526円','1,503,276円','特殊部品のため・重量物','出力日時：','日本時間','16.315％','＋30,250円']:assert expected in text,expected
 page.locator('#copy-text').click();page.wait_for_function("document.querySelector('#notice').textContent === '結果をコピーしました'")
 copied=page.evaluate('navigator.clipboard.readText()');assert '特殊部品のため・重量物' in copied
 with page.expect_download() as info: page.locator('#save-image').click()
 download=info.value;assert download.suggested_filename.startswith('estimate_');download.save_as(ART/'result.png')
 assert (ART/'result.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
 assert all(u.startswith('blob:') for u in requests[start:]),requests[start:]
 # No browser storage or cookies.
 assert page.evaluate('localStorage.length + sessionStorage.length')==0
 assert context.cookies()==[]
 # Negative, fractional workers, text and oversized amounts disable exports without NaN.
 for value in ['-1','abc','1000000000001','1.234']:
  fill(page.locator('#parts'),value);assert page.locator('#parts').get_attribute('aria-invalid')=='true';assert page.locator('#save-image').is_disabled();assert 'NaN' not in page.locator('body').inner_text()
 fill(page.locator('#parts'),'850000');fill(page.locator('#workers'),'2.5');assert page.locator('#workers').get_attribute('aria-invalid')=='true';fill(page.locator('#workers'),'3')
 fill(page.locator('#adopt-labor'),'100000');assert page.locator('#welfare').inner_text()=='16,315円';fill(page.locator('#adopt-labor'),'')
 fill(page.locator('#adopt-materials'),'0');assert page.locator('#booked-materials').inner_text()=='0円',page.locator('#booked-materials').inner_text();fill(page.locator('#adopt-materials'),'70000')
 fill(page.locator('#memo-materials'),'<img src=x onerror=alert(1)>');assert page.locator('#changes img').count()==0;fill(page.locator('#memo-materials'),'特殊部品のため・重量物')
 # Mobile layout across narrow widths, including output previews.
 for width in [320,375,390,768]:
  page.set_viewport_size({'width':width,'height':844});page.locator('#preview').click()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
  if width==390:page.screenshot(path=str(ART/'mobile.png'),full_page=True)
 page.locator('details.settings').evaluate('(el)=>el.open=true');fill(page.locator('#overheadRate'),'12');assert page.locator('#overhead').inner_text()=='161,100円'
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click()
 assert page.locator('#parts').input_value()=='0';assert page.locator('#overheadRate').input_value()=='10';assert page.locator('#memo-materials').input_value()=='';assert page.locator('#adopt-materials').input_value()=='';assert page.locator('#grand-total').inner_text()=='0円'
 fill(page.locator('#parts'),'999');page.reload();assert page.locator('#parts').input_value()=='0';assert page.locator('#grand-total').inner_text()=='0円'
 # Clipboard fallback when the API is unavailable.
 page.evaluate("Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true})")
 page.locator('#copy-text').click();assert page.locator('#copy-fallback').is_visible();assert '出力日時' in page.locator('#copy-area').input_value()
 assert errors==[],errors
 assert all(u.startswith(BASE) or u.startswith('blob:') for u in requests),requests
 print(json.dumps({'result':'PASS','checks':['指定2ケース','採用0円・空欄','人工費変更','設定変更','リセット','再読込','320/375/390/768/1440幅','PNGダウンロード','Clipboard実コピー・代替','メモ・日時反映','出力時通信0件','Storage/Cookieなし','コンソールエラーなし'],'artifacts':str(ART)},ensure_ascii=False))
 browser.close()
