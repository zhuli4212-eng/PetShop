# 首批美术资源 v2
日期：2026-11-14。状态：首批独立透明 PNG 已制作，未接入预览或游戏，未上传云端、未提交 Git。

## 目录与制作基准
Codex 侧栏“宠物店”项目根为 D:\work\宠物店。美术确认稿/素材 是现有 build_screens.py 读取的素材目录；手机预览/dist 是发布导出，不放源素材。本批不运行构建器、不改模板或玩法源码。
实际观看模块总览、ui-show、lamp；依照 制作规范与预览差异-v2.0 第5节：深绿 #214b42 / 奶油 #fff0ce / 黄铜 #c39b5c / 暖木 #664a30，方角像素风。
已存在 144 张动物图、场景、人物、台灯/矮篱及基础 UI 图标，本批不重复生成，不扩动作。

## 本批文件
|文件|用途|像素尺寸/格式|大小|建议显示|
|---|---|---|---|---|
|trophy-gold-v2.png|金奖杯视觉母型；私/公开赛复用，赛事名由文字层显示|1254×1254 RGBA|772054 B|64/128 px|
|collection-book-v2.png|独立奖杯收集册；封面为奖杯，不能替代动物档案|1254×1254 RGBA|944692 B|64/128 px|
|item-trait-review-v2.png|特征复评单：夹板、放大镜、爪印|1254×1254 RGBA|805535 B|64/128 px|
|item-breeding-guidance-v2.png|选育指导单：谱系图、纸卷、封签|1254×1254 RGBA|913373 B|64/128 px|

美术确认稿/素材 内为新增文件。制作/美术源稿-v2 内有同名保留副本。本批是高分辨率像素风母图，不宣称已经完成严格 64×64 像素网格的发布压缩。后续正式集成前需导出小图并核对细节、边缘和包体。不改动画，不带旧店名或嵌入数值。

## 验证及限制
- 四文件均读取成功，RGBA，alpha 最小0最大255，真实透明背景。
- 已逐张观看生成输出；金杯再次从项目路径读取确认；题材、颜色、剪影与预览暖木/深绿/黄铜方向一致。
- 未声称与现有32px ui图标像素密度完全一致。小尺寸观感尚须验收；新图细节略丰富。
- 制作/首批美术资源-v2.html 提供 160/64/32 px 和深浅底对比，不是游戏预览。
- 本机 Edge 无头核验启动退出（TargetClosedError / crashpad管道错误），未生成小尺寸截图，不把失败写成通过。verify_assets.py 留作复验。
- 不使用任何现有旧名称；母图无文字，中文名称由界面文字层提供。

## 后续优先级与复用
P0：以金杯母型补铜、银、纪念、桂冠四档；私赛用铜银金，公开赛用五档，同档跨赛事复用，名称/次数/首次动物快照只做文字与现有动物图。
P1：补技能树分支/节点状态图标、订单难度/取消标识；优先复用现有ui-orders/ui-lab/coin，不为每个节点生一套图。锁定/可点/完成用同一边框状态。
P2：盆栽/地毯独立静态资源，复用台灯/矮篱；不要重绘主场景、不要自由摆放系统、不要扩死亡动作。
每批必须：透明检查 → 项目保存读取 → 64px识别 → 深浅底检查 → 现有11模块对照 → 再集成。生成完成不等于接入完成。

## 生成方式与提示词
使用内置 image_gen，一资产一次调用，没有 CLI/API 或付费服务设置变更。
共同约束：single isolated production sprite, true transparent background, no text/no watermark, warm cozy pet shop, stepped pixel outlines, green #214b42, cream #fff0ce, brass #c39b5c, walnut #664a30, roughly64×64 logical pixels, no animation.
金杯：one elegant brass two-handled cup, forest green ribbon, dark wood plinth, tiny paw emblem, centered full silhouette.
收集册：closed deep green leather album, brass corner brackets, cream page edges, gold trophy emblem (not animal ledger), three-quarter front.
复评单：cream sheet on walnut clipboard, brass magnifying glass over green paw; no syringe/potion/magic.
指导单：cream parchment scroll, green ribbon and brass seal, two parent paw symbols connected to one descendant paw, no letters.

