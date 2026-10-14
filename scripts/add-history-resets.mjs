import '../config.mjs';
import mysql from 'mysql2/promise';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mysqlOptions } from '../config.mjs';
import { schemaTables } from '../mysql-schema.mjs';

export async function addHistoryResets({ apply = false, backupDir } = {}) {
  const db = await mysql.createConnection(mysqlOptions());
  try {
    const [columns] = await db.query(
      "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='id'",
    );
    const type = columns[0]?.type;
    if (!/^(?:bigint|int)(?:\(\d+\))?(?: unsigned)?$/i.test(type || ''))
      throw Error('无法确定 users.id 的类型');
    const [existing] = await db.query("SHOW TABLES LIKE 'history_resets'");
    if (existing.length) return { exists: true, applied: false };
    const sql = schemaTables
      .find((t) => t.name === 'history_resets')
      .sql.replace('`user_id` BIGINT', '`user_id` ' + type);
    if (!apply) return { exists: false, parentType: type, sql, applied: false };
    const directory =
      backupDir ||
      fileURLToPath(
        new URL(
          '../database/backups/history-' + new Date().toISOString().replace(/[:.]/g, '-') + '/',
          import.meta.url,
        ),
      );
    const [users] = await db.query('SHOW CREATE TABLE users');
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'before-schema.json'),
      JSON.stringify({ users: users[0]['Create Table'], history_resets: null }, null, 2),
    );
    await writeFile(join(directory, 'add-history-resets.sql'), sql + '\n');
    await db.query(sql);
    return { exists: true, applied: true, parentType: type };
  } finally {
    await db.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(await addHistoryResets({ apply: process.argv.includes('--apply') }), null, 2),
    );
  } catch (error) {
    console.error('历史清除标记表升级失败：' + (error.code || error.message));
    process.exitCode = 1;
  }
}
