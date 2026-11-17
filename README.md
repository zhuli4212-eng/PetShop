# 宠物店

像素风宠物店经营游戏。仓库包含 Cocos Creator 3.8.8 工程、可直接运行的 Web Mobile 版本、手机云端版，以及设计、美术和数值资料。

## 在新电脑上打开

- **继续日常经营**　电脑双击 `PetShop/启动宠物店.cmd`，手机打开[云端宠物店](https://petshop-cloud-play.zhuli4212.chatgpt.site/)。两台设备使用同一 ChatGPT 账号，读取同一份云端经营档。电脑打开云端版只需要浏览器。
- **运行离线版**　用有此私有仓库权限的 GitHub 账号克隆项目，安装 Node.js 24，双击 `PetShop/start-offline.cmd`。离线版单独保存本机进度，首次启动时若没有本机存档会创建新店。
- **搬迁旧机进度**　从[项目 Releases](https://github.com/zhuli4212-eng/PetShop/releases) 下载整项目迁移 ZIP，按压缩包内的《迁移说明》解压。如已克隆仓库，首次启动本地游戏前，将 ZIP 内的 `宠物店/PetShop/local/local_sim` 复制到检出的 `PetShop/local/local_sim`。如果新电脑已有自己的本地店铺，先保存一份副本。云端版与本地版独立保存。

## 项目入口

| 目录或文件 | 内容 |
| --- | --- |
| [PetShop](PetShop/README.md) | 正式游戏、Node.js 服务、玩法测试和已构建的 Web Mobile 版本 |
| [云端经营版](云端经营版/) | 云端客户端、Worker 服务、D1 迁移和回归测试 |
| [手机预览](手机预览/) | 早期手机预览与交互演示 |
| [本地总览.html](本地总览.html) | 在本地浏览器打开，可查看设计、制作与美术预览 |
| [设计定稿](设计定稿/)、[设计草案](设计草案/)、[数值设计](数值设计/) | 正式规则、历史草案、数值表与试算 |
| [动物资源](动物资源/)、[美术确认稿](美术确认稿/)、[制作](制作/) | 动物动作、美术源稿、制作脚本及历代演示 |

用 Cocos Dashboard 导入 `PetShop` 即可继续开发。在 `PetShop` 中运行 `node --test server/*.test.mjs` 可执行玩法回归。云端工程使用 pnpm 11.25.0，在 `云端经营版` 中运行 `pnpm install --frozen-lockfile` 和 `pnpm run build` 可重新打包。

原有两个独立仓库的历史已并入 Git。标签 `history/mobile-preview` 和 `history/cloud-edition` 分别指向迁入前的最后提交。
