"""Reference cost clipboard and output checks; requires the README local server."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=context.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,v):
  page.locator('#'+id).focus();page.locator('#'+id).fill(v)
 def copy_cost(id,expected):
  total=page.locator('#grand-total').inner_text()
  page.locator('#copy-cost-'+id).click()
  expect(page.locator('#row-copy-feedback-'+id)).to_contain_text('原価をコピーしました：'+expected)
  assert page.evaluate('navigator.clipboard.readText()')==expected
  assert page.locator('#grand-total').inner_text()==total
 fill('parts','850000');fill('workers','1.5');fill('shipping','20000')
 assert page.locator('[data-copy="cost"]').count()==6
 assert page.locator('#row-labor .booked-cell #labor-cost').count()==1
 assert page.locator('#row-labor .cost-title #labor-cost').count()==0
 assert page.locator('.welfare-amounts #welfare-cost').count()==1
 assert page.locator('#grand-total').inner_text()=='1,166,994円'
 before=len(requests)
 for id,cost in [('materials','26,350'),('removal','15,810'),('protection','10,540'),('overhead','64,976'),('labor','54,000'),('welfare','9,368')]:copy_cost(id,cost)
 page.locator('#copy-amount-welfare').click()
 expect(page.locator('#row-copy-feedback-welfare')).to_contain_text('金額をコピーしました：14,194')
 assert page.evaluate('navigator.clipboard.readText()')=='14,194'
 for id in ['materials','removal','protection','overhead']:
  fill('adopt-'+id,'100000');assert page.locator('#cost-'+id).inner_text()=='62,000円';copy_cost(id,'62,000')
  fill('adopt-'+id,'10000.99');copy_cost(id,'6,200')
  fill('adopt-'+id,'0');copy_cost(id,'0')
  fill('adopt-'+id,'')
 assert page.locator('#grand-total').inner_text()=='1,166,994円'
 fill('adopt-materials','100000')
 assert page.locator('#cost-overhead').inner_text()=='68,541円'
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  copy_cost('materials','62,000');copy_cost('labor','54,000');copy_cost('welfare','9,368')
  if width in [1440,390]:
   page.locator('#row-materials').screenshot(path=str(ART/f'cost-row-{width}.png'))
   page.locator('.totals-list').screenshot(path=str(ART/f'cost-welfare-{width}.png'))
 page.locator('#preview').click()
 assert '消耗資材費：売価 100,000円 → 参考原価 62,000円' in page.locator('#summary-text').inner_text()
 page.locator('#copy-text').click()
 expect(page.locator('#notice')).to_have_text('結果をコピーしました')
 assert '利益率38％' in page.evaluate('navigator.clipboard.readText()')
 with page.expect_download() as info:page.locator('#save-image').click()
 info.value.save_as(ART/'reference-cost-result.png')
 assert (ART/'reference-cost-result.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
 fill('parts','-1');assert page.locator('[data-copy="cost"]:disabled').count()==6
 fill('parts','850000');assert page.locator('[data-copy="cost"]:disabled').count()==0
 # Manual selection fallback works outside the main item rows, too.
 page.evaluate("Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true})")
 page.locator('#copy-cost-welfare').click()
 expect(page.locator('#row-copy-area-welfare')).to_be_visible()
 assert page.locator('#row-copy-area-welfare').input_value()=='9,368'
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click()
 assert page.locator('#cost-materials').inner_text()=='0円'
 assert not page.locator('#row-copy-feedback-welfare').is_visible()
 assert all(url.startswith('blob:') for url in requests[before:]),requests[before:]
 assert not errors,errors
 print('PASS: 6項目の実原価コピー・62％/38％・採用変更/0/空欄・PC/モバイル・PNG/テキスト・手動コピー代替・通信なし')
 b.close()
