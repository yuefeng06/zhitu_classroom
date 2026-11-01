# 知途课堂项目协作说明

本文件适用于项目根目录及其子目录，供后续编码代理了解项目、实施修改和验证结果。用户在当前任务中的明确要求优先于本文件。沟通默认使用中文。

## 项目定位与当前交付边界

- 项目主题为“按自己的节奏学习”，当前交付是可本地运行、适配桌面与手机的响应式网站，不是已发布的原生 APP 或小程序。
- 用户端已形成课程发现、搜索与分集播放、账户、收藏、私有笔记、最近访问、每日手动打卡的主要路径；内容来自真实课程目录。功能存在不代表当前视频在原站始终可播放。
- 桌面导航为首页、课程、学习、发现、我的；移动端主导航为首页、发现、学习、我的，课程列表由页面入口进入。
- 正式业务 API 与浏览器本地工具分开描述。管理工作台已接入服务端权限和 MySQL，包含看板、用户状态、课程管理、文章管理、讨论审核；三类核心业务是课程、文章和讨论，不包含直播或自助角色授权。
- 本文件是唯一规范正文；`agent.md` 为兼容入口，不维护另一套规则。项目建设说明维护在 `项目书.tex`，编译产物不等于网站部署。

## 工作方式

- 先阅读与任务有关的代码和文档，再实现修改；保留用户已有改动。
- 对已授权的工作持续推进，常规、可逆的实现选择自行判断，不反复请求确认。缺少关键连接信息时，说明缺少什么，同时继续不依赖该信息的工作。
- 搜索优先使用 `rg`、`rg --files`，排除 `node_modules`、`.npm-cache` 和私人备份目录。
- 修改范围与任务保持一致。当前项目不需要构建工具，不为小功能引入前端框架或改写整套架构。
- 代码格式以 `.prettierrc.json`、`.editorconfig` 为准，使用 `npm run format` / `npm run format:check`；PowerShell 使用 `npm run format:powershell` / `npm run format:powershell:check`。`scripts/format-code.mjs` 明确限定源码范围并保护生成文章块，不直接对全目录执行格式覆盖。业务 JavaScript 使用两空格、分号和单引号；PowerShell 使用四空格。字符串内容、SQL 参数与执行顺序不因排版调整而改写，格式命令不连接业务数据库。详情见 `docs/代码格式说明.md`。
- 汇报实际完成的变化、验证结果和仍存在的限制。区分代码支持、隔离测试通过与业务服务已经生效。

## 技术结构

项目为原生 HTML、CSS、JavaScript 前端与 Node.js 后端，同源提供页面和 `/api` 接口。JavaScript 模块使用 ESM。Node.js 要求为 22.13 或更新版本。

| 文件或目录 | 职责 |
| --- | --- |
| `frontend/index.html`、`frontend/js/app.js` | 页面入口、课程列表与学习中心等主要页面逻辑 |
| `frontend/js/home.js`、`frontend/css/theme.css` | 参考设计改版后的首页、全站视觉覆盖与响应式布局 |
| `frontend/js/handwriting.js`、`frontend/js/handwriting-data.js`、`frontend/assets/logo.svg`、`frontend/assets/logo-mark.svg` | 首页逐字笔画动画、页头字标与 favicon；手写字形来源及许可保存在 `licenses/` |
| `frontend/css/styles.css`、`frontend/css/studio.css` | 基础样式、扩展页面与移动端样式 |
| `frontend/js/studio.js` | 发现页面及管理路由等扩展模块 |
| `frontend/js/profile.js`、`frontend/js/account.js` | 个人中心、学习工具、头像菜单与账户交互 |
| `frontend/js/checkin-calendar.js`、`backend/checkins.mjs`、`frontend/js/study-collection.js` | 学习页打卡日历、服务器北京时间与统计、学习书架及个人中心历史记录 |
| `frontend/js/auth.js`、`frontend/js/avatar.js`、`backend/avatars.mjs` | 登录注册表单、头像裁剪与服务端头像文件读写 |
| `frontend/js/player.js`、`backend/media.mjs` | 播放器交互和视频源配置解析 |
| `frontend/js/search.js` | 顶部真实课程名称轮播与一键直达、搜索提示、键盘交互及按账号区分的浏览器本地搜索历史 |
| `frontend/js/navigation.js`、`frontend/js/select-menu.js` | 滑块导航、选项切换和主题下拉菜单 |
| `frontend/js/experience.js`、`frontend/js/motion.js` | 语言与阅读偏好、页面动效 |
| `frontend/js/study-posts.js` | 有来源链接的学习经验文章 |
| `articles/README-zh_CN.md`、`scripts/import-smart-questions.mjs` | 用户提供的《提问的智慧》原文与静态全文生成器，生成内容嵌入 `frontend/js/study-posts.js` |
| `server.mjs` | HTTP 服务、API 分发、静态资源白名单 |
| `backend/admin-api.mjs`、`frontend/js/admin.js`、`frontend/js/published-articles.js` | 后台授权、管理写入与已发布文章阅读 |
| `frontend/js/admin-user.js` | 管理端用户详情、只读学习统计和关注列表、普通账号头像维护 |
| `backend/passwords.mjs`、`backend/course-summary.mjs` | 有界异步密码派生、登录限流与批量课程摘要 |
| `backend/recommendation-evaluation.mjs` | 全局时间分区、四算法对照与独立测试评估 |
| `backend/backend.mjs` | 身份认证、课程、笔记、收藏、学习记录等业务 API |
| `backend/config.mjs`、`backend/database.mjs` | 环境配置、异步数据库适配与事务 |
| `backend/mysql-schema.mjs` | MySQL 结构检查与旧版结构升级 |
| `backend/catalog.mjs`、`database/video-catalog.json` | 课程元数据与 Bilibili 分集映射 |
| `media-sources.json` | 默认片源及按章节覆盖的视频源配置 |
| `backend/sqlite-bootstrap.mjs`、`zhitu.db` | SQLite 测试初始化与历史迁移源 |
| `course-images/`、`discovery-images/` | 本地课程封面和探索方向图片 |
| `scripts/`、`tests/` | 数据维护、导出脚本与接口、MySQL、浏览器测试 |

## 启动和配置

常规启动：

```powershell
npm install
npm run db:check
npm start
```

开发模式为 `npm run dev`。默认页面地址为 `http://localhost:3000`，端口由 `PORT` 控制。服务和数据库脚本会读取根目录 `.env`，外部环境变量优先；配置键参考 `.env.example`。

业务数据库默认使用 MySQL，目标库由 `MYSQL_DATABASE` 指定，本项目已切换到 `zhitu_classroom`。通过正在运行的 `/api/health` 返回 `database: mysql` 验证网站实际数据源；`npm run db:check` 仅证明配置指向的数据库可以访问且结构齐全。

不得在 MySQL 连接失败时静默回退 SQLite。显式 `DB_CLIENT=sqlite` 仅用于隔离测试或明确安排的回退，`DB_PATH` 控制 SQLite 文件路径。

## 数据库维护

- MySQL 是切换后的业务数据来源。原 `zhitu.db` 不再代表最新学习数据，不得用它覆盖 MySQL 中的新记录。
- `npm run db:migrate` 是 SQLite 到 MySQL 的历史迁移工具，会备份双方数据并处理旧结构；不是普通启动步骤。不要因页面、字体、图片等前端变更而运行迁移。
- 仅维护课程内容时使用 `scripts/sync-mysql-catalog.mjs --ids=…` 预检，加 `--apply` 后备份目标课程与章节并事务更新；不运行全量历史迁移。更新片源快照后需重启服务载入映射；替换已有分集前核对内容和历史关联，不能仅按分 P 编号假设是同一章节。
- 明确下架的课程记录在 `backend/catalog.mjs` 的 `retiredCourseIds`；增量同步可附加 `--unpublish-ids=…`，仅设置 `published=0`，保留章节及学习数据。不要重新推荐已停用的课程；历史详情兼容接口的保留不代表视频可播放。
- 每日打卡使用 `study_checkins`，联合主键为用户与日期；日期由服务器按北京时间确定，不信任客户端日期或账号，不补造历史。已有库用 `scripts/add-study-checkins.mjs` 预检和 `--apply` 增量加表；不能为此运行全量迁移。
- 修改业务结构时先检查实际 MySQL 元数据，准备增量迁移、备份和适当的隔离验证。已有 MySQL 库应保留账户、笔记、学习记录及关联关系。
- 旧表与新表的主键有带符号和无符号两种类型。逻辑关联列应匹配实际父列，不要假设所有 ID 都是同一种 `BIGINT`。
- MySQL 的 DDL 会隐式提交；数据事务回滚不代表已执行的建表、改表也被撤销。
- 不随意删除或清空业务表，不绕过账户身份冲突来强行合并数据。清理测试数据时只操作能够准确确认归属的测试记录或隔离库。
- `backend/database.mjs` 提供异步 `get`、`all`、`run` 和 `transaction`；查询必须正确等待，值使用参数绑定。新增 SQL 要分别考虑 MySQL 和 SQLite 测试兼容性。
- 私有笔记、学习记录及写入操作根据服务端会话确定用户，不信任请求正文中的用户编号。保留会话 Cookie、密码摘要和归属校验机制。
- 不将 `.env`、密码、连接密钥、会话令牌、数据库内容或私人备份输出到日志、聊天、截图或公开文件。修改示例配置时仅使用占位值。
- 头像地址使用既有 `users.avatar` 字段，图片位于 `AVATAR_DIR`（默认 `data/avatars/`）。备份或迁移服务时同时保存数据库和该目录。头像按服务端会话更新；仅允许小型 JPEG，通过限定随机文件名的 `/api/avatars/…jpg` 接口读取，不开放上传目录列表。测试必须指定独立临时头像目录。
- 管理员可通过 `/api/admin/users/:id/avatar` 维护普通账号头像，须确认目标昵称并校验用户资料行版本，事务中复查目标角色；不得修改管理员头像。普通用户仍通过本人会话修改头像。用户详情 `/api/admin/users/:id/detail` 仅提供学习记录统计和分页讲师关注列表，不返回私人笔记正文、密码摘要或会话字段；统计含下架关联，打卡为累计记录数，不冒充观看时长。无数据库结构变化。
- `server.mjs` 使用静态资源白名单；新增页面资源需同步注册，不能改成任意项目文件下载。

## 当前结构中的重要区别

- 已删除 coins、admin_audit；评论审核状态从 comment_moderation 并入 comments.hidden。删除的表不再由启动、管理升级或新库初始化脚本创建。历史测试夹具和备份除外。
- sessions 和 account_status 已并入 users，使用 disabled、session_token_hash（SHA-256 摘要，唯一，可空）、session_expires（Unix 毫秒）。每账号只保留一次登录；新登录替换旧登录，旧会话退出不能清掉新会话，停用账号撤销会话。
- 旧22表精简使用 scripts/simplify-schema.mjs 预检；停止写入后带 --apply --maintenance 备份并执行，不运行全量迁移。数据库 DDL 不可事务回滚，私有备份含原会话和密码摘要，不公开或上传。
- backend/recommendations.mjs 模型版本为 4，推荐只读取收藏和最近访问；旧模型回退，不能沿用含投币信号的模型宣称本轮机器学习已启用。
- favorites 保存 user_id、chapter_id、created_at，联合主键为用户与章节；没有 course_id 或物理外键。旧收藏使用 scripts/migrate-chapter-favorites.mjs 预检，停写后带 --apply --maintenance 备份迁移：优先 course_visits 最近有效章节，否则按 position、id 取第一集，保留收藏时间。
- 收藏 API 必须传 chapterId，校验章节所属课程；书架按分集展示并直达该集，同一课程可收藏多集。推荐按用户和课程聚合章节收藏，不能因收藏多集虚增关注人数。播放映射仍由 JSON 提供，本轮不将 BVID/CID 或视频本体写入数据库。
- SQLite 仅使用本版新建隔离测试库；旧文件保留为历史迁移资料，不能静默覆盖其中旧会话与账号状态。

- `courses.published` 是当前上架状态；`status` 为保留的旧字段，不能把两者当作自动同步。
- 2026-10-14 实际 MySQL 已精简为 17 张表、1 个视图、0 个物理外键。`progress.chapter_id` 等仍为逻辑关联列，直接删除章节不再自动置空，2026-10-30 按用户要求增加受保护的删除：课程先下架且无章节/学习互动记录，章节无收藏、笔记、进度、访问或弹幕关联时才可删除；否则保留记录，仅下架。
- 当前 MySQL 的 `users.nickname` 已建立唯一索引；注册先做友好预检查，再由数据库拒绝并发重复。旧库先用 `scripts/upgrade-platform.mjs` 预检、备份并增量升级，不能跳过重复昵称检查或自动合并账户。
- `live_events.starts_at` 当前为字符串；会话失效时间 `users.session_expires` 为 Unix 毫秒；播放与笔记时间点以秒计。
- 课程与章节的逻辑关联不能代替“章节属于指定课程”的接口校验。
- 数据结构以实际 MySQL 元数据为准，优先参考 `database/数据库表结构说明.md`，不要把旧初始化 SQL 或 ER 图片当成当前库的完整约束。

## 页面与内容约定

- 首页推荐由 `backend/recommendations.mjs` 的内容相似度与去重关注人数排序；`backend/recommendation-store.mjs` 可加载通过离线门控的 BPR 私有模型。`npm run recommend:train` 只读业务表，写私有模型，不需要数据库迁移。模型包含用户隐向量，不得公开、打包或加入静态白名单；更新后重启服务，超过 7 天回退。训练数据不足或不优于内容/热门基线时不得声称机器学习已启用。评估按全局唯一时间戳分为训练、验证、独立测试，门控只用验证集；比较热门、内容、纯 BPR 与混合的命中、召回、NDCG 和覆盖率。最近关系快照不等于完整事件流或线上效果验证，详见 README。

- 当前视觉:浅灰背景、白色卡片、粉色点缀、深蓝精选横幅与无衬线排版。`frontend/css/theme.css` 在旧样式之后加载；不要因旧文档中的米色绿色说明而回退本次改版。避免过度加粗和重复功能模块。
- 品牌图形为圆润 Z 字路线与进度圆点，用户明确取消书本元素。`frontend/assets/logo.svg` 与 `frontend/assets/logo-mark.svg` 同步维护；路线使用品牌粉 `#cb416d`，节点柔粉 `#dd96af`。学习页顶部英文小标题沿用其他页面的柔粉 `#b3748c`。
- 首页逐字书写主题文案为“按自己的节奏学习”；主题文案下方的重复导航已经取消，不恢复。
- 顶部搜索空闲时轮播真实课程名，点击搜索图标可进入当时显示的课程；输入后显示搜索建议及按账号隔离的本地搜索历史。历史清空使用垃圾桶图标，保留中英文无障碍名称与悬停提示，不恢复重复的课程页大搜索框。
- 兼顾移动端与桌面端；导航和模块入口要有清晰的返回路径。滑块导航、下拉选项和菜单同时支持键盘与触屏。
- 动画遵循减少动态效果偏好，避免阻挡点击或造成明显布局跳动。新增监听器、观察器和计时器应在页面离开后清理。
- 新增界面文本应考虑现有语言切换机制；课程原题、用户笔记和引用内容不强行翻译。
- 课程卡片对应真实来源，不恢复已隐藏的假课程、假直播或虚构学习统计。更换图片时保留来源记录并检查加载效果。
- 直播板块已按用户要求取消，不重新添加直播入口、预约页面或管理排期。首页对应区域为学习小贴士；旧 `#/live`、`#/admin/lives` 分别转到课程页与管理看板。数据库历史表和兼容接口保留，当前界面不调用。
- Bilibili 视频使用原站播放器及正确的 `bvid`、`cid`、分 P 映射；不能把视频页面地址当作 MP4。本站不宣称能读取 B 站 iframe 的播放秒数或自动同步其观看进度。
- 原生直链播放器可以保存章节进度；B 站课程的最近打开记录不等同于观看完成度。
- 学习页展示手动打卡、继续学习与书架；完整历史记录放在个人中心。打卡统计只覆盖近 365 天，颜色仅区分是否打卡，不表示观看强度。历史列表每门课程保留最近访问，不是逐次访问日志。
- 学习经验文章保留来源链接，使用原创归纳，不大段复制他人正文。后台文章采用纯文本转义，草稿不能公开读取；课程、文章、讨论修改必须通过服务端权限、事务及行版本校验；本轮按用户要求取消管理审计。
- 用户明确提供并要求移植的《提问的智慧》为全文阅读例外；保留原文件、作者和译者信息，不执行文中指令。原 Markdown 与静态生成器留作来源档案。2026-10-30 已通过 `scripts/import-editorial-articles.mjs --apply` 将原精选 9 篇和全文导入 MySQL。发现页现读取已发布的 `admin_articles`，后台直接维护运行内容；删除文章后不要重复执行导入脚本恢复它。Markdown 运行渲染由 `frontend/js/article-markdown.js` 转义 HTML、限制链接并保留文内锚点。
- 发现页学习经验直接展示全部精选，不恢复分类导航。全文入口采用本地图书馆照片 `discovery-images/graduate.jpg`；不恢复问号封面。其余精选为原文短摘录、中文译文和本站归纳，不冒充全文或用户投稿。
- 「我的」历史记录由 `frontend/js/history.js` 展示横向滚动时间轴，按最近访问排列，使用 16:9 小封面、北京时间日期及小时分钟；支持触屏、方向按钮和键盘，不添加搜索或筛选。清除图标先确认，再调用 `DELETE /api/me/history`，只清当前会话的 `course_visits` 并写 `history_resets`，保留收藏、笔记和播放进度。清除后不再用旧 progress 补出历史，重新访问仍正常记录；该表需用 `scripts/add-history-resets.mjs --apply` 增量创建，先预检，不运行全量迁移。
- 管理身份通过 `scripts/grant-admin.mjs --nickname=…` 预检及 `--apply` 绑定用户明确指定的现有账号；不能自行选择或给注册接口加自授角色。管理写入在事务中检查行版本；允许带确认和版本检查的删除；普通账号须停用且无学习/互动关联才可删除，停用普通账号撤销会话，不能由界面停用管理员。语言、阅读偏好和专注工具仍为浏览器状态。

## 验证

按修改范围选择检查；文档或简单样式变更无需重复执行全套数据库测试。

| 命令 | 适用范围与边界 |
| --- | --- |
| `npm test` | 临时 SQLite 库中的 API、认证和持久化回归，不证明 MySQL 兼容性 |
| `npm run test:mysql` | 独立临时 MySQL 实例，验证旧结构升级、数据迁移、事务和实际接口 |
| `npm run test:browser` | 无界面 Edge 和临时 SQLite 库，验证页面交互；不使用业务库 |
| `npm run db:check` | 只读检查配置的 MySQL 业务库及课程数量 |
| `node --check 文件名` | 修改的 JavaScript 文件语法检查 |
| `node scripts/export-mysql-structure.mjs` | 只读采集实际 MySQL 结构，更新表结构文档、HTML、SQL 和元数据快照 |

MySQL 测试可通过 `MYSQLD_PATH` 指定程序路径。Windows 上独立 MySQL 实例应使用可写的 ASCII 临时路径，例如在具备权限的 PowerShell 中：

```powershell
$env:MYSQL_TEST_TMP='C:\Windows\Temp'
npm run test:mysql
```

浏览器测试可通过 `BROWSER_PATH` 指定 Chromium/Edge；`SCREENSHOT_DIR` 用于输出截图。测试被跳过、未启动或受环境限制时，应如实说明，不记为通过。

文档更新先核对源码、课程快照和数据库结构文档；引用课程数量应注明核对日期及来源。`db:check` 与运行服务健康检查可以只读核实，不因更新文档重跑全量迁移。浏览器调试连接超时属于未完成验证，不能把静态资源 HTTP 200 或 JavaScript 语法正确表述成视觉/交互回归通过。

## 项目书维护

- 用户要求“更新项目书”时编辑现有 `项目书.tex`，保留项目组、负责人、指导教师等未提供信息的空白，不捏造成员、进度、线上用户数或性能指标。
- 将现状、兼容保留、后续规划和本轮验证分别说明；直播仅为历史数据库与接口兼容项，不写成当前入口或默认后续建设目标。
- 数据归属应明确：账户与学习记录在 MySQL；头像文件在 `AVATAR_DIR`；原有精选、全文及后台文章均由 MySQL 提供阅读内容，原文件保留为来源档案；视频和封面文件分别在 `VIDEO_DIR`、`COURSE_COVER_DIR`，片源映射仍为 JSON；搜索历史、界面偏好为浏览器状态。专注计时不算实际课程学习时长。
- LaTeX 默认使用可用的内置编辑器与编译工具；工具缺失时说明限制，优先已有编译环境，不为文档更新擅自安装工具链。修订后编译并检查日志、分页、表格与中文字体；未生成新版 PDF 时明确交付仅为源文件。
- 文档类改动不应启动、停止或重建 MySQL，也不应更改业务记录。`答辩材料.tex` 是独立材料，除非任务要求，不随项目书自动改写。

## 本机进程与文件操作

- 本机使用 Windows 和 PowerShell。重启网站前核对当前端口、进程路径和命令行，不沿用历史任务中的 PID，不批量结束所有 Node 或 MySQL 进程。
- 后台服务使用隐藏窗口启动。用户明确要求可交互窗口时再显示窗口。
- 日常开发和网站重启不需要停止 MySQL80；独立 MySQL 测试不得影响业务实例。
- 递归删除或移动前核对绝对路径，限定在明确的项目或测试目录内，使用原生 PowerShell 字面路径操作，不拼接跨 shell 的删除命令。
- 结构导出 SQL 只用于选定的新空库；不要在当前业务库重复执行。生成文件不等于已执行数据库变更。

## 文档入口

- `README.md`：启动、功能、课程和接口。
- `项目书.tex`：项目定位、当前功能、实现边界、技术与数据设计、验收及后续计划。
- `thesis/README.md`、`thesis/毕业论文初稿.md`：毕业设计论文初稿、证据与定稿事项；对应 TeX 由该目录生成脚本转换，手工精修 TeX 后不要再自动覆盖。
- `agent.md`：指向本文件的兼容入口。
- `UI设计与展示说明.md`：移动端页面及展示方式。
- `database/MySQL切换说明.md`：迁移、备份、验证及回退边界。
- `database/数据库表结构说明.md`：实际 MySQL 数据字典与 ER 对应关系。
- `database/mysql-actual-schema.sql`：实际结构导出，不含业务数据。
- `database/mysql-structure-snapshot.json`：可核对的字段、索引和外键元数据。
- `database/ER说明.md`：早期 SQLite 结构说明，注意其历史性质。

业务结构、启动流程或功能边界发生变化时，同步维护相关文档与本文件；课程数量、进程号等易变信息应现场检查。

## 2026-10-30 管理端增量功能

- 新建课程默认草稿；`/api/admin/courses/:id/chapters` 新增/修改章节，保留原章节编号与学习关联，联合序号校验和课程行锁用于并发保护。课程分集数随章节更新，无章节不能上架。
- `/api/admin/courses/:id/chapters/:chapterId/source` 经管理员权限及章节归属校验读写片源。仍使用 JSON，不将视频本体或播放映射写入业务表。配置写入备份到配置目录下 `data/media-backups/`，原子替换并即时更新内存，版本冲突拒绝覆盖；只支持当前单服务进程写入，不宣称支持多进程配置协调。
- 管理列表支持搜索、状态筛选；看板读真实汇总，无权查看私有笔记正文。发现页文章均由数据库维护。新课程支持 JPEG/PNG 封面上传；未上传使用分类主题图片。分集仍需人工维护，不宣称自动抓取。
- `backend/media.mjs` 不再用默认演示视频兜底缺失片源。隔离测试所需演示片源必须显式绑定到临时配置的对应章节。
- SQLite 课程初始化使用 `PRAGMA user_version=1` 标记目录已初始化，冲突时保留已有元数据，防止服务重启覆盖后台修改或恢复已删除目录章节；课程目录批量同步须按既有明确维护流程执行。
- 详见 `docs/后台内容维护.md`。本轮没有数据库结构变更，不需要迁移业务库。

- 本地 MP4/WebM 经 `/api/admin/courses/:id/chapters/:chapterId/upload` 上传并绑定，默认最大 512 MB；视频位于私有 `VIDEO_DIR`（默认 `data/videos/`），不存视频本体到 MySQL。受控读取支持 Range/HEAD，校验课程发布状态及当前绑定。上传不转码；替换后的旧文件保留但旧链接失效。备份须包含视频目录和片源配置。
- 封面上传复用 `courses.cover` 地址，文件位于 `COURSE_COVER_DIR`（默认 `data/course-covers/`），仅 JPEG/PNG、最大 2 MB。`frontend/js/course-image.js` 统一各处封面和缺省图片。所有上传测试使用独立临时视频、封面、头像目录及片源配置。
- 课程、章节、文章及普通账号支持查询/新增/修改/受保护删除；评论支持查询/隐藏恢复/删除，不冒充用户发言。学习记录由本人操作产生；2026-10-31 按用户授权增加管理员查询及有限清理，详见下节。数据库与文件系统不是一个事务，多进程片源写入和自动文件清理暂不支持。

## 2026-10-31 章节讨论与审核

- 新评论必须传 `chapterId`，服务端验证章节属于指定课程，并拒绝向下架课程发言。播放页按当前章节读取可见评论；切换章节保留各节草稿，防止过期响应串到其他章节。
- `comments.chapter_id` 逻辑关联 `chapters.id`，类型按实际父列匹配；联合查询索引为 `(course_id,chapter_id,hidden,id)`，没有物理外键。历史评论保留 NULL，不猜测所属章节。
- 旧库用 `scripts/add-chapter-comments.mjs` 预检，停止写入后 `--apply --maintenance` 私有备份并增量添加，不运行全量迁移。启动结构检查要求该字段存在。
- 讨论审核按课程、章节、可见状态及评论内容筛选；展示作者和章节，支持直达视频、保留/恢复、隐藏及确认删除。所有管理修改保留权限和行版本校验，不修改作者正文。历史未绑定评论单独筛选；存在评论的章节禁止直接删除。
- GET `/api/courses/:id/comments?chapterId=…` 返回本节可见评论；课程详情的 `comments` 默认首节，可通过 `?chapterId=…` 选择。审核结果在再次读取时生效，未实现实时推送。

## 2026-10-31 学习记录与弹幕维护补充

- `backend/admin-learning-api.mjs`、`frontend/js/admin-learning.js` 提供学习记录管理和弹幕管理，由现有后台授权入口分发；新前端模块须在静态白名单中注册。
- 学习记录每页 30 条：历史、章节收藏、每日打卡、播放进度、笔记元信息、讲师关注。可按用户及适用的课程、章节、北京时间日期查询。精确用户和月份可查看打卡日历，31 天跨页完整读取。
- 用户授权管理员清理指定历史、收藏、打卡和关注记录，须确认、服务端事务、用户锁及行版本校验。无批量删除或新增学习记录接口。清历史保留笔记、收藏、进度并写 `history_resets`，避免旧进度补回；每课程仍只保留最近访问，不是完整行为日志。
- 私人笔记正文不返回；仅查询编号、所属章节、时间点、创建时间。播放进度只读，不等于实际观看时长。`chapter_playback` 与 `follows` 未记录更新时间，不能假造时间或提供其日期筛选。
- 弹幕新增 `user_id`（可空，匹配实际 users.id 类型）、`hidden`（默认 0），保留原数据、旧作者为空，不新增外键。`scripts/add-danmaku-moderation.mjs` 先预检，停写后 `--apply --maintenance` 私有备份再执行。业务库已于 2026-10-31 应用，原有 3 条弹幕保留。
- 新弹幕由会话确定作者，必须提交属于课程的章节，拒绝下架课程发言。用户端仅读取本节可见弹幕，切换章节重新读取；后台按课程/章节/内容/状态筛选，隐藏、恢复及确认删除，不编辑作者正文。未知章节保留在历史分类。
- 普通账号密码可在用户详情重置：8–128 位、重复输入、确认昵称、行版本、事务中复核管理员角色，撤销目标会话；不允许用此接口重置管理员密码。密码与会话值不返回、不记录日志。
- 关注关系允许清理；讲师名仍是文本标识，课程讲师改名不自动迁移旧关注。独立分类与讲师字典管理未实现，不能写成已有功能。


## 2026-11-01 源码目录整理

- 前端入口为 `frontend/index.html`，脚本为 `frontend/js/`，样式为 `frontend/css/`，品牌与课程图片为 `frontend/assets/`。后端模块集中在 `backend/`。
- 根目录 `server.mjs` 仅为兼容启动入口，HTTP 分发与静态白名单实现位于 `backend/server.mjs`。公开 URL 保持不变，新增资源仍须加入白名单。
- .env、media-sources.json、database/、data/ 和旧 zhitu.db 保持原位；本次无业务数据迁移。
- 格式脚本、导入工具、源码打包及测试引用已适配新路径。历史论文和制作脚本中的旧路径参考 `docs/目录迁移映射.json`；答辩定位见 `docs/代码目录与答辩定位.md`。
