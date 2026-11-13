"""CAT identity, footer version, manifest/icons, and project-path compatibility."""
from pathlib import Path
import json,os,struct
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('CAT_TEST_BASE','http://127.0.0.1:8000/').rstrip('/')+'/'
ART=Path('/tmp/estimate-verification');ART.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':1440,'height':1000},permissions=['clipboard-read','clipboard-write'],accept_downloads=True)
 page=ctx.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.on('request',lambda r:requests.append(r.url))
 page.goto(BASE);page.wait_for_load_state('networkidle')
 assert page.title()=='CAT'
 expect(page.locator('h1')).to_have_text('CAT')
 assert 'Calculation Assistant Tool' in page.locator('.brand').inner_text()
 expect(page.locator('#app-version')).to_have_text('v1.0.0')
 assert page.locator('meta[name="application-name"]').get_attribute('content')=='CAT'
 assert page.locator('meta[name="apple-mobile-web-app-title"]').get_attribute('content')=='CAT'
 assert 'NekoAssist' not in page.locator('body').inner_text()
 # Browser parses the manifest at a /test/ subpath, as it does on GitHub Pages.
 session=ctx.new_cdp_session(page)
 result=session.send('Page.getAppManifest')
 assert not result.get('errors'),result
 manifest=json.loads(result['data'])
 assert manifest['name']==manifest['short_name']=='CAT'
 assert result['url']==BASE+'manifest.webmanifest?v=1'
 from urllib.parse import urljoin
 for key in ['id','start_url','scope']:assert urljoin(result['url'],manifest[key])==BASE
 assert manifest['display']=='standalone'
 icon=manifest['icons'][1]
 assert manifest['icons'][0]['sizes']=='192x192'
 assert urljoin(result['url'],icon['src'])==BASE+'assets/cat-icon.png?v=1'
 # The generated cat is packaged at actual standard icon dimensions.
 assert page.locator('link[rel="icon"]').get_attribute('href')=='assets/cat-favicon.png?v=1'
 assert page.locator('link[rel="apple-touch-icon"]').get_attribute('href')=='assets/cat-apple-touch-icon.png?v=1'
 assert page.locator('.brand-icon').evaluate('el=>el.complete&&el.naturalWidth===192&&el.naturalHeight===192')
 assert icon['sizes']=='512x512'
 for name,size in [('cat-favicon.png',32),('cat-apple-touch-icon.png',180),('cat-icon-192.png',192),('cat-icon.png',512)]:
  raw=(Path(__file__).resolve().parents[1]/'assets'/name).read_bytes()
  assert raw[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',raw[16:24])==(size,size)
 before=len(requests)
 for width in [1440,768,390,320]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  assert page.locator('.app-fullname').is_visible()
  assert page.locator('#app-version').is_visible()
  if width in [1440,390]:
   page.locator('.page-heading').screenshot(path=str(ART/f'cat-heading-{width}.png'))
   page.locator('footer').screenshot(path=str(ART/f'cat-version-{width}.png'))
 # No remote requests or input storage are introduced by metadata/assets.
 for id,value in [('parts','850000'),('workers','6'),('shipping','20000')]:page.locator('#'+id).fill(value)
 assert page.locator('#grand-total').inner_text()=='1,516,476円'
 # Both old NekoAssist v1 and compact copies keep their original data formats.
 legacy=page.evaluate("""() => {const p=Object.fromEntries(Object.entries({...Estimate.defaults,parts:'850000',workers:'6',shipping:'20000'}).map(([id,n])=>[id,Estimate.decimal(n)]));return EstimatePortable.encodeV1({p,extraItems:[],memos:{},...Estimate.calculate(p,{},'auto')},'日時','auto',false);} """)
 assert legacy.startswith('NekoAssist 簡易シート v1')
 page.locator('#import-panel').evaluate('(el)=>el.open=true');page.locator('#import-text').fill(legacy)
 page.locator('#check-import').click();expect(page.locator('#import-preview')).to_be_visible()
 page.locator('#apply-import').click();assert page.locator('#grand-total').inner_text()=='1,516,476円'
 page.locator('#copy-simple').click();expect(page.locator('#notice')).to_contain_text('簡易版をコピーしました')
 assert page.evaluate('navigator.clipboard.readText()').startswith('見積1,516,476円')
 with page.expect_download() as download:page.locator('#save-image').click()
 download.value.save_as(ART/'cat-result.png')
 assert (ART/'cat-result.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
 assert page.evaluate('localStorage.length+sessionStorage.length')==0
 assert page.evaluate("'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(r=>r.length) : 0")==0
 assert ctx.cookies()==[]
 assert all(url.startswith(BASE) or url.startswith('blob:') for url in requests[before:]),requests
 assert not errors,errors
 # Installability observations are recorded for debugging; home-screen bookmarks do not require a service worker.
 installability=session.send('Page.getInstallabilityErrors')
 (ART/'cat-installability.json').write_text(json.dumps(installability,ensure_ascii=False))
 assert not any('icon' in item['errorId'] for item in installability.get('installabilityErrors',[])),installability
 print('PASS: CATタブ/画面名・正式名称・更新番号・manifestと猫アイコン・/test/相対パス・PC/スマホ幅・旧メモ復元・コピー/PNG・通信/保存なし')
 b.close()
