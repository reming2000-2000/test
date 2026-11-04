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
 assert page.locator('button[data-copy]').count()==12
 assert page.locator('button[data-copy] svg').count()==12
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
 fill('adopt-materials','10000');check_copy('materials','amount','10,000');check_copy('materials','basis','部品代×5％+2,500')
 fill('adopt-materials','5000');check_copy('materials','basis','部品代×5％-2,500')
 fill('adopt-materials','7500');check_copy('materials','basis','部品代×5％')
 fill('adopt-materials','');check_copy('materials','basis','部品代×5％')
 fill('adopt-materials','0');check_copy('materials','amount','0');check_copy('materials','basis','部品代×5％-7,500')
 fill('adopt-materials','10000')
 page.locator('details.settings').evaluate('(el)=>el.open=true');fill('materialsRate','7');check_copy('materials','basis','部品代×7％-500')
 fill('materialsRate','5');page.locator('details.settings').evaluate('(el)=>el.open=false')
 fill('adopt-labor','100000');check_copy('labor','amount','100,000');check_copy('labor','basis','1.5人×58,000+13,000')
 check_copy('removal','basis','部品代×3％');check_copy('protection','basis','部品代×2％')
 fill('adopt-shipping','20000');check_copy('shipping','basis','1.5人×4,000+20,000-6,000')
 fill('parts','0');fill('adopt-materials','2500');check_copy('materials','basis','部品代×5％+2,500')
 fill('parts','150000');fill('adopt-materials','10000')
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  check_copy('materials','basis','部品代×5％+2,500')
  if width in [1440,390]:page.locator('#row-materials').screenshot(path=str(ART/f'copy-row-{width}.png'))
 fill('parts','-1');assert page.locator('button[data-copy]:disabled').count()==12
 fill('parts','150000');assert page.locator('button[data-copy]:disabled').count()==0
 # Denied clipboard permission or unavailable API yields selectable text beside that row.
 page.evaluate("Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('NotAllowedError'))},configurable:true})")
 page.locator('#copy-basis-materials').click()
 expect(page.locator('#row-copy-area-materials')).to_be_visible()
 assert page.locator('#row-copy-area-materials').input_value()=='部品代×5％+2,500'
 assert page.locator('#copy-basis-materials').is_enabled()
 assert len(requests)==network_before,requests[network_before:]
 assert not errors,errors
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 print('PASS: 実クリップボード12ボタン、標準/増減/0/率変更、売価原価分離、小数人員、PC・モバイル、不正入力、拒否時代替、通信なし')
 b.close()
