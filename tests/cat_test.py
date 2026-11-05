"""Decorative companion integration; use the local server from README."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=context.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.clock.install()
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 cat=page.locator('#pixel-companion')
 expect(cat).to_have_attribute('data-sprite-loaded','true')
 assert page.locator('#cat-canvas').is_visible()
 def fill(id,v):
  page.locator('#'+id).focus();page.locator('#'+id).fill(v)
 fill('parts','850000');fill('workers','1.5');fill('shipping','20000')
 assert page.locator('#grand-total').inner_text()=='1,166,994円'
 expect(cat).to_have_attribute('data-state','typing')
 network_before=len(requests)
 page.locator('#copy-amount-parts').click()
 expect(cat).to_have_attribute('data-state','copy')
 assert page.evaluate('navigator.clipboard.readText()')=='850,000'
 page.screenshot(path=str(ART/'cat-desktop.png'),full_page=False)
 page.locator('#pixel-companion').screenshot(path=str(ART/'cat-closeup.png'))
 page.locator('#cat-canvas').screenshot(path=str(ART/'cat-new-copy.png'))
 page.locator('#round-standard').click();expect(cat).to_have_attribute('data-state','round')
 assert page.locator('#booked-parts').inner_text()=='850,000円'
 assert page.locator('#grand-total').inner_text()=='1,166,994円'
 page.locator('#preview').click();assert 'にゃ' not in page.locator('#summary-text').inner_text()
 with page.expect_download() as download:page.locator('#save-image').click()
 expect(cat).to_have_attribute('data-state','export');download.value.save_as(ART/'cat-free-export.png')
 fill('parts','-1');expect(cat).to_have_attribute('data-state','error')
 fill('parts','850000')
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  button=page.locator('#cat-toggle');rect=button.bounding_box()
  assert rect['x']>=0 and rect['x']+rect['width']<=width
  if width==390:
   page.locator('#copy-amount-parts').click();expect(cat).to_have_attribute('data-state','copy')
   page.screenshot(path=str(ART/'cat-mobile.png'))
 before=page.locator('#grand-total').inner_text()
 page.locator('#cat-toggle').click();assert not page.locator('#cat-canvas').is_visible()
 assert page.locator('#cat-toggle').get_attribute('aria-label')=='猫を表示'
 page.locator('#copy-amount-parts').click();assert not page.locator('#cat-canvas').is_visible()
 page.locator('#cat-toggle').click();assert page.locator('#cat-canvas').is_visible()
 assert page.locator('#grand-total').inner_text()==before
 page.clock.run_for(500)
 page.clock.fast_forward(31000);expect(cat).to_have_attribute('data-state','sleep')
 page.locator('#parts').click();expect(cat).not_to_have_attribute('data-state','sleep')
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click();expect(cat).to_have_attribute('data-state','reset')
 assert page.locator('#grand-total').inner_text()=='0円'
 assert all(u.startswith('blob:') for u in requests[network_before:]),requests[network_before:]
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 assert context.cookies()==[]
 assert not errors,errors
 reduced=browser.new_context(reduced_motion='reduce')
 reduced_page=reduced.new_page();reduced_page.goto('http://127.0.0.1:8000')
 assert reduced_page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
 reduced_page.locator('#parts').fill('-1')
 assert reduced_page.locator('#cat-canvas').evaluate('(el)=>getComputedStyle(el).transform')=='none'
 print('PASS: 猫の入力/コピー/端数/画像/エラー/リセット/睡眠、非表示、320px、動作軽減、計算不変、通信なし')
 browser.close()
