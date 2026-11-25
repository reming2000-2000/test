"""Company copy review and application, independent of existing portable import."""
import os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
def fixture(name):
 return subprocess.check_output(['node','-e',"process.stdout.write(require('./tests/company_sample.cjs')[process.argv[1]])",name],cwd=ROOT,text=True)
SAMPLE=fixture('sample')
MIXED_SAMPLE=fixture('mixedSample')
BASE=os.environ.get('CAT_TEST_BASE','http://127.0.0.1:8000')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=ctx.new_page();page.set_default_timeout(7000);errors=[];requests=[];dialogs=[];confirm=[True]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 def handle_dialog(dialog):
  dialogs.append(dialog.message)
  dialog.accept() if confirm[0] else dialog.dismiss()
 page.on('dialog',handle_dialog)
 page.goto(BASE);page.wait_for_load_state('networkidle')
 def fill(id,value):page.locator('#'+id).focus();page.locator('#'+id).fill(value)
 def main():return page.locator('#grand-total').inner_text()
 def paste(text=SAMPLE,clipboard=False):
  page.locator('#company-panel').evaluate('(el)=>el.open=true')
  if clipboard:
   page.evaluate('text=>navigator.clipboard.writeText(text)',text)
   page.locator('#company-text').focus();page.keyboard.press('Control+V')
  else:fill('company-text',text)
  expect(page.locator('#company-review')).to_be_visible()
 def target(id,value):page.locator('[data-company-target="source_'+str(id)+'"]').select_option(value)
 def apply():
  expect(page.locator('#company-apply')).to_be_enabled();page.locator('#company-apply').click()
  expect(page.locator('#company-notice')).to_contain_text('CATに反映しました')
 def amount(key,value):
  expect(page.locator(f'#company-balance [data-amount="{key}"] dd')).to_have_text(value)
 def show_comparison():
  page.locator('#company-balance summary').click()
 # The normal flow uses an actual paste then one click, with no replacement or workforce prompts.
 assert not page.locator('#company-panel').evaluate('el=>el.open')
 paste(clipboard=True);assert main()=='0円'
 assert page.locator('#company-parse').count()==0
 assert page.locator('#company-panel select').count()==0
 assert page.locator('#company-panel').get_by_text('原価・補助行の扱い').count()==0
 expect(page.locator('#company-issue-area')).to_be_hidden()
 expect(page.locator('#company-aggregates [data-amount="parts"] dd')).to_have_text('11,692,000円')
 expect(page.locator('#company-aggregates [data-amount="materials"] small')).to_have_text('部品代比 3.72％')
 expect(page.locator('#company-workers-help')).to_have_text('13日×3＝39人工')
 expect(page.locator('#company-workers')).to_be_hidden()
 amount('source-final','18,000,000円');amount('cat-final','18,000,000円');amount('difference','0円')
 assert page.locator('#company-balance .company-comparison>div').count()==3
 expect(page.locator('#company-balance').get_by_text('金額は一致しています。')).to_be_visible()
 expect(page.locator('#company-balance [data-amount="cat-before"]')).to_be_hidden()
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  if width in [1440,390]:page.locator('.company-preview').screenshot(path=str(ART/f'company-compact-{width}.png'))
 apply();assert not dialogs
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
 # Existing input is preserved on cancellation and replaced only on explicit approval.
 fill('parts','54321');before=main();paste();assert main()==before
 confirm[0]=False;page.locator('#company-apply').click()
 assert '置き換え' in dialogs[-1] and main()==before
 expect(page.locator('#company-review')).to_be_visible();expect(page.locator('#company-apply')).to_be_enabled()
 confirm[0]=True;apply();assert main()=='18,027,345円'
 # Manual classification and confirmed exclusions update the sum immediately.
 candidate=SAMPLE.replace('現場諸材料、工事機材費','工事機材費')
 paste(candidate);expect(page.locator('#company-issue-title')).to_have_text('要確認 1項目')
 select=page.locator('[data-company-target="source_11"]')
 expect(select).to_have_value('materials');expect(page.locator('#company-issues .company-status')).to_have_text('要確認')
 expect(page.locator('#company-apply')).to_be_disabled()
 expect(page.locator('#company-aggregates [data-amount="materials"]')).to_have_count(0)
 page.locator('[data-company-accept="source_11"]').click()
 expect(page.locator('#company-issue-area')).to_be_hidden();amount('difference','0円')
 page.locator('#company-detail-toggle').click()
 expect(page.locator('.company-row')).to_have_count(16)
 expect(page.locator('[data-source-id="source_11"]')).to_contain_text('手動確認済み')
 target(11,'removal');expect(page.locator('#company-aggregates [data-amount="materials"]')).to_have_count(0)
 expect(page.locator('#company-aggregates [data-amount="removal"] dd')).to_contain_text('435,000円')
 target(11,'materials')
 target(12,'exclude');amount('difference','－650,000円')
 show_comparison();expect(page.locator('#company-balance').get_by_text('1項目を取込対象外',exact=False)).to_be_visible()
 # Editing details and worker overrides update the live comparison and still require a final click.
 page.locator('[data-company-labor="source_10"]').check();expect(page.locator('#company-balance [data-amount="welfare-diff"] dd')).not_to_have_text('0円')
 page.locator('[data-company-labor="source_10"]').uncheck()
 target(12,'shipping')
 page.locator('#company-worker-toggle').click();fill('company-workers','38')
 expect(page.locator('#company-workers-help')).to_have_text('手動入力 38人工')
 target(11,'removal');expect(page.locator('#company-workers')).to_have_value('38')
 target(9,'exclude');expect(page.locator('#company-worker-fields')).to_be_hidden()
 target(9,'labor');expect(page.locator('#company-workers')).to_have_value('39')
 fill('company-workers','38');apply();expect(page.locator('#workers')).to_have_value('38')
 # Unknown and unreadable rows need an explicit decision even when the numbers match.
 header='番号\t区分\t品名\t売価金額\t原価\t備考'
 text=header+'\n1\tFREE部品\t架空部品\t1000\t500\t備考99,999円\n2\t経費\t不明な費用\t0\t100\t'
 paste(text);amount('difference','0円');expect(page.locator('#company-apply')).to_be_disabled()
 expect(page.locator('#company-balance').get_by_text('金額は一致しています。')).to_have_count(0)
 target(2,'exclude');expect(page.locator('#company-apply')).to_be_enabled()
 bad_line='3\t経費\t<em>金額不明の費用</em>\t不明\t100\t'
 paste(text+'\n'+bad_line)
 expect(page.locator('#company-issue-title')).to_have_text('要確認 1項目')
 expect(page.locator('#company-format-title')).to_have_text('形式を確認してください（1行）')
 bad=page.locator('[data-source-id="source_3"]')
 expect(bad).to_contain_text('売価金額を読み取れません')
 assert bad.locator('select').count()==0 and bad.locator('em').count()==0
 expect(bad.locator('pre')).to_be_hidden()
 bad.locator('summary').click()
 assert bad.locator('pre').text_content()==bad_line
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 target(2,'exclude');expect(page.locator('#company-apply')).to_be_disabled()
 page.locator('[data-company-format="source_3"]').click()
 expect(page.locator('#company-format-area')).to_be_hidden()
 expect(page.locator('#company-apply')).to_be_enabled()
 amount('source-final','確認できません')
 page.locator('#company-detail-toggle').click()
 page.locator('[data-company-format="source_3"]').click()
 expect(page.locator('#company-format-area')).to_be_visible()
 expect(page.locator('#company-apply')).to_be_disabled()
 paste(header+'\n1\t経費\t返却費\t-100\t0\t');expect(page.locator('#company-apply')).to_be_disabled()
 target(1,'discount');amount('cat-final','-100円')
 paste(header+'\n1\t経費\t<img src=x onerror=alert(1)>\t100\t0\t')
 assert page.locator('#company-panel img').count()==0
 target(1,'extra');apply();assert page.locator('#cost-rows img').count()==0
 # Unclear or conflicting labor instead requires a valid manual value.
 paste(header+'\n1\t経費\t交換作業費\t58000\t36000\t13日×3名＝40人工')
 expect(page.locator('#company-workers')).to_have_value('');expect(page.locator('#company-workers')).to_be_visible()
 expect(page.locator('#company-apply')).to_be_disabled()
 fill('company-workers','不明');expect(page.locator('#company-apply')).to_be_disabled()
 fill('company-workers','1');apply();assert main()=='67,462円'
 expect(page.locator('#booked-overhead')).to_have_text('0円');expect(page.locator('#booked-removal')).to_have_text('0円')
 # The mixed format creates no false reviews, but preserves a real 0-yen part.
 page.locator('#reset').click()
 paste(MIXED_SAMPLE,clipboard=True)
 expect(page.locator('#company-issue-area')).to_be_hidden()
 expect(page.locator('#company-format-area')).to_be_hidden()
 assert page.locator('#company-panel select').count()==0
 expect(page.locator('#company-workers-help')).to_contain_text('12人×58,000')
 amount('source-final','1,740,000円');amount('difference','0円')
 page.locator('#company-detail-toggle').click()
 expect(page.locator('#company-rows .company-row')).to_have_count(13)
 expect(page.locator('#company-rows').get_by_text('架空無償部品')).to_be_visible()
 expect(page.locator('#company-rows').get_by_text('架空フレーム関係部品')).to_have_count(0)
 expect(page.locator('#company-rows').get_by_text('ABC-123')).to_have_count(0)
 apply();assert main()=='1,740,552円'
 expect(page.locator('#workers')).to_have_value('12')
 expect(page.locator('#adopt-materials')).to_have_value('28,000')
 # Explicit source total is used for comparison, arithmetic mismatches are disclosed in details.
 totals=header+'\n1\tFREE部品\t架空部品\t1000\t500\t\n2\t小計\t合計\t1010\t\t'
 paste(totals);amount('source-final','1,010円');amount('difference','－10円')
 show_comparison();expect(page.locator('#company-balance').get_by_text('記載された最終合計と読取明細合計が一致しません。')).to_be_visible()
 # Existing manual settings and discount-only trials still trigger replacement confirmation.
 page.locator('#reset').click();page.locator('details.settings').evaluate('el=>el.open=true')
 fill('materialsRate','9.25');fill('welfareRate','15');paste()
 show_comparison();amount('welfare-diff','－29,745円')
 apply();expect(page.locator('#materialsRate')).to_have_value('9.25');expect(page.locator('#welfareRate')).to_have_value('15')
 expect(page.locator('#mode-materialsRate')).to_contain_text('手動');assert main()=='17,997,600円'
 page.locator('#reset').click();fill('discount-rate','5');paste()
 confirm[0]=False;page.locator('#company-apply').click();expect(page.locator('#discount-rate')).to_have_value('5')
 confirm[0]=True
 # Re-pasting immediately invalidates the draft and does not render large classified lists until requested.
 fill('company-text','不完全');expect(page.locator('#company-review')).to_be_hidden()
 expect(page.locator('#company-error')).to_contain_text('列を判定できません')
 large=header+'\n'+'\n'.join(f'{i}\tFREE部品\t架空部品\t100\t20\t' for i in range(1,1501))
 paste(large);assert page.locator('.company-row').count()==0
 expect(page.locator('#company-aggregates [data-amount="parts"] dd')).to_have_text('150,000円')
 fill('company-text',SAMPLE)
 page.locator('#reset').click();expect(page.locator('#company-text')).to_have_value('')
 expect(page.locator('#company-review')).to_be_hidden()
 paste();page.reload();assert page.locator('#company-text').input_value()=='' and page.locator('.company-row').count()==0
 assert page.evaluate('localStorage.length+sessionStorage.length')==0 and ctx.cookies()==[]
 assert all(url.startswith(BASE) or url.startswith('blob:') for url in requests)
 assert not errors,errors
 b.close();print('PASS: 社内解析/分類/人員確認・元入力保持/置換確認・指定全額/3.72%/福利/値引比較・欠落費目0・端数保護/簡易/コピー/PNG・未分類/未読取/負額/XSS・PC/スマホ・保存通信なし')
