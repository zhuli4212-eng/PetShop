from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(r'D:\work\宠物店')
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
    page=b.new_page(viewport={'width':1050,'height':620},device_scale_factor=1)
    page.goto((root/'制作'/'首批美术资源-v2.html').as_uri())
    page.screenshot(path=str(root/'制作'/'美术源稿-v2'/'首批资源核验.png'),full_page=True)
    print(page.locator('img').evaluate_all('(els)=>els.every(e=>e.complete && e.naturalWidth>0)'))
    b.close()
