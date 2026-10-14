import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./database/mysql-schema.sql', import.meta.url), 'utf8');
export const schemaTables = [
  ...source.matchAll(/CREATE TABLE `(\w+)` \(([\s\S]*?)\) ENGINE=InnoDB[^;]*;/g),
].map((match) => ({
  name: match[1],
  sql: match[0],
  columns: [...match[2].matchAll(/^  `(\w+)` ([^\n]+)/gm)].map((m) => ({
    name: m[1],
    definition: m[2].trim().replace(/,$/, ''),
  })),
  references: [...match[2].matchAll(/FOREIGN KEY \(`(\w+)`\) REFERENCES `(\w+)` \(`(\w+)`\)/g)].map(
    (m) => ({ column: m[1], table: m[2], parent: m[3] }),
  ),
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
    ['courses', 'published', 'BIGINT NOT NULL DEFAULT 1'],
    ['courses', 'subject', "VARCHAR(255) NOT NULL DEFAULT ''"],
    ['live_events', 'published', 'BIGINT NOT NULL DEFAULT 1'],
    ['danmaku', 'chapter_id', (await columnType(connection, 'chapters', 'id')) + ' NULL'],
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
  const [fks] = await connection.query(
    "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='danmaku' AND COLUMN_NAME='chapter_id' AND REFERENCED_TABLE_NAME='chapters'",
  );
  if (!fks.length)
    await connection.query(
      'ALTER TABLE danmaku ADD CONSTRAINT fk_danmaku_chapter_id FOREIGN KEY (chapter_id) REFERENCES chapters(id)',
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
  await validateSchema(connection);
}

export async function validateSchema(connection) {
  const [rows] = await connection.query(
    'SELECT TABLE_NAME AS name,COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()',
  );
  const columns = new Set(rows.map((r) => r.name + '.' + r.col));
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
