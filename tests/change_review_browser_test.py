"""Review indicators distinguish intentional rounding from larger adopted changes."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ART = Path('/tmp/estimate-verification'); ART.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:8000'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1100},
        permissions=['clipboard-read', 'clipboard-write'])
    page = context.new_page(); page.set_default_timeout(7000)
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.on('request', lambda request: requests.append(request.url))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(BASE); page.wait_for_load_state('networkidle')

    def fill(id, value):
        page.locator('#' + id).focus(); page.locator('#' + id).fill(value)

    def card(id):
        return page.locator('#changes [data-item-id="' + id + '"]')

    def check(id, review):
        expect(card(id)).to_have_count(1)
        assert ('needs-review' in card(id).get_attribute('class')) == review, (id, review)
        assert card(id).locator('.review-badge').count() == int(review)

    def snapshot():
        return page.evaluate("""() => ({
          amounts: ['grand-total','subtotal','booked-overhead','welfare','standard-total']
            .map(id=>document.getElementById(id).textContent),
          changes: [...document.querySelectorAll('#changes .change-card')]
            .map(el=>[el.dataset.itemId,el.textContent,el.className])
        })""")

    # Nothing is added to the clean initial view.
    expect(page.locator('#review-guide')).to_be_hidden()
    expect(page.locator('#changes')).to_contain_text('標準設定からの変更はありません')
    assert page.locator('.needs-review').count() == 0

    # Both signs, exact boundaries and displayed percentage rounding.
    page.locator('#add-custom-item').click()
    fill('custom-name-custom_1', '追加作業費')
    for standard, adopted, review in [
        ('1550', '1500', False), ('1550', '1400', True),
        ('10000', '10100', True), ('10000', '9900', True),
        ('10000', '10099.99', False), ('10000', '9900.01', False),
        ('100000', '99900', False),
        ('1000000', '1001000', False), ('1000000', '1010000', True),
        ('1000000', '990000', True), ('1000000', '990000.01', False),
        ('0', '99.99', False), ('0', '100', True),
    ]:
        fill('custom-amount-custom_1', standard); fill('adopt-custom_1', adopted)
        check('custom_1', review)
    expect(card('custom_1').locator('.review-badge')).to_have_text('標準額0円・要確認')
    assert 'NaN' not in card('custom_1').inner_text()
    fill('adopt-custom_1', '0'); expect(card('custom_1')).to_have_count(0)
    expect(page.locator('#review-guide')).to_be_hidden()

    # Re-evaluate the current standard immediately; explicit adoption stays fixed.
    page.locator('#reset').click()
    fill('parts', '850000'); fill('workers', '6'); fill('shipping', '20000')
    assert page.locator('#grand-total').inner_text() == '1,516,476円'
    fill('adopt-materials', '70000'); fill('memo-materials', '現場条件を考慮')
    check('materials', True)
    expect(card('materials').locator('.review-badge')).to_have_text('標準比＋64.7％・要確認')
    assert page.locator('#grand-total').inner_text() == '1,546,726円'
    assert page.locator('#total-diff').inner_text() == '＋30,250円'
    fill('adopt-materials', '40000'); check('materials', True)
    expect(card('materials').locator('.review-badge')).to_have_text('標準比－5.9％・要確認')
    page.locator('details.settings').evaluate('(el)=>el.open=true')
    fill('materialsRate', '5')
    fill('parts', '800000'); expect(card('materials')).to_have_count(0)
    assert page.locator('#booked-materials').inner_text() == '40,000円'
    fill('parts', '850000'); check('materials', True)
    # Invalid edits prioritize the existing validation and disable exports.
    fill('workers', '-1')
    assert page.locator('.needs-review').count() == 0
    expect(page.locator('#validation-banner')).to_be_visible()
    expect(page.locator('#copy-text')).to_be_disabled()
    fill('workers', '6'); check('materials', True)
    # Rounding preserves the fixed correction and its review indicator; undo restores the rest.
    before = snapshot()
    page.locator('#round-standard').click()
    check('materials', True)
    page.locator('#undo-round').click(); assert snapshot() == before

    # Automatic rounding of small values creates blue cards, even above 1%.
    page.locator('#reset').click(); fill('parts', '1550')
    page.locator('#round-standard').click()
    assert page.locator('#changes .change-card').count() > 0
    assert page.locator('.needs-review').count() == 0
    assert page.locator('#booked-parts').inner_text() == '1,550円'
    # Changes only to rates remain in the separate settings list.
    page.locator('#reset').click(); fill('parts', '850000')
    page.locator('details.settings').evaluate('(el)=>el.open=true'); fill('materialsRate', '9')
    expect(page.locator('#setting-changes')).to_be_visible()
    assert page.locator('#changes .change-card').count() == 0
    expect(page.locator('#review-guide')).to_be_hidden()

    # Same-name custom rows are independent; tags/order affect the existing formulas only.
    page.locator('#reset').click()
    name = '追加作業費（業者別の確認用・試運転調整を含む）'
    for number, standard, adopted in [(1, '10000', '15000'), (2, '1550', '1500')]:
        page.locator('#add-custom-item').click()
        fill('custom-name-custom_' + str(number), name)
        fill('custom-amount-custom_' + str(number), standard)
        fill('adopt-custom_' + str(number), adopted)
    fill('memo-custom_1', '現場条件を考慮して追加')
    check('custom_1', True); check('custom_2', False)
    page.locator('#edit-items').click(); page.locator('#tag-custom_1').select_option('labor')
    assert page.locator('#welfare').inner_text() == '2,447円'
    before = snapshot()
    page.locator('[data-move-item="custom_2"][data-direction="-1"]').click()
    after = snapshot()
    assert before['amounts'] == after['amounts']
    assert [change[0] for change in after['changes']] == ['custom_2', 'custom_1']
    check('custom_1', True); check('custom_2', False)

    # PC and phone headers, badges and long labels wrap without horizontal scrolling.
    panel = page.locator('section[aria-labelledby="changes-title"]')
    red_color = card('custom_1').evaluate('el=>getComputedStyle(el).borderLeftColor')
    normal_color = card('custom_2').evaluate('el=>getComputedStyle(el).borderLeftColor')
    assert red_color != normal_color
    for width in [1440, 768, 390, 320]:
        page.set_viewport_size({'width': width, 'height': 1100})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), width
        expect(card('custom_1').locator('.review-badge')).to_be_visible()
        if width in [1440, 390]: panel.screenshot(path=str(ART / f'change-review-{width}.png'))

    # Review styling never changes plain-text output or the imported values/order.
    page.locator('#copy-text').click()
    expect(page.locator('#notice')).to_have_text('結果をコピーしました')
    detailed = page.evaluate('navigator.clipboard.readText()')
    assert '現場条件を考慮して追加' in detailed and '出力日時：' in detailed
    assert '要確認' not in detailed and '赤枠' not in detailed
    page.locator('#copy-simple').click()
    expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
    compact = page.evaluate('navigator.clipboard.readText()')
    assert '要確認' not in compact and '赤枠' not in compact
    before = snapshot()
    page.locator('#import-panel').evaluate('(el)=>el.open=true'); fill('import-text', compact)
    page.locator('#import-proportional').uncheck(); page.locator('#check-import').click()
    expect(page.locator('#import-preview')).to_be_visible(); page.locator('#apply-import').click()
    after = snapshot()
    assert after['amounts'] == before['amounts'], (before, after)
    # Imported custom rows receive fresh IDs in their restored display order.
    assert [row[1:] for row in after['changes']] == [row[1:] for row in before['changes']], (before, after)

    page.locator('#reset').click()
    assert page.locator('#changes .change-card').count() == 0
    expect(page.locator('#review-guide')).to_be_hidden()
    fill('adopt-materials', '100'); check('materials', True)
    page.reload(); assert page.locator('.needs-review').count() == 0
    assert page.locator('#adopt-materials').input_value() == ''
    assert page.evaluate('localStorage.length+sessionStorage.length') == 0
    assert context.cookies() == []
    assert all(url.startswith(BASE) or url.startswith('blob:') for url in requests)
    assert not errors, errors
    browser.close()
    print('PASS: 赤枠/端数除外・正負と境界・基準0・現在標準への追従・入力エラー・丸め取消・設定差分・同名追加/タグ/順序・PC/スマホ・出力/復元/通信/リセット')
