# 宠物店旧网址香港直连

`https://play.zhu-li-4212.xyz/petshop/` 直达香港 ECS。根路径 `/` 返回 302 到 `/petshop/`。DNS 记录为 `play A 47.243.58.106`，代理状态为「仅 DNS」。保留 `petshop-trial.pages.dev` 及受网关身份限制的原上游。两条入口使用同一正式客户端、账号服务和数据库。

## 站点与后续发布

`play-direct.conf` 通过 `/etc/systemd/system/petshop-web.service.d/55-play-direct.conf` 加入现有 Nginx 服务。每次服务启动，`compose-play-nginx.py` 读取 `/opt/petshop/current/nginx-production.conf`，在 `/run/petshop-web/` 生成组合配置。当前正式包及将来切换的新包仍以 `/opt/petshop/current/public` 和原账号服务为来源。

直连站点的代理以实际连接地址设置 `X-Real-IP`，清除访客提供的网关身份、转发来源和客户端 IP 请求头。账号服务沿用原有来源校验、登录凭证和请求限制。直连网页支持 HTTP/2，脚本等静态资源启用 gzip。带内容摘要的 WOFF2 使用长期缓存，首页和发布清单重新校验。

证书由 Let's Encrypt 签发。首次切换前用 DNS 验证，切换后改用 Certbot 独立 HTTP-01 自动续期，80 端口由 Certbot 验证时临时监听。`55-petshop-play-direct` 续期钩子检查证书域名和密钥配对，原子切换站点证书的符号链接，再重启网页服务。

## 回退

如需回到原路由，先把 `play` 恢复为 `dream-hunter.pages.dev` 的 CNAME，启用代理并选自动 TTL。等旧路由从公网返回可用后，再停用 `55-play-direct.conf`，重新加载 systemd 并重启 `petshop-web.service`。旧路由仍使用网关和同一份数据库。

移除站点配置前，先备份 drop-in。停用后的直连续期钩子与证书由运维按需留存。此回退只切网页和入口连接，账号服务继续使用原来的数据库文件。

[实际迁移与公网验收记录](../../output/aliyun/deployment-20261120-play-direct.json)
