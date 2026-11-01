import { readFileSync } from 'node:fs';
import { relationships } from './relationships.mjs';

const source = readFileSync(new URL('../database/mysql-schema.sql', import.meta.url), 'utf8');
export const schemaTables = [
  ...source.matchAll(/CREATE TABLE `(\w+)` \(([\s\S]*?)\) ENGINE=InnoDB[^;]*;/g),
].map((match) => ({
  name: match[1],
  sql: match[0],
  columns: [...match[2].matchAll(/^  `(\w+)` ([^\n]+)/gm)].map((m) => ({
    name: m[1],
    definition: m[2].trim().replace(/,$/, ''),
  })),
  references: relationships
    .filter(([table]) => table === match[1])
    .map(([, column, table]) => ({ column, table, parent: 'id' })),
}));
export const tableNames = schemaTables.map((t) => t.name);
const identifier = (name) => '`' + name + '`';

async function columnType(connection, table, column) {
  const [rows] = await connection.query(
    'SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',
    [table, column],
  );
  if (
    !rows[0] ||
    !/^(tinyint|smallint|mediumint|int|bigint)(\(\d+\))?( unsigned)?$/i.test(rows[0].type)
  )
    throw new Error(`无法确定 ${table}.${column} 的整数类型`);
  return rows[0].type;
}

export async function ensureSchema(connection) {
  for (const table of schemaTables) {
    const [existing] = await connection.query(
      'SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
      [table.name],
    );
    if (existing.length && existing[0].engine !== 'InnoDB')
      throw new Error(`${table.name} 必须使用 InnoDB；未自动转换已有表`);
    let sql = table.sql;
    for (const ref of table.references) {
      const type = await columnType(connection, ref.table, ref.parent);
      sql = sql.replace(
        new RegExp('`' + ref.column + '` BIGINT\\b'),
        identifier(ref.column) + ' ' + type,
      );
    }
    if (!existing.length) await connection.query(sql);
  }
  // Additive upgrades for the legacy 10-table installation. DDL is deliberately
  // separate from data migration: MySQL DDL has implicit commits.
  const [userColumns] = await connection.query(
    "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'",
  );
  const userNames = new Set(userColumns.map((c) => c.name));
  for (const [legacy, current] of [
    ['password_hash', 'password'],
    ['following_count', 'following'],
  ]) {
    if (userNames.has(legacy) && !userNames.has(current))
      await connection.query(
        `ALTER TABLE users RENAME COLUMN ${identifier(legacy)} TO ${identifier(current)}`,
      );
  }
  if (!userNames.has('created_at')) {
    // Unknown historical join dates stay NULL until matched to a source user.
    await connection.query('ALTER TABLE users ADD COLUMN created_at DATETIME(3) NULL DEFAULT NULL');
    await connection.query(
      'ALTER TABLE users MODIFY COLUMN created_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3)',
    );
  }
  // Old installations used shorter strings, including a 500-character comment
  // limit. Only widen supported columns; never truncate existing content.
  const [existingColumns] = await connection.query(
    'SELECT TABLE_NAME AS t,COLUMN_NAME AS c,DATA_TYPE AS type,CHARACTER_MAXIMUM_LENGTH AS length FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()',
  );
  for (const table of schemaTables)
    for (const column of table.columns) {
      const old = existingColumns.find((c) => c.t === table.name && c.c === column.name);
      if (!old || old.type !== 'varchar') continue;
      const size = column.definition.match(/^VARCHAR\((\d+)\)/);
      if ((size && old.length < Number(size[1])) || column.definition.startsWith('TEXT '))
        await connection.query(
          `ALTER TABLE ${identifier(table.name)} MODIFY COLUMN ${identifier(column.name)} ${column.definition}`,
        );
    }
  for (const [table, column, definition] of [
    ['users', 'disabled', 'BIGINT NOT NULL DEFAULT 0'],
    [
      'users',
      'session_token_hash',
      'CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL',
    ],
    ['users', 'session_expires', 'BIGINT NULL DEFAULT NULL'],
    ['comments', 'hidden', 'BIGINT NOT NULL DEFAULT 0'],
    [
      'comments',
      'chapter_id',
      (await columnType(connection, 'chapters', 'id')) + ' NULL DEFAULT NULL',
    ],
    ['courses', 'published', 'BIGINT NOT NULL DEFAULT 1'],
    ['courses', 'subject', "VARCHAR(255) NOT NULL DEFAULT ''"],
    ['live_events', 'published', 'BIGINT NOT NULL DEFAULT 1'],
    ['danmaku', 'chapter_id', (await columnType(connection, 'chapters', 'id')) + ' NULL'],
    ['danmaku', 'user_id', (await columnType(connection, 'users', 'id')) + ' NULL DEFAULT NULL'],
    ['danmaku', 'hidden', 'BIGINT NOT NULL DEFAULT 0'],
  ]) {
    const [rows] = await connection.query(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',
      [table, column],
    );
    if (!rows.length)
      await connection.query(
        `ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column)} ${definition}`,
      );
  }
  const [commentIndexes] = await connection.query('SHOW INDEX FROM comments');
  const [dmIndexes] = await connection.query('SHOW INDEX FROM danmaku');
  for (const [name, fields] of [
    ['idx_danmaku_user', 'user_id'],
    ['idx_danmaku_review', 'course_id,chapter_id,hidden,id'],
  ])
    if (!dmIndexes.some((i) => i.Key_name === name))
      await connection.query(`CREATE INDEX ${name} ON danmaku(${fields})`);
  if (!commentIndexes.some((i) => i.Key_name === 'idx_comments_chapter'))
    await connection.query(
      'CREATE INDEX idx_comments_chapter ON comments(course_id,chapter_id,hidden,id)',
    );
  const [indexes] = await connection.query('SHOW INDEX FROM users');
  if (
    !indexes.some(
      (i) =>
        i.Column_name === 'nickname' &&
        i.Non_unique === 0 &&
        indexes.filter((x) => x.Key_name === i.Key_name).length === 1,
    )
  ) {
    const [[duplicates]] = await connection.query(
      'SELECT COUNT(*) AS n FROM (SELECT nickname FROM users GROUP BY nickname HAVING COUNT(*)>1) d',
    );
    if (duplicates.n) throw Error('重复昵称阻止唯一索引升级');
    await connection.query('ALTER TABLE users ADD UNIQUE INDEX uq_users_nickname (nickname)');
  }
  if (!indexes.some((i) => i.Key_name === 'uq_users_session_token_hash'))
    await connection.query(
      'ALTER TABLE users ADD UNIQUE INDEX uq_users_session_token_hash(session_token_hash)',
    );
  await validateSchema(connection);
}

export async function validateSchema(connection) {
  const [rows] = await connection.query(
    'SELECT TABLE_NAME AS name,COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()',
  );
  const columns = new Set(rows.map((r) => r.name + '.' + r.col));
  if (
    rows.some((r) =>
      ['coins', 'sessions', 'account_status', 'comment_moderation', 'admin_audit'].includes(r.name),
    )
  )
    throw Error('数据库仍为旧结构，请先预检并执行 scripts/simplify-schema.mjs 增量迁移');
  if (columns.has('favorites.course_id'))
    throw Error('收藏仍为课程结构，请先预检并执行 scripts/migrate-chapter-favorites.mjs 增量迁移');
  if (!columns.has('comments.chapter_id'))
    throw Error(
      '评论尚未按章节关联，请预检 scripts/add-chapter-comments.mjs，并停写后使用 --apply --maintenance 增量升级',
    );
  if (!columns.has('danmaku.user_id') || !columns.has('danmaku.hidden'))
    throw Error(
      '弹幕审核尚未升级，请预检 scripts/add-danmaku-moderation.mjs，并停写后使用 --apply --maintenance',
    );
  const missing = schemaTables.flatMap((t) =>
    t.columns.filter((c) => !columns.has(t.name + '.' + c.name)).map((c) => t.name + '.' + c.name),
  );
  if (missing.length) throw new Error('数据库缺少字段：' + missing.join(', '));
  const [engines] = await connection.query(
    'SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()',
  );
  if (engines.some((r) => tableNames.includes(r.name) && r.engine !== 'InnoDB'))
    throw new Error('业务表必须使用 InnoDB');
}
