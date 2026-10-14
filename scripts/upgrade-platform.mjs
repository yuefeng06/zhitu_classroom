import '../config.mjs';
import mysql from 'mysql2/promise';
import { join } from 'node:path';
import { mysqlOptions } from '../config.mjs';
import { schemaTables } from '../mysql-schema.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const names = [
  'admin_accounts',
  'account_status',
  'admin_articles',
  'comment_moderation',
  'admin_audit',
];
export async function upgradePlatform(connection, { apply = false, backupDir } = {}) {
  const [[duplicates]] = await connection.query(
    'SELECT COUNT(*) AS n FROM (SELECT nickname FROM users GROUP BY nickname HAVING COUNT(*)>1) d',
  );
  if (duplicates.n) throw Error('检测到重复昵称分组，需人工确认后再建唯一索引；未修改账号');
  const [indexes] = await connection.query('SHOW INDEX FROM users');
  const unique = indexes.some(
    (i) =>
      i.Column_name === 'nickname' &&
      i.Non_unique === 0 &&
      indexes.filter((x) => x.Key_name === i.Key_name).length === 1,
  );
  const [tables] = await connection.query('SHOW TABLES');
  const exists = new Set(tables.map((t) => Object.values(t)[0]));
  const statements = [];
  for (const name of names)
    if (!exists.has(name)) {
      const table = schemaTables.find((t) => t.name === name);
      let sql = table.sql;
      for (const ref of table.references) {
        const [rows] = await connection.query(
          'SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',
          [ref.table, ref.parent],
        );
        const type = rows[0]?.type;
        if (!/^(bigint|int)(\(\d+\))?( unsigned)?$/i.test(type || ''))
          throw Error('父键类型无法确认');
        sql = sql.replace('`' + ref.column + '` BIGINT', '`' + ref.column + '` ' + type);
      }
      statements.push(sql);
    }
  if (!unique) statements.push('ALTER TABLE users ADD UNIQUE INDEX uq_users_nickname (nickname)');
  if (apply && statements.length) {
    const directory =
      backupDir ||
      fileURLToPath(
        new URL(
          '../database/backups/platform-' + new Date().toISOString().replace(/[:.]/g, '-') + '/',
          import.meta.url,
        ),
      );
    await mkdir(directory, { recursive: true });
    const [user] = await connection.query('SHOW CREATE TABLE users');
    await writeFile(
      join(directory, 'before.json'),
      JSON.stringify(
        { users: user[0]['Create Table'], addedTables: names.filter((n) => !exists.has(n)) },
        null,
        2,
      ),
    );
    await writeFile(join(directory, 'upgrade.sql'), statements.join(';\n') + ';\n');
    for (const sql of statements) await connection.query(sql);
  }
  return {
    applied: apply,
    statements: statements.length,
    duplicateGroups: Number(duplicates.n),
    nicknameUnique: unique || apply,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = await mysql.createConnection(mysqlOptions());
  try {
    console.log(
      JSON.stringify(await upgradePlatform(db, { apply: process.argv.includes('--apply') })),
    );
  } catch (e) {
    console.error(e.code || e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
