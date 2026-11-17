# 狗的侧卧静帧

四张 `*-generated.png` 是 ImageGen 输出的原始透明母稿，每张三列四行。前两行为母犬，第 3、4 行为公犬。每两行依次对应图鉴的 01 至 06 号花色。生成时使用的完整英文提示保存在 `generation-prompts.json`。

每张 `*-catalogue.png` 使用游戏里该品种的十二张站姿原图。`*-pose.png` 对照已确认的侧卧姿势。柴犬、柯基、腊肠各用本品种原侧卧图；贵宾参照柯基的头部贴地位置，卷毛造型、垂耳、圆尾和花色来自贵宾图鉴。

在本目录运行 `python -B catalogue.py` 可重新生成参考板。运行 `python -B export_dogs.py` 会从现存母稿导出 45 张资源至 `PetShop/assets/resources/pets`，并更新四张 `*-review.png`。需要 Pillow、NumPy 与 OpenCV。脚本只生成 PNG，文件名按游戏物种、花色、性别命名。

导出宽度按品种和公母分别标定。每张画布 96 × 64，最下面一行有色像素为 y = 58。复用的三张原侧卧图为赤色公柴犬、赤白母柯基和黑褐母腊肠，对照板内标有 `original`。
