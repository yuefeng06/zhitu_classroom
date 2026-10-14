-- MySQL runtime schema. Applied incrementally by mysql-schema.mjs.
CREATE TABLE `users` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `nickname` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `avatar` VARCHAR(255) NULL DEFAULT '学',
  `following` BIGINT NULL DEFAULT 0,
  `disabled` BIGINT NOT NULL DEFAULT 0,
  `session_token_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  `session_expires` BIGINT NULL DEFAULT NULL,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY uq_users_nickname (nickname),
  UNIQUE KEY uq_users_session_token_hash (session_token_hash)
) ENGINE=InnoDB COMMENT='用户';

CREATE TABLE `courses` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(500) NOT NULL,
  `category` VARCHAR(255) NOT NULL,
  `teacher` VARCHAR(100) NOT NULL,
  `description` TEXT NOT NULL,
  `cover` VARCHAR(255) NOT NULL,
  `accent` VARCHAR(255) NOT NULL,
  `lessons` BIGINT NOT NULL,
  `students` BIGINT NULL DEFAULT 0,
  `duration` VARCHAR(255) NOT NULL,
  `level` VARCHAR(255) NULL DEFAULT '入门',
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `published` BIGINT NOT NULL DEFAULT 1,
  `subject` VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='课程';

CREATE TABLE `chapters` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `course_id` BIGINT NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `duration` VARCHAR(255) NOT NULL,
  `is_free` BIGINT NULL DEFAULT 0,
  `position` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_course_id` (`course_id`)
) ENGINE=InnoDB COMMENT='章节';

CREATE TABLE `live_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(500) NOT NULL,
  `teacher` VARCHAR(100) NOT NULL,
  `starts_at` VARCHAR(255) NOT NULL,
  `published` BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='直播';

CREATE TABLE `follows` (
  `user_id` BIGINT NOT NULL,
  `teacher` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`user_id`,`teacher`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB COMMENT='讲师关注';

CREATE TABLE `favorites` (
  `user_id` BIGINT NOT NULL,
  `course_id` BIGINT NOT NULL,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`course_id`),
  KEY `idx_course_id` (`course_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB COMMENT='课程收藏';

CREATE TABLE `comments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `course_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `content` TEXT NOT NULL,
  `likes` BIGINT NULL DEFAULT 0,
  `hidden` BIGINT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_course_id` (`course_id`)
) ENGINE=InnoDB COMMENT='课程讨论';

CREATE TABLE `danmaku` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `course_id` BIGINT NOT NULL,
  `content` TEXT NOT NULL,
  `at_second` BIGINT NULL DEFAULT 8,
  `color` VARCHAR(255) NULL DEFAULT '#ffffff',
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  `chapter_id` BIGINT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_chapter_id` (`chapter_id`),
  KEY `idx_course_id` (`course_id`)
) ENGINE=InnoDB COMMENT='弹幕';

CREATE TABLE `progress` (
  `user_id` BIGINT NOT NULL,
  `course_id` BIGINT NOT NULL,
  `chapter_id` BIGINT NULL,
  `percent` BIGINT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`course_id`),
  KEY `idx_course_id` (`course_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB COMMENT='课程进度';

CREATE TABLE `course_visits` (
  `user_id` BIGINT NOT NULL,
  `course_id` BIGINT NOT NULL,
  `chapter_id` BIGINT NOT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`course_id`),
  KEY `idx_chapter_id` (`chapter_id`),
  KEY `idx_course_id` (`course_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB COMMENT='最近访问';

CREATE TABLE `chapter_playback` (
  `user_id` BIGINT NOT NULL,
  `chapter_id` BIGINT NOT NULL,
  `current_time` DOUBLE NOT NULL DEFAULT 0,
  `duration` DOUBLE NOT NULL,
  `percent` DOUBLE NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`,`chapter_id`),
  KEY `idx_chapter_id` (`chapter_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB COMMENT='章节播放';

CREATE TABLE `notes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `course_id` BIGINT NOT NULL,
  `chapter_id` BIGINT NOT NULL,
  `at_second` DOUBLE NOT NULL,
  `content` TEXT NOT NULL,
  `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_chapter_id` (`chapter_id`),
  KEY `idx_course_id` (`course_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB COMMENT='学习笔记';

CREATE TABLE `reservations` (
  `user_id` BIGINT NOT NULL,
  `live_id` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`,`live_id`),
  KEY `idx_live_id` (`live_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB COMMENT='直播预约';

CREATE TABLE `study_checkins` (
  `user_id` BIGINT NOT NULL,
  `checkin_date` DATE NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`checkin_date`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `history_resets` (
  `user_id` BIGINT NOT NULL,
  `cleared_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `admin_accounts` (
  `user_id` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `admin_articles` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(160) NOT NULL,
  `summary` VARCHAR(500) NOT NULL,
  `content` TEXT NOT NULL,
  `source_url` VARCHAR(1000) NOT NULL DEFAULT '',
  `published` BIGINT NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
