# 宠物店分支开发与发布

- 开发、构建和验收在本机 `develop` 分支或从它分出的功能分支进行。保留用户已有的未提交文件，按当前任务范围提交。
- 开发预览使用本机离线入口 `PetShop/start-offline.cmd`。涉及存档结构、引导重跑或测试数据时，使用独立目录的 `PETSHOP_SAVE_DIR`。使用香港正式服和正式玩家库做验收须经用户明确授权。
- `main` 是经用户确认后同步正式版的分支。先在本地完成候选版本并提供变更范围、测试结果和预览，等用户确认该候选版本后，再合回 `main` 并按确认范围发布。
- 用户批准调整清单或本地效果图，只覆盖相应本地工作。同步正式版须单独确认具体候选版本。以本地可运行版本、源代码提交和实际线上部署分别记录验收结果。

## 香港正式版基准

当前正式版为 `2026.11.19.1`，游戏代码为 `22dc268`。使用 `petshop-v2026.11.19.1` 或 `production-baseline-2026-11-19` 查找含正式部署包和回执的归档提交。正式服基准以实际部署包和部署记录为准。

- 部署包为 `output/aliyun/petshop-production-20261119-hk.tar.gz`，SHA-256 为 `28c1b72ea492eb43c4de195f73f2dbbe45796336ded96d1cda5b5a4c2115c991`。
- 服务器目录、正式入口核验及回退备份见 [`output/aliyun/deployment-20261119-hk.json`](output/aliyun/deployment-20261119-hk.json)及[香港部署说明](外网试玩/aliyun/README.md)。
- 2026-11-18 的上版由 `production-baseline-2026-11-18` 定位，归档提交 `930ce85` 的部署记录为 [`deployment-20261118-hk.json`](output/aliyun/deployment-20261118-hk.json)。
- 2026-11-17 的上版继续由 `production-baseline-2026-11-17` 定位，归档提交为 `88a0fa9`，部署记录为 [`deployment-20261117-hk.json`](output/aliyun/deployment-20261117-hk.json)。
- 后续发布前保留对应上一版的部署产物和记录，确认其可供回退。发布完成后核对线上版本并更新部署记录。
