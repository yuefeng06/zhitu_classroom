# GitHub 源码使用说明

本仓库用于保存和展示知途课堂源码。上传 GitHub 不等于部署网站；GitHub Pages 不能运行这里的 Node.js 服务和 MySQL。

## 运行环境

- Node.js 22.13 或更新版本。
- MySQL 8.0；数据库和账号由运行者自行配置。
- PowerShell 示例命令适用于 Windows，代码也可在具备相应环境的其他系统运行。

安装依赖并准备本地配置：

```powershell
npm ci
Copy-Item .env.example .env
```

在本机编辑 `.env`，填写自己的 MySQL 连接信息。不要把密码放进源码、截图或 Git 提交。

## 已有业务库

指向已配置且结构完整的业务库后运行：

```powershell
npm run db:check
npm start
```

浏览器访问 http://localhost:3000。现有库缺表时按 README 中对应的增量升级说明处理，不因下载源码而重跑历史迁移。

## 新环境的空数据库

本仓库不含原作者的数据库文件、账户、笔记或学习记录。需要自己初始化：

1. 在 MySQL 中创建一个新的空库（例如 `zhitu_classroom_demo`），把 `.env` 的 `MYSQL_DATABASE` 指向该库。
2. 在 Workbench 中选中这个新空库，执行 `database/mysql-actual-schema.sql`。该文件只有结构，不包含用户数据；不要在已有业务库重复执行。
3. 使用课程同步脚本预检并导入公开课程目录。下列命令仅适用于上一步创建的空库：

```powershell
$courseIds = node --input-type=module -e "import {videoCatalog} from './catalog.mjs'; console.log(videoCatalog.map(c => c.id).join(','))"
node scripts/sync-mysql-catalog.mjs "--ids=$courseIds"
# 确认预检指向自己新建的空库后，再执行：
node scripts/sync-mysql-catalog.mjs "--ids=$courseIds" --apply
npm run db:check
npm start
```

4. 在网站注册自己的账户。需要管理端时，按 README 的 `scripts/grant-admin.mjs` 流程，明确指定自己注册的昵称，先预检再执行。

不要把 `npm run db:migrate` 当成首次启动命令，它用于迁移既有 SQLite 历史记录。

## 文件与验证边界

源码包含业务模块、测试、样式、课程封面、公开课程目录、原文许可、结构 SQL 和论文源稿。`.env`、数据库实例、上传头像、私有推荐模型、日志、缓存、私人备份及历史压缩包均不属于上传内容。

```powershell
npm run format:check
npm test
```

`npm test` 使用隔离 SQLite，不能代替 MySQL 验证。浏览器测试需要本机 Edge/Chromium，MySQL 测试需要独立测试实例；不具备这些环境时不要把跳过报告为通过。原站视频能否播放仍取决于原站权限和片源状态。

旧文档中的截图、实验附件、源码压缩包或本机绝对路径属于历史交付记录，可能不随本次仓库上传。可直接使用 GitHub 的 Download ZIP 下载当前源码。

## 素材与许可

课程视频由来源站提供，仓库不包含视频本体。封面与方向图片的来源见 `database/cover-sources.json`、`database/discovery-image-sources.json`，字形许可见 `licenses/`，文章保留原作者和译者信息。本次上传不额外授予第三方素材的使用许可。
