"""Category tags and reorderable estimate rows, including actual touch gestures."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=ctx.new_page();page.set_default_timeout(7000);errors=[];requests=[]
 def attach(pg):
  pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  pg.on('request',lambda r:requests.append(r.url));pg.on('dialog',lambda d:d.accept())
 attach(page);page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,value):page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 def order():return page.locator('#cost-rows article').evaluate_all('(els)=>els.map(el=>el.id.replace("row-",""))')
 def amounts():return page.evaluate("() => ['subtotal','booked-overhead','welfare','grand-total','standard-total','welfare-cost'].map(id=>document.getElementById(id).textContent)")
 def row_data():return page.locator('#cost-rows article').evaluate_all("""els=>els.map(el=>({label:el.getAttribute('aria-label'),tag:el.dataset.itemTag,amount:el.querySelector('[id^="booked-"]').textContent,adopted:el.querySelector('[id^="adopt-"]').value.replaceAll(',',''),memo:el.querySelector('.note-input').value}))""")
 def edit():
  if page.locator('#edit-items').get_attribute('aria-expanded')=='false':page.locator('#edit-items').click()
 def move(id,direction):page.locator(f'[data-move-item="{id}"][data-direction="{direction}"]').click()
 def copy():
  page.locator('#copy-simple').click();expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
  return page.evaluate('navigator.clipboard.readText()')
 def prepare(text,valid=True):
  page.locator('#import-panel').evaluate('(el)=>el.open=true');fill('import-text',text);page.locator('#check-import').click()
  if valid:expect(page.locator('#import-preview')).to_be_visible()
  else:expect(page.locator('#import-error')).not_to_be_empty();assert page.locator('#import-preview').is_hidden()
 def drag(id,target,cancel=False):
  page.locator('#row-'+target).evaluate('el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-140)')
  handle=page.locator('[data-drag-item="'+id+'"]');h=handle.bounding_box();r=page.locator('#row-'+id).bounding_box();t=page.locator('#row-'+target).bounding_box()
  x=h['x']+h['width']/2;y=h['y']+h['height']/2
  offset=y-(r['y']+r['height']/2);end=t['y']+t['height']/2+offset-12
  page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,end,steps=16)
  if cancel:page.keyboard.press('Escape')
  page.mouse.up()
 # Normal use is unchanged and the new controls start hidden.
 assert page.locator('.row-editor:visible').count()==0
 fill('workers','2');assert page.locator('#welfare').inner_text()=='18,925円'
 page.locator('#add-custom-item').click();fill('custom-name-custom_1','交換作業費（業者2）');fill('custom-amount-custom_1','58000')
 assert page.locator('#welfare').inner_text()=='18,925円'
 edit();page.locator('#tag-custom_1').select_option('labor')
 assert page.locator('#welfare').inner_text()=='28,388円'
 expect(page.locator('#welfare-basis')).to_contain_text('174,000円')
 expect(page.locator('#item-tag-custom_1')).to_contain_text('法定福利費対象')
 assert page.locator('#welfare-cost').inner_text()=='18,736円'
 fill('adopt-custom_1','0');assert page.locator('#welfare').inner_text()=='18,925円'
 fill('adopt-custom_1','10000');fill('adopt-labor','100000');assert page.locator('#welfare').inner_text()=='17,946円'
 fill('adopt-custom_1','');fill('adopt-labor','')
 page.locator('#add-custom-item').click();fill('custom-name-custom_2','廃油処理');fill('custom-amount-custom_2','7000')
 page.locator('#tag-custom_2').select_option('removal')
 assert page.locator('#welfare').inner_text()=='28,388円' and page.locator('#grand-total').inner_text()=='236,288円'
 page.locator('#tag-custom_1').select_option('removal');assert page.locator('#welfare').inner_text()=='18,925円'
 page.locator('#tag-custom_1').select_option('labor')
 fill('adopt-custom_1','-1');assert page.locator('#copy-simple').is_disabled();fill('adopt-custom_1','')
 # A real mouse gesture reorders an existing item; Escape restores a pending drag.
 before=amounts();original_order=order();drag('materials','labor')
 assert order().index('materials')<order().index('labor'),order()
 assert amounts()==before
 stable=order();drag('removal','shipping',cancel=True);assert order()==stable
 assert page.locator('.is-moving').count()==0
 # Arrows and keyboard work for existing and added rows, including overhead.
 while order()[0]!='overhead':move('overhead',-1)
 assert amounts()==before
 assert page.locator('[data-move-item="overhead"][data-direction="-1"]').is_disabled()
 position=order().index('custom_1');move('custom_1',-1);assert order().index('custom_1')==position-1
 page.locator('[data-move-item="custom_1"][data-direction="1"]').press('Enter')
 assert order().index('custom_1')==position
 assert amounts()==before
 page.locator('#copy-amount-custom_1').click();expect(page.locator('#copy-amount-custom_1')).to_have_class('row-copy-button is-copied')
 move('custom_1',-1);assert 'is-copied' in page.locator('#copy-amount-custom_1').get_attribute('class')
 # Two additional rows can have identical human names and different tags/amounts.
 fill('custom-name-custom_2','交換作業費（業者2）');fill('adopt-custom_2','0');fill('memo-custom_2','撤去費を別計上')
 fill('adopt-custom_1','70000');fill('memo-custom_1','夜間作業／"追加"')
 # Exported ordered breakdown mirrors the screen and restore preserves every row, including duplicate names.
 text=copy();assert '〔交換作業費〕' in text and '〔撤去品引取費〕' in text and '日本時間' not in text
 breakdown=next(line for line in text.splitlines() if line.startswith('内訳：'))
 assert breakdown.startswith('内訳：諸経費='),breakdown
 before_rows=row_data();before_amounts=amounts()
 page.locator('#simple-preview').evaluate('(el)=>el.open=true');expect(page.locator('#simple-text')).to_contain_text('内訳：諸経費=')
 page.locator('#preview').click();full=page.locator('#summary-text').inner_text()
 assert '法定福利費の算定対象' in full and '186,000円' in full
 detail=full.split('【見積内訳】')[1].split('【追加項目のタグ】')[0]
 names=[line.split('：')[0] for line in detail.strip().splitlines()[:len(before_rows)]]
 assert names==[r['label'] for r in before_rows],names
 with page.expect_download() as download:page.locator('#save-image').click()
 download.value.save_as(ART/'tag-order-result.png')
 prepare(text);preview=page.locator('#import-summary').inner_text()
 assert '法定福利費の対象作業費合計：186,000円' in preview
 page.locator('#import-proportional').uncheck();page.locator('#check-import').click();page.locator('#apply-import').click()
 assert row_data()==before_rows,(row_data(),before_rows)
 assert amounts()==before_amounts
 assert page.locator('.row-editor:visible').count()==0
 # Bad tag/order metadata is rejected before any current data is replaced.
 bads=[text.replace('〔交換作業費〕','〔不明〕'),text+'\n'+breakdown,text.replace(breakdown,'内訳：部品=0')]
 for bad in bads:prepare(bad,False);assert row_data()==before_rows
 # Formatting hostile text is never interpreted as HTML.
 prepare(text.replace('廃油処理','<img src=x onerror=alert(1)>') if '廃油処理' in text else text.replace('夜間作業','<img src=x>'))
 assert page.locator('#import-summary img').count()==0
 # Reset clears category/order metadata; a new extra is still inserted above overhead.
 page.locator('#reset').click();assert order()==['parts','labor','materials','shipping','removal','protection','overhead']
 assert page.locator('#edit-items').get_attribute('aria-expanded')=='false'
 assert page.locator('#item-tag-custom_1').count()==0
 page.locator('#add-custom-item').click();assert page.locator('#tag-custom_1').input_value()=='other'
 assert order()[-2:]==['custom_1','overhead']
 # Adding/deleting after an arbitrary reorder keeps IDs, totals and selectors coherent.
 edit()
 while order()[0]!='overhead':move('overhead',-1)
 page.locator('#add-custom-item').click();assert order()[0]=='custom_2'
 fill('custom-name-custom_2','試運転');fill('custom-amount-custom_2','58000');page.locator('#tag-custom_2').select_option('labor')
 assert page.locator('#welfare').inner_text()=='9,462円'
 page.locator('[data-remove-custom="custom_2"]').click();assert page.locator('#welfare').inner_text()=='0円'
 # Narrow viewports, selected badges and all edit controls remain readable and touchable.
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width<=760:
   assert page.locator('[data-drag-item="parts"]').bounding_box()['height']>=44
   assert page.locator('#tag-custom_1').bounding_box()['height']>=44
  if width in [1440,390]:page.locator('#row-custom_1').screenshot(path=str(ART/f'tag-editor-{width}.png'))
 page.reload();assert order()[0]=='parts' and page.locator('.custom-cost-row').count()==0
 # Actual mobile touch dragging and edge auto-scroll, with the same deterministic totals.
 mobile=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 phone=mobile.new_page();attach(phone);phone.goto('http://127.0.0.1:8000');phone.wait_for_load_state('networkidle')
 phone.locator('#parts').fill('850000');phone.locator('#workers').fill('2');phone.locator('#edit-items').click()
 phone.locator('#row-parts').evaluate('el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-100)')
 baseline=phone.locator('#grand-total').inner_text()
 h=phone.locator('[data-drag-item="parts"]').bounding_box();r=phone.locator('#row-parts').bounding_box();t=phone.locator('#row-labor').bounding_box()
 x=h['x']+h['width']/2;start=h['y']+h['height']/2;offset=start-(r['y']+r['height']/2);end=min(824,t['y']+t['height']/2+offset+24)
 cdp=mobile.new_cdp_session(phone)
 def touch(kind,y):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[] if kind in ['touchEnd','touchCancel'] else [{'x':x,'y':y,'id':1}]})
 touch('touchStart',start)
 for step in range(1,17):touch('touchMove',start+(end-start)*step/16)
 touch('touchEnd',end)
 mobile_order=phone.locator('#cost-rows article').evaluate_all('(els)=>els.map(el=>el.id)')
 assert mobile_order.index('row-parts')>mobile_order.index('row-labor'),mobile_order
 assert phone.locator('#grand-total').inner_text()==baseline
 # Drag to an edge and keep the finger still: the requestAnimationFrame loop must scroll.
 phone.locator('#row-parts').evaluate('el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-100)')
 h=phone.locator('[data-drag-item="parts"]').bounding_box();start=h['y']+h['height']/2;old_scroll=phone.evaluate('scrollY')
 touch('touchStart',start);touch('touchMove',810);phone.wait_for_timeout(250)
 assert phone.evaluate('scrollY')>old_scroll
 touch('touchCancel',810)
 assert phone.locator('.is-moving').count()==0
 assert phone.locator('#cost-rows article').evaluate_all('(els)=>els.map(el=>el.id)')==mobile_order
 assert phone.locator('#grand-total').inner_text()==baseline
 assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
 mobile.close()
 assert page.evaluate('localStorage.length+sessionStorage.length')==0 and ctx.cookies()==[]
 assert all(url.startswith('http://127.0.0.1:8000') or url.startswith('blob:') for url in requests)
 assert not errors,errors
 b.close();print('PASS: タグ対象/採用/切捨て・マウス/タッチ/上下移動・取消/自動スクロール・順序と金額の復元・同名費目・不正拒否・旧機能/PNG/通信/リセット')
