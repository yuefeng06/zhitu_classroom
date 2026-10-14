-- 知途课堂：数据库表结构答辩讲解版（MySQL 8.0）
-- 依据实际结构快照：2026-10-14T10:52:05.133Z；源库：zhitu_classroom。
-- 本文件保留原导出的全部建表语句，仅增加中文行注释，不改变实际字段与约束。
-- 用法：在 MySQL Workbench 打开，定位到表逐段讲解。
-- 如需执行建表，仅在已选中的新空库运行；不要在 zhitu_classroom 业务库重复执行。
-- 现场查看业务库请改用配套《答辩演示_只读查询.sql》。
--
-- 讲解顺序：users → courses → chapters → favorites → notes → study_checkins → admin_accounts。
-- PRIMARY KEY：唯一且非空地识别一条记录；一张表只能有一个主键。
-- 联合主键：一个主键由多列组成，组合唯一，不要求每列单独唯一。
-- FOREIGN KEY：约束非NULL引用值必须存在于父表；不代替身份权限和全部业务规则。
-- UNIQUE KEY：约束候选业务值不重复；本项目昵称和章节顺序均非NULL。
-- 普通 KEY：辅助查询和逻辑关联，不限制重复；名称含 fk_ 也不表示存在外键。
-- AUTO_INCREMENT：生成编号，可有间隙；主键并不必须自增。
-- 本轮已移除所有物理外键，关联列和查询索引仍保留。
-- 直接 SQL 不再有外键保护；后台仅下架课程或停用账号，接口负责存在性与归属校验。
--
-- 知途课堂 MySQL 实际结构，源库 zhitu_classroom，2026-10-14T10:52:05.133Z
-- 仅在已选中的新空库执行；不包含数据、DROP 或 USE。
-- 自增计数起点已省略；视图使用 SQL SECURITY INVOKER，移除源库限定名。
SET NAMES utf8mb4;

-- ============================================================
-- 01  用户表（users）
-- 设计理由：用户编号稳定地标识一个人；昵称等业务信息可变化，不能用昵称变化牵动全部关联。
-- 答辩补充：nickname 的 UNIQUE 是业务唯一性；id 的 PRIMARY KEY 是稳定身份，两者用途不同。
-- 答辩补充：密码字段保存摘要；此脚本不包含真实账号或密码摘要值。
CREATE TABLE `users` (
  -- 用户编号
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- 登录昵称；唯一性以本次采集的实际索引为准
  `nickname` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- scrypt 密码摘要，不存储明文密码
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 头像标识或资源值，可空
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- 旧版关注数量字段；当前关注列表从 follows 查询
  `following` int unsigned NOT NULL DEFAULT '0',
  -- 创建时间
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  -- 账号停用状态，0 正常，1 停用；停用撤销当前会话
  `disabled` bigint NOT NULL DEFAULT '0',
  -- 当前单会话令牌的 SHA-256 摘要，可空，单列唯一，非明文令牌
  `session_token_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  -- 当前会话过期时间，Unix 毫秒，可空
  `session_expires` bigint DEFAULT NULL,
  -- 主键设计：用户编号稳定地标识一个人；昵称等业务信息可变化，不能用昵称变化牵动全部关联。
  PRIMARY KEY (`id`),
  -- 唯一索引：阻止同名账号并发重复注册，应用预检查不能替代此约束。
  UNIQUE KEY `uq_users_nickname` (`nickname`),
  -- 唯一索引：当前会话摘要唯一；NULL 表示未登录，允许多个用户同时为 NULL。
  UNIQUE KEY `uq_users_session_token_hash` (`session_token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- ============================================================
-- 02  历史清除标记表（history_resets）
-- 设计理由：每个已有用户最多保留一个最近清除时间，重复清除更新同一行。
CREATE TABLE `history_resets` (
  -- 用户编号，主键；逻辑关联 users.id
  `user_id` bigint unsigned NOT NULL,
  -- 最近确认清除历史的服务端时间，UTC
  `cleared_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- 主键设计：每个已有用户最多保留一个最近清除时间，重复清除更新同一行。
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 03  每日学习打卡表（study_checkins）
-- 设计理由：日期单独不能区分用户，用户单独不能区分日期；组合限制每人每天最多打卡一次。
-- 答辩补充：唯一约束只限制重复日期；日期采用服务器北京时间、禁止补签由接口负责。
CREATE TABLE `study_checkins` (
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 打卡业务日期，由服务器按 Asia/Shanghai 确定，客户端不能补签
  `checkin_date` date NOT NULL,
  -- 服务端写入时间，UTC
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- 主键设计：日期单独不能区分用户，用户单独不能区分日期；组合限制每人每天最多打卡一次。
  PRIMARY KEY (`user_id`,`checkin_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 04  课程表（courses）
-- 设计理由：课程标题可能重名或修改，使用独立编号稳定地关联章节、收藏、评论和学习记录。
-- 答辩补充：当前上架依据 published；status 是旧字段，不能假设二者自动同步。
-- 答辩补充：lessons、students 等普通字段不是主键，不保证实时统计含义。
CREATE TABLE `courses` (
  -- 课程编号
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- 课程名称
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 学习方向，例如高中课程、考研课程
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 讲师姓名
  `teacher` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 课程简介及原站资源说明
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 封面标签文字；课程图片按课程 ID 读取静态资源
  `cover` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 课程配色标识
  `accent` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 课程分集数量
  `lessons` smallint unsigned NOT NULL,
  -- 历史学习人数展示字段，并非实时学习记录计数
  `students` int unsigned NOT NULL DEFAULT '0',
  -- 课程总时长展示文本
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 课程难度或学习阶段
  `level` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '入门',
  -- 旧版状态字段，保留兼容；当前接口使用 published
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1 上架 0 下架',
  -- 创建时间
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 当前课程上架标记，1 为上架、0 为下架
  `published` bigint NOT NULL DEFAULT '1',
  -- 具体学科，例如数学、Python
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  -- 主键设计：课程标题可能重名或修改，使用独立编号稳定地关联章节、收藏、评论和学习记录。
  PRIMARY KEY (`id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `idx_course_category_students` (`category`,`students` DESC),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `idx_course_teacher` (`teacher`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程主表';

-- ============================================================
-- 05  章节表（chapters）
-- 设计理由：不同课程都可能有“第一讲”，独立章节编号便于笔记定位和播放记录关联。
-- 答辩补充：UNIQUE(course_id, position) 表示同一课程章节顺序不能重复，不同课程可都从第1节开始。
-- 答辩补充：它是联合唯一索引，不是联合主键；本表主键只有 id。
CREATE TABLE `chapters` (
  -- 章节编号
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- 关联课程编号
  `course_id` bigint unsigned NOT NULL,
  -- 章节标题
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 章节时长展示文本，例如 12:35
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 是否免费，业务约定 1 为免费、0 为非免费
  `is_free` tinyint NOT NULL DEFAULT '0',
  -- 章节在课程中的展示顺序
  `position` smallint unsigned NOT NULL,
  -- 主键设计：不同课程都可能有“第一讲”，独立章节编号便于笔记定位和播放记录关联。
  PRIMARY KEY (`id`),
  -- 唯一索引：同一课程内章节顺序唯一，不同课程可以采用相同顺序号。
  UNIQUE KEY `uk_chapter_position` (`course_id`,`position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程章节表';

-- ============================================================
-- 06  评论表（comments）
-- 设计理由：同一用户可多次评论同一课程，每条评论需要独立编号供展示和审核。
CREATE TABLE `comments` (
  -- 评论编号
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- 关联课程编号
  `course_id` bigint unsigned NOT NULL,
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 评论内容；当前接口最多接受 1,000 字符
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 评论点赞数
  `likes` int unsigned NOT NULL DEFAULT '0',
  -- 创建时间
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 评论审核隐藏状态，0 可见，1 隐藏；迁移自 comment_moderation
  `hidden` bigint NOT NULL DEFAULT '0',
  -- 主键设计：同一用户可多次评论同一课程，每条评论需要独立编号供展示和审核。
  PRIMARY KEY (`id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_comment_course` (`course_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_comment_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程评论表';

-- ============================================================
-- 07  直播表（live_events）
-- 设计理由：唯一标识历史直播；此表仅兼容保留，当前页面不提供直播。
CREATE TABLE `live_events` (
  -- 直播编号
  `id` bigint NOT NULL AUTO_INCREMENT,
  -- 直播主题
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 讲师姓名
  `teacher` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 计划开始时间字符串；当前物理类型为 VARCHAR，不是 DATETIME
  `starts_at` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 发布状态，接口使用 1 表示发布，0 表示未发布
  `published` bigint NOT NULL DEFAULT '1',
  -- 主键设计：唯一标识历史直播；此表仅兼容保留，当前页面不提供直播。
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='直播';

-- ============================================================
-- 08  学习笔记表（notes）
-- 设计理由：同一用户在同一课程、同一章节可以写多条笔记，因此每条笔记单独编号。
-- 答辩补充：用户、课程和章节均为逻辑关联；接口校验存在性以及章节所属课程。
-- 答辩补充：私有笔记的读写权限由服务端会话及用户归属判断。
CREATE TABLE `notes` (
  -- 笔记编号
  `id` bigint NOT NULL AUTO_INCREMENT,
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 关联课程编号
  `course_id` bigint unsigned NOT NULL,
  -- 关联章节编号
  `chapter_id` bigint unsigned NOT NULL,
  -- 视频时间点，单位秒，可含小数
  `at_second` double NOT NULL,
  -- 笔记正文；当前接口最多接受 2,000 字符
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 创建时间
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  -- 主键设计：同一用户在同一课程、同一章节可以写多条笔记，因此每条笔记单独编号。
  PRIMARY KEY (`id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_notes_chapter_id` (`chapter_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_notes_course_id` (`course_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_notes_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学习笔记';

-- ============================================================
-- 09  课程收藏表（favorites）
-- 设计理由：用户可收藏多门课程，课程可被多人收藏；两列组合保证同一收藏关系不重复。
CREATE TABLE `favorites` (
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 关联课程编号
  `course_id` bigint unsigned NOT NULL,
  -- 创建时间
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 主键设计：用户可收藏多门课程，课程可被多人收藏；两列组合保证同一收藏关系不重复。
  PRIMARY KEY (`user_id`,`course_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_favorite_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程收藏表';

-- ============================================================
-- 10  课程学习进度表（progress）
-- 设计理由：每个用户在每门课程只维护一份当前进度；再次学习更新该记录。
-- 答辩补充：chapter_id 可空且逻辑关联章节；已移除 ON DELETE SET NULL，直接删除章节不会自动清理关联。
CREATE TABLE `progress` (
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 关联课程编号
  `course_id` bigint unsigned NOT NULL,
  -- 最近播放章节，可空；逻辑关联 chapters.id，删除章节不再自动置 NULL
  `chapter_id` bigint unsigned DEFAULT NULL,
  -- 课程完成百分比，原生播放记录按章节汇总
  `percent` tinyint unsigned NOT NULL DEFAULT '0',
  -- 更新时间
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- 主键设计：每个用户在每门课程只维护一份当前进度；再次学习更新该记录。
  PRIMARY KEY (`user_id`,`course_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_progress_course` (`course_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_progress_chapter` (`chapter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户学习进度表';

-- ============================================================
-- 11  直播预约表（reservations）
-- 设计理由：历史上每个用户对同一直播最多一条预约，当前页面不再使用预约功能。
CREATE TABLE `reservations` (
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 关联直播编号
  `live_id` bigint NOT NULL,
  -- 主键设计：历史上每个用户对同一直播最多一条预约，当前页面不再使用预约功能。
  PRIMARY KEY (`user_id`,`live_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_reservations_live_id` (`live_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='直播预约';

-- ============================================================
-- 12  最近学习访问表（course_visits）
-- 设计理由：每个用户每门课程只保留最近一次访问；这不是追加每次观看的事件日志。
-- 答辩补充：章节与课程是否匹配仍需接口校验；访问记录不等于播放完成度。
CREATE TABLE `course_visits` (
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 关联课程编号
  `course_id` bigint unsigned NOT NULL,
  -- 最近打开的章节编号
  `chapter_id` bigint unsigned NOT NULL,
  -- 最近访问时间，毫秒精度
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- 主键设计：每个用户每门课程只保留最近一次访问；这不是追加每次观看的事件日志。
  PRIMARY KEY (`user_id`,`course_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_course_visits_chapter_id` (`chapter_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_course_visits_course_id` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='最近访问';

-- ============================================================
-- 13  章节播放记录表（chapter_playback）
-- 设计理由：每个用户每个章节只保存一份原生播放器位置；其他用户的位置独立保存。
CREATE TABLE `chapter_playback` (
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 关联章节编号
  `chapter_id` bigint unsigned NOT NULL,
  -- 最近播放位置，单位秒，可含小数
  `current_time` double NOT NULL DEFAULT '0',
  -- 播放器视频时长，单位秒，可含小数
  `duration` double NOT NULL,
  -- 该章节已记录的最高完成百分比
  `percent` double NOT NULL DEFAULT '0',
  -- 主键设计：每个用户每个章节只保存一份原生播放器位置；其他用户的位置独立保存。
  PRIMARY KEY (`user_id`,`chapter_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_chapter_playback_chapter_id` (`chapter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='章节播放';

-- ============================================================
-- 14  讲师关注表（follows）
-- 设计理由：同一用户不能重复关注同名讲师；当前没有讲师实体，teacher 不是讲师外键。
-- 答辩补充：若需区分同名讲师，应另建讲师实体并迁移至 teacher_id，不能称当前已具备该外键。
CREATE TABLE `follows` (
  -- 关联用户编号
  `user_id` bigint unsigned NOT NULL,
  -- 讲师姓名，参与联合主键；不是讲师表外键
  `teacher` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 主键设计：同一用户不能重复关注同名讲师；当前没有讲师实体，teacher 不是讲师外键。
  PRIMARY KEY (`user_id`,`teacher`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='讲师关注表';

-- ============================================================
-- 15  弹幕表（danmaku）
-- 设计理由：同一课程同一时间点可有多条弹幕，时间或正文不能作为唯一标识。
CREATE TABLE `danmaku` (
  -- 记录编号
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  -- 关联课程编号
  `course_id` bigint unsigned NOT NULL,
  -- 文本内容
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  -- 弹幕出现时间，单位秒，当前数据库使用整数
  `at_second` int unsigned NOT NULL DEFAULT '8',
  -- 弹幕文字颜色，例如 #ffffff
  `color` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '#ffffff',
  -- 创建时间
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 弹幕所属章节，可空；此表未存储用户编号
  `chapter_id` bigint unsigned DEFAULT NULL,
  -- 主键设计：同一课程同一时间点可有多条弹幕，时间或正文不能作为唯一标识。
  PRIMARY KEY (`id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_danmaku_course` (`course_id`),
  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。
  KEY `fk_danmaku_chapter_id` (`chapter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='视频弹幕表';

-- ============================================================
-- 16  管理员身份表（admin_accounts）
-- 设计理由：user_id 是主键并逻辑关联 users.id：每个用户最多一条管理员身份；授权脚本验证用户存在。
CREATE TABLE `admin_accounts` (
  -- 管理员用户编号，主键；逻辑关联 users.id
  `user_id` bigint unsigned NOT NULL,
  -- 创建时间
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- 主键设计：user_id 是主键并逻辑关联 users.id：每个用户最多一条管理员身份；授权脚本验证用户存在。
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 17  管理文章表（admin_articles）
-- 设计理由：文章标题可重复或修改，用独立编号定位编辑与公开阅读。
-- 答辩补充：文章写入检查管理员权限与行版本；本轮已移除管理审计表，不再保留操作流水。
CREATE TABLE `admin_articles` (
  -- 记录编号
  `id` bigint NOT NULL AUTO_INCREMENT,
  -- 标题
  `title` varchar(160) NOT NULL,
  -- 列表摘要
  `summary` varchar(500) NOT NULL,
  -- 纯文本正文，页面转义后展示
  `content` text NOT NULL,
  -- 原文 HTTP(S) 链接，可空字符串
  `source_url` varchar(1000) NOT NULL DEFAULT '',
  -- 发布状态，接口使用 1 表示发布，0 表示未发布
  `published` bigint NOT NULL DEFAULT '0',
  -- 更新时间
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- 主键设计：文章标题可重复或修改，用独立编号定位编辑与公开阅读。
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 统计视图：不是额外保存数据的基础表，不单独设置主键。
-- 当前旧视图按课程标题分组，同名课程会合并；也未排除被隐藏评论。
-- 此定义按现状保留，不能讲成按课程编号统计公开评论的新接口。
CREATE SQL SECURITY INVOKER VIEW `v_course_comment_stats` AS select `c`.`title` AS `课程`,count(`cm`.`id`) AS `评论数` from (`courses` `c` left join `comments` `cm` on((`cm`.`course_id` = `c`.`id`))) group by `c`.`title`;
