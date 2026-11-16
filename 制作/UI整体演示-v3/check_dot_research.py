"""Exercise the research page, including blocked states and the outcome query."""
import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
EDGE = Path(os.environ['ProgramFiles(x86)']) / 'Microsoft/Edge/Application/msedge.exe'


def verify(browser, width):
    preview = os.environ.get('RESEARCH_PREVIEW_URL') or (ROOT / ('手机预览/dist/ui-v3' if width==320 else '美术确认稿/UI整体演示-v3') / 'index.html').as_uri()
    page = browser.new_page(viewport={'width': width, 'height': 568 if width == 320 else 844},
                            is_mobile=True, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(path=Path(__file__).with_name('test_unlocked_shop.js'))
    page.goto(preview.split('#')[0] + '#research')
    app = page.locator('.dr-lab')
    dlg = app.locator('.dr-dialog')

    def tap(action, key=None):
        selector = f'[data-research="{action}"]'
        if key is not None:
            selector += f'[data-key="{key}"]'
        app.locator(selector).tap()

    def pick(scenario):
        panel = app.locator('.dr-examples')
        if panel.get_attribute('open') is None:
            panel.locator('summary').tap()
        tap('case', scenario)

    zero_gain = re.compile(r'^\+?0%$')

    def check_rank_table(values):
        dlg.locator('.dr-table summary').tap()
        rows = dlg.locator('tbody tr')
        expect(rows).to_have_count(11)
        for level,(bonus,value) in values.items():
            expect(rows.nth(level).locator('td').nth(0)).to_have_text(bonus)
            expect(rows.nth(level).locator('td').nth(1)).to_have_text(value)
        dlg.locator('.dr-table summary').tap()

    def check_example(first,second):
        benefit=dlg.locator('.dr-benefit')
        expect(benefit.locator('p')).to_contain_text(first)
        expect(benefit.locator('p')).to_contain_text(second)
        dims=benefit.bounding_box()
        actions=dlg.locator('.dr-fixed-actions').bounding_box()
        assert dims['y']+dims['height']<=actions['y']+1
        assert actions['y']+actions['height']<=page.viewport_size['height']+1

    value_row=app.locator('[data-research=node][data-key="2"]').inner_text()
    assert value_row.count('估价 200')==1 and value_row.count('43 → 44 金币')==1,value_row
    tap('node', 1)
    check_example('19.62%', '20.16%')
    expect(dlg.locator('.dr-benefit')).to_contain_text('0.54 个百分点')
    tap('review')
    check_example('19.62%', '20.16%')
    tap('close')
    tap('node', 0)
    expect(dlg.locator('.dr-compare b')).to_have_text(['+15%', '+20%'])
    check_example('11.5%','12%')
    check_rank_table({0:(zero_gain,'10%'),3:('+15%','11.5%'),4:('+20%','12%'),10:('+50%','15%')})
    tap('review')
    expect(dlg.locator('.dr-compare b')).to_have_text(['+15%', '+20%'])
    check_example('11.5%','12%')
    dlg.get_by_label('失败', exact=True).check()
    tap('submit')
    assert '研究未完成' in dlg.inner_text()
    tap('review')
    dlg.get_by_label('待确认', exact=True).check()
    tap('submit')
    tap('close')
    tap('node', 0)
    assert '研究结果待确认' in dlg.inner_text()
    tap('query')
    assert '3 → 4 级' in dlg.inner_text()
    tap('continue')
    assert '当前 · 4 级' in dlg.inner_text()
    tap('back')
    expect(app.locator('.dr-ledger-head')).to_contain_text('10 / 30 级')
    pick('prereq')
    tap('node', 0)
    assert dlg.locator('button:disabled').inner_text() == '前置不足'
    tap('prereq', 1)
    assert dlg.locator('#dr-title').inner_text() == '六维选育研究'
    expect(dlg.locator('.dr-compare b')).to_have_text([zero_gain, '+3%'])
    check_example('18%','18.54%')
    check_rank_table({0:(zero_gain,'18%'),3:('+9%','19.62%'),4:('+12%','20.16%'),10:('+30%','23.4%')})
    tap('back')
    assert dlg.locator('#dr-title').inner_text() == '稀有标签研究'
    tap('close')
    pick('funds')
    tap('node', 2)
    expect(dlg.locator('.dr-compare b')).to_have_text(['21.5%', '22%'])
    check_example('43','44')
    check_rank_table({0:('20%','40 金币'),3:('21.5%','43 金币'),4:('22%','44 金币'),10:('25%','50 金币')})
    assert dlg.locator('button:disabled').inner_text() == '金币不足'
    tap('close')
    pick('max')
    tap('node', 2)
    assert '25%' in dlg.inner_text() and not dlg.locator('[data-research=review]').count()
    tap('close')
    tap('species', '猫')
    tap('node', 1)
    assert dlg.locator('button:disabled').inner_text() == '房间未开放'
    tap('close')
    pick('normal')
    tap('node', 2)
    tap('review')
    assert '4,000 金币' in dlg.inner_text()
    check_example('43','44')
    tap('submit')
    expect(dlg.locator('.dr-success')).to_contain_text('44')
    tap('close')
    tap('species', '狗')
    assert '0 / 30' in app.locator('.dr-ledger-head').inner_text()
    tap('species', '兔')
    assert '30 / 30' in app.locator('.dr-ledger-head').inner_text()
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    assert not errors, errors
    print(f'{width}px: statuses, species isolation, prerequisites, ranks, mock submit and query passed')
    page.close()


if __name__ == '__main__':
    with sync_playwright() as playwright, playwright.chromium.launch(executable_path=str(EDGE)) as browser:
        for w in [320, 390]:
            verify(browser, w)
