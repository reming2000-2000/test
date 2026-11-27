"""Company adoption release, one-step undo, positional insertion and exact memo restoration."""
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE = os.environ.get('CAT_TEST_BASE', 'http://127.0.0.1:8000')
ART = Path('/tmp/estimate-verification')
ART.mkdir(exist_ok=True)
SAMPLE = """番号	区分	品名	数量	単位	単価	売価金額	原価	備考
1	FREE部品	架空部品	1	式	381,200	381,200	0
2	経費	交換作業費	1.5	人工	58,000	87,000	0
3	経費	消耗資材費	1	式	32,100	32,100	0
4	経費	送料	1	式	14,000	14,000	0
5	経費	養生・安全対策費	1	式	0	0	0
6	経費	諸経費	1	式	82,000	82,000	0
7	経費	試運転調整費	1	式	12,345	12,345	0"""
DEFAULT = ['parts', 'labor', 'materials', 'shipping', 'removal', 'protection', 'overhead']


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(
        viewport={'width': 1440, 'height': 1040},
        has_touch=True,
        permissions=['clipboard-read', 'clipboard-write'],
    )
    page = context.new_page()
    page.set_default_timeout(7000)
    errors, requests, dialogs = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.on('request', lambda request: requests.append(request.url))

    def accept(dialog):
        dialogs.append(dialog.message)
        dialog.accept()

    page.on('dialog', accept)
    page.goto(BASE)
    page.wait_for_load_state('networkidle')

    def fill(id, value):
        field = page.locator('#' + id)
        field.focus()
        field.fill(value)

    def text(id):
        return page.locator('#' + id).inner_text()

    def adopt(id):
        return page.locator('#adopt-' + id).input_value().replace(',', '')

    def mode(id):
        return page.locator('#row-' + id).get_attribute('data-adoption-mode')

    def order():
        return page.locator('#cost-rows .cost-row').evaluate_all("rows=>rows.map(row=>row.id.slice(4))")

    def snapshot(everything=False, restored=False):
        return page.evaluate("""([everything, restored])=>{
            const get = id=>document.getElementById(id);
            const amounts = ids=>ids.map(id=>get(id).textContent);
            const fields = [...document.querySelectorAll('#basic-fields input,#setting-fields input')].map(input=>[input.id,input.value.replaceAll(',','')]);
            const rows = [...document.querySelectorAll('#cost-rows .cost-row')].map(row=>{
                const id=row.id.slice(4);
                let mode=row.dataset.adoptionMode;
                // Individual rounding provenance expires on simple import. Its adopted value stays fixed.
                if (restored && mode==='rounded' && id!=='overhead') mode='manual';
                return [
                    row.getAttribute('aria-label'),row.dataset.itemTag,mode,
                    get('adopt-'+id).value.replaceAll(',',''),get('booked-'+id).textContent,
                    get('custom-amount-'+id)?.value.replaceAll(',',''),get('memo-'+id).value,
                    ...(everything?[get(id==='overhead'?'overhead-mode-label':'adoption-state-'+id).textContent]:[])
                ];
            });
            return {fields,rows,amounts:amounts(['subtotal','welfare','grand-total','standard-total']),
                ...(everything?{warning:!get('overhead-warning').hidden}: {})};
        }""", [everything, restored])

    def copy():
        page.locator('#copy-simple').click()
        expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
        return page.evaluate('navigator.clipboard.readText()')

    def restore(text, proportional=False):
        page.locator('#import-panel').evaluate('panel=>panel.open=true')
        fill('import-text', text)
        page.locator('#import-proportional').set_checked(proportional)
        page.locator('#check-import').click()
        expect(page.locator('#import-preview')).to_be_visible()
        page.locator('#apply-import').click()
        expect(page.locator('#company-recalc')).to_be_hidden()

    def recalc_open():
        panel = page.locator('#company-recalc')
        if not panel.evaluate('el=>el.open'):
            panel.locator('summary').click()

    def check(*ids):
        recalc_open()
        for id in ids:
            page.locator(f'[data-recalc-item="{id}"]').check()

    def recalc_amounts(id):
        return page.locator(f'[data-recalc-result="{id}"] td').all_text_contents()

    def confirm_recalc():
        before, expected, delta = recalc_amounts('total')
        assert text('grand-total') == before
        page.locator('#company-recalc-confirm').click()
        expect(page.locator('#grand-total')).to_have_text(expected)
        expect(page.locator('#company-recalc-preview')).to_be_hidden()
        expect(page.locator('#undo-round')).to_have_text('再計算前に戻す')
        return expected, delta

    # Ordinary editing still follows the same three inputs and one-click add flow.
    expect(page.locator('#company-recalc')).to_be_hidden()
    assert page.locator('#basic-fields input').count() == 3
    assert page.locator('[data-insert-before]').count() == 0
    assert order() == DEFAULT
    fill('parts', '381200')
    expect(page.locator('#adoption-state-materials')).to_have_text('自動計算')
    expect(page.locator('#booked-materials')).to_have_text('26,684円')
    page.locator('#add-custom-item').click()
    expect(page.locator('#custom-name-custom_1')).to_be_focused()
    assert order()[-2:] == ['custom_1', 'overhead']
    plain = snapshot()
    plain_copy = copy()
    restore(plain_copy)
    assert snapshot() == plain and copy() == plain_copy
    page.locator('#reset').click()

    # Company import retains fixed zero values and source information without releasing anything.
    page.locator('#company-panel summary').first.click()
    fill('company-text', SAMPLE)
    count = len(dialogs)
    page.locator('#company-apply').click()
    assert len(dialogs) == count
    expect(page.locator('#grand-total')).to_have_text('622,839円')
    assert not page.locator('#company-recalc').evaluate('el=>el.open')
    expect(page.locator('#adoption-state-materials')).to_have_text('取込額を固定中')
    expect(page.locator('#adoption-state-removal')).to_have_text('明細なし・0円固定')
    expect(page.locator('#adoption-state-protection')).to_have_text('取込の0円を固定中')
    expect(page.locator('#overhead-mode-label')).to_have_text('取込額を固定中')
    assert adopt('removal') == adopt('protection') == '0'
    assert len(page.locator('[data-recalc-item]').all()) == 4
    initial = snapshot(everything=True)
    imported = snapshot()
    imported_copy = copy()

    check('materials', 'overhead')
    assert recalc_amounts('materials') == ['32,100円', '26,684円', '－5,416円']
    assert recalc_amounts('overhead') == ['82,000円', '52,122.9円', '－29,877.1円']
    assert recalc_amounts('total') == ['622,839円', '587,545.9円', '－35,293.1円']
    for width in [1440, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 940})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        if width in [1440, 390]:
            page.locator('#company-recalc').screenshot(path=str(ART / f'company-recalc-{width}.png'))
    page.locator('#company-recalc-cancel').click()
    assert snapshot(everything=True) == initial and copy() == imported_copy
    expect(page.locator('#undo-round')).to_be_hidden()
    recalc_open()
    page.locator('#company-recalc-all').click()
    assert page.locator('[data-recalc-item]:checked').count() == 4
    assert len(page.locator('[data-recalc-result]').all()) == 5
    confirm_recalc()
    assert all(mode(id) == 'auto' and adopt(id) == '' for id in ['materials', 'removal', 'protection', 'overhead'])
    assert all(mode(id) == 'manual' for id in ['labor', 'shipping', 'custom_1'])
    expect(page.locator('#company-recalc-none')).to_be_visible()
    page.locator('#undo-round').click()
    assert snapshot(everything=True) == initial

    # Release one, verify the other adopted values, then check exact undo.
    check('materials')
    assert confirm_recalc()[0] == '617,423円'
    assert mode('materials') == 'auto' and adopt('materials') == ''
    assert mode('overhead') == 'manual' and adopt('overhead') == '82000'
    assert adopt('removal') == adopt('protection') == '0'
    expect(page.locator('#overhead-warning')).to_be_visible()
    page.locator('#undo-round').click()
    assert snapshot(everything=True) == initial
    expect(page.locator('#undo-round')).to_be_hidden()

    # Releasing overhead makes it follow the new subtotal, with the imported extra included.
    check('materials', 'overhead')
    assert confirm_recalc()[0] == '587,545.9円'
    assert mode('overhead') == 'auto' and adopt('overhead') == ''
    expect(page.locator('#subtotal')).to_have_text('521,229円')
    expect(page.locator('#adoption-state-materials')).to_have_text('自動計算')
    after_recalc = snapshot(everything=True)

    check('removal')
    expect(page.locator('[data-recalc-result="overhead"] th')).to_have_text('諸経費（連動分）')
    assert recalc_amounts('overhead') == ['52,122.9円', '54,028.9円', '＋1,906円']
    page.locator('#company-recalc-cancel').click()
    assert snapshot(everything=True) == after_recalc
    expect(page.locator('#undo-round')).to_have_text('再計算前に戻す')
    page.locator('#round-standard').click()
    expect(page.locator('#undo-round')).to_have_text('調整前に戻す')
    expect(page.locator('#adoption-state-materials')).to_have_text('端数調整済み')
    expect(page.locator('#booked-materials')).to_have_text('26,600円')
    assert mode('overhead') == 'rounded'
    page.locator('#undo-round').click()
    assert snapshot(everything=True) == after_recalc
    expect(page.locator('#undo-round')).to_be_hidden()

    # Edits while a choice is staged refresh its preview. Ordinary edits still flow into auto rows.
    check('removal')
    prior_preview = recalc_amounts('total')
    fill('parts', '510123')
    assert recalc_amounts('total') != prior_preview
    expect(page.locator('#booked-materials')).to_have_text('25,506.15円')
    page.locator('#company-recalc-cancel').click()
    assert adopt('removal') == '0'
    page.locator('details.settings').evaluate('panel=>panel.open=true')
    fill('materialsRate', '6.25')
    expect(page.locator('#booked-materials')).to_have_text('31,882.6875円')
    fill('overheadRate', '12.5')
    fill('adopt-shipping', '0')
    expect(page.locator('#adoption-state-shipping')).to_have_text('手動固定')
    assert adopt('shipping') == '0' and adopt('custom_1') == '12345'
    mixed = snapshot()
    mixed_copy = copy()
    page.locator('#round-standard').click()
    assert adopt('materials') == '31800' and adopt('shipping') == '0'
    assert adopt('removal') == adopt('protection') == '0' and adopt('custom_1') == '12345'
    assert mode('overhead') == 'rounded'
    page.locator('#round-held summary').click()
    expect(page.locator('#round-held-items')).to_contain_text('部品送料・運搬交通費 · 手動固定')
    expect(page.locator('#round-held-items')).to_contain_text('撤去品引取費 · 明細なし・0円固定')
    expect(page.locator('#round-held-items')).to_contain_text('養生・安全対策費 · 取込の0円を固定中')
    rounded = snapshot(restored=True)
    rounded_copy = copy()
    assert '端数調整あり' in rounded_copy
    restore(rounded_copy)
    assert snapshot() == rounded and copy() == rounded_copy
    restore(imported_copy)
    assert snapshot() == imported
    assert [adopt(id) for id in ['materials', 'removal', 'protection', 'overhead']] == ['32100', '0', '0', '82000']
    assert copy() == imported_copy
    restore(mixed_copy)
    assert snapshot() == mixed and copy() == mixed_copy

    # Insert at the start, between rows, and at the end. New positions preserve existing fields.
    imported_extra = snapshot()['rows'][-2]
    page.locator('#add-custom-item').click()
    expect(page.locator('#custom-name-custom_2')).to_be_focused()
    assert order()[-3:] == ['custom_1', 'custom_2', 'overhead']
    fill('custom-name-custom_2', '既存の追加費')
    fill('custom-amount-custom_2', '1200')
    fill('adopt-custom_2', '0')
    page.locator('#detail-custom_2').evaluate('panel=>panel.open=true')
    fill('memo-custom_2', '維持するメモ')
    page.locator('#edit-items').click()
    assert page.locator('[data-insert-before]').count() == len(order()) + 1

    def insert(before, id, tap=False):
        before_total = text('grand-total')
        button = page.locator(f'[data-insert-before="{before}"]')
        if tap:
            assert button.bounding_box()['height'] >= 44
            button.tap()
        else:
            button.click()
        expect(page.locator('#custom-name-' + id)).to_be_focused()
        assert text('grand-total') == before_total
        assert page.locator('#tag-' + id).input_value() == 'other'

    insert('parts', 'custom_3')
    assert order()[0:2] == ['custom_3', 'parts']
    fill('custom-name-custom_3', '先頭の追加費')
    fill('custom-amount-custom_3', '1000')
    insert('materials', 'custom_4', tap=True)
    assert order()[order().index('labor')+1:order().index('materials')] == ['custom_4']
    fill('custom-name-custom_4', '宿泊費')
    fill('custom-amount-custom_4', '25000')
    expect(page.locator('#welfare')).to_have_text('14,194円')
    insert('', 'custom_5', tap=True)
    assert order()[-2:] == ['overhead', 'custom_5']
    fill('custom-name-custom_5', '追加の交換作業')
    fill('custom-amount-custom_5', '18000')
    page.locator('#tag-custom_5').select_option('labor')
    expect(page.locator('#welfare')).to_have_text('17,130円')
    insert('custom_5', 'custom_6')
    assert order()[-3:] == ['overhead', 'custom_6', 'custom_5']
    page.locator('[data-remove-custom="custom_6"]').click()
    assert order()[-2:] == ['overhead', 'custom_5']
    before_move = text('grand-total')
    page.locator('[data-move-item="custom_5"][data-direction="-1"]').click()
    assert mode('overhead') == 'auto' and text('grand-total') == before_move
    assert page.locator('#tag-custom_5').input_value() == 'labor'
    page.locator('[data-move-item="custom_5"][data-direction="1"]').click()
    assert order()[-1] == 'custom_5'
    expect(page.locator('#booked-overhead')).to_have_text('85,668.8359375円')
    assert next(row for row in snapshot()['rows'] if row[0]=='試運転調整費') == imported_extra
    page.locator('#edit-items').click()
    assert page.locator('[data-insert-before]').count() == 0
    expect(page.locator('#add-custom-item')).to_be_visible()
    arranged = snapshot()
    memo = copy()
    assert '内訳：追加1=' in memo and memo.endswith('追加5=18,000')
    restore(memo)
    assert snapshot() == arranged and copy() == memo

    # A reordered memo can hold a left-over fixed row and a linked expense at once.
    fill('adopt-materials', '33000')
    restore(copy(), proportional=True)
    assert mode('materials') == 'linked' and mode('overhead') == 'auto'
    assert mode('shipping') == 'manual' and adopt('shipping') == '0'
    expect(page.locator('#link-help-materials')).to_contain_text('引継掛率で連動')
    linked = snapshot()
    linked_copy = copy()
    assert '連動：資材33,000/510,123' in linked_copy
    restore(linked_copy)
    assert snapshot() == linked and copy() == linked_copy

    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.evaluate('localStorage.length+sessionStorage.length') == 0 and context.cookies() == []
    assert all(url.startswith(BASE) or url.startswith('blob:') for url in requests)
    assert not errors, errors
    browser.close()
    print('PASS: 取込額と0円の由来・個別/一括選択・金額プレビュー/確定/キャンセル・共通取消・端数保護・挿入/移動/削除/タグ・簡易復元/互換性・スマホ')
