# 宠物店

Cocos Creator 3.8.8 的 2D 项目。主场景在 `assets/scenes/ShopMain.scene`，本地店铺服务在 `server/main.mjs`。

界面的构图、原画和控件样式对照[已确认的像素预览](../美术确认稿/UI整体演示-v3/index.html)。首页侧门和页脚「进入兔房」都打开动物房间。上方门牌切换物种，房景下方是本房的完整名册，可用「状态」和「成长状态」两个下拉框组合筛选。操作提示出现在游戏顶部的标题栏下方。正式游戏显示当前经营档的动物、研究等级和报价。

## 开始游戏

电脑双击 `启动宠物店.cmd`，手机浏览器打开[云端经营版](https://petshop-cloud-play.zhuli4212.chatgpt.site/)。两台设备登录同一 ChatGPT 账号即可继续经营同一家店。首次部署时已复制当时的本机存档，日常经营以云端存档为准。

需要继续旧的本机进度或离线测试时，在 Windows 上双击 `start-offline.cmd`。这个入口启动或复用 `127.0.0.1:17888` 的本机服务，独立保存进度。点场景物件进入功能，功能内点返回回店铺。档案、核价等操作窗点返回回到发起功能。报价中的「修改选择」可以继续编辑原先勾选的动物。[完整返回规则](../设计定稿/界面层级与返回逻辑-v1.0.md)

## 异地多人试玩

每位玩家在这个服务器上单独开店。新玩家先点「注册」，输入账号名后进入自己的店。老玩家在「登录」输入原名即可续玩；知道账号名的人也可以进入这家店。游戏里的「账号 → 切换多人账号」可退出当前登录。

1. 开服电脑需要 Node.js 24 和 Cloudflare 的 `cloudflared`。这台电脑已装好两者。新电脑可从 [Cloudflare 官方下载页](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) 安装并把 `cloudflared` 加入 PATH，也可以设置 `CLOUDFLARED` 指向可执行文件。
2. 双击 `启动多人试玩服.cmd`，等窗口出现「异地试玩地址」。将这个完整的 HTTPS 网址发给玩家，电脑浏览器也用同一个网址登录。当前地址同时写入 `local/multiplayer/试玩地址.url`。保持开服电脑联网、唤醒和运行。
3. 结束时在窗口按 Ctrl+C，或双击 `停止多人试玩服.cmd`。再次开服时将新网址发给玩家，账号和进度继续保存在这台电脑。临时入口适用于试玩，重开会更换地址。[Cloudflare 临时隧道说明](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

多人数据保存在 `local/multiplayer/multiplayer.sqlite`。备份时先停服，再复制整个 `local/multiplayer` 目录；换机时还原此目录。个人云端店铺和 `local/local_sim` 的离线档各有独立入口。

需要固定域名时，将 HTTPS 反向代理或固定隧道指向 `http://127.0.0.1:17889`，给服务设置 `PUBLIC_ORIGIN=https://你的实际域名`，再运行 `node server/multiplayer.mjs`。单机开发可不设 `PUBLIC_ORIGIN`，直接运行同一命令后打开 `http://127.0.0.1:17889/`。通过 `MULTIPLAYER_PORT` 和 `MULTIPLAYER_DATA_DIR` 可单独指定端口及数据目录。

## 在编辑器里开发

在工程目录运行 `.\启动宠物店.cmd --editor`，按同样的顺序启动服务和编辑器。按 Cocos 的预览按钮即可测试改动；Canvas 上的 ShopMain 组件可以指定其他店铺服务器地址。

本地游戏使用 Web Mobile 构建。首次检出工程或改动客户端后，在工程根目录用 PowerShell 构建，然后双击 `start-offline.cmd`。

```powershell
& 'D:\app\CocosCreator\3.8.8\CocosCreator.exe' --project (Get-Location).Path --build ('configPath=' + (Resolve-Path 'tools/build-web-mobile.json').Path)
```

## 开店与经营

新店有 680 金币、兔房和一对成年安哥拉兔。点绿色签到簿可领当天的一公一母两只基础幼兔。点兔房侧门查看名册，或从繁育台选种。兔、猫、狗一窝分别等待 2、7、10 分钟；关掉游戏仍按服务器时间成长。繁育后亲本保留在房间。

订单夹、天平、来客簿和研究所回收窗口均可勾选多只，核对逐只报价和合计后成交。研究所还提供幼体货架、复评、选育指导及分物种技能树。布料箱可以购置、摆出或收起四种装饰。奖杯架提供私人赛及本地模拟公开赛，报名后可以继续经营，结果按比赛日程结算。用于本地轮换的赛历起点是北京时间 2026 年 11 月 9 日 20:00。

## 存档与联调

服务器将本机经营档保存在 `local/local_sim/shop.json`，滚动备份在同目录的 `backups`。账户身份、动物、金币、经营事件和成功操作回执随档保存。重新打开游戏会读取同一个档；设备时间回拨时按最后保存的经营时间继续。账号入口可以查看店主编号和经营账簿。模拟支付只在客户端演示，不扣费、不到账。

服务端可运行 `node --test server/*.test.mjs` 测试。接口包括首页、页面读取、经营操作、原请求回执和前后台心跳。开发测试可给独立服务设置 `PETSHOP_PORT` 与 `PETSHOP_SAVE_DIR`，分别隔离端口和存档。

## 本机赛事维护

运行游戏后，在同一 Windows 用户的 `PetShop` 工程目录用 PowerShell 查看本店正在举办的期号、报名状态和公布时间。

```powershell
node tools/maintain-show.mjs list
```

核实赛表等技术故障后，用查询到的期号作废整期。下面的期号是格式示例。

```powershell
node tools/maintain-show.mjs void private-7 "本期赛表配置错误"
```

本期须已开放且尚未公布结果。尚未报名的赛期也能作废，之后停止受理报名。已报名的私人赛退回原实付金币，公开赛原报名费为零。原因、原额退款和报名记录由运行中的店铺服务一次写入；重复执行显示原处理结果。已公布的奖项保留，作废赛期没有奖杯、奖金或补报名机会。

维护命令连接现有服务，默认使用本机 17888 端口。自定义端口的联调实例需给命令设置相同的 `PETSHOP_PORT`。服务每次启动在当前用户目录的 `.petshop/maintenance` 下轮换本进程的本地凭据。请勿共享该目录。更新前已经运行的旧服务需要正常重启一次以加载新代码，之后可在游戏运行期间直接维护。
