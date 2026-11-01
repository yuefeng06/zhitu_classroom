import '../backend/config.mjs';
import mysql from 'mysql2/promise';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mysqlOptions } from '../backend/config.mjs';
import { schemaTables } from '../backend/mysql-schema.mjs';

// Add one table only; never run a historical migration for a new feature.
export async function addStudyCheckins({ apply = false, backupDir } = {}) {
  const db = await mysql.createConnection(mysqlOptions());
  try {
    const [parent] = await db.query(
      "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='id'",
    );
    const type = parent[0]?.type;
    if (!/^(?:bigint|int)(?:\(\d+\))?(?: unsigned)?$/i.test(type || ''))
      throw Error('无法确定 users.id 的类型');
    const [existing] = await db.query("SHOW TABLES LIKE 'study_checkins'");
    if (existing.length) return { exists: true, applied: false };
    const sql = schemaTables
      .find((t) => t.name === 'study_checkins')
      .sql.replace('`user_id` BIGINT', '`user_id` ' + type);
    if (!apply) return { exists: false, parentType: type, sql, applied: false };
    const directory =
      backupDir ||
      fileURLToPath(
        new URL(
          '../database/backups/checkins-' + new Date().toISOString().replace(/[:.]/g, '-') + '/',
          import.meta.url,
        ),
      );
    const [users] = await db.query('SHOW CREATE TABLE users');
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'before-schema.json'),
      JSON.stringify({ users: users[0]['Create Table'], study_checkins: null }, null, 2),
    );
    await writeFile(join(directory, 'add-study-checkins.sql'), sql + '\n');
    // MySQL DDL commits implicitly. No existing table or data is changed.
    await db.query(sql);
    return { exists: true, applied: true, parentType: type, backupDirectory: directory };
  } finally {
    await db.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(await addStudyCheckins({ apply: process.argv.includes('--apply') }), null, 2),
    );
  } catch (error) {
    console.error('打卡表升级失败：' + (error.code || error.message));
    process.exitCode = 1;
  }
}
