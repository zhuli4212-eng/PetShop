# 外网试玩账号服务

## 当前正式服：阿里云香港

2026-11-17 已迁往香港 ECS。两个 Pages 项目使用 `../aliyun/pages-entry.mjs` 通过 HTTPS 连接香港上游，玩家账号和经营进度保存在香港的 SQLite；原 D1 已冻结保留。[当前部署与验证记录](../aliyun/README.md)优先于下方历史 D1 流程。正式发布包保存在仓库 `output/aliyun/`，新电脑无需旧电脑的临时目录即可解包核查。

## 历史流程：Cloudflare D1 原生账号服务

个人站和独立试玩站各自调用本站的 `/petshop-api/v1/`。两个 Cloudflare Pages 项目的原生 Worker 通过 `DB` 绑定读写**同一个自有 D1 生产库**。原 Sites 账号库在 V6 完成迁移和核对，源库保持冻结。两站的发布记录见[浏览器试玩说明](../browser/README.md)。

## 更新两个正式试玩入口

1. 在 `云端经营版` 安装锁定的开发依赖。当前账号和玩法服务沿用正式 V3 源提交 `3967f2b`。准备好该检出目录的 `dist/server/index.js`，从工程根目录运行下面两条命令。构建器会核对 V3 原件的 SHA-256；验收脚本使用临时 D1 检查两个入口、同账号续玩和签到重试。

   ```powershell
   node 外网试玩/accounts/build-pages-native.mjs --release "<正式V3检出目录>" --out "<临时API产物目录>"
   node 外网试玩/accounts/check-pages-native.mjs "<临时API产物目录>"
   ```

2. 核对两个 Pages 项目的生产配置。两边的 `DB` 均指向现有自有生产库，兼容日期为 `2026-05-15`，启用 `nodejs_compat`。日常更新复用现有数据。以后若有表结构变动，先在隔离的 D1 验证新增迁移，再对共享生产库执行一次。
3. 把同一份 `_worker.js` 和 `_routes.json` 放在两个 Pages 发布包的根目录，路由范围为 `/petshop-api/v1/*`。独立站将 `外网试玩/browser/dist` 放在根目录。个人站从当前生产快照组包，将这套静态文件放在 `petshop/`，保留其他栏目的文件。
4. 发布后分别访问两站的 `/petshop-api/v1/health`，确认返回 JSON 且 `storage` 为 `trial-accounts`。用受控测试账号从一个入口保存，在另一个入口登录并核对同一家店。版本回退同样要保留原生 API 和现有 D1 绑定，维持旧 Sites 源库冻结，避免玩家进度分叉。

升级账号或玩法代码时，先验证新服务与既有存档、客户端相容，再更新 `build-pages-native.mjs` 的来源版本和摘要。自有 Pages 的运行包以已核对的 V3 玩法服务为基础。

## 全新空库初始化

为独立测试或全新环境建库时，依次应用 `drizzle/0000_trial_accounts.sql` 和 `drizzle/0001_trial_passwords.sql`。这两份文件建立账号、会话、限流和密码字段；已迁移的正式库继续保留现有记录。

## 历史资料 · 已退役的 Sites 账号服务与 Pages 代理

旧 Sites 的 V7 是迁址告知页。根路径链接到[现行试玩入口](https://play.zhu-li-4212.xyz/petshop/)。原游戏 API 返回 HTTP 503 与新网址，原迁移管理路径返回 HTTP 410。这个版本只生成固定响应，不使用数据库或迁移凭据。

早期版本由 `build-sites.mjs --prepare` 从指定游戏源码准备 Sites 检出，在检出中执行 `pnpm install --frozen-lockfile`、`pnpm run build`，通过 `.openai/hosting.json` 发布 Worker 和 Drizzle 迁移。独立站当时使用 `build-pages.mjs` 将 `proxy.mjs` 与 `proxy-origin.json` 打包为代理；个人站的浏览器也把经营请求发往独立站。上述脚本留作旧版本核对。现在两个正式入口均按本文首节构建和更新。
