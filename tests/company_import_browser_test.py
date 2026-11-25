"""Company copy review and application, independent of existing portable import."""
import os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
SAMPLE=subprocess.check_output(['node','-e',"process.stdout.write(require('./tests/company_sample.cjs').sample)"],cwd=ROOT,text=True)
BASE=os.environ.get('CAT_TEST_BASE','http://127.0.0.1:8000')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=ctx.new_page();page.set_default_timeout(7000);errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url));page.on('dialog',lambda d:d.accept())
 page.goto(BASE);page.wait_for_load_state('networkidle')
 def fill(id,value):page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 def main():return page.locator('#grand-total').inner_text()
 def paste(text=SAMPLE):
  page.locator('#company-panel').evaluate('(el)=>el.open=true');fill('company-text',text);page.locator('#company-parse').click()
  expect(page.locator('#company-review')).to_be_visible()
 def target(id,value):page.locator('[data-company-target="source_'+str(id)+'"]').select_option(value)
 def ready():target(11,'materials');page.locator('#company-workers-confirmed').check()
 def apply():
  if page.locator('#company-replace-option').is_visible():page.locator('#company-replace').check()
  expect(page.locator('#company-apply')).to_be_enabled();page.locator('#company-apply').click()
  expect(page.locator('#company-notice')).to_contain_text('CATに反映しました')
 def amount(label,value):
  row=page.locator('#company-balance dl>div').filter(has=page.locator('dt',has_text=label))
  expect(row.locator('dd')).to_have_text(value)
 # Default collapsed; parsing/classification never mutates the current estimate.
 assert not page.locator('#company-panel').evaluate('el=>el.open')
 fill('parts','12345');fill('adopt-materials','2000');fill('memo-materials','元の入力')
 before=main();paste();assert main()==before
 assert page.locator('.company-row').count()==16
 expect(page.locator('[data-source-id="source_11"] .company-status')).to_have_text('要確認')
 expect(page.locator('#company-workers')).to_have_value('39')
 expect(page.locator('#company-apply')).to_be_disabled()
 ready();expect(page.locator('#company-apply')).to_be_disabled()
 page.locator('#company-replace').check();expect(page.locator('#company-apply')).to_be_enabled()
 amount('CAT計算総額（値引前）','18,027,345円');amount('比較用の値引後金額','18,000,000円')
 amount('差額（比較用 − 元明細合計）','0円');amount('元データの小計','17,658,300円')
 # A new estimate edit invalidates the replacement acknowledgement, keeping the draft.
 fill('parts','54321');expect(page.locator('#company-replace')).not_to_be_checked();expect(page.locator('#company-apply')).to_be_disabled()
 assert page.locator('.company-row').count()==16
 # Explicitly tagging trial work as labor changes welfare, and is reversible before import.
 page.locator('[data-company-labor="source_10"]').check()
 expect(page.locator('#company-balance')).to_contain_text('法定福利費の差額')
 assert '0円'!=page.locator('#company-balance dl>div').filter(has=page.locator('dt',has_text='法定福利費の差額')).locator('dd').inner_text()
 page.locator('[data-company-labor="source_10"]').uncheck()
 target(9,'exclude');expect(page.locator('#company-worker-fields')).to_be_hidden();expect(page.locator('#company-workers')).to_have_value('0')
 target(9,'labor');expect(page.locator('#company-workers')).to_have_value('39');page.locator('#company-workers-confirmed').check()
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1100})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [1440,390]:
   page.locator('#company-rows').screenshot(path=str(ART/f'company-rows-{width}.png'))
   page.locator('#company-balance').screenshot(path=str(ART/f'company-balance-{width}.png'))
 apply()
 assert main()=='18,027,345円'
 assert page.locator('#parts').input_value().replace(',','')=='11692000'
 assert page.locator('#workers').input_value()=='39' and page.locator('#shipping').input_value()=='0'
 for id,value in [('labor','2,262,000円'),('materials','435,000円'),('shipping','650,000円'),('removal','0円'),('protection','260,000円'),('overhead','1,605,300円'),('custom_1','754,000円')]:
  expect(page.locator('#booked-'+id)).to_have_text(value)
 expect(page.locator('#parts-ratio-materials')).to_have_text('部品代比 3.72％')
 expect(page.locator('#welfare')).to_have_text('369,045円')
 expect(page.locator('#row-overhead')).to_have_attribute('data-overhead-mode','manual')
 expect(page.locator('#tag-custom_1')).to_have_value('other')
 assert page.locator('.custom-cost-row').count()==1
 assert page.locator('#company-text').input_value()=='' and page.locator('.company-row').count()==0
 assert page.locator('#memo-materials').input_value()==''
 # Source-fixed amounts survive first-release rounding and the existing export/import flow.
 before=main();page.locator('#round-standard').click();assert main()==before
 page.locator('#undo-round').click();assert main()==before
 page.locator('#copy-simple').click();expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
 compact=page.evaluate('navigator.clipboard.readText()');assert '-27,345' not in compact and '－27,345' not in compact and compact.startswith('見積18,027,345円')
 page.locator('#import-panel').evaluate('el=>el.open=true');fill('import-text',compact)
 page.locator('#import-proportional').uncheck();page.locator('#check-import').click();page.locator('#apply-import').click()
 assert main()==before
 page.locator('#copy-text').click();expect(page.locator('#notice')).to_have_text('結果をコピーしました')
 assert '18,027,345円' in page.evaluate('navigator.clipboard.readText()')
 with page.expect_download() as download:page.locator('#save-image').click()
 download.value.save_as(ART/'company-import-result.png')
 assert (ART/'company-import-result.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
 # Unknown and unreadable rows need an explicit decision; no silent loss or HTML execution.
 header='番号\t区分\t品名\t売価金額\t原価\t備考'
 text=header+'\n1\tFREE部品\t架空部品\t1000\t500\t備考99,999円\n2\t経費\t不明な費用\t200\t100\t'
 paste(text);expect(page.locator('#company-apply')).to_be_disabled();target(2,'exclude')
 expect(page.locator('#company-balance')).to_contain_text('取込対象外')
 amount('差額（比較用 − 元明細合計）','－200円')
 paste(text+'\n読取できない行');target(2,'exclude');expect(page.locator('#company-apply')).to_be_disabled()
 target(3,'exclude');amount('元データ明細合計（値引後）','確認できません')
 # Negative non-discount names are not automatically assigned to ordinary cost fields.
 paste(header+'\n1\t経費\t返却費\t-100\t0\t');expect(page.locator('#company-apply')).to_be_disabled()
 target(1,'discount');amount('値引（比較のみ）','－100円')
 paste(header+'\n1\t経費\t<img src=x onerror=alert(1)>\t100\t0\t')
 assert page.locator('#company-panel img').count()==0
 target(1,'extra');apply();assert page.locator('#cost-rows img').count()==0
 # Labor without credible quantity is blocked until the user supplies and confirms it.
 paste(header+'\n1\t経費\t交換作業費\t58000\t36000\t単価から推測しない')
 expect(page.locator('#company-workers')).to_have_value('')
 page.locator('#company-workers-confirmed').check();expect(page.locator('#company-apply')).to_be_disabled()
 fill('company-workers','1');expect(page.locator('#company-workers-confirmed')).not_to_be_checked()
 page.locator('#company-workers-confirmed').check();apply();assert main()=='67,462円'
 expect(page.locator('#booked-overhead')).to_have_text('0円');expect(page.locator('#booked-removal')).to_have_text('0円')
 # Existing manual settings stay manual, and welfare differences are disclosed rather than patched.
 page.locator('#reset').click();page.locator('details.settings').evaluate('el=>el.open=true')
 fill('materialsRate','9.25');fill('welfareRate','15');paste();ready()
 amount('法定福利費の差額','－29,745円');expect(page.locator('#company-balance')).to_contain_text('自動計算')
 apply();expect(page.locator('#materialsRate')).to_have_value('9.25');expect(page.locator('#welfareRate')).to_have_value('15')
 expect(page.locator('#mode-materialsRate')).to_contain_text('手動');assert main()=='17,997,600円'
 # Even an existing discount-only trial is not discarded without replacement acknowledgement.
 page.locator('#reset').click();paste();ready();expect(page.locator('#company-apply')).to_be_enabled()
 fill('discount-rate','5');expect(page.locator('#company-replace-option')).to_be_visible();expect(page.locator('#company-apply')).to_be_disabled()
 # Editing pasted text invalidates all pending classification; reset/reload destroy drafts.
 paste();ready();fill('company-text',SAMPLE+' ');expect(page.locator('#company-review')).to_be_hidden()
 paste();page.locator('#reset').click();assert page.locator('#company-text').input_value()==''
 paste();page.reload();assert page.locator('#company-text').input_value()=='' and page.locator('.company-row').count()==0
 assert page.evaluate('localStorage.length+sessionStorage.length')==0 and ctx.cookies()==[]
 assert all(url.startswith(BASE) or url.startswith('blob:') for url in requests)
 assert not errors,errors
 b.close();print('PASS: 社内解析/分類/人員確認・元入力保持/置換確認・指定全額/3.72%/福利/値引比較・欠落費目0・端数保護/簡易/コピー/PNG・未分類/未読取/負額/XSS・PC/スマホ・保存通信なし')
