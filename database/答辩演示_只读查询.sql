-- 知途课堂：答辩现场查看结构（MySQL 8.0）
-- 本文件仅有 USE、SHOW、DESCRIBE 和元数据 SELECT；不修改业务数据。
-- 在 Workbench 中选中一个段落执行，逐步讲解；无需执行配套建表文件。
-- 1. 确认选中的数据库，以及22张基础表和1个视图。
USE `zhitu_classroom`;

SELECT
  DATABASE() AS `当前数据库`,
  VERSION() AS `MySQL版本`;

SHOW FULL TABLES;

-- 2. 主键与唯一索引：id 是稳定身份，nickname 的唯一索引防止重名。
DESCRIBE `users`;

SHOW CREATE TABLE `users`;

SHOW INDEX
FROM
  `users`;

-- 3. 一对多：课程主键被章节 course_id 外键引用。
-- 章节的主键是 id；(course_id, position) 是联合唯一索引，二者不要混淆。
SHOW CREATE TABLE `courses`;

SHOW CREATE TABLE `chapters`;

-- 4. 多对多：同一用户可收藏不同课程，不同用户可收藏同一课程。
-- (user_id, course_id) 联合主键限制同一个收藏组合不能重复。
SHOW CREATE TABLE `favorites`;

-- 5. 每人每天最多一条打卡，由 (user_id, checkin_date) 联合主键保证。
-- “今天”由服务器计算，不是由联合主键本身判断。
SHOW CREATE TABLE `study_checkins`;

-- 6. 一个字段兼任主键与外键：已有用户最多有一条管理员身份。
-- 外键只保证用户存在；管理员接口仍需验证会话和权限。
SHOW CREATE TABLE `admin_accounts`;

-- 7. 删除规则：笔记的 NO ACTION；进度的 chapter_id 使用 SET NULL。
-- 用户/课程/章节各自存在，不代表章节一定属于所指定课程；仍需接口检查。
SHOW CREATE TABLE `notes`;

SHOW CREATE TABLE `progress`;

-- 8. 汇总所有字段。不读取任何用户数据、密码摘要值或会话令牌值。
SELECT
  TABLE_NAME AS `表名`,
  ORDINAL_POSITION AS `字段序号`,
  COLUMN_NAME AS `字段名`,
  COLUMN_TYPE AS `类型`,
  IS_NULLABLE AS `允许NULL`,
  COLUMN_DEFAULT AS `默认值`,
  EXTRA AS `附加属性`
FROM
  information_schema.COLUMNS
WHERE
  TABLE_SCHEMA = DATABASE()
ORDER BY
  TABLE_NAME,
  ORDINAL_POSITION;

-- 9. 查看每个主键的组成。一个主键可包含多个字段；顺序按实际索引保留。
SELECT
  TABLE_NAME AS `表名`,
  GROUP_CONCAT(
    COLUMN_NAME
    ORDER BY
      SEQ_IN_INDEX SEPARATOR ', '
  ) AS `主键字段`,
  CASE
    WHEN COUNT(*) > 1 THEN '联合主键'
    ELSE '单字段主键'
  END AS `主键形式`
FROM
  information_schema.STATISTICS
WHERE
  TABLE_SCHEMA = DATABASE()
  AND INDEX_NAME = 'PRIMARY'
GROUP BY
  TABLE_NAME
ORDER BY
  TABLE_NAME;

-- 10. 区分主键、唯一索引和普通索引。
SELECT
  TABLE_NAME AS `表名`,
  INDEX_NAME AS `索引名`,
  CASE
    WHEN INDEX_NAME = 'PRIMARY' THEN '主键'
    WHEN NON_UNIQUE = 0 THEN '唯一索引'
    ELSE '普通索引'
  END AS `索引类型`,
  GROUP_CONCAT(
    COLUMN_NAME
    ORDER BY
      SEQ_IN_INDEX SEPARATOR ', '
  ) AS `字段组成`
FROM
  information_schema.STATISTICS
WHERE
  TABLE_SCHEMA = DATABASE()
GROUP BY
  TABLE_NAME,
  INDEX_NAME,
  NON_UNIQUE
ORDER BY
  TABLE_NAME,
  INDEX_NAME;

-- 11. 查看全部外键的子表、父表、引用字段，以及删除/更新规则。
SELECT
  k.TABLE_NAME AS `子表`,
  k.COLUMN_NAME AS `外键字段`,
  k.REFERENCED_TABLE_NAME AS `父表`,
  k.REFERENCED_COLUMN_NAME AS `引用字段`,
  k.CONSTRAINT_NAME AS `外键名`,
  r.DELETE_RULE AS `删除规则`,
  r.UPDATE_RULE AS `更新规则`
FROM
  information_schema.KEY_COLUMN_USAGE AS k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS AS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
  AND r.TABLE_NAME = k.TABLE_NAME
  AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
WHERE
  k.TABLE_SCHEMA = DATABASE()
  AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY
  k.TABLE_NAME,
  k.CONSTRAINT_NAME,
  k.ORDINAL_POSITION;

-- 12. 视图：由基础表查询产生，不是又复制了一份评论数据。
-- 当前按标题分组，存在同名课程合并的局限；保留实际定义讲解。
SHOW CREATE VIEW `v_course_comment_stats`;
