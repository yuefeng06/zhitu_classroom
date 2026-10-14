-- MySQL 8.0 增量补表：只补 5 张缺失表，不删除表、不改已有数据。
-- 请在 MySQL Workbench 中打开本文件，不选中局部文字，执行整个脚本。
-- 已有同名表不会被修复或覆盖，请结合末尾字段/外键报告核对。
-- 仅补结构：不导入 SQLite 用户、笔记、课程数据，不切换网站数据源。
-- DDL 会隐式提交；如果某张表失败，前面成功创建的表会保留，可修正后重跑。
USE `zhitu_classroom`;

SET NAMES utf8mb4;

-- 1. 诊断父表，必须返回 users/courses/chapters/live_events 共 4 行。
SELECT
  t.TABLE_NAME,
  t.ENGINE,
  c.COLUMN_TYPE AS id_type,
  c.COLUMN_KEY
FROM
  information_schema.TABLES t
  JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
  AND c.TABLE_NAME = t.TABLE_NAME
  AND c.COLUMN_NAME = 'id'
WHERE
  t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME IN ('users', 'courses', 'chapters', 'live_events');

SET
  @zt_user_type = (
    SELECT
      COLUMN_TYPE
    FROM
      information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'id'
      AND DATA_TYPE IN (
        'tinyint',
        'smallint',
        'mediumint',
        'int',
        'bigint'
      )
  );

SET
  @zt_course_type = (
    SELECT
      COLUMN_TYPE
    FROM
      information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'courses'
      AND COLUMN_NAME = 'id'
      AND DATA_TYPE IN (
        'tinyint',
        'smallint',
        'mediumint',
        'int',
        'bigint'
      )
  );

SET
  @zt_chapter_type = (
    SELECT
      COLUMN_TYPE
    FROM
      information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chapters'
      AND COLUMN_NAME = 'id'
      AND DATA_TYPE IN (
        'tinyint',
        'smallint',
        'mediumint',
        'int',
        'bigint'
      )
  );

SET
  @zt_live_type = (
    SELECT
      COLUMN_TYPE
    FROM
      information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'live_events'
      AND COLUMN_NAME = 'id'
      AND DATA_TYPE IN (
        'tinyint',
        'smallint',
        'mediumint',
        'int',
        'bigint'
      )
  );

SET
  @zt_parent_count = (
    SELECT
      COUNT(*)
    FROM
      information_schema.TABLES
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('users', 'courses', 'chapters', 'live_events')
      AND ENGINE = 'InnoDB'
  );

SET
  @zt_ready = (
    DATABASE() = 'zhitu_classroom'
    AND @zt_parent_count = 4
    AND @zt_user_type IS NOT NULL
    AND @zt_course_type IS NOT NULL
    AND @zt_chapter_type IS NOT NULL
    AND @zt_live_type IS NOT NULL
  );

SELECT
  IF(
    @zt_ready,
    '前置检查通过，将按父表主键类型补建缺失表',
    '未通过：需要 4 张 InnoDB 父表及整数类型 id；本脚本将跳过所有建表'
  ) AS precheck;

-- 2. 补表；外键类型与父表 COLUMN_TYPE 保持一致（含 UNSIGNED）。
-- sessions
SET
  @zt_ddl = IF(
    @zt_ready,
    CONCAT(
      'CREATE TABLE IF NOT EXISTS `sessions` (',
      '`token` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,',
      '`user_id` ',
      @zt_user_type,
      ' NULL,',
      '`expires` BIGINT NOT NULL,',
      'PRIMARY KEY (`token`), FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    ),
    'SELECT ''前置检查未通过，跳过 sessions'' AS diagnostic'
  );

PREPARE zhitu_patch
FROM
  @zt_ddl;

EXECUTE zhitu_patch;

DEALLOCATE PREPARE zhitu_patch;

-- course_visits
SET
  @zt_ddl = IF(
    @zt_ready,
    CONCAT(
      'CREATE TABLE IF NOT EXISTS `course_visits` (',
      '`user_id` ',
      @zt_user_type,
      ' NOT NULL,',
      '`course_id` ',
      @zt_course_type,
      ' NOT NULL,',
      '`chapter_id` ',
      @zt_chapter_type,
      ' NOT NULL,',
      '`updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),',
      'PRIMARY KEY (`user_id`,`course_id`),',
      'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),',
      'FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`),',
      'FOREIGN KEY (`chapter_id`) REFERENCES `chapters` (`id`)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    ),
    'SELECT ''前置检查未通过，跳过 course_visits'' AS diagnostic'
  );

PREPARE zhitu_patch
FROM
  @zt_ddl;

EXECUTE zhitu_patch;

DEALLOCATE PREPARE zhitu_patch;

-- chapter_playback
SET
  @zt_ddl = IF(
    @zt_ready,
    CONCAT(
      'CREATE TABLE IF NOT EXISTS `chapter_playback` (',
      '`user_id` ',
      @zt_user_type,
      ' NOT NULL,',
      '`chapter_id` ',
      @zt_chapter_type,
      ' NOT NULL,',
      '`current_time` DOUBLE NOT NULL DEFAULT 0,',
      '`duration` DOUBLE NOT NULL,',
      '`percent` DOUBLE NOT NULL DEFAULT 0,',
      'PRIMARY KEY (`user_id`,`chapter_id`),',
      'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),',
      'FOREIGN KEY (`chapter_id`) REFERENCES `chapters` (`id`)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    ),
    'SELECT ''前置检查未通过，跳过 chapter_playback'' AS diagnostic'
  );

PREPARE zhitu_patch
FROM
  @zt_ddl;

EXECUTE zhitu_patch;

DEALLOCATE PREPARE zhitu_patch;

-- notes
SET
  @zt_ddl = IF(
    @zt_ready,
    CONCAT(
      'CREATE TABLE IF NOT EXISTS `notes` (',
      '`id` BIGINT NOT NULL AUTO_INCREMENT,',
      '`user_id` ',
      @zt_user_type,
      ' NOT NULL,',
      '`course_id` ',
      @zt_course_type,
      ' NOT NULL,',
      '`chapter_id` ',
      @zt_chapter_type,
      ' NOT NULL,',
      '`at_second` DOUBLE NOT NULL,',
      '`content` TEXT NOT NULL,',
      '`created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),',
      'PRIMARY KEY (`id`),',
      'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),',
      'FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`),',
      'FOREIGN KEY (`chapter_id`) REFERENCES `chapters` (`id`)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    ),
    'SELECT ''前置检查未通过，跳过 notes'' AS diagnostic'
  );

PREPARE zhitu_patch
FROM
  @zt_ddl;

EXECUTE zhitu_patch;

DEALLOCATE PREPARE zhitu_patch;

-- reservations
SET
  @zt_ddl = IF(
    @zt_ready,
    CONCAT(
      'CREATE TABLE IF NOT EXISTS `reservations` (',
      '`user_id` ',
      @zt_user_type,
      ' NOT NULL,',
      '`live_id` ',
      @zt_live_type,
      ' NOT NULL,',
      'PRIMARY KEY (`user_id`,`live_id`),',
      'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),',
      'FOREIGN KEY (`live_id`) REFERENCES `live_events` (`id`)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    ),
    'SELECT ''前置检查未通过，跳过 reservations'' AS diagnostic'
  );

PREPARE zhitu_patch
FROM
  @zt_ddl;

EXECUTE zhitu_patch;

DEALLOCATE PREPARE zhitu_patch;

-- 3. 存在性检查：应显示 5 行“已存在”；这不代表已有表的字段也匹配。
SELECT
  e.table_name,
  IF(t.TABLE_NAME IS NULL, '缺失', '已存在') AS table_status,
  t.ENGINE
FROM
  (
    SELECT
      'sessions' AS table_name
    UNION ALL
    SELECT
      'course_visits'
    UNION ALL
    SELECT
      'chapter_playback'
    UNION ALL
    SELECT
      'notes'
    UNION ALL
    SELECT
      'reservations'
  ) e
  LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME = e.table_name;

-- 查看实际字段类型，便于确认 UNSIGNED 是否与父表一致。
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_KEY
FROM
  information_schema.COLUMNS
WHERE
  TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'sessions',
    'course_visits',
    'chapter_playback',
    'notes',
    'reservations'
  )
ORDER BY
  TABLE_NAME,
  ORDINAL_POSITION;

-- 正常应有 11 条外键：1 + 3 + 2 + 3 + 2。
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM
  information_schema.KEY_COLUMN_USAGE
WHERE
  TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'sessions',
    'course_visits',
    'chapter_playback',
    'notes',
    'reservations'
  )
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY
  TABLE_NAME,
  COLUMN_NAME;

-- 旧表尚需核对的字段；本补丁不会修改这些旧表。
SELECT
  e.table_name,
  e.column_name,
  IF(c.COLUMN_NAME IS NULL, '缺失，需后续迁移', '已存在') AS column_status
FROM
  (
    SELECT
      'courses' AS table_name,
      'published' AS column_name
    UNION ALL
    SELECT
      'courses',
      'subject'
    UNION ALL
    SELECT
      'live_events',
      'published'
    UNION ALL
    SELECT
      'danmaku',
      'chapter_id'
  ) e
  LEFT JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA = DATABASE()
  AND c.TABLE_NAME = e.table_name
  AND c.COLUMN_NAME = e.column_name;
