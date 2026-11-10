"""Parts-price tiers, manual and imported rates, and the local reference guide."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=ctx.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,value):page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 def modes(m,r):
  assert page.locator('#mode-materialsRate').get_attribute('data-mode')==m
  assert page.locator('#mode-removalRate').get_attribute('data-mode')==r
 page.locator('details.settings').evaluate('(el)=>el.open=true')
 modes('auto','auto');assert page.locator('#materialsRate').input_value()=='5'
 assert page.locator('#reference-rules').get_attribute('open') is None
 assert page.locator('#mode-materialsRate').inner_text()=='部品代の入力待ち'
 before=len(requests)
 for price,m,r,band in [('0.01','7','5','0'),('500000','7','5','0'),('500000.01','5','3','1'),('999999.99','5','3','1'),('1000000','3','2','2'),('2999999.99','3','2','2'),('3000000','2','1','3'),('400000','7','5','0')]:
  fill('parts',price)
  assert page.locator('#materialsRate').input_value()==m,price
  assert page.locator('#removalRate').input_value()==r,price
  assert page.locator('.current-band').get_attribute('data-reference-band')==band
 assert page.locator('#grand-total').inner_text()=='501,600円'
 # Existing adoption and rounding semantics remain in place.
 fill('adopt-materials','30000');assert page.locator('#grand-total').inner_text()=='503,800円'
 fill('adopt-materials','')
 fill('parts','381200');assert page.locator('#standard-materials').inner_text()=='26,684円'
 page.locator('#round-standard').click();assert page.locator('#booked-materials').inner_text()=='26,600円'
 fill('parts','1500000');assert page.locator('#adopt-materials').input_value()=='26,600'
 fill('adopt-materials','');assert page.locator('#booked-materials').inner_text()=='45,000円'
 # Manual rates are independently protected; all other settings and adoptions stay unchanged.
 fill('materialsRate','9.25');fill('protectionRate','4');fill('overheadRate','12');fill('adopt-materials','12345')
 fill('parts','3000000');modes('manual','auto')
 assert page.locator('#materialsRate').input_value()=='9.25' and page.locator('#removalRate').input_value()=='1'
 assert page.locator('#adopt-materials').input_value()=='12,345'
 assert page.locator('#protectionRate').input_value()=='4' and page.locator('#overheadRate').input_value()=='12'
 fill('removalRate','0');fill('parts','400000');modes('manual','manual')
 assert page.locator('#removalRate').input_value()=='0'
 page.locator('#reset-parts-rates').click();modes('auto','auto')
 assert page.locator('#materialsRate').input_value()=='7' and page.locator('#removalRate').input_value()=='5'
 assert page.locator('#adopt-materials').input_value()=='12,345'
 for value in ['-1','abc','1000000000001']:
  fill('parts',value);assert page.locator('#materialsRate').input_value()=='7';assert page.locator('#copy-simple').is_disabled()
 fill('parts','850000');assert page.locator('#materialsRate').input_value()=='5'
 fill('materialsRate','bad');fill('parts','1000000');assert page.locator('#materialsRate').input_value()=='bad'
 page.locator('#reset-parts-rates').click();assert page.locator('#copy-simple').is_enabled()
 fill('parts','0');assert page.locator('#materialsRate').input_value()=='3'
 fill('parts','');assert page.locator('#materialsRate').input_value()=='3'
 # New and old copied conditions both retain their rates when parts later change tiers.
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click();modes('auto','auto')
 fill('parts','381200');page.locator('#copy-simple').click();expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
 compact=page.evaluate('navigator.clipboard.readText()')
 assert '資材7%／撤去5%' in compact
 legacy=page.evaluate("""() => {const p=Object.fromEntries(Object.entries({...Estimate.defaults,parts:'850000'}).map(([id,n])=>[id,Estimate.decimal(n)]));return EstimatePortable.encodeV1({p,extraItems:[],memos:{},...Estimate.calculate(p,{},'auto')},'日時','auto',false);} """)
 for copied,m,r in [(compact,'7','5'),(legacy,'5','3')]:
  page.locator('#import-panel').evaluate('(el)=>el.open=true');fill('import-text',copied);page.locator('#check-import').click()
  expect(page.locator('#import-preview')).to_be_visible();page.locator('#apply-import').click();modes('imported','imported')
  fill('parts','3000000');assert page.locator('#materialsRate').input_value()==m and page.locator('#removalRate').input_value()==r
  page.locator('details.settings').evaluate('(el)=>el.open=true');page.locator('#reset-parts-rates').click()
  assert page.locator('#materialsRate').input_value()=='2' and page.locator('#removalRate').input_value()=='1'
 # Full saved summaries and actual PNG use current rates.
 page.locator('#preview').click();assert '消耗資材費率：2％' in page.locator('#summary-text').inner_text()
 with page.expect_download() as download:page.locator('#save-image').click()
 download.value.save_as(ART/'parts-rates-result.png')
 page.locator('#reference-rules').evaluate('(el)=>el.open=true')
 page.locator('#reference-rules details').evaluate_all('(els)=>els.forEach(el=>el.open=true)')
 reference=page.locator('#reference-rules').inner_text()
 for term in ['15％','11％','3,500円','135,000円','166,000円','20,000円','16.315％','百円単位切り上げ','50万円以下']:
  assert term in reference,term
 for term in ['トーシン','福島','愛知','NTT']:
  assert term not in reference,term
 # Only the existing seven expenses appear; reference tables add no inputs or requests.
 assert page.locator('#cost-rows article').count()==7
 assert page.locator('#reference-rules input').count()==0
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [1440,390]:
   page.locator('details.settings').screenshot(path=str(ART/f'parts-rates-settings-{width}.png'))
   page.locator('#reference-rules').screenshot(path=str(ART/f'parts-rates-reference-{width}.png'))
 page.locator('#reset').click();fill('parts','400000');assert page.locator('#materialsRate').input_value()=='7'
 fill('materialsRate','20');page.reload();modes('auto','auto')
 page.locator('details.settings').evaluate('(el)=>el.open=true');fill('parts','400000');assert page.locator('#materialsRate').input_value()=='7'
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 assert all(url.startswith('blob:') or url.startswith('http://127.0.0.1:8000') for url in requests[before:])
 assert not errors,errors
 b.close();print('PASS: 自動掛率の境界・独立手動保持/自動復帰・採用/端数/原価/諸経費維持・旧新簡易復元・参考表・PC/スマホ・PNG・再読込・通信なし')
