# 店铺字体资产

玩家端正常文字由 `ShopTypography.ts` 绑定真实字体资产；标题使用 Noto Serif CJK SC Bold，正文使用 Noto Sans CJK SC Regular / Bold。所有字重均为独立静态 TTF，不使用 Label 模拟粗体。

三份文件位于 `assets/resources/fonts`。来源锁定到 Noto CJK 官方仓库提交 `f8d157532fbfaeda587e826d4cd5b21a49186f7c`：Sans 2.004、Serif 2.003。该目录的 `font-sources.json` 记录原始下载地址、原始文件 SHA-256、实际导入资产 SHA-256 和处理方法；两份 OFL 许可随包保留。

生成方法：使用 fonttools 4.68.0 的 `varLib.instancer.instantiateVariableFont`，对官方 SC 可变 TTF 分别固定 `wght=400` / `wght=700`，保存静态字体；静态样式名设为 Regular / Bold。保留原始 Unicode 映射，Sans 每份 44,810 个、Serif 44,777 个字符，未按当前页面裁剪。检查样字包含「芋头、臻选、绒光、𠮷、S+、#、%」及英文数字。

资源合计 78,841,560 字节（约 75.2 MiB，压缩前）。本批优先固定字形及动态文字覆盖。发布前仍需在真实手机和移动网络验证加载开销；如需优化，采用另行验证的字体分包或完整覆盖方案，不能静默换回系统字体或裁掉昵称字形。

Web 启动时先加载三份字体，失败时显示明确的重试界面。Cocos 3.8.8 自带字体加载器超时 3 秒仍可能返回成功，因此代码另按其 TTF family 约定（从公开 nativeUrl 取文件名并加 `_LABEL`）调用 `document.fonts.load`，要求返回的 FontFace 非空且全部为 `loaded`；等待上限 90 秒。真实字体就绪前不进入游戏。引擎升级时需重新核验此 family 约定。预览 HTML 仅包含其固定文案的 WOFF2 子集，与游戏完整 TTF 区分记录。

验证证据见 `output/new-design-validation-20261120/fonts.json` 及对应的真实 Cocos UI 检查；本轮验收范围是 Windows Web Mobile 构建，微信／原生宿主与手机真机尚未验收。
