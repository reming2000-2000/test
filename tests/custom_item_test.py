"""Optional estimate rows, including overhead and saved summaries."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=context.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,value):
  page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 assert page.locator('#row-overhead').evaluate("el=>el.previousElementSibling.contains(document.querySelector('#add-custom-item'))")
 page.locator('details.settings').evaluate('(el)=>el.open=true')
 for id in ['materialsRate','removalRate','protectionRate']:fill(id,'0')
 fill('parts','500000');assert page.locator('#grand-total').inner_text()=='550,000円'
 before=len(requests)
 page.locator('#add-custom-item').click()
 fill('custom-name-custom_1','試運転調整費');fill('custom-amount-custom_1','50000')
 assert page.locator('#subtotal').inner_text()=='550,000円'
 assert page.locator('#booked-overhead').inner_text()=='55,000円'
 assert page.locator('#grand-total').inner_text()=='605,000円'
 page.locator('#add-custom-item').click();fill('custom-name-custom_2','試験費');fill('custom-amount-custom_2','12000')
 assert page.locator('#grand-total').inner_text()=='618,200円'
 assert page.locator('#cost-rows article').evaluate_all('(els)=>els.map(el=>el.id)')[-3:]==['row-custom_1','row-custom_2','row-overhead']
 fill('adopt-custom_1','60000');fill('memo-custom_1','試運転を含む')
 assert page.locator('#grand-total').inner_text()=='629,200円'
 assert page.locator('#total-diff').inner_text()=='＋11,000円'
 page.locator('#copy-amount-custom_1').click();expect(page.locator('#row-copy-feedback-custom_1')).to_contain_text('コピーしました：60,000')
 assert page.evaluate('navigator.clipboard.readText()')=='60,000'
 page.locator('#copy-basis-custom_1').click();expect(page.locator('#row-copy-feedback-custom_1')).to_contain_text('コピーしました：手入力+10,000')
 assert page.evaluate('navigator.clipboard.readText()')=='手入力+10,000'
 page.locator('#preview').click()
 text=page.locator('#summary-text').inner_text()
 assert '試運転調整費：60,000円' in text and '試運転を含む' in text and '試験費：12,000円' in text
 page.locator('#copy-text').click();expect(page.locator('#notice')).to_have_text('結果をコピーしました')
 assert '試運転調整費：60,000円' in page.evaluate('navigator.clipboard.readText()')
 with page.expect_download() as info:page.locator('#save-image').click()
 info.value.save_as(ART/'custom-item-result.png')
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [1440,390]:page.locator('#row-custom_1').screenshot(path=str(ART/f'custom-item-{width}.png'))
 fill('custom-name-custom_1','<img src=x onerror=alert(1)>')
 assert page.locator('#cost-rows img').count()==0
 page.locator('#preview').click();assert '<img src=x onerror=alert(1)>' in page.locator('#summary-text').inner_text()
 fill('custom-name-custom_1','試運転調整費')
 fill('custom-amount-custom_1','50055.9');page.locator('#round-standard').click()
 assert page.locator('#adopt-custom_1').input_value()=='50,000'
 assert page.locator('#booked-overhead').inner_text()=='56,200円'
 fill('adopt-custom_2','13123');assert page.locator('#booked-overhead').inner_text()=='56,300円'
 fill('adopt-overhead','55000')
 page.locator('[data-remove-custom="custom_1"]').click()
 assert page.locator('#row-custom_1').count()==0
 assert page.locator('#overhead-warning').is_visible()
 page.locator('#overhead-auto').click()
 assert page.locator('#subtotal').inner_text()=='513,123円'
 assert page.locator('#booked-overhead').inner_text()=='51,300円'
 fill('custom-amount-custom_2','-1');assert page.locator('#save-image').is_disabled()
 assert 'NaN' not in page.locator('body').inner_text()
 page.locator('[data-remove-custom="custom_2"]').click();assert page.locator('#save-image').is_enabled()
 assert page.locator('#grand-total').inner_text()=='550,000円'
 page.locator('#add-custom-item').click();fill('custom-amount-custom_3','0')
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click()
 assert page.locator('.custom-cost-row').count()==0
 page.locator('#add-custom-item').click();assert page.locator('#row-custom_1').count()==1
 page.reload();assert page.locator('.custom-cost-row').count()==0
 assert not errors,errors
 assert all(url.startswith('blob:') or url.startswith('http://127.0.0.1:8000') for url in requests[before:])
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 print('PASS: 任意項目追加/複数/削除・金額/採用変更・諸経費全モード・コピー/PNG/テキスト・XSS防止・PC/スマホ・リセット/再読込')
 b.close()
