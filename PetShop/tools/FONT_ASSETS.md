# 店铺字体资产

玩家端正常文字由 `ShopTypography.ts` 绑定真实字体资产；标题使用 Noto Serif CJK SC Bold，正文使用 Noto Sans CJK SC Regular / Bold。所有字重均为独立静态 TTF，不使用 Label 模拟粗体。

三份文件位于 `assets/resources/fonts`。来源锁定到 Noto CJK 官方仓库提交 `f8d157532fbfaeda587e826d4cd5b21a49186f7c`：Sans 2.004、Serif 2.003。该目录的 `font-sources.json` 记录原始下载地址、原始文件 SHA-256、实际导入资产 SHA-256 和处理方法；两份 OFL 许可随包保留。

生成方法：使用 fonttools 4.68.0 的 `varLib.instancer.instantiateVariableFont`，对官方 SC 可变 TTF 分别固定 `wght=400` / `wght=700`，保存静态字体；静态样式名设为 Regular / Bold。保留原始 Unicode 映射，Sans 每份 44,810 个、Serif 44,777 个字符，未按当前页面裁剪。检查样字包含「芋头、臻选、绒光、𠮷、S+、#、%」及英文数字。

原始资源合计 78,841,560 字节（约 75.2 MiB）。账号网页正式打包时将三份完整字体转为 WOFF2，核对字符映射、轮廓、字距与排版表。字体内容、覆盖范围和字重仍与 Cocos 原始资产相同。离线及其他原始 Cocos 构建继续使用 TTF。

账号网页依次显示 Cocos 标题、开场和登录页。验证账号后才下载游戏字体与店铺音效，字体就绪后显示游戏。无账号入口的 Cocos 构建在进入店铺前等待字体。Cocos 3.8.8 的 TTF 加载器可能提前报告完成，代码通过 `document.fonts.load` 核对三个实际字体，等待上限 90 秒，失败时显示通用重试。网页 WOFF2 字体使用可直接写入 Canvas `font` 的名称，包含字母前缀并替换文件名中的句点。浏览器登录验收同时核验 Canvas 是否接受三套字体的配置字号。引擎升级时需要重新核验命名与下载器。

验证证据见 `output/new-design-validation-20261120/fonts.json` 及对应的真实 Cocos UI 检查；本轮验收范围是 Windows Web Mobile 构建，微信／原生宿主与手机真机尚未验收。
