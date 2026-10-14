# MySQL 数据源切换

## 历史清除功能增量升级（2026-10-05）

已有库运行 `node scripts/add-history-resets.mjs` 预检，再运行 `node scripts/add-history-resets.mjs --apply`，检查后重启网站。脚本备份用户表结构并只新增 `history_resets`，外键匹配实际 `users.id` 类型，不删除任何历史或运行全量迁移。当前业务库已应用，最新结构导出为17表1视图。

用户在界面确认清除时，`DELETE /api/me/history` 才会删除本人 `course_visits` 并保存标记，保留 `progress`、`chapter_playback`、收藏及笔记。标记用于停止旧进度补回历史；之后重新访问课程照常记录。

后端默认驱动是 MySQL 8.0+，使用 `mysql2/promise` 连接池、参数化查询和事务。SQLite 保留为迁移源和独立测试驱动，不会在 MySQL 连接失败时自动降级，以免把新数据写进另一个数据库。

2026-09-22 已完成本机正式切换：`localhost:3000/api/health` 返回 `database: mysql`，目标库为 `zhitu_classroom`（MySQL 8.0.30）。上架课程 28 门、分集 1,900 个；旧演示课程和分集保留历史数据但不上架。原始双侧备份位于 `database/backups/2026-09-22T04-58-29-801Z/`。正式服务的注册、收藏、最近学习、笔记写入与读取已验证，测试账号及记录已清理。

## 首次切换

1. 在项目根目录 `.env` 中填写 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`，并保持 `DB_CLIENT=mysql`。密码仅保存在本机；`.env` 不在网站静态文件白名单中，也已加入 `.gitignore`。
2. `npm install` 安装依赖。停止旧网站进程，在迁移和检查完成前保持暂停写入；不必停止 MySQL80 服务。
3. 执行 `npm run db:migrate`。账户须具有目标库建表、修改表和读写权限；目标库不存在时还需要建库权限。
4. 执行 `npm run db:check`。确认库名、上架课程和分集数量。
5. 执行 `npm start`，访问 `http://localhost:3000/api/health`，返回的 `database` 必须是 `mysql`。只看 Workbench 中有没有表，不能判断网站当前的数据源。

`npm start` 和脚本自动读取 `.env`；外部环境变量优先。启动只检查结构，不自动迁移。更新课程目录后，须在维护窗口重新执行迁移，检查报告后启动。

## 数据保留与冲突

- 先把目标 MySQL 库内的业务表结构、数据保存到 `database/backups/<时间>/mysql-before.json`，并通过 SQLite 备份 API 生成 `sqlite-source.db`。
- 只在 SQLite 副本上补齐结构、同步当前课程目录。原始 `zhitu.db` 保留。
- MySQL 缺表时补建，旧版缺少的 `published`、`subject`、弹幕章节列按需添加；外键列跟随现有父表整数类型，包括 `BIGINT UNSIGNED`。
- 兼容旧用户表：`password_hash` 重命名为 `password`，`following_count` 重命名为 `following`；缺失的加入时间从对应 SQLite 用户恢复。较短的文本列按需扩容，支持新版长评论。
- 同编号且内容相同的讨论、弹幕，即使导入时间不同也视为同一条记录，保留 MySQL 原时间。
- 15 张业务表数据在一个事务内迁移。账号编号、昵称及密码须对应；不静默合并账户或覆盖不同密码。课程、章节同编号不同标题时停止，防止把学习记录关联到另一门课。
- 收藏等关系取并集；课程进度和最近访问取较新的时间戳。相同编号但内容不同的笔记、讨论、播放记录会报冲突，数据写入整体回滚。
- 已有 MySQL 的学习人数、创建时间和直播排期保留；匹配课程的目录信息按当前源更新。
- 已有明文密码转换为 scrypt；现有 scrypt 摘要保留，不导出到网页或控制台。
- 成功报告写入 `database/mysql-migration-report.json`。迁移前备份包含私人数据，只保存在本机，勿放入公开仓库。

MySQL 建表、加字段会隐式提交，所以即使随后数据事务回滚，已经补建的空表和字段会保留。不会 DROP 现有表，也不清空目标库。冲突时应先检查提示的表名、主键，核实对应关系再重跑。

## 验证

- `npm test`：SQLite 临时库，验证原有接口兼容性。
- `npm run test:mysql`：独立临时 MySQL 实例和随机本机端口，验证旧版无符号外键升级、重复迁移、冲突回滚、登录注册、中文与 emoji、私有笔记、收藏、播放事务、预约、外键和重启持久化；不使用业务库。
- `npm run test:browser`：临时 SQLite 库中的完整浏览器交互回归。
- `npm run db:check`：只读检查 `.env` 指定的实际 MySQL 库。

测试依赖本机 `mysqld`，可用 `MYSQLD_PATH` 指定路径。Windows MySQL 8.0 的独立实例测试需使用 ASCII 临时路径，例如在有权限的 PowerShell 中：

```powershell
$env:MYSQL_TEST_TMP='C:\Windows\Temp'
npm run test:mysql
```

## Workbench 查询

```sql
USE zhitu_classroom;
SHOW TABLES;
SELECT COUNT(*) AS 上架课程 FROM courses WHERE published=1;
SELECT SUM(lessons) AS 原站分集 FROM courses WHERE published=1;
SELECT id, title, category, subject FROM courses WHERE published=1 ORDER BY id;
SELECT id, user_id, course_id, chapter_id, at_second, content FROM notes ORDER BY id DESC;
```

学习经验文章仍是网站静态内容；语言、阅读样式等界面偏好保存在浏览器。管理员页面仍为演示原型。本次切换迁移的是已接通后端的业务数据，并未把这些前端功能改成正式管理 API。

## 回退

若迁移失败，旧网站仍可通过 `DB_CLIENT=sqlite`、`DB_PATH=./zhitu.db` 启动。若已在 MySQL 上产生新数据，不要直接切回旧 SQLite，否则新记录不会出现在旧库中；须先停止写入并同步增量。MySQL 原始备份是 JSON 数据快照，不是可直接运行的 SQL 文件。

## 2026-10-07 管理后台增量升级

已有库运行 `node scripts/upgrade-platform.mjs` 检查重复昵称、实际父列类型与缺失结构，再加 `--apply` 备份相关结构并创建五张管理表、补建昵称唯一索引。当前业务库已应用，22表、1视图，原有学习记录保留。该操作不使用SQLite迁移数据。MySQL DDL隐式提交，结构备份不是业务数据全量备份。

管理员绑定：按用户明确指定的已注册昵称运行 `node scripts/grant-admin.mjs --nickname=指定昵称`，确认唯一匹配后加 `--apply`；不会显示密码或创建通用管理员密码。重启网站加载新代码。后台管理具有真实写入权限，应仅在隔离库测试发布、停用与审核流程。
