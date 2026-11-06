"""Discount preview checks; use the local server in README."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000});errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,value):
  page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 assert page.locator('.result-panel + #discount-panel').count()==1
 assert page.locator('#discount-rate-result').inner_text()=='—'
 page.locator('details.settings').evaluate('(el)=>el.open=true')
 for id in ['materialsRate','removalRate','protectionRate','overheadRate']:fill(id,'0')
 page.locator('details.settings').evaluate('(el)=>el.open=false')
 fill('parts','500000');assert page.locator('#grand-total').inner_text()=='500,000円'
 before=len(requests)
 fill('discount-rate','5')
 assert page.locator('#discount-rate-result').inner_text()=='25,000円（2.5万円）'
 assert page.locator('#discount-rate-after').inner_text()=='475,000円'
 fill('discount-amount','30000')
 assert page.locator('#discount-amount-result').inner_text()=='6％'
 assert page.locator('#discount-amount-after').inner_text()=='470,000円'
 assert page.locator('#grand-total').inner_text()=='500,000円'
 assert page.locator('#discount-rate-after').inner_text()=='475,000円'
 fill('adopt-parts','400000')
 assert page.locator('#discount-base').inner_text()=='400,000円'
 assert page.locator('#discount-rate-result').inner_text()=='20,000円（2万円）'
 assert page.locator('#discount-amount-result').inner_text()=='7.5％'
 fill('adopt-parts','')
 for value in ['101','-1','abc','1.2345']:
  fill('discount-rate',value);assert page.locator('#discount-rate').get_attribute('aria-invalid')=='true'
  assert page.locator('#discount-rate-result').inner_text()=='—'
  assert 'NaN' not in page.locator('#discount-panel').inner_text()
 fill('discount-rate','100');assert page.locator('#discount-rate-after').inner_text()=='0円'
 fill('discount-rate','0');assert page.locator('#discount-rate-after').inner_text()=='500,000円'
 fill('discount-rate','5')
 for value in ['500001','-1','abc','1.234']:
  fill('discount-amount',value);assert page.locator('#discount-amount').get_attribute('aria-invalid')=='true'
  assert page.locator('#discount-amount-result').inner_text()=='—'
 fill('discount-amount','30000');page.locator('#discount-rate').focus()
 assert page.locator('#discount-amount').input_value()=='30,000'
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [1440,390]:page.locator('#discount-panel').screenshot(path=str(ART/f'discount-{width}.png'))
 fill('parts','-1');assert page.locator('#discount-rate-result').inner_text()=='—'
 fill('parts','500000');assert page.locator('#discount-rate-after').inner_text()=='475,000円'
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click()
 assert page.locator('#discount-rate').input_value()=='' and page.locator('#discount-amount').input_value()==''
 fill('discount-amount','0');assert page.locator('#discount-amount-result').inner_text()=='—'
 fill('discount-amount','1');assert page.locator('#discount-amount').get_attribute('aria-invalid')=='true'
 fill('discount-rate','5');page.reload()
 assert page.locator('#discount-rate').input_value()=='' and page.locator('#discount-amount').input_value()==''
 assert not errors,errors
 # Only the final explicit reload fetched resources; discount edits themselves made no requests.
 assert all(url.startswith('http://127.0.0.1:8000') for url in requests[before:])
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 print('PASS: 50万円の2方式・独立試算・採用額連動・0/100％・不正入力・PC/モバイル・リセット/再読込')
 b.close()
