import '../backend/config.mjs';
import mysql from 'mysql2/promise';
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { mysqlOptions } from '../backend/config.mjs';
import { ensureSchema, schemaTables, tableNames } from '../backend/mysql-schema.mjs';
import { initializeSqlite } from '../backend/sqlite-bootstrap.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const normalized = (value) => (typeof value === 'string' ? value.replace(/\.000$/, '') : value);
const same = (a, b) => normalized(a) === normalized(b);
const hash = (password) => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
function passwordsMatch(a, b) {
  if (a === b) return true;
  const verify = (plain, encoded) => {
    if (plain.startsWith('scrypt:') || !encoded.startsWith('scrypt:')) return false;
    const [, salt, digest] = encoded.split(':');
    const actual = Buffer.from(digest || '', 'hex');
    return actual.length === 64 && timingSafeEqual(scryptSync(plain, salt, 64), actual);
  };
  return verify(a, b) || verify(b, a);
}

export async function migrateMysql({
  sourcePath = resolve(root, process.env.DB_PATH || 'zhitu.db'),
  backupDir,
  allowEmptySource = false,
} = {}) {
  if (!existsSync(sourcePath) && !allowEmptySource)
    throw new Error('找不到源 SQLite 文件；为避免遗漏历史数据，迁移已停止');
  const options = mysqlOptions();
  const admin = await mysql.createConnection(mysqlOptions({ database: false }));
  let connection, source;
  const report = { database: options.database, startedAt: new Date().toISOString(), tables: {} };
  try {
    await admin.query(
      'CREATE DATABASE IF NOT EXISTS `' +
        options.database +
        '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    connection = await mysql.createConnection(options);
    await connection.query("SET time_zone='+00:00'");
    const [[lock]] = await connection.query('SELECT GET_LOCK(?,5) AS acquired', [
      'zhitu-migrate:' + options.database,
    ]);
    if (lock.acquired !== 1) throw new Error('已有迁移正在运行，请稍后重试');
    const directory =
      backupDir ||
      join(root, 'database', 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(directory, { recursive: true });
    report.backupDirectory = directory;
    // Snapshot the target's definitions and data before any ALTER or inserts.
    // Private backup stays outside the HTTP asset allowlist and is gitignored.
    const target = { database: options.database, tables: {} };
    const [existing] = await connection.query('SHOW FULL TABLES WHERE Table_type="BASE TABLE"');
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    for (const item of existing) {
      const name = Object.values(item)[0];
      if (!tableNames.includes(name)) continue;
      const [[ddl]] = await connection.query('SHOW CREATE TABLE `' + name + '`');
      const [rows] = await connection.query('SELECT * FROM `' + name + '`');
      target.tables[name] = { ddl: ddl['Create Table'], rows };
    }
    await connection.commit();
    await writeFile(join(directory, 'mysql-before.json'), JSON.stringify(target, null, 2));
    const snapshotPath = join(directory, 'sqlite-source.db');
    if (existsSync(sourcePath)) {
      const original = new DatabaseSync(sourcePath, { readOnly: true });
      try {
        await backup(original, snapshotPath);
      } finally {
        original.close();
      }
    }
    // Upgrade a COPY, never the original. This also seeds the current catalog.
    source = new DatabaseSync(snapshotPath);
    initializeSqlite(source);
    await ensureSchema(connection);
    await connection.beginTransaction();
    try {
      for (const table of schemaTables) {
        const rows = source.prepare('SELECT * FROM `' + table.name + '`').all();
        const keys = source
          .prepare('PRAGMA table_info(' + table.name + ')')
          .all()
          .filter((c) => c.pk)
          .sort((a, b) => a.pk - b.pk)
          .map((c) => c.name);
        const fields = table.columns.map((c) => c.name);
        const stats = (report.tables[table.name] = {
          source: rows.length,
          inserted: 0,
          updated: 0,
          retained: 0,
        });
        for (const row of rows) {
          const where = keys.map((k) => '`' + k + '`=?').join(' AND ');
          const [[old]] = await connection.execute(
            'SELECT * FROM `' + table.name + '` WHERE ' + where,
            keys.map((k) => row[k]),
          );
          if (old) {
            if (table.name === 'users') {
              if (old.nickname !== row.nickname || !passwordsMatch(old.password, row.password))
                throw new Error(`账户冲突：users id=${row.id}。迁移已回滚，不会覆盖密码或合并账户`);
              if (old.created_at === null)
                await connection.execute('UPDATE users SET created_at=? WHERE id=?', [
                  row.created_at,
                  row.id,
                ]);
              if (!old.password.startsWith('scrypt:')) {
                await connection.execute('UPDATE users SET password=? WHERE id=?', [
                  row.password,
                  row.id,
                ]);
                stats.updated++;
              } else stats.retained++;
              continue;
            }
            if (['courses', 'chapters', 'live_events'].includes(table.name)) {
              if (old.title !== row.title)
                throw new Error(
                  `内容编号冲突：${table.name} id=${row.id}。迁移已回滚，请先确认编号对应关系`,
                );
              if (table.name === 'chapters' && old.course_id !== row.course_id)
                throw new Error(`章节所属课程冲突：chapters id=${row.id}`);
              // Catalog metadata is authoritative, but preserve existing enrolment
              // counts, timestamps, and live scheduling in the MySQL target.
              const updates = fields.filter(
                (k) =>
                  !keys.includes(k) &&
                  !['students', 'created_at', 'starts_at'].includes(k) &&
                  !same(old[k], row[k]),
              );
              if (updates.length) {
                await connection.execute(
                  'UPDATE `' +
                    table.name +
                    '` SET ' +
                    updates.map((k) => '`' + k + '`=?').join(',') +
                    ' WHERE ' +
                    where,
                  [...updates.map((k) => row[k]), ...keys.map((k) => row[k])],
                );
                stats.updated++;
              } else stats.retained++;
              continue;
            }
            if (fields.every((k) => same(row[k], old[k]))) {
              stats.retained++;
              continue;
            }
            if (
              ['comments', 'danmaku'].includes(table.name) &&
              fields.filter((k) => k !== 'created_at').every((k) => same(row[k], old[k]))
            ) {
              stats.retained++;
              continue;
            }
            if (['progress', 'course_visits'].includes(table.name)) {
              if (row.updated_at > old.updated_at) {
                const updates = fields.filter((k) => !keys.includes(k));
                await connection.execute(
                  'UPDATE `' +
                    table.name +
                    '` SET ' +
                    updates.map((k) => '`' + k + '`=?').join(',') +
                    ' WHERE ' +
                    where,
                  [...updates.map((k) => row[k]), ...keys.map((k) => row[k])],
                );
                stats.updated++;
              } else stats.retained++;
              continue;
            }
            if (['favorites', 'coins', 'follows', 'reservations'].includes(table.name)) {
              stats.retained++;
              continue;
            }
            // Different notes/comments/playback with the same key need a human
            // choice; silently skipping them would lose historical information.
            throw new Error(
              `历史记录冲突：${table.name} 主键 ${keys.map((k) => row[k]).join('/')}。数据事务已回滚`,
            );
          }
          await connection.execute(
            'INSERT INTO `' +
              table.name +
              '` (' +
              fields.map((k) => '`' + k + '`').join(',') +
              ') VALUES (' +
              fields.map(() => '?').join(',') +
              ')',
            fields.map((k) => row[k]),
          );
          stats.inserted++;
        }
      }
      // Legacy accounts that existed only in MySQL need the same password format.
      const [users] = await connection.query('SELECT id,password FROM users');
      for (const user of users)
        if (!user.password.startsWith('scrypt:'))
          await connection.execute('UPDATE users SET password=? WHERE id=?', [
            hash(user.password),
            user.id,
          ]);
      await connection.commit();
      report.ok = true;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    for (const table of tableNames) {
      const [[count]] = await connection.query('SELECT COUNT(*) AS n FROM `' + table + '`');
      report.tables[table].target = count.n;
    }
    await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
    return report;
  } finally {
    source?.close();
    if (connection) await connection.end();
    await admin.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await migrateMysql();
    await writeFile(
      join(root, 'database', 'mysql-migration-report.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('MySQL 迁移未完成：', error.code || error.message);
    process.exitCode = 1;
  }
}
