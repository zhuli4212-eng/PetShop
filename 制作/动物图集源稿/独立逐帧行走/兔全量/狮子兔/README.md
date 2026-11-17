# 狮子兔四帧跳跃

每个资源键对应一只狮子兔的毛色、性别和年龄。八张 ImageGen 母稿各绘三行四列，三行分别对应三只同年龄、同性别的兔，每行的四幅是这只兔的一个完整循环。图鉴里本年龄的立绘是这次作画的唯一外形参考。毛色顺序和每行原始立绘路径见 [references.json](references.json)，逐张提示词见 [prompts.json](prompts.json)。

## 原稿与成品

| 目录 | 内容 |
| --- | --- |
| `references/` | 本年龄真实立绘的参考板。每张纵向三行，顺序对应母图三行。 |
| `masters/` | 内置 ImageGen 生成的透明原始母图。 |
| `adult/`、`young/` | 每个身份一张 384 × 96 透明 PNG，行内顺序为蓄力、蹬地、腾空、前掌着地。 |

`proof-adult-male.png`、`proof-adult-female.png`、`proof-young-male.png`、`proof-young-female.png` 各把六种毛色的正式立绘与四个动作帧放在同一基线，以 2 倍像素倍率查看。

## 复现

在本目录运行 `python references.py` 可从正式立绘重建参考板。保留的 `masters/` 是导出的输入，运行 `python export.py` 可重建两组动作条和逐帧检查图。脚本用 Pillow、NumPy 和 OpenCV 将十二个已画好的完整姿势分割出来，清理透明边缘，每只兔四个姿势使用同一等比倍率，按身体位置作整帧平移。地面在 y=89，第三帧的脚底成年在 y=81、幼年在 y=83，房间贴图已包含腾空高度。

运行 `python verify.py` 核对资源键、尺寸、足底、四帧轮廓、各年龄体量和图像去重。美术检查需结合母图和并排检查图看清后脚蹬直、腹下收足和前掌承重，尤其注意黑色脚掌和深色鬃毛的轮廓。
