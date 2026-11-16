"""Check floor movement and sprite phases in the self-contained mobile preview."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PREVIEW = (ROOT / '美术确认稿/宠物店界面预览.html').as_uri()
EDGE = Path(os.environ['ProgramFiles(x86)']) / 'Microsoft/Edge/Application/msedge.exe'
SAMPLE = """() => [...document.querySelectorAll('[data-walker]')].map(el => {
  const art = el.querySelector('.walk-cycle');
  const r = el.getBoundingClientRect(), floor = el.parentElement.getBoundingClientRect();
  return {id:el.dataset.walker, gait:el.dataset.gait, x:el.style.left, y:el.style.top,
    visible:getComputedStyle(art).display!=='none', frame:art.style.backgroundPositionX,
    heading:el.style.getPropertyValue('--heading'),
    inside:r.left>=floor.left && r.right<=floor.right && r.top>=floor.top && r.bottom<=floor.bottom};
})"""


def main():
    with sync_playwright() as pw, pw.chromium.launch(executable_path=str(EDGE)) as browser:
        page = browser.new_page(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
        errors = []
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.clock.install()
        page.goto(PREVIEW)
        page.clock.pause_at(page.evaluate('new Date(Date.now()+1000).toISOString()'))
        for kind, count in [('店长',1),('兔',3),('猫',2),('狗',3)]:
            if kind == '兔':
                page.locator('.scene-target[data-v="rooms"]').tap()
            if kind in ('猫','狗'):
                page.locator(f'.room-sign[data-v="{kind}"]').tap()
            trace = {}
            for _ in range(90):
                for pose in page.evaluate(SAMPLE):
                    assert pose['inside'], (kind,pose)
                    assert pose['visible'] == (pose['gait']=='walk'), pose
                    trace.setdefault(pose['id'],[]).append(pose)
                page.clock.run_for(140)
            assert len(trace)==count
            for ident, poses in trace.items():
                assert {p['gait'] for p in poses}=={'walk','idle'}, ident
                assert len({p['x'] for p in poses})>8, ident
                assert len({p['frame'] for p in poses if p['visible']})==4, ident
                assert len({p['heading'] for p in poses})==2, ident
            print(kind, ','.join(trace), 'walk, idle, turn and 4 frames OK')
        # Media-query change events follow the browser compositor, so exercise
        # this on a real clock independently of the accelerated route samples.
        real=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
        real.goto(PREVIEW)
        resting=real.evaluate(SAMPLE)
        real.wait_for_timeout(700)
        assert resting==real.evaluate(SAMPLE) and resting[0]['gait']=='idle'
        real.emulate_media(reduced_motion='no-preference')
        real.wait_for_function("document.querySelector('[data-walker]').dataset.gait==='walk'")
        real.emulate_media(reduced_motion='reduce')
        real.wait_for_function("document.querySelector('[data-walker]').dataset.gait==='idle'")
        stopped=real.evaluate(SAMPLE)
        real.wait_for_timeout(700)
        assert stopped==real.evaluate(SAMPLE)
        assert not errors,errors


if __name__=='__main__':
    main()
