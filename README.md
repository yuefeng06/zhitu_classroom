# 知途课堂全栈网课系统

当前源码已按 `frontend/`、`backend/` 分层；答辩查找入口见 [代码目录与答辩定位](docs/代码目录与答辩定位.md)。启动命令保持不变。

首次从 GitHub 下载后，请先阅读 [GitHub 源码使用说明](docs/GitHub使用说明.md)。仓库不含业务数据库或登录凭据；上传源码不等于在线部署。

## 章节视频收藏（2026-10-15）

收藏对象为每个章节的视频。favorites 仅保存 user_id、chapter_id、created_at，以 (user_id, chapter_id) 为联合主键，没有物理外键；课程通过 chapters.course_id 取得。同一课程可以收藏多集，书架显示分集标题、时长和所属课程，点击直接进入对应集。

POST /api/courses/:id/favorite 必须传入 chapterId，可传 active: true/false 明确设置状态；省略 active 时切换当前章节状态。身份由会话确定，校验章节属于指定课程；下架课程不能新增收藏。课程摘要返回 favorite_chapter_count，章节详情分别返回 favorite。

旧收藏按最近打开的有效章节迁移；无有效访问记录则取 position 最小的第一集，保留原收藏时间。先运行 node scripts/migrate-chapter-favorites.mjs 预检，停写后加 --apply --maintenance 备份并执行。详情见 [章节收藏迁移说明](database/章节收藏迁移说明.md)。不运行全量历史迁移。

播放信息本轮没有迁移：课程和章节资料在 MySQL，BVID、CID、分 P 和播放地址由 database/video-catalog.json、media-sources.json 解析，视频文件由来源站提供，不存数据库。

推荐按“用户—课程”聚合章节收藏；收藏同一课程多集仍只计一次收藏信号和一个关注人数。模型版本为 4，旧版模型回退，重新训练通过门控才可加载。

## 数据结构精简（2026-10-14）

实际 MySQL 已调整为 17 张基础表、1 个视图、0 个物理外键。保留主键、唯一约束与关联查询索引。删除 coins、admin_audit，comment_moderation.hidden 合并为 comments.hidden；sessions 与 account_status 合并进 users.disabled、users.session_token_hash、users.session_expires。登录采用单账号单会话，后一次登录替换前一次，令牌仅保存 SHA-256 摘要，Cookie 保留 HttpOnly/SameSite。投币与审计接口和页面已移除，讨论隐藏/恢复功能保留。

旧22表升级：先运行 `node scripts/simplify-schema.mjs` 预检；停止网站写入后执行 `node scripts/simplify-schema.mjs --apply --maintenance`，再重启。脚本备份结构和受影响数据、生成恢复 SQL；不执行全量历史迁移。详情见 [数据库精简迁移说明](database/数据库精简迁移说明.md)。

删除物理外键不等于删除关联字段。直接 SQL 现在可以产生孤儿记录，需运维自行校验；网站仍校验账号归属、对象存在性及章节所属课程，后台只下架/停用，不提供硬删除。旧 SQLite 文件属于历史资料，本版不会自动改写旧会话结构；SQLite 测试使用新临时库。推荐信号已移除投币，当时模型版本提升为 3（当前章节收藏版本为 4），旧模型自动回退到内容/热门排序，须重新训练并通过门控才能启用新模型。

## 代码格式

运行 `npm run format` 统一业务 JavaScript、CSS、HTML、配置 JSON、测试和维护脚本的格式，运行 `npm run format:check` 只检查而不写入。使用固定版本的 Prettier 和 SQL Formatter 作为开发依赖，不增加网站运行时框架。规则见 `.prettierrc.json`、`.editorconfig` 和 [代码格式说明](docs/代码格式说明.md)。

PowerShell 脚本使用 PowerShell 7 与 PSScriptAnalyzer：`npm run format:powershell` 整理格式，`npm run format:powershell:check` 只检查。本机本轮下载的格式工具保存在 `artifacts/source-format/tools/`；其他环境需自行准备 PSScriptAnalyzer 模块。

格式脚本采用明确的源码范围，不遍历业务数据、私人备份、第三方依赖或论文源码快照。自动生成的文章数据、手写字形、数据库导出，以及由程序按固定行格式读取的 `database/mysql-schema.sql` 保持原样；手工维护的两个补表 SQL 和答辩只读查询纳入格式检查。格式命令不会执行 SQL 或连接数据库。

## 管理后台与技术升级（2026-10-07）

管理端已接入MySQL，包含真实看板、用户状态、课程、文章、讨论审核。登录受指定的管理员账号后，从个人中心进入管理工作台（#/admin）；普通账号访问管理接口返回403。现有业务库本轮已完成增量升级并按用户指定配置管理员，日常启动无需重复升级或授权。

其他旧库升级先执行 node scripts/upgrade-platform.mjs 预检，确认没有重复昵称后加 --apply。脚本备份相关结构，补充管理员身份、管理文章表与昵称唯一索引；旧22表精简使用下述专用迁移，不运行全量历史迁移。新环境先注册账号，再由运维执行 node scripts/grant-admin.mjs --nickname=指定昵称 预检及 --apply 授权；网站注册不接受自授管理员。不要未经账号拥有者明确指定就分配管理员。

管理列表每页 50 条，支持搜索和状态筛选；编辑、删除带行版本，冲突返回 409。课程、章节和普通账号支持增删改查；课程支持封面上传和逐章节视频上传，发布后直接用于前台。文章可增删改查、发布/撤回；2026-10-30 原有 9 篇精选和《提问的智慧》已导入 MySQL，发现页读取数据库。评论可隐藏/恢复和删除，不改写作者原话。课程/章节有学习关联时禁止删除、可下架；普通账号须停用且无关联才能删除，管理员受保护。完整步骤与文件备份边界见 [后台内容维护](docs/后台内容维护.md)。

登录注册改用异步scrypt（运行4个、排队最多16个），直接连接地址每15分钟最多60次请求；内存限流不适用于跨实例统一控制。昵称唯一索引保证并发同名请求仅一次成功。课程摘要从4N次个人状态查询改为4次批量查询；内容向量按课程元数据签名缓存。

验证：npm test 24项、独立MySQL 13项、ADMIN_ONLY=1浏览器专项1项通过；全量浏览器本轮未重跑。npm run benchmark:summaries仅使用MySQL连接私有临时表；33门课程摘要中位耗时28.576ms→1.377ms，这是单连接函数基准，不是整站延迟。实验与范围见 thesis/evidence/platform-validation.md。

## 历史时间轴（2026-10-05）

个人中心历史记录支持横向滚动，以节点、连线和北京时间日期/时刻回顾最近访问。每门课程保留最新一次记录，不表示观看时长或逐次播放事件。支持触屏滑动、左右按钮，时间轴聚焦后用左右方向键及 Home/End 浏览。

右上角垃圾桶图标打开清除确认框，确认后仅清除当前账号的访问历史；收藏、笔记、章节播放位置和课程完成进度保留。取消或请求失败不清空界面。再次访问课程会重新产生记录。`DELETE /api/me/history` 必须有登录会话，不接受指定用户编号；事务锁定用户，删除 `course_visits` 并记录 `history_resets`，阻止旧 `progress` 在清空后补出历史。

旧库升级先运行 `node scripts/add-history-resets.mjs` 预检，再加 `--apply`，最后重启服务；该脚本备份相关结构并只新建标记表，关联列类型匹配实际 `users.id`，不会替用户清空历史。当前业务库已完成增量建表，当时结构为 17 张表、1 个视图；2026-10-07 管理升级后曾为 22 张表；2026-10-14 精简后为 17 张表、1 个视图、0 个物理外键。不要为此运行历史全量迁移。

## 个性化课程推荐（2026-10-05）

首页推荐已从固定课程编号改为动态排序。课程类别、学科、讲师与标题/简介词项构成 TF-IDF 向量，中文文本使用双字切分；收藏、最近访问分别采用 3、1 的兴趣权重，按用户和课程去重并封顶为 6。用余弦相似度匹配兴趣，辅以去重关注人数；优先展示未接触的上架课程。卡片下显示简短推荐理由，“换一组”继续展示同一排序结果。匿名及新用户使用关注人数排序，无行为数据时按课程编号稳定排列。搜索仍是 SQL 模糊匹配。

另提供 BPR 矩阵分解训练与混合排序：

```powershell
npm run recommend:train
```

该命令只读当前配置数据库，输出汇总评估，写入私有 `data/recommendations/model.json`，不新增表、不改业务记录。模型包含用户隐向量，禁止公开、加入静态白名单或源码附件。至少 10 位有行为用户、50 组去重交互、3 门课程，且训练/验证/测试各至少 5 位用户才进入评估。按全局唯一时间戳约 60/20/20 切分，不拆分同一时间戳；比较热门、内容、纯 BPR 和混合排序的 HitRate@5、Recall@5、NDCG@5、Coverage@5。验证集混合 NDCG 必须严格优于热门与内容基线且命中率不低于它们才通过启用门控。训练加验证重训后仅评估一次独立测试集，不用测试集调参；通过门控时另用全部记录拟合服务模型。训练使用固定随机种子、8 维向量、160 轮随机梯度更新；未观察课程是相对排序采样项，不是用户明确不喜欢的课程。

训练后重启网站载入模型；模型仅适用于同一数据库，7 天后、文件无效、未知用户或没有兴趣记录时回退内容/冷启动排序。2026-10-07 业务库检查只有 3 位有行为用户、15 组记录，报告 `insufficient-data`，当前没有启用机器学习模型。内容推荐可直接使用；不能据此宣称机器学习效果已验证。B站访问不是播放完成，笔记正文、账户资料和密码不参与训练。

评估来自当前状态快照，访问表只保留最后访问，收藏取消后不保留事件。全局分区仍是最近关系快照诊断，不是完整事件流的严格回放；元数据没有历史版本。独立测试集避免复用验证指标，但不能消除快照选择偏差。合成对照运行 `npm run recommend:experiment`，不写服务模型；本轮混合未优于内容基线，报告 `baseline-not-improved`。尚无曝光记录、真实线上 A/B 试验或学习效果结论。算法参考 [BPR 原始论文](https://arxiv.org/abs/1205.2618)。

## 当前界面（2026-09-30）

参照用户提供的《学习平台首页设计 (1)》重排首页：浅灰背景、白色课程卡片、粉色导航与操作点缀、深蓝精选横幅。首页由 `frontend/js/home.js` 渲染，`frontend/css/theme.css` 最后加载并统一课程、发现、学习、个人中心与管理工作台页面的视觉。

首页支持主题筛选、推荐课程换组、手动切换精选课程和学习快捷入口。课程、笔记与收藏数量来自现有 API；侧栏提供学习小贴士，不使用虚构排行、观看人数或连续打卡数据。改版不修改数据库结构或业务记录。

## 启动

需要 Node.js 22.13 或更新版本、MySQL 8.0+。后端默认使用 MySQL，前端静态页面和 API 由同一个 Node.js 服务提供。

常规启动：在项目根目录的 `.env` 填写已有 MySQL 的连接信息，执行：

```bash
npm install
npm run db:check
npm start
```

浏览器访问 http://localhost:3000 。`/api/health` 的 `database` 返回 `mysql` 才表示当前服务已连接 MySQL。启动会自动读取 `.env`，不会在连接失败时自动切回 SQLite。

只有明确需要从旧 SQLite 迁移时才使用 `npm run db:migrate`，并按切换说明暂停写入。迁移会备份两侧数据，保留原 `zhitu.db`，保留 MySQL 关联列的无符号类型。已有账户或记录发生冲突时停止，不覆盖历史数据。完整步骤、备份位置及回退说明见 [MySQL 切换说明](database/MySQL切换说明.md)。开发模式为 `npm run dev`；`PORT` 控制端口，`DB_PATH` 指定 SQLite 迁移源。只有显式配置 `DB_CLIENT=sqlite` 才运行 SQLite 模式。

## 演示账号

- 昵称：`林同学`
- 密码：`123456`

也可在登录窗注册新账号。登录使用 HttpOnly Cookie 会话，刷新页面及重启服务后可恢复，有效期七天。退出登录会撤销服务端会话。

### 账户与头像（2026-10-01）

- 未登录时右上角提供“登录 / 注册”入口。表单支持模式切换、确认密码、显示密码和错误提示；新账号密码至少 6 位，注册成功后直接登录。
- 登录后通过右上角菜单“更换头像”，或点击个人中心头像编辑。支持选择不超过 4 MB 的 JPG、PNG、WebP；拖动或使用滑杆调整位置和缩放，预览后保存，也可恢复默认。
- 浏览器裁剪为 256 × 256 JPEG；服务端验证格式、尺寸和大小（不超过 200 KB），按当前会话更新已有 `users.avatar`。头像刷新、重新登录或服务重启后保留。默认头像文件缺失时显示网站标志。
- 图片在本机 `data/avatars/`，可用 `AVATAR_DIR` 覆盖；数据库保存随机图片地址。备份和迁移时须同时保留图片目录；历史图片暂保留，避免并发更新造成资源失效。前端静态白名单不开放此目录。
- 顶部和手机底部导航使用连续滑块轨道。左右方向键移动导航焦点，Enter 确认；分类选项的方向键直接切换。增加弹窗入场、精选切换、卡片淡入与按钮光点动画，遵循系统“减少动态效果”。

头像接口：`POST /api/me/avatar` 接收 `{ image: "data:image/jpeg;base64,…" }` 或 `{ reset: true }`；要求登录，返回当前用户资料。`GET /api/avatars/<随机标识>.jpg` 返回 JPEG，地址可用于显示公开头像。本次没有新增或改动数据库列。

## 已连通功能

- 首页推荐、分类、课程及讲师搜索，搜索条件保留在地址中。
- 课程详情、评论、弹幕和章节目录。
- 登录注册、课程书架、关注讲师、讨论和私有笔记，数据持久化。
- 原生视频播放器：播放/暂停、拖动进度、音量、全屏、0.75–2 倍速、前后跳转 10 秒、画中画、自动下一节。
- 直链课程每 5 秒、暂停、切换章节及离开页面时保存播放位置，重新进入恢复最近章节及秒数。
- 专注模式、分享当前章节和时间点、带时间的私有笔记（可定位、删除），手机端也可使用。
- 浅灰背景、白色卡片、粉色点缀和深蓝精选横幅。
- 直播板块已取消：首页改为学习小贴士，个人中心提供书架入口，管理端不再展示直播草稿或排期。
- 接口失败、登录失效、视频加载失败重试提示；空章节课程展示未发布状态。

## 当前上架课程

课程中心展示 **33 门真实课程、2,205 个原站分集**，分为高中（8 门）、考研（12 门）、考公（3 门）、大学与技术公开课（10 门）。首页精选覆盖不同学习方向；课程中心按板块分组，支持分类、学科、关键词筛选，以及分集数或名称排序。筛选条件保留在地址中。采用当前浅灰背景、白色卡片与粉色点缀。

| 课程 | 分类 / 学科 | 实际分集 | 原站链接 |
| --- | --- | --- | --- |
| 高中语文 · 大题答题模板 | 高中课程 / 语文 | 1 | [BV1oh4y1s7Lb](https://www.bilibili.com/video/BV1oh4y1s7Lb/) |
| 高中数学 · 基础与解法全集 | 高中课程 / 数学 | 198 | [BV147411K7xu](https://www.bilibili.com/video/BV147411K7xu/) |
| 高中物理一轮复习 · 运动学 | 高中课程 / 物理 | 15 | [BV1D54y1m7Av](https://www.bilibili.com/video/BV1D54y1m7Av/) |
| 高中物理一轮复习 · 电场 | 高中课程 / 物理 | 17 | [BV1A5411E7Q1](https://www.bilibili.com/video/BV1A5411E7Q1/) |
| 高中物理一轮复习 · 磁场圆周 | 高中课程 / 物理 | 17 | [BV1Xb4y1Q7Eq](https://www.bilibili.com/video/BV1Xb4y1Q7Eq/) |
| 高中化学 · 基础与解法全集 | 高中课程 / 化学 | 200 | [BV1Qi4y1R7tW](https://www.bilibili.com/video/BV1Qi4y1R7tW/) |
| 高中地理 300 讲（上） | 高中课程 / 地理 | 164 | [BV1kr4y1v7uf](https://www.bilibili.com/video/BV1kr4y1v7uf/) |
| 高中生物 · 基础与解法全集 | 高中课程 / 生物 | 140 | [BV1YC4y1o7E3](https://www.bilibili.com/video/BV1YC4y1o7E3/) |
| 2026 考研数学一真题 · 李烈逐题讲解 | 考研课程 / 数学 | 22 | [BV1AuoMBBE2p](https://www.bilibili.com/video/BV1AuoMBBE2p/) |
| 2025 考研数学一真题 · 李烈逐题讲解 | 考研课程 / 数学 | 23 | [BV1a96DYgEYZ](https://www.bilibili.com/video/BV1a96DYgEYZ/) |
| 27 考研数学一 · 真题分类逐题讲解 | 考研课程 / 数学 | 55 | [BV1KXeu6tEUy](https://www.bilibili.com/video/BV1KXeu6tEUy/) |
| 概率救命 · 概率知识串讲 | 考研课程 / 数学 | 17 | [BV1zH4y117JX](https://www.bilibili.com/video/BV1zH4y117JX/) |
| 徐涛 · 考研政治零基础经典课 | 考研课程 / 政治 | 37 | [BV15ocBzQEJJ](https://www.bilibili.com/video/BV15ocBzQEJJ/) |
| 2027 考研英语 · 三合一阅读技巧 | 考研课程 / 英语 | 18 | [BV1VD5x6NE7a](https://www.bilibili.com/video/BV1VD5x6NE7a/) |
| 考研电路 · 电路原理零基础精讲 | 考研课程 / 电路原理 | 78 | [BV1uW4y1v7xr](https://www.bilibili.com/video/BV1uW4y1v7xr/) |
| 公务员行测 · 数量关系系统课 | 考公课程 / 数量关系 | 14 | [BV19N411U7Pc](https://www.bilibili.com/video/BV19N411U7Pc/) |
| 王道计算机考研 · 数据结构 | 考研课程 / 408 专业课 | 104 | [BV1b7411N798](https://www.bilibili.com/video/BV1b7411N798/) |
| 王道计算机考研 · 操作系统 | 考研课程 / 408 专业课 | 86 | [BV1YE411D7nH](https://www.bilibili.com/video/BV1YE411D7nH/) |
| 王道计算机考研 · 计算机组成原理 | 考研课程 / 408 专业课 | 92 | [BV1ps4y1d73V](https://www.bilibili.com/video/BV1ps4y1d73V/) |
| 王道计算机考研 · 计算机网络 | 考研课程 / 408 专业课 | 94 | [BV19E411D78Q](https://www.bilibili.com/video/BV19E411D78Q/) |
| 考研线性代数 · 复习课程 | 考研课程 / 数学 | 13 | [BV13NCrBVEN3](https://www.bilibili.com/video/BV13NCrBVEN3/) |
| 花生十三 · 逻辑判断 600 题精讲（第1套） | 考公课程 / 逻辑判断 | 1 | [BV1TFdFBUE9r](https://www.bilibili.com/video/BV1TFdFBUE9r/) |
| 花生老师 · 言语理解知识点速通 | 考公课程 / 言语理解 | 1 | [BV16NhA6sE7J](https://www.bilibili.com/video/BV16NhA6sE7J/) |
| 吴恩达 · AI 初学者 Python 入门 | 大学与技术公开课 / Python | 35 | [BV1Ydv8BFEer](https://www.bilibili.com/video/BV1Ydv8BFEer/) |
| 翁恺 · C++ 面向对象程序设计 | 大学与技术公开课 / C++ | 33 | [BV16P4y1o7No](https://www.bilibili.com/video/BV16P4y1o7No/) |
| MIT · 线性代数公开课 | 大学与技术公开课 / 数学 | 70 | [BV1rH4y1N7BW](https://www.bilibili.com/video/BV1rH4y1N7BW/) |
| Harvard CS50 · SQL 数据库入门 | 大学与技术公开课 / 数据库 | 8 | [BV1EK411x7TP](https://www.bilibili.com/video/BV1EK411x7TP/) |
| The Cherno · C++ 系列教程 | 大学与技术公开课 / C++ | 98 | [BV1qh411p7Sa](https://www.bilibili.com/video/BV1qh411p7Sa/) |
| MIT Missing Semester · Shell 与课程概览 | 大学与技术公开课 / 开发工具 | 1 | [BV1Eo4y1d7KZ](https://www.bilibili.com/video/BV1Eo4y1d7KZ/) |
| 李宏毅 · 机器学习与深度学习 | 大学与技术公开课 / 人工智能 | 59 | [BV1SMe36KEC2](https://www.bilibili.com/video/BV1SMe36KEC2/) |
| 尚学堂马士兵 · Java 系列教程 | 大学与技术公开课 / Java | 245 | [BV1Yt41197sM](https://www.bilibili.com/video/BV1Yt41197sM/) |
| 哈尔滨工业大学 · 操作系统 | 大学与技术公开课 / 操作系统 | 32 | [BV19r4y1b7Aw](https://www.bilibili.com/video/BV19r4y1b7Aw/) |
| UC Berkeley CS186 · 数据库系统导论 | 大学与技术公开课 / 数据库 | 217 | [BV13a411c7Qo](https://www.bilibili.com/video/BV13a411c7Qo/) |

分集数量以公开元数据快照为准，不根据标题推测。MIT 线代标题写有72讲，该链接实际列出70个分集；Cherno C++ 与 Missing Semester 的两个链接各仅包含第1讲。物理的运动学、电场、磁场圆周分别建立课程。导学、介绍等原站分集也保留，可通过目录搜索定位课程内容。

公开元数据保存在 `database/video-catalog.json`；`backend/catalog.mjs` 在迁移时同步课程与分集（SQLite 模式为启动时同步），新增章节 ID 为课程 ID × 10000 + 分P序号，保留原站 cid。每节视频均使用对应 bvid、page、cid，来源链接也带分P序号。日常启动不依赖外网。

`node scripts/import-course-sources.mjs` 可刷新22门课程的公开元数据。脚本每批最多请求3个链接，任何一个失败都保留原有目录文件；成功后执行数据库迁移并重启服务生效。更新元数据不下载视频。原有五门课程的快照也保留在同一文件中。可加 `--ids=34,35,36` 仅刷新指定课程。

所有课程列表统一过滤下架内容，不删除底层历史学习数据。旧演示直播已下架，不会在启动时自动创建，预约接口拒绝下架直播。直播页面及入口已取消，旧页面链接跳转到课程页；数据表和旧接口仅为历史兼容保留，网站不再调用。显式写入 `media-sources.json` 的章节配置可以覆盖快照中的视频源。

## 学习体验与页面交互

保留暖米色背景。首页增加高中理科、考研408、数据库三条课程入口；我的学习提供最近访问、收藏书架和课程数量概览，空记录时展示真实课程推荐。

登录后打开课程或切换章节会保存最近访问章节，重新打开时恢复章节；B站播放秒数仍由原站管理，不把打开记录当作观看进度。游客切换章节也会更新当前链接，便于刷新与分享。

卡片进入视口时轻微淡入、位移，保留浏览器原生滚动；增加顶部阅读进度条、返回顶部和返回列表时的位置恢复。遵循系统“减少动态效果”设置。搜索支持中文输入法，登录支持密码框回车，章节切换会同步目录与地址。

## 视频源与播放边界

历史记录（2026-10-02 已按用户要求下架，以下为旧接入说明）：原首页「武忠祥高等数学」接入的视频为：https://www.bilibili.com/video/BV15Ke46XEFG/ 。2026-09-20 读取原站公开元数据：该链接当前只有一个视频分P，时长 16583 秒（4:36:23）。它作为独立课程 9、章节 9001 展示，保留已有课程与数据。

Bilibili 视频使用原站 iframe 播放器，原站的播放权限、清晰度、登录和地域限制仍然适用。页面提供「在来源站打开」入口。第三方播放器不向本页提供播放时间：**B站课不宣称自动同步进度、跨站续播或自动下一节**，笔记时间需手动填写，倍速等控制由B站播放器提供。本站支持其收藏、讲师关注、讨论、专注模式和私有笔记。

旧演示课程（ID 1–8）已从首页、课程中心、我的学习和收藏入口移除，底层历史记录与原地址仍保留。其旧章节使用 MDN 的公开 CC0 花朵 MP4 短片，用于验证真实 HTML5 播放与续播，页面明确标注为演示素材，非相应学科教学视频。来源：https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video 。没有把视频页面链接当作 MP4，也不提取第三方临时或鉴权媒体地址。

编辑项目根目录的 `media-sources.json`，重启服务即可替换片源。`default` 是未单独配置章节的默认源；`chapters` 按数据库章节 ID 覆盖。也可用环境变量 `MEDIA_CONFIG_PATH` 指定配置文件。

直链章节配置示例（将地址换成实际可访问的 MP4/WebM 直链）：

```json
{"url":"https://your-cdn.example/lesson-01.mp4","label":"第一课：课程导学","sourcePage":"https://your-course.example/lesson-01","demo":false}
```

B站章节配置示例：

```json
{"kind":"bilibili","bvid":"BV15Ke46XEFG","page":1,"label":"武忠祥高等数学 · B站课程","demo":false}
```

直链必须是浏览器支持的 HTTP(S) 视频地址。当前不接入需要额外解码库的 HLS/DASH。进度按每个章节到达过的最远播放位置取平均，重新观看不降低完成比例，最近播放位置则可向前恢复；这是学习位置记录，不是不可伪造的观看时长统计。旧的模拟百分比会在第一次真实播放保存后改为按章节计算。

管理员端已接入服务端权限和 MySQL，支持课程、章节、文章和普通账号增删改查，以及评论审核和删除。支持本地视频与封面上传，发布后用于真实前台展示；直播板块已取消。此处原先的浏览器演示原型说明已被正式实现取代。

`database/zhitu_mysql.sql` 已按当前 15 张表更新，为空 MySQL 8.0+ 库提供建表及真实课程数据初始化，不包含 DROP，也不作为旧库迁移脚本。正式后端默认驱动已改为 MySQL；旧库切换使用 `npm run db:migrate`，不直接导入此初始化 SQL。`database/zhitu_sqlite.sql` 是实际结构与公开课程快照；ER 图与完整字段字典见 `database/ER说明.md`。

## 接口

所有返回值为 JSON；写入请求使用 `Content-Type: application/json`。用户身份来自 Cookie，不接受客户端伪造的用户编号。

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/api/health` | 服务健康检查 |
| POST | `/api/auth/register`、`/api/auth/login` | `{nickname,password}` |
| GET | `/api/auth/me` | 当前用户，游客返回 `{user:null}` |
| POST | `/api/auth/logout` | 退出登录 |
| GET | `/api/home` | 推荐、继续学习 |
| GET | `/api/catalog` | 课程总数、分集总数、分类及学科计数 |
| GET | `/api/courses?q=&category=&subject=` | 搜索、分类及学科筛选（兼容旧分类“考研公共课”） |
| GET | `/api/courses/:id` | 详情、章节和个人互动状态；评论默认首节，可用 `?chapterId=…` 指定章节 |
| POST | `/api/courses/:id/favorite`、`coin`、`follow` | 切换状态，返回 `{active}` |
| POST | `/api/courses/:id/visit` | `{chapterId}`，保存当前用户最近访问章节，不修改观看进度 |
| POST | `/api/courses/:id/progress` | `{chapterId,currentTime,duration}`，单位秒；服务端计算课程比例，拒绝B站章节 |
| GET | `/api/courses/:id/comments?chapterId=…` | 仅返回指定章节的可见评论，校验章节属于该课程 |
| POST | `/api/courses/:id/comments` | `{chapterId, content}`，登录后发布到当前章节，下架课程拒绝新评论 |
| GET | `/api/courses/:id/danmaku?chapterId=…` | 指定章节可见弹幕 |
| POST | `/api/courses/:id/danmaku` | `{content,chapterId,atSecond?,color?}`，章节必填，作者由会话确定 |
| GET | `/api/courses/:id/notes` | 当前用户的课程笔记 |
| POST | `/api/courses/:id/notes` | `{chapterId,atSecond,content}`，返回 201 |
| DELETE | `/api/notes/:id` | 只允许删除自己的笔记 |
| GET | `/api/me/courses` | 已学课程与收藏的章节视频，需登录 |
| GET | `/api/lives` | 历史兼容接口；界面已取消直播，不再调用 |
| POST | `/api/lives/:id/reservation` | 历史兼容接口；需登录，界面不再提供预约 |

## 验证

```bash
npm test
```

测试使用临时数据库，不修改项目的 `zhitu.db`。接口测试覆盖认证、课程搜索、两类片源、逐章节进度、私有笔记及越权删除、互动、预约、错误参数、服务重启后数据恢复及数据库文件访问限制。另运行 `npm run test:browser` 执行浏览器测试（需要允许运行 Chromium 页面进程的环境）。浏览器测试使用本机 Edge 无头模式，验证页面加载、登录、视频真实播放与暂停保存、倍速、专注模式、时间笔记、B站嵌入、评论转义、搜索和学习中心；未安装 Edge 时跳过，可用 `BROWSER_PATH` 指定 Chromium 浏览器可执行文件。

## 移动端与周五展示

用户端使用首页、发现、学习、我的四栏底部导航（620px 以下显示）。新增独立分类导航页 `#/explore` 与个人中心 `#/profile`。管理端入口在个人中心，也可直接访问 `#/admin`。管理端使用服务端权限与真实API，支持分页的课程编辑、文章发布、用户状态和讨论审核。

页面清单、设计规范与展示步骤见 [UI设计与展示说明](UI设计与展示说明.md)。界面截图在 `artifacts/ui`；可使用 `SCREENSHOT_DIR` 环境变量配合浏览器测试重新生成。

当前用户端背景由 `frontend/css/theme.css` 绘制淡粉与浅紫渐变，旧 `frontend/assets/landscape.svg` 保留为历史素材。背景随页面滚动缓慢位移，最大 180px；使用被动滚动监听与 requestAnimationFrame，不接管滚轮。系统启用减少动态效果时背景静止，管理端继续使用原有纯色背景。

数据库文档可在项目根目录执行 `node scripts/export-database.mjs` 重新生成。该脚本只读 zhitu.db，并在内存空库中验证 SQLite 导出；不导出账号、会话或个人数据。PNG 展示图片需在 SVG 更新后重新渲染。MySQL 迁移与接口已通过本机独立 MySQL 8.0.30 实例验证；业务库是否完成切换以 `npm run db:check` 和正在运行服务的 `/api/health` 为准。

## 语言与外观设置

用户端右上角地球按钮打开界面设置，可切换简体中文 / English、标准 / 舒适阅读字号、柔和背景及背景视差。偏好保存在本机 localStorage 的 zhitu-appearance 项，存储不可用时仅对当前访问生效。遵循系统减少动态效果设置。

课程中心可在卡片 / 清单视图之间切换，选择随刷新保留。非输入状态按 / 可聚焦顶部搜索。保留原有米色与绿色。

语言切换仅本地替换界面文案，不发送内容到翻译服务，也不重新挂载播放器或清空表单。课程原名、讲师、简介、章节标题、评论和笔记保留原文；管理工作台界面沿用语言辞典，原始业务内容不翻译。语言辞典及动态计数规则集中在 frontend/js/experience.js。新增文案应添加到辞典，原始业务内容应放在排除选择器或 data-original-content 容器内。

## 头像菜单与个人中心

使用用户提供的 avatar-cheese.jpg 作为默认展示头像，顶部头像打开个人菜单，提供个人中心、最近学习、书架、界面设置和登录 / 退出入口；支持点击外部、Esc 关闭以及方向键导航。个人页点击头像可放大查看。

个人中心展示真实的最近课程、私有笔记摘要、关注讲师和加入日期。GET /api/me/overview 需要会话认证，只返回当前用户的数据，笔记和讲师列表过滤旧演示课程。个人中心的专注计时支持 15 / 25 / 45 分钟、暂停、继续与重置，使用截止时间计算剩余时长。状态按账号保存在当前标签页 sessionStorage 中，刷新和页面切换后恢复；不计作真实观看进度，不跨设备同步。旧学习目标模块已移除。头像菜单点击提供短暂光晕反馈，系统减少动态效果开启时禁用光晕。

用户端顶部及手机底部导航使用跟随当前栏目的滑块。通过 ResizeObserver 同步中英文标签宽度与窗口变化，页面切换时平滑移动；系统减少动态效果模式下直接切换。界面设置新增“导航样式”：柔和渐变 / 简洁纯色，选择保存在现有外观偏好中。导航、课程标题、正文与常用操作文字支持舒适字号，配色遵循当前粉色与浅灰主题。

课程卡片使用 course-images/ 中的 30 张本地 JPEG，来源记录见 database/cover-sources.json，可用 node scripts/import-course-covers.mjs 更新。29 张来自对应 Bilibili 视频的公开封面；课程 9 原站无法返回封面，使用 Antoine Dautry / Unsplash 的数学公式照片作主题图（https://unsplash.com/photos/mathematics-computation-05A-kdOH6Hw）。卡片图片懒加载，失败时保留文字封面。分类与学习/书架入口使用滑块轨道，移动端可横向滚动，遵循减少动态效果偏好。

发现页调整为四个实景方向入口、按学习目的切换的入门课程推荐以及可展开的学习建议，移除重复的课程总览横幅、书架及直播快捷入口。方向图片来源记录：database/discovery-image-sources.json；均为本地 JPEG。个人信息栏的界面设置按钮改为文字入口。

学习页：最近章节入口、账号内课程搜索、方向筛选、课程名称排序、书架收藏/移除（调用真实 API）。个人页：全部私有笔记检索、按课程筛选、回到章节、导出当前筛选笔记为 Markdown；最近探索方向仅按访问课程统计，不推断观看时长。GET /api/me/notes 认证后仅返回当前账号已上架课程的笔记。移除个人页重复的续学/书架/发现快捷入口，保留专注计时、讲师关注、书架与管理工作台入口。

发现页提供 9 篇学习经验精选，内容为简短中文整理；每篇阅读弹窗保留原作者、来源、原文标题和外链，不代表站内用户投稿。来源包含 The Learning Scientists 的 Retrieval Practice / Spaced Practice、UNC Learning Center 的 Studying 101、MIT Admissions Blogs 的 How to Finals（Kevin S.）。核对日期 2026-09-21，数据与原文 URL 见 frontend/js/study-posts.js。学习页方向/排序使用 frontend/js/select-menu.js 自定义粉色主题菜单：保留原生 select 为数据源，支持鼠标、方向键、Enter、Escape、Tab，退出页面清理事件。

品牌标志：frontend/assets/logo-mark.svg 为纯矢量图形标，使用展开的书页、向上延伸的路径与一点哑金光点；frontend/assets/logo.svg 为图形与中文字标组合。主题色 #28594b，点缀色 #aa8b52。已接入页头与 SVG favicon，不依赖外部图片服务；文字组合采用系统中文字体。

### 增量维护课程目录

公开分集快照由 `node scripts/import-course-sources.mjs --ids=31,37,38` 获取；封面可用 `node scripts/import-course-covers.mjs --ids=31,37,38` 单独更新，避免覆盖其他主题图片。

MySQL 不从旧 SQLite 自动导入新目录。使用 `node scripts/sync-mysql-catalog.mjs --ids=31,37,38` 只读预检，确认后加 `--apply` 才写入。工具先把目标课程与章节备份到私有 `database/backups/catalog-时间/`，在事务中新增或更新课程及章节，不删除历史章节、不修改账号、笔记、收藏和学习记录。遇到章节编号冲突或缩减目录时停止。更新后重启网站以载入新视频映射。

2026-10-01：Cherno 课程保留编号 31，用 98 集新版替换单集来源。首讲仍为 Welcome to C++（425 秒），保持章节编号 310001；新增电路课程 37 和数量关系课程 38。评论头像统一作为限定路径的图片显示，加载失败显示昵称首字，避免头像地址挤占评论排版。

本次专项浏览器回归（独立 SQLite 测试库）：PowerShell 中设置 `$env:COURSE_AVATAR_ONLY='1'` 后运行 `npm run test:browser`，覆盖三门更新课程的目录、末集映射、本地封面、头像上传及评论图片失败回退。测试完成后用 `Remove-Item Env:COURSE_AVATAR_ONLY` 恢复全量浏览器测试。该专项不验证 Bilibili iframe 的实际播放权限。

### 顶部搜索

顶部搜索输入时使用真实课程 API 提示最多 6 门匹配课程，可按课程、讲师或学科查找；方向键选择，Enter 打开，Escape 收起，也可查看完整搜索结果。最近 8 次提交的搜索保存在当前浏览器 localStorage，按登录账号与访客分开，可清空；不写入 MySQL、不跨设备同步。支持中文输入法和移动端，存储不可用时暂存于当前页面内存。

专项验证：PowerShell 设置 `$env:SEARCH_ONLY='1'` 后运行 `npm run test:browser`；完成后 `Remove-Item Env:SEARCH_ONLY` 恢复全量测试。

2026-10-01 学习经验更新：新增交错练习、图文结合、具体例子、康奈尔笔记和拖延任务拆解 5 篇来源文章的整理。每篇附简短英文摘录、本站中文译文、学习要点和本站实践建议。出处与核对日期在 `frontend/js/study-posts.js` 中，发现页直接展示全部文章；当时为静态内容；2026-10-30 已导入 MySQL，发现页改为读取后台已发布文章。课程页移除标题区重复搜索框，统一使用顶部搜索，结果上方可清除当前关键词。

双语文章与课程入口专项验证：PowerShell 设置 `$env:POSTS_ONLY='1'` 后运行 `npm run test:browser`，验证分类、英文摘录、中文译文、来源链接、移动端溢出、语言切换及关键词清除；结束后 `Remove-Item Env:POSTS_ONLY`。

2026-10-01 后续完善：全部 9 篇学习经验均提供英文短摘录、本站译文和原文链接；移除列表卡片的“中英对照”标签。课程清单视图使用独立封面尺寸，避免图片遮挡文字；课程排序接入粉色主题菜单，支持键盘操作并在页面切换时清理监听器。

当前 `POSTS_ONLY` 浏览器专项同时检查桌面/移动端课程清单封面与文字边界、主题排序菜单及键盘操作，以及全部 9 篇文章的原文摘录和译文。

界面设置的语言、导航样式和阅读字号统一使用主题下拉菜单，支持键盘选择与 Esc 收起。修改仍保存在浏览器原有外观设置中；恢复默认和重开弹窗会同步显示。PowerShell 设置 `$env:SETTINGS_ONLY='1'` 后运行 `npm run test:browser` 可专项验证，结束后用 `Remove-Item Env:SETTINGS_ONLY` 清除。

### 首页书写与品牌字标

2026-10-02：首页“按自己的节奏学习”使用本地 SVG 字形按笔画逐字呈现，可点击“重写一遍”重播。开启系统减少动态效果时直接显示完整文字；离开首页时取消动画与媒体查询监听器。顶部采用书页标志与莓粉、灰紫矢量字标，不依赖外部字体。字形数据来源、衍生修改及 Arphic Public License 见 `licenses/handwriting-sources.md` 与 `licenses/ARPHICPL.txt`。

专项验证：PowerShell 设置 `$env:HANDWRITING_ONLY='1'` 后运行 `npm run test:browser`，覆盖笔画顺序、重播、离页清理、减少动态效果和移动端布局；完成后 `Remove-Item Env:HANDWRITING_ONLY`。本次仅涉及页面资源，不修改业务数据库。

首页品牌调整（2026-10-02）：移除手写标语下的分类导航条，课程分类仍可从课程中心和学习方向入口访问。品牌字标改用系统无衬线字体，深灰紫“知途”与莓粉“课堂”搭配书页标志；首页标语保留书写动画。完整十项评审见《首页与品牌设计评审.md》。`HANDWRITING_ONLY` 专项同时检查新首页结构与推荐换组。

顶部搜索课程轮播（2026-10-02）：空白搜索框展示真实课程名称，每 5 秒滚动切换一次。点击放大镜或空输入时按 Enter 直接打开当前课程；输入关键词后继续使用搜索提示与历史。轮播标题不会写入输入值或搜索历史。鼠标悬停、键盘焦点进入、页面不可见时暂停；系统开启减少动态效果时静态展示一门课程。课程接口失败或返回空列表时显示“浏览全部课程”，按钮进入课程中心。`SEARCH_ONLY` 专项覆盖轮播、直达、减少动态效果及原有搜索流程。


2026-10-02 数学课程更新：新增课程 39–42，原站快照共 117 个分集，实际后续更新以原站为准。课程 9（武忠祥高数）通过 published=0 下架，保留章节、笔记、收藏及历史关联，不再出现在公开列表、搜索、首页推荐和学习中心。增量工具支持 `--unpublish-ids=9`：与 `--ids=39,40,41,42` 一同预检，加 `--apply` 后备份受影响课程/章节并事务更新。历史详情兼容接口仍保留，不表示旧视频可播放。

浏览器专项：设置 `$env:MATH_ONLY='1'` 后运行 `npm run test:browser`，覆盖新增四门课程的目录、最后分集映射、封面资源、下架入口与移动端布局；结束后清除该变量。此测试不代表 Bilibili iframe 内部播放权限验证。

### 每日打卡与历史记录

学习页现为「每日打卡 → 继续学习 → 我的书架」。打卡日历展示近 365 天的手动签到，使用主题粉色区分已打卡/未打卡；每日最多一条，不按观看时长生成深浅，也不补造历史。支持点击/键盘查看日期、手机横向滚动及今日定位。连续天数按今天或昨天向前连续计算，统计范围为当前 365 天窗口。日期由服务器按 `Asia/Shanghai` 确定，跨设备随登录账号保存。

`GET /api/me/checkins` 返回当前账号的日期、近一年总天数与连续天数；`POST /api/me/checkins` 使用空 JSON `{}` 为当天打卡，重复请求幂等。账号由会话确定，不接受客户端提供日期或用户编号。`study_checkins` 以 `(user_id,checkin_date)` 为联合主键，通过逻辑关联引用用户，账号由服务端会话确认，写入时间为 UTC。

现有 MySQL 库使用 `node scripts/add-study-checkins.mjs` 预检，再加 `--apply` 增量添加一张表；脚本读取实际 `users.id` 类型，备份涉及的结构，保留所有已有表和数据，不运行历史迁移。2026-10-02 已在本机业务库添加，结构文档和快照已重新导出。

完整「历史记录」移至我的页面，仅展示最近访问的课程、章节与北京时间日期，不提供搜索、筛选、排序或书架按钮。桌面采用两列横向小卡片，900px 以下单列，封面保持 16:9；每门课程保留最近一次访问，并非逐次访问日志。学习页与头像菜单均提供入口。学习页仍保留一张最近课程的继续学习卡片，书架页保留筛选功能。

### 《提问的智慧》全文阅读

发现页「学习经验」中新增独立全文入口，点击后在站内阅读用户提供的完整中文文档。支持目录跳转、Escape/按钮关闭、返回文章开头，保留作者、译者及原文链接。文章正文不随界面语言切换而改写。

原文件逐字节保存在 `articles/README-zh_CN.md`；执行 `node scripts/import-smart-questions.mjs` 可重新生成 `frontend/js/study-posts.js` 末尾的静态阅读内容。转换器只处理该文档所用的 Markdown，转义 HTML、限制链接协议，并校验文内锚点。该方式保留为历史来源档案。2026-10-30 全文和 9 篇精选已导入 MySQL，由文章后台统一维护、运行时安全排版；不再从静态 JS 重复展示。

验证：`npm test` 验证身份隔离、跨日/闰日和并发幂等；`npm run test:mysql` 验证无外键结构迁移、应用层校验、落库及重启保留；设置 `$env:CHECKINS_ONLY='1'` 后执行 `npm run test:browser` 验证打卡、历史搬移和响应式布局，结束后清除该变量。

2026-10-02 发现页简化：取消学习经验分类导航，直接展示全部九篇精选；《提问的智慧》入口使用本地 `discovery-images/graduate.jpg` 图书馆照片，来源沿用 `database/discovery-image-sources.json`。桌面封面为 160×120px，移动端为 88×110px，图片裁切且不遮挡文字。

2026-10-02 图形标志更新：`frontend/assets/logo.svg` 与 `frontend/assets/logo-mark.svg` 同步采用“圆润 Z 字路线＋进度圆点”，对应知途的首字母与自主学习节奏。图形为原生 SVG，路线品牌粉 #cb416d、节点柔粉 #dd96af；沿用现有站名字体与导航布局。

顶部导航悬停预览（2026-10-09）：桌面鼠标移到栏目时，粉色滑块平滑跟随；移出导航回到当前页面，点击才切换路由，aria-current 始终表示实际页面。键盘导航及手机点击保持原有方式，减少动态效果时立即切换。已在隔离 Edge 检查悬停、移出、点击、方向键、减少动态效果及手机触屏，截图见 artifacts/navigation-hover。此项仅修改前端，无数据库变更。

导航点击定位修正（2026-10-09）：鼠标按下获得焦点不再清除悬停预览，避免点击前滑块回退；键盘操作仍取消鼠标预览。定位使用相对容器的实际矩形，保留弹性布局的小数像素。`NAVIGATION_ONLY=1 npm run test:browser` 专项覆盖1440/840/1024宽度下鼠标按住400ms的逐帧对齐、释放后跳转、移出复位、键盘、减少动态效果和手机触屏；截图在 artifacts/navigation-offset。

## 后台内容维护更新（2026-10-30）

后台支持新建课程草稿、章节新增与编辑、Bilibili/直链视频源配置、搜索与状态筛选。分集数根据章节记录更新，视频源保存后在当前服务即时生效，保存前自动备份。未配置片源不再回退演示视频。看板展示数据库真实汇总。操作方法、文件归属与单进程限制见 `docs/后台内容维护.md`。

## 2026-10-30 后台增删改查与视频上传

课程管理 → 新建草稿 → 更换封面 → 章节与视频源 → 新增章节 → 上传并绑定 MP4/WebM → 编辑课程发布 → 前台播放。支持视频 Range/HEAD；默认视频上限 512 MB、封面上限 2 MB。配置参见 `.env.example`。

视频保存在 `data/videos/`，封面保存在 `data/course-covers/`，片源映射仍在 `media-sources.json`；备份时须与 MySQL 和头像一并保存。旧文件暂保留，删除/替换后旧链接不可读，不提供自动垃圾回收、视频转码或多进程配置协调。

原学习经验及全文已增量导入 `admin_articles`，数据表结构不变，无需全量迁移。新环境需按 `scripts/import-editorial-articles.mjs` 预检和 `--apply` 一次性导入；后台删除后不要再次导入。文章只执行安全的 Markdown 排版，不执行原文 HTML。

详见 [后台内容维护与答辩演示流程](docs/后台内容维护.md)。后端改动需要重启当前网站服务，再刷新浏览器生效。

### 用户管理详情与头像维护

用户列表展示头像、昵称、注册日期与账号状态；“用户详情”提供真实的私有笔记数量、章节收藏、关注讲师、最近访问、累计打卡和讨论统计，并分页展示讲师关注列表。笔记正文不向后台开放；关注与学习记录由用户产生，管理员现可在学习记录管理中查询并有限清理。统计包含下架内容的保留关联，不代表实际观看时长。

普通账号可在详情顶部进入“更换头像”，选择图片、预览并确认保存，也可恢复默认；继续使用 `users.avatar` 与 `AVATAR_DIR`，无需数据库迁移。管理员头像在自己的个人中心维护。接口为 `GET /api/admin/users/:id/detail` 和 `POST /api/admin/users/:id/avatar`，受管理员权限、目标确认和行版本校验保护。


### 章节讨论审核（2026-10-31）

播放页仅展示当前章节的讨论，发布必须指定该课程下的 chapterId。后台讨论审核支持课程、章节、内容及状态筛选，显示作者、课程与章节，并可直达视频、保留/恢复、隐藏或确认删除。修改带权限及行版本校验，刷新或切回章节可读取最新结果。

本机 MySQL 已备份并增量添加 comments.chapter_id 与联合查询索引，原有 9 条无章节评论保留为 NULL，单独列入“历史课程评论（未绑定章节）”；没有新增外键、没有猜测历史章节。其他旧环境先预检 node scripts/add-chapter-comments.mjs，停写后加 --apply --maintenance 升级，不运行全量迁移。操作步骤与验证边界见 docs/后台内容维护.md。


### 学习记录、弹幕与账号维护（2026-10-31）

后台新增“学习记录管理”：历史记录、章节收藏、打卡日历、播放进度、笔记元信息和讲师关注统一分页查询，支持按用户和适用的课程/章节/日期筛选。历史、收藏、打卡和关注可确认清理，保留服务端权限、事务、锁与行版本；播放进度及笔记元信息只读，不展示笔记正文，不新增虚假学习行为。用户详情可直接进入指定用户记录，也可确认重置普通账号密码并撤销其旧会话。

“弹幕管理”支持按课程章节审核、隐藏恢复和删除。业务 MySQL 已备份并新增 danmaku.user_id、hidden 及索引，旧 3 条弹幕全部保留；新弹幕归属当前会话和具体章节。其他旧环境运行 node scripts/add-danmaku-moderation.mjs 预检，停写后加 --apply --maintenance 升级。所有操作步骤、接口及边界见 [后台内容维护](docs/后台内容维护.md)。
