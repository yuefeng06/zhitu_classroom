-- 知途课堂 MySQL 实际结构，源库 zhitu_classroom，2026-10-14T10:52:05.133Z
-- 仅在已选中的新空库执行；不包含数据、DROP 或 USE。
-- 自增计数起点已省略；视图使用 SQL SECURITY INVOKER，移除源库限定名。
SET NAMES utf8mb4;

CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nickname` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `following` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `disabled` bigint NOT NULL DEFAULT '0',
  `session_token_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `session_expires` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_nickname` (`nickname`),
  UNIQUE KEY `uq_users_session_token_hash` (`session_token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

CREATE TABLE `history_resets` (
  `user_id` bigint unsigned NOT NULL,
  `cleared_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `study_checkins` (
  `user_id` bigint unsigned NOT NULL,
  `checkin_date` date NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`checkin_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `courses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `cover` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accent` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lessons` smallint unsigned NOT NULL,
  `students` int unsigned NOT NULL DEFAULT '0',
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '入门',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '1 上架 0 下架',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `published` bigint NOT NULL DEFAULT '1',
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `idx_course_category_students` (`category`,`students` DESC),
  KEY `idx_course_teacher` (`teacher`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程主表';

CREATE TABLE `chapters` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `course_id` bigint unsigned NOT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_free` tinyint NOT NULL DEFAULT '0',
  `position` smallint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_chapter_position` (`course_id`,`position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程章节表';

CREATE TABLE `comments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `course_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `likes` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `hidden` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `fk_comment_course` (`course_id`),
  KEY `fk_comment_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程评论表';

CREATE TABLE `live_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `starts_at` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `published` bigint NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='直播';

CREATE TABLE `notes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `course_id` bigint unsigned NOT NULL,
  `chapter_id` bigint unsigned NOT NULL,
  `at_second` double NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_notes_chapter_id` (`chapter_id`),
  KEY `fk_notes_course_id` (`course_id`),
  KEY `fk_notes_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学习笔记';

CREATE TABLE `favorites` (
  `user_id` bigint unsigned NOT NULL,
  `course_id` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`course_id`),
  KEY `fk_favorite_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='课程收藏表';

CREATE TABLE `progress` (
  `user_id` bigint unsigned NOT NULL,
  `course_id` bigint unsigned NOT NULL,
  `chapter_id` bigint unsigned DEFAULT NULL,
  `percent` tinyint unsigned NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`course_id`),
  KEY `fk_progress_course` (`course_id`),
  KEY `fk_progress_chapter` (`chapter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户学习进度表';

CREATE TABLE `reservations` (
  `user_id` bigint unsigned NOT NULL,
  `live_id` bigint NOT NULL,
  PRIMARY KEY (`user_id`,`live_id`),
  KEY `fk_reservations_live_id` (`live_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='直播预约';

CREATE TABLE `course_visits` (
  `user_id` bigint unsigned NOT NULL,
  `course_id` bigint unsigned NOT NULL,
  `chapter_id` bigint unsigned NOT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`course_id`),
  KEY `fk_course_visits_chapter_id` (`chapter_id`),
  KEY `fk_course_visits_course_id` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='最近访问';

CREATE TABLE `chapter_playback` (
  `user_id` bigint unsigned NOT NULL,
  `chapter_id` bigint unsigned NOT NULL,
  `current_time` double NOT NULL DEFAULT '0',
  `duration` double NOT NULL,
  `percent` double NOT NULL DEFAULT '0',
  PRIMARY KEY (`user_id`,`chapter_id`),
  KEY `fk_chapter_playback_chapter_id` (`chapter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='章节播放';

CREATE TABLE `follows` (
  `user_id` bigint unsigned NOT NULL,
  `teacher` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`user_id`,`teacher`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='讲师关注表';

CREATE TABLE `danmaku` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `course_id` bigint unsigned NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `at_second` int unsigned NOT NULL DEFAULT '8',
  `color` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '#ffffff',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `chapter_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_danmaku_course` (`course_id`),
  KEY `fk_danmaku_chapter_id` (`chapter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='视频弹幕表';

CREATE TABLE `admin_accounts` (
  `user_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `admin_articles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` varchar(160) NOT NULL,
  `summary` varchar(500) NOT NULL,
  `content` text NOT NULL,
  `source_url` varchar(1000) NOT NULL DEFAULT '',
  `published` bigint NOT NULL DEFAULT '0',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE SQL SECURITY INVOKER VIEW `v_course_comment_stats` AS select `c`.`title` AS `课程`,count(`cm`.`id`) AS `评论数` from (`courses` `c` left join `comments` `cm` on((`cm`.`course_id` = `c`.`id`))) group by `c`.`title`;
