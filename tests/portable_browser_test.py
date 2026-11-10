"""Copy compact conditions, preview and restore, then re-estimate without storage/network."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=ctx.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.goto('http://127.0.0.1:8000');page.wait_for_load_state('networkidle')
 def fill(id,value):page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 def copy():
  page.locator('#copy-simple').click();expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
  return page.evaluate('navigator.clipboard.readText()')
 def prepare(text,proportional=True):
  page.locator('#import-panel').evaluate('(el)=>el.open=true');fill('import-text',text)
  page.locator('#import-proportional').set_checked(proportional)
  page.locator('#check-import').click();expect(page.locator('#import-preview')).to_be_visible()
 def apply():page.locator('#apply-import').click();expect(page.locator('#import-notice')).to_contain_text('計算条件を反映しました')
 for id,value in [('parts','850000'),('workers','1.5'),('shipping','20000'),('adopt-materials','70000'),('memo-materials','特殊部品・値引き交渉後')]:fill(id,value)
 page.locator('#add-custom-item').click();fill('custom-name-custom_1','試運転調整費');fill('custom-amount-custom_1','50000');fill('adopt-custom_1','55000');fill('memo-custom_1','追加試運転を含む')
 fill('adopt-overhead','100000')
 original=page.locator('#grand-total').inner_text();compact=copy()
 assert len(compact.splitlines())<40
 assert '1.5人' in compact and '特殊部品・値引き交渉後' in compact and '試運転調整費' in compact and '日本時間' not in compact and '出力日時' not in compact
 # Checking doesn't mutate the current estimate. Invalid text keeps every input intact.
 fill('parts','1000');before=page.locator('#grand-total').inner_text()
 page.locator('#import-panel').evaluate('(el)=>el.open=true');fill('import-text','部品代 999999')
 page.locator('#check-import').click();expect(page.locator('#import-error')).not_to_be_empty();assert page.locator('#import-preview').is_hidden()
 assert page.locator('#grand-total').inner_text()==before
 prepare(compact);assert page.locator('#grand-total').inner_text()==before
 assert '出力日時' not in page.locator('#import-summary').inner_text() and 'undefined' not in page.locator('#import-summary').inner_text()
 assert original in page.locator('#import-summary').inner_text()
 assert '部品代比 約8.2353％' in page.locator('#import-summary').inner_text()
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [1440,390]:page.locator('#import-panel').screenshot(path=str(ART/f'compact-import-{width}.png'))
 apply();assert page.locator('#grand-total').inner_text()==original
 assert page.locator('#workers').input_value()=='1.5'
 old_compact=compact.replace('\n','｜2026/11/10 09:05:59（日本時間）\n',1)
 prepare(old_compact);assert '出力日時：2026/11/10 09:05:59（日本時間）' in page.locator('#import-summary').inner_text()
 apply();assert page.locator('#grand-total').inner_text()==original
 assert page.locator('#memo-materials').input_value()=='特殊部品・値引き交渉後'
 assert page.locator('#memo-custom_1').input_value()=='追加試運転を含む'
 expect(page.locator('#link-help-materials')).to_contain_text('8.2353％')
 expect(page.locator('#overhead-mode-label')).to_have_text('引継掛率で自動連動')
 fill('parts','1700000');assert page.locator('#booked-materials').inner_text()=='140,000円'
 assert page.locator('#booked-custom_1').inner_text()=='55,000円'
 assert page.locator('#overhead-warning').is_hidden()
 # Copy/import a second time keeps precise rational factors, not displayed rounded percentages.
 second=copy();total=page.locator('#grand-total').inner_text();prepare(second,False);apply()
 assert page.locator('#grand-total').inner_text()==total
 fill('parts','850000');assert page.locator('#booked-materials').inner_text()=='70,000円'
 page.locator('#preview').click();expect(page.locator('#summary-text')).to_contain_text('引継掛率で連動する費目')
 assert '出力日時：' in page.locator('#summary-text').inner_text()
 page.locator('#copy-text').click();expect(page.locator('#notice')).to_have_text('結果をコピーしました')
 assert '出力日時：' in page.evaluate('navigator.clipboard.readText()')
 with page.expect_download() as download:page.locator('#save-image').click()
 download.value.save_as(ART/'compact-restored-result.png')
 # Editing linked adoption makes it fixed. Clearing returns to the standard rate.
 fill('adopt-materials','65000');assert page.locator('#link-help-materials').is_hidden()
 fill('parts','1700000');assert page.locator('#booked-materials').inner_text()=='65,000円'
 fill('adopt-materials','');assert page.locator('#booked-materials').inner_text()=='85,000円'
 # Settings edit deliberately replaces a linked rate.
 prepare(compact);apply();page.locator('details.settings').evaluate('(el)=>el.open=true')
 fill('materialsRate','7');assert page.locator('#booked-materials').inner_text()=='59,500円'
 assert page.locator('#link-help-materials').is_hidden()
 # Restore original fixed amounts by unchecking the proportional option.
 prepare(compact,False);apply();assert page.locator('#grand-total').inner_text()==original
 fill('parts','1700000');assert page.locator('#booked-materials').inner_text()=='70,000円'
 assert page.locator('#overhead-warning').is_visible()
 # Auto rounded overhead retains its mode through a round trip; batch rounding cancels links.
 prepare(compact);apply();page.locator('#round-standard').click();assert page.locator('#link-help-materials').is_hidden()
 rounded_total=page.locator('#grand-total').inner_text();rounded=copy();prepare(rounded,False);apply()
 assert page.locator('#grand-total').inner_text()==rounded_total
 expect(page.locator('#overhead-mode-label')).to_have_text('自動連動・端数調整')
 # Invalid inputs prevent compact output, just like all other exports.
 fill('parts','-1');assert page.locator('#copy-simple').is_disabled()
 # No HTML from names or notes is evaluated.
 malicious=compact.replace('試運転調整費','<img src=x onerror=alert(1)>')
 prepare(malicious);assert page.locator('#import-summary img').count()==0;apply()
 assert page.locator('#cost-rows img').count()==0
 # Clipboard failure offers the exact reusable text for manual selection.
 page.evaluate("() => { navigator.clipboard.writeText=async()=>{throw Error('denied')}; }")
 page.locator('#copy-simple').click();expect(page.locator('#copy-fallback')).to_be_visible()
 assert page.locator('#copy-area').input_value().startswith('見積')
 # Clear/reset/reload removes import text, preview, links and added items.
 page.on('dialog',lambda d:d.accept());page.locator('#reset').click()
 assert page.locator('#import-text').input_value()=='' and page.locator('.custom-cost-row').count()==0
 assert page.locator('#import-preview').is_hidden() and page.locator('#link-help-materials').is_hidden()
 prepare(compact);fill('import-text',compact+' ');assert page.locator('#import-preview').is_hidden()
 page.reload();assert page.locator('#parts').input_value()=='0' and page.locator('#import-text').input_value()==''
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 assert all(url.startswith('http://127.0.0.1:8000') or url.startswith('blob:') for url in requests),requests
 assert not errors,errors
 b.close();print('PASS: 簡易コピー/貼付確認/復元・固定/割合連動・精度維持・端数自動・メモ/任意項目・PNG・拒否時fallback・PC/スマホ・リセット/再読込・外部通信なし')
