"""Verify walking frames in the current all-in-one preview, including the first-day rabbit room."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PREVIEW = (ROOT / '美术确认稿/UI整体演示-v3/index.html').as_uri()


def check_room(page, name):
    frames = page.evaluate("""async () => {
      const actor=document.querySelector('.rb-resident[data-walker]');
      const cycle=actor.querySelector('.walk-cycle'),rest=actor.querySelector('.rest-sprite');
      const sheet=new Image();
      sheet.src=cycle.style.backgroundImage.match(/url\\(["']?(.*?)["']?\\)/)[1];
      await sheet.decode();
      if(sheet.naturalWidth!==384||sheet.naturalHeight!==96)throw Error('Invalid frame dimensions');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const poses=new Set();
      for(let i=0;i<4;i++){
        ctx.clearRect(0,0,96,96);
        ctx.drawImage(sheet,i*96,0,96,96,0,0,96,96);
        poses.add(canvas.toDataURL());
      }
      if(poses.size!==4)throw Error('Duplicate poses in the active sheet');
      const seen=new Set(), positions=new Set(), motions=new Set();
      const until=performance.now()+12000;
      while(performance.now()<until){
        motions.add(actor.dataset.gait);
        if(actor.dataset.gait==='walk'){
          const box=cycle.getBoundingClientRect();
          if(box.width<10||box.height<10||getComputedStyle(cycle).display==='none'||
              getComputedStyle(rest).visibility!=='hidden')throw Error('Walking frame is not visible');
          seen.add(cycle.style.backgroundPositionX);
          positions.add(actor.style.left);
        } else if(getComputedStyle(cycle).display!=='none'||getComputedStyle(rest).visibility==='hidden'){
          throw Error('Idle artwork is not visible');
        }
        if(seen.size===4&&positions.size>=5&&motions.size===2)break;
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
      return [seen.size,positions.size,motions.size];
    }""")
    assert frames[0] == 4 and frames[1] >= 5 and frames[2] == 2, (name, frames)
    print(name, '4 different pixel frames visible while walking; static pose at rest', flush=True)


if __name__ == '__main__':
    with sync_playwright() as pw, pw.chromium.launch(channel='msedge') as browser:
        page=browser.new_page(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
        errors=[]
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(PREVIEW+'#rooms')
        check_room(page,'经营兔房')
        page.locator('[data-room-filter=group]').select_option('已故')
        assert page.locator('.rb-resident small').count() and not page.locator('.walk-cycle').count()
        page.evaluate('saleState.coins=25000')
        for species in ('猫','狗'):
            page.locator(f'[data-species="{species}"]').tap()
            assert not page.locator('.rb-resident').count()
            for action in ('pack','pack-commit'):
                page.locator(f'[data-dot="{action}"]').tap()
            check_room(page,species+'房')
        assert not page.locator('.rb-resident[data-key=spring] .walk-cycle').count()
        page.select_option('#jump','firstday')
        page.locator('#home-extras [data-go=rabbitroom]').tap()
        check_room(page,'首日试养兔房')
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function("document.querySelector('[data-walker]').dataset.gait==='idle'")
        first=page.locator('[data-walker]').first
        start=first.bounding_box()
        page.wait_for_timeout(550)
        assert first.bounding_box()==start and not first.locator('.walk-cycle').is_visible()
        first.tap()
        assert page.url.endswith('#rabbitpet') and not page.locator('.walk-cycle').count()
        assert not errors, errors
