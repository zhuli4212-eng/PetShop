# 宠物店分支开发与发布

## 正式设计依据

- 2026-11-20 用户确认 Dot 中新落档的设计为正式设计。以 [`设计定稿/宠物店全局设计总档-2026-11-20.md`](设计定稿/宠物店全局设计总档-2026-11-20.md)及其中指定的最新专项为设计依据；旧设计有冲突的地方按新设计执行，未冲突的细则继续有效。
- 新设计中已选定的首测参数是当前开发与首测基线；明确标为待定、候选或未采纳建议的内容仍按原状态处理。设计确认、实现验收和正式部署分别记录，不以旧代码或旧预览覆盖新设计。
- 选育与道具按[选育道具与双优选标记](设计定稿/选育道具与双优选标记-确认补充-2026-11-20.md)的最新确认执行。五项各 20% 为指导单本地首测参数，所有道具默认开放。改动与验证结果同步更新对应设计和验收记录。

## 分支与发布

- 开发、构建和验收在本机 `develop` 分支或从它分出的功能分支进行。保留用户已有的未提交文件，按当前任务范围提交。
- 开发预览使用本机离线入口 `PetShop/start-offline.cmd`。涉及存档结构、引导重跑或测试数据时，使用独立目录的 `PETSHOP_SAVE_DIR`。使用香港正式服和正式玩家库做验收须经用户明确授权。
- 全功能解锁、点击金币 +10,000 仅供独立的本地全功能测试包使用。测试包绑定 `127.0.0.1:17940`，使用独立的 `save-test`。这两项严禁进入普通查看包、任何线上试玩和正式版。测试端代码仅由 `--local-test` 打包到指定测试输出，正式发布应取常规客户端与服务端源。
- `main` 是经用户确认后同步正式版的分支。先在本地完成候选版本并提供变更范围、测试结果和预览，等用户确认该候选版本后，再合回 `main` 并按确认范围发布。
- 用户批准调整清单或本地效果图，只覆盖相应本地工作。同步正式版须单独确认具体候选版本。以本地可运行版本、源代码提交和实际线上部署分别记录验收结果。

## 香港正式版基准

当前正式版为 `2026.11.21.1`，游戏代码为 `281ff33`。使用 `petshop-v2026.11.21.1` 或 `production-baseline-2026-11-21.1` 查找正式部署包和回执。

- 部署包为 `output/aliyun/petshop-production-20261121.1-hk.tar.gz`，SHA-256 为 `347c052db9c8687a281e90f8e79c01db35c352ff5c808d191bcd0640b734bf95`。
- 服务器目录、正式入口核验及回退备份见[正式发布记录](output/aliyun/deployment-20261121.1-hk.json)及[香港部署说明](外网试玩/aliyun/README.md)。
- 上一版 `2026.11.20.7` 可由 `petshop-v2026.11.20.7` 或 `production-baseline-2026-11-20.7` 定位。[发布记录](output/aliyun/deployment-20261120.7-hk.json)

- 上一版 `2026.11.20.6` 可由 `petshop-v2026.11.20.6` 或 `production-baseline-2026-11-20.6` 定位。[发布记录](output/aliyun/deployment-20261120.6-hk.json)

- 上一版 `2026.11.20.4` 可由 `petshop-v2026.11.20.4` 或 `production-baseline-2026-11-20.4` 定位。[发布记录](output/aliyun/deployment-20261120.4-hk.json)

- 上一版 `2026.11.20.3` 可由 `petshop-v2026.11.20.3` 或 `production-baseline-2026-11-20.3` 定位。[发布记录](output/aliyun/deployment-20261120.3-hk.json)
- 上一版 `2026.11.20.2` 可由 `petshop-v2026.11.20.2` 或 `production-baseline-2026-11-20.2` 定位。[发布记录](output/aliyun/deployment-20261120.2-hk.json)
- 上一版 `2026.11.20.1` 可由 `petshop-v2026.11.20.1` 或 `production-baseline-2026-11-20.1` 定位。[发布记录](output/aliyun/deployment-20261120.1-hk.json)
- 上一版 `2026.11.19.2` 可由 `petshop-v2026.11.19.2` 或 `production-baseline-2026-11-19.2` 定位。[发布记录](output/aliyun/deployment-20261119.2-hk.json)
- 2026-11-19 的上一版为 `2026.11.19.1`，由 `petshop-v2026.11.19.1` 或 `production-baseline-2026-11-19` 定位，部署记录为 [deployment-20261119-hk.json](output/aliyun/deployment-20261119-hk.json)。
- 2026-11-18 的上版由 `production-baseline-2026-11-18` 定位，归档提交 `930ce85` 的部署记录为 [`deployment-20261118-hk.json`](output/aliyun/deployment-20261118-hk.json)。
- 2026-11-17 的上版继续由 `production-baseline-2026-11-17` 定位，归档提交为 `88a0fa9`，部署记录为 [`deployment-20261117-hk.json`](output/aliyun/deployment-20261117-hk.json)。
- 后续发布前保留对应上一版的部署产物和记录，确认其可供回退。发布完成后核对线上版本并更新部署记录。
