"""Row-level clipboard checks; start the README HTTP server before running."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:8000'
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'])
 page=context.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.goto(BASE);page.wait_for_load_state('networkidle')
 assert page.locator('button[data-copy]').count()==20
 assert page.locator('button[data-copy] svg').count()==20
 def fill(id,value):
  el=page.locator('#'+id);el.focus();el.fill(value)
 def check_copy(id,kind,expected):
  before=page.locator('#grand-total').inner_text()
  page.locator('#copy-'+kind+'-'+id).click()
  expect(page.locator('#row-copy-feedback-'+id)).to_contain_text('をコピーしました：'+expected)
  assert page.evaluate('navigator.clipboard.readText()')==expected
  assert page.locator('#grand-total').inner_text()==before
 fill('parts','150000');fill('workers','1.5');fill('shipping','20000')
 network_before=len(requests)
 check_copy('parts','amount','150,000')
 check_copy('materials','basis','部品代×5％')
 fill('adopt-materials','10000');check_copy('materials','amount','10,000');check_copy('materials','basis','部品代×5％+2,500（＝部品代6.7％）')
 fill('adopt-materials','5000');check_copy('materials','basis','部品代×5％-2,500（＝部品代3.3％）')
 fill('adopt-materials','7500');check_copy('materials','basis','部品代×5％')
 fill('adopt-materials','');check_copy('materials','basis','部品代×5％')
 fill('adopt-materials','0');check_copy('materials','amount','0');check_copy('materials','basis','部品代×5％-7,500（＝部品代0％）')
 fill('adopt-materials','10000')
 page.locator('details.settings').evaluate('(el)=>el.open=true');fill('materialsRate','7');check_copy('materials','basis','部品代×7％-500（＝部品代6.7％）')
 fill('materialsRate','5');page.locator('details.settings').evaluate('(el)=>el.open=false')
 fill('adopt-labor','100000');check_copy('labor','amount','100,000');check_copy('labor','basis','1.5人×58,000+13,000')
 check_copy('removal','basis','部品代×3％');check_copy('protection','basis','部品代×2％')
 fill('adopt-shipping','20000');check_copy('shipping','basis','1.5人×4,000+20,000-6,000')
 fill('parts','0');fill('adopt-materials','2500');check_copy('materials','basis','部品代×5％+2,500')
 fill('parts','150000');fill('adopt-materials','10000')
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  check_copy('materials','basis','部品代×5％+2,500（＝部品代6.7％）')
  if width in [1440,390]:page.locator('#row-materials').screenshot(path=str(ART/f'copy-row-{width}.png'))
 # Requested example: the appended ratio is copied to the actual clipboard.
 fill('parts','288500');fill('adopt-protection','12694')
 check_copy('protection','basis','部品代×2％+6,924（＝部品代4.4％）')
 fill('parts','150000');fill('adopt-protection','')
 # Overhead uses the same row controls and must not be included in its own subtotal.
 page.locator('details.settings').evaluate('(el)=>el.open=true')
 for id in ['materialsRate','removalRate','protectionRate']:fill(id,'0')
 fill('parts','500000');fill('workers','0');fill('shipping','57740')
 for id in ['adopt-materials','adopt-labor','adopt-shipping']:fill(id,'')
 assert page.locator('#standard-overhead').inner_text()=='55,774円'
 fill('adopt-overhead','55700')
 assert page.locator('#subtotal').inner_text()=='557,740円'
 assert page.locator('#grand-total').inner_text()=='613,440円'
 assert page.locator('#total-diff').inner_text()=='－74円'
 assert page.locator('#cost-rows .cost-row').last.get_attribute('id')=='row-overhead'
 fill('memo-overhead','端数調整')
 check_copy('overhead','amount','55,700');check_copy('overhead','basis','小計×10％-74')
 page.locator('#preview').click()
 summary=page.locator('#summary-text').inner_text()
 assert summary.count('諸経費：55,700円')==1
 assert '端数調整' in summary
 fill('adopt-overhead','0');assert page.locator('#grand-total').inner_text()=='557,740円'
 fill('adopt-overhead','');assert page.locator('#grand-total').inner_text()=='613,514円'
 fill('adopt-overhead','55700');fill('shipping','57750')
 assert page.locator('#booked-overhead').inner_text()=='55,700円'
 check_copy('overhead','basis','小計×10％-75')
 # Welfare reference cost follows labor adoption, without affecting totals.
 fill('workers','1.5')
 assert page.locator('#welfare-cost').inner_text()=='原価（参考）：14,194円 × 0.66 ＝ 9,368円'
 fill('adopt-labor','100000')
 assert page.locator('#welfare-cost').inner_text()=='原価（参考）：16,315円 × 0.66 ＝ 10,767円'
 page.locator('#preview').click()
 assert '原価（参考）：16,315円 × 0.66 ＝ 10,767円' in page.locator('#summary-text').inner_text()
 for width in [1440,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width!=320:
   page.locator('#row-overhead').screenshot(path=str(ART/f'overhead-{width}.png'))
   page.locator('.totals-list').screenshot(path=str(ART/f'welfare-{width}.png'))
 fill('adopt-overhead','-1');assert page.locator('#copy-amount-overhead').is_disabled()
 fill('adopt-overhead','')
 fill('parts','150000');fill('adopt-materials','10000');fill('materialsRate','5')
 fill('parts','-1');assert page.locator('button[data-copy]:disabled').count()==20
 fill('parts','150000');assert page.locator('button[data-copy]:disabled').count()==0
 # Denied clipboard permission or unavailable API yields selectable text beside that row.
 page.evaluate("Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('NotAllowedError'))},configurable:true})")
 page.locator('#copy-basis-materials').click()
 expect(page.locator('#row-copy-area-materials')).to_be_visible()
 assert page.locator('#row-copy-area-materials').input_value()=='部品代×5％+2,500（＝部品代6.7％）'
 assert page.locator('#copy-basis-materials').is_enabled()
 assert len(requests)==network_before,requests[network_before:]
 assert not errors,errors
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 print('PASS: 実クリップボード20ボタン、標準/増減/0/率変更、売価原価分離、小数人員、PC・モバイル、不正入力、拒否時代替、通信なし')
 b.close()
