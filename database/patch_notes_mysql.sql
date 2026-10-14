-- 修复当前报错的 zhitu_classroom 数据库；请执行整个文件。
USE `zhitu_classroom`;

-- 仅补建 notes，不删除或修改其他表及其数据。
-- 兼容旧版 BIGINT UNSIGNED 和新版 BIGINT 主键。
SELECT
  DATABASE() AS current_database;

-- 前置条件诊断：应有 users、courses、chapters 三行。
SELECT
  t.TABLE_NAME,
  t.ENGINE,
  c.COLUMN_TYPE AS id_type
FROM
  information_schema.TABLES t
  JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA = t.TABLE_SCHEMA
  AND c.TABLE_NAME = t.TABLE_NAME
  AND c.COLUMN_NAME = 'id'
WHERE
  t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME IN ('users', 'courses', 'chapters');

SET
  @notes_user_type = (
    SELECT
      COLUMN_TYPE
    FROM
      information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'id'
  );

SET
  @notes_course_type = (
    SELECT
      COLUMN_TYPE
    FROM
      information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'courses'
      AND COLUMN_NAME = 'id'
  );

SET
  @notes_chapter_type = (
    SELECT
      COLUMN_TYPE
    FROM
      information_schema.COLUMNS
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'chapters'
      AND COLUMN_NAME = 'id'
  );

SET
  @notes_parent_engines = (
    SELECT
      COUNT(*)
    FROM
      information_schema.TABLES
    WHERE
      TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('users', 'courses', 'chapters')
      AND ENGINE = 'InnoDB'
  );

SET
  @notes_ddl = IF(
    DATABASE() IS NOT NULL
    AND @notes_user_type IS NOT NULL
    AND @notes_course_type IS NOT NULL
    AND @notes_chapter_type IS NOT NULL
    AND @notes_parent_engines = 3,
    CONCAT(
      'CREATE TABLE IF NOT EXISTS `notes` (',
      '`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,',
      '`user_id` ',
      @notes_user_type,
      ' NOT NULL,',
      '`course_id` ',
      @notes_course_type,
      ' NOT NULL,',
      '`chapter_id` ',
      @notes_chapter_type,
      ' NOT NULL,',
      '`at_second` DOUBLE NOT NULL,',
      '`content` TEXT NOT NULL,',
      '`created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),',
      'FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),',
      'FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`),',
      'FOREIGN KEY (`chapter_id`) REFERENCES `chapters` (`id`)',
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    ),
    'SELECT ''未建表：请先选择正确数据库，并确认 users、courses、chapters 存在且使用 InnoDB'' AS error_message'
  );

PREPARE notes_patch
FROM
  @notes_ddl;

EXECUTE notes_patch;

DEALLOCATE PREPARE notes_patch;

-- 应返回一行 notes；如果没有结果，请查看上面的 error_message。
SHOW TABLES LIKE 'notes';

SELECT
  IF(
    COUNT(*) = 1,
    '成功：zhitu_classroom.notes 已存在',
    '未成功：请检查前置条件结果及 EXECUTE notes_patch 的错误信息'
  ) AS repair_result
FROM
  information_schema.TABLES
WHERE
  TABLE_SCHEMA = 'zhitu_classroom'
  AND TABLE_NAME = 'notes';
