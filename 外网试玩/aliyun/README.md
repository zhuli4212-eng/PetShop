# 宠物店阿里云香港服部署

当前正式版为 `2026.11.19.2`，游戏源代码为 `7cdcbdc`。本次沿用正式库，短暂停写期间生成备份，并逐条核对 16 个账号的密码哈希和店铺存档、47 条会话及登录限流记录。版本、网页资源摘要、备份和回退目录见[正式发布记录](../../output/aliyun/deployment-20261119.2-hk.json)。

2026-11-19 的上一版为 `2026.11.19.1`，游戏源代码为 `22dc268`。该次发布保留账号和密码，并重置当时的 13 家店铺。详见[上一版发布记录](../../output/aliyun/deployment-20261119-hk.json)。

2026-11-18 已在原香港实例发布 `9b3ec2b`。停写备份后重置了 13 家店铺，账号、密码哈希和会话逐行核对一致。两条试玩入口共用重置后的账号库。发布文件、入口核验和回退路径见[本次部署记录](../../output/aliyun/deployment-20261118-hk.json)。

2026-11-17 已完成中国香港 ECS（Ubuntu 22.04，47.243.58.106）正式切换。游戏程序及账号数据库运行在香港；两个 Pages 入口通过 HTTPS 网关连接同一个上游。原 Cloudflare D1 已冻结，保留为迁移备份，不再承接玩家写入。

- 玩家入口：<https://petshop-trial.pages.dev/>；备用入口：<https://play.zhu-li-4212.xyz/petshop/>。
- 上游：`petshop.zhu-li-4212.xyz`；API：`127.0.0.1:8788`；生产数据库：`/var/lib/petshop/shop.sqlite`。
- 切换时完整保留 11 个账号、27 条会话、5 条登录限流记录；最终快照经两次 D1 导出逐行比对，SHA-256 为 `b8012c3eacf6ac2733ae78c98b611d8ad623c8c38c287b3b23fe1442cbd52876`。
- 两个入口通过 CN 网络出口验证：健康检查、匿名拒绝、原密码登录、同一店铺读档及退出；正式服务重启后再次通过。香港隔离测试通过注册、密码登录、并发签到去重、重启恢复、回执及兔房检查。未执行手机真机和 10 人长期负载测试。
- Let's Encrypt 证书当前有效期到 2027-02-15；`certbot.timer` 已启用，`renew --dry-run` 通过；部署续期钩子会同步证书并重启网页服务。
- Pages 正式部署：`petshop-trial=e8649e9f-42e4-4285-b959-0bf04ec8e81a`；`dream-hunter=5763f880-f5ba-41cc-a275-3b05b9fa4d5c`。游戏资源清单及个人站原有静态资源未变。

测试包适用于 Ubuntu 22.04 或 24.04（x86-64、ARM64）。网页与账号 API 使用同一个来源。新测试库保存在服务器的 `/var/lib/petshop-trial-test/shop.sqlite`。本轮使用测试账号验证注册、原密码重登和店铺存档。

## 安装

1. 把测试发布包上传到服务器上的普通账号目录。在空目录解包，进入含有 `install.sh`、`server.mjs`、`account-service.mjs`、`schema.sql` 与 `public/` 的目录。
2. 在服务器终端运行以下命令。

   ```bash
   sudo apt-get update
   sudo bash ./install.sh
   ```

   安装器优先使用系统已有的 Node.js 24 或更新版本。需要下载时，安装器按官方 Node.js 24 Linux 发布清单核对压缩包的 SHA-256。服务器需要能从 Ubuntu 软件源及 Node.js 官网下载所需文件。首次安装会从 Ubuntu 软件包提取 nginx 程序，使用项目自己的配置运行。两个服务由 systemd 以非 root 用户启动，重启机器后会自动恢复。新版发布包用同一命令安装，测试数据库存放在版本目录之外。

3. 安装器会请求本机网页与 `/petshop-api/v1/health`。出现 `Petshop test site ready` 后，在自己的电脑上打开 PowerShell，运行以下命令，并将用户名与公网 IP 替换为实例的实际值。

   ```powershell
   ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8080:127.0.0.1:8080 用户名@服务器公网IP
   ```

   保持这个窗口开启，浏览器打开 **http://127.0.0.1:8080/**。服务器上的网页和 API 分别仅监听 `127.0.0.1:8080` 和 `127.0.0.1:8787`。SSH 隧道通过现有 SSH 连接传输。

4. 注册一个测试账号，完成一次签到或繁育。关闭浏览器，在新的浏览器窗口用同一账号和密码登录，核对店铺进度。用第二个测试账号分别登录，核对两个店铺各自的进度。

## 查看服务

```bash
curl -fsS http://127.0.0.1:8080/petshop-api/v1/health
systemctl status petshop-trial-test.service petshop-trial-test-web.service --no-pager
sudo journalctl -u petshop-trial-test.service -u petshop-trial-test-web.service -n 40 --no-pager
```

SQLite 采用 WAL 模式。备份运行中的店铺时，使用 SQLite 在线备份接口生成一致快照，再复制到独立存储。修改监听地址、绑定正式域名和迁移正式玩家数据属于正式切换阶段。

## 正式上游

正式地址仍使用现有的两个玩家入口。两站的 Pages 网关通过 HTTPS 请求阿里云上游 `petshop.zhu-li-4212.xyz`，使用 `X-Petshop-Origin-Secret` 认证并传递 `X-Petshop-Client-IP`。上游 nginx 在静态资源和 API 前均检查网关身份。玩家继续从各入口的同源 `/petshop-api/v1/` 登录。

1. 在完成测试安装的服务器上，从正式包目录运行 `sudo bash production.sh stage`。该命令独立安装生产程序、用户和 systemd 配置。排练使用 `python3 migrate.py verify rehearsal.sqlite receipt.json` 校验源库的逐表摘要，再用 `bash production.sh audit rehearsal.sqlite <receipt.json中的sqlite_sha256>` 以只读模式核对本机收到的文件。上述命令不启动服务。
2. 为两个 Pages 网关配置相同的 Secret 绑定 `PETSHOP_ORIGIN_SECRET`。在服务器端将同一个值从受控的秘密文件经标准输入传给 `sudo bash production.sh set-secret < 私有文件路径`。使用至少 40 个字符的随机 base64url 字符串。秘钥文件由 root 写入，nginx 需要的配置仅允许 petshop 专用组读取，响应与访问日志均不包含它。轮换后重启 `petshop.service` 与已启用的 `petshop-web.service`。
3. 两个入口均停写、正式 D1 已冻结时，生成最终 SQLite 和独立对账回执。先运行 `python3 migrate.py verify final.sqlite receipt.json`，再运行 `sudo bash production.sh import-final final.sqlite <最终sqlite_sha256>`。导入再次核对文件后以原子方式建立 `/var/lib/petshop/shop.sqlite`。重复导入会保护现有库。持续运行的生产库请用 SQLite 在线备份保留可恢复副本。
4. 运行 `sudo bash production.sh start-local`。账号服务会检验现有生产库，监听 `127.0.0.1:8788`。管理员可在服务器上运行以下命令核对 API 就绪情况。排练副本只执行第 1 步的只读对账；完整登录和游戏页面可能推进店铺状态。

   ```bash
   curl -fsS -H 'Host: petshop.zhu-li-4212.xyz' -H 'Origin: https://petshop.zhu-li-4212.xyz' http://127.0.0.1:8788/petshop-api/v1/health
   ```

5. 在香港服务器的 DNS、80/443 安全组规则及受信任 TLS 证书就绪后，运行 `sudo bash production.sh publish /绝对路径/fullchain.pem /绝对路径/privkey.pem`。安装器检查域名、证书链及私钥匹配，再启动独立的 443 监听；现有个人站 DNS 继续沿用原地址。可以使用已有证书，也可以按证书服务商的 **ACME DNS-01** 流程，为该子域的 `_acme-challenge` 写入临时 TXT 记录。手动证书续签后重新执行 `publish` 装入新证书。Let’s Encrypt 自动续期使用 `install -m 0700 renew-certificate.sh /etc/letsencrypt/renewal-hooks/deploy/petshop` 安装钩子，再运行 `certbot renew --dry-run` 验证。只有正式阿里云上游需要对应的 DNS 和 443 网络接入。
6. 在两个原玩家入口分别核验同一受控账号的登录、同一店铺读档、保存及退出重登。新库开始承接写入后，应用回退继续使用新库；切回旧库需要先停写并对账迁回。

## 本地候选包与存档重置

从仓库根目录构建 Web Mobile 后，用以下命令生成一个独立候选包。现有正式基线的文件校验继续使用原固定摘要。

```powershell
$pages = 'output/aliyun/本次候选/pages'
$version = '2026.11.19.1'
$source = git rev-parse HEAD
node '外网试玩/browser/build.mjs' --client 'PetShop/build/web-mobile' --out $pages --version $version --source $source
node '云端经营版/node_modules/esbuild/bin/esbuild' '外网试玩/accounts/worker.mjs' --bundle --format=esm --platform=node --target=node24 --charset=utf8 "--outfile=$pages/_worker.js"
python '外网试玩/aliyun/package.py' --candidate --production --pages $pages --out 'output/aliyun/本次候选/petshop.tar.gz'
```

正式编号按北京时间使用 `YYYY.MM.DD.N`，同日发布时递增 `N`。打包时填入对应的完整游戏提交。登录页显示编号，两条入口各自的 `release.json` 返回版本、游戏提交和实际主包摘要。发布后核对 HTTPS 上的版本清单及清单指向的客户端，再将已验收的归档提交标为 `petshop-v<版本号>`。游戏主包、设置和入口使用带内容摘要的文件名，避免 CDN 继续返回上版脚本。

将候选包与上一个正式包分别解到独立目录后，运行 `node 外网试玩/aliyun/check.mjs <候选目录> <上版目录>`。它在临时 SQLite 库中创建测试店，覆盖旧店读取、账号密码重登、新店引导、并发回执、重置及备份恢复。

只有明确安排重置的发布才执行 `reset-shops.mjs`。停写后用候选包中的账号服务生成新店，并在同一笔 SQLite 事务内替换每家店铺存档。账号、密码哈希和会话继续沿用。该命令先生成并校验指定的新备份，随后才改库。保存当前程序目录的实际指向，验证候选和备份可用后再恢复玩家入口。对已经重新承接玩家写入的库做数据回退前，先停写并对账。
