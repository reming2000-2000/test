"""Live overhead modes; start the local server from README."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'])
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,value):
  page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 def mode(value):assert page.locator('#row-overhead').get_attribute('data-overhead-mode')==value
 mode('auto');assert page.locator('#adopt-overhead').input_value()==''
 page.locator('details.settings').evaluate('(el)=>el.open=true')
 for id in ['materialsRate','removalRate','protectionRate']:fill(id,'0')
 fill('parts','557740')
 assert page.locator('#booked-overhead').inner_text()=='55,774円'
 page.locator('#round-standard').click();mode('rounded')
 assert page.locator('#booked-overhead').inner_text()=='55,700円'
 fill('adopt-parts','583620')
 assert page.locator('#booked-overhead').inner_text()=='58,300円'
 assert page.locator('#adopt-overhead').input_value()=='58,300'
 assert page.locator('#grand-total').inner_text()=='641,920円'
 assert page.locator('#cost-overhead').inner_text()=='36,146円'
 fill('discount-rate','5');assert page.locator('#discount-rate-after').inner_text()=='609,824円'
 page.locator('#copy-amount-overhead').click()
 expect(page.locator('#row-copy-feedback-overhead')).to_contain_text('金額をコピーしました：58,300')
 assert page.evaluate('navigator.clipboard.readText()')=='58,300'
 fill('overheadRate','12');assert page.locator('#booked-overhead').inner_text()=='70,000円'
 fill('overheadRate','10')
 fill('adopt-overhead','55800');mode('manual')
 assert not page.locator('#overhead-warning').is_visible()
 fill('adopt-parts','600000')
 assert page.locator('#booked-overhead').inner_text()=='55,800円'
 assert page.locator('#overhead-warning').is_visible()
 page.locator('#preview').click()
 text=page.locator('#summary-text').inner_text()
 assert '手動固定' in text and '手動固定の諸経費を確認してください' in text
 fill('adopt-overhead','56000');assert not page.locator('#overhead-warning').is_visible()
 fill('overheadRate','12');assert page.locator('#overhead-warning').is_visible()
 page.locator('#overhead-auto').click();mode('rounded')
 assert page.locator('#booked-overhead').inner_text()=='72,000円'
 assert not page.locator('#overhead-warning').is_visible()
 fill('adopt-overhead','0');mode('manual')
 fill('adopt-parts','585000');assert page.locator('#booked-overhead').inner_text()=='0円'
 assert page.locator('#overhead-warning').is_visible()
 fill('adopt-overhead','');mode('rounded')
 assert page.locator('#booked-overhead').inner_text()=='70,200円'
 fill('adopt-overhead','-1');assert page.locator('#copy-amount-overhead').is_disabled()
 page.locator('#overhead-auto').click();mode('rounded')
 assert page.locator('#copy-amount-overhead').is_enabled()
 fill('overheadRate','10');fill('adopt-parts','10016740')
 assert page.locator('#booked-overhead').inner_text()=='1,001,000円'
 # A fixed value and its warning remain legible on narrow screens.
 fill('adopt-overhead','1000000');fill('adopt-parts','10017740')
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert page.locator('#overhead-warning').is_visible()
  if width in [1440,390]:page.locator('#row-overhead').screenshot(path=str(ART/f'overhead-mode-{width}.png'))
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click();mode('auto')
 assert page.locator('#adopt-overhead').input_value()==''
 fill('parts','557740');fill('adopt-overhead','55700');page.reload();mode('auto')
 assert page.locator('#grand-total').inner_text()=='0円'
 assert not errors,errors
 print('PASS: 諸経費3モード・自動端数連動・手動固定の変更検知・自動復帰・原価/コピー/値引/出力・PC/スマホ・リセット')
 b.close()
