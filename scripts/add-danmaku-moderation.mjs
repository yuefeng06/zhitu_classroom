import '../backend/config.mjs';
import mysql from 'mysql2/promise';
import { mysqlOptions } from '../backend/config.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export async function addDanmakuModeration(
  db,
  { apply = false, maintenance = false, backupDir } = {},
) {
  const [columns] = await db.query(
    "SELECT TABLE_NAME AS t,COLUMN_NAME AS c,COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('danmaku','users')",
  );
  const type = columns.find((c) => c.t === 'users' && c.c === 'id')?.type;
  if (!/^(?:bigint|int)(?:\(\d+\))?(?: unsigned)?$/i.test(type || ''))
    throw Error('无法确认用户编号类型');
  const author = columns.find((c) => c.t === 'danmaku' && c.c === 'user_id');
  if (author && author.type !== type) throw Error('弹幕用户编号类型不匹配');
  const statements = [];
  if (!author) statements.push(`ALTER TABLE danmaku ADD COLUMN user_id ${type} NULL DEFAULT NULL`);
  if (!columns.some((c) => c.t === 'danmaku' && c.c === 'hidden'))
    statements.push('ALTER TABLE danmaku ADD COLUMN hidden BIGINT NOT NULL DEFAULT 0');
  const [indexes] = await db.query('SHOW INDEX FROM danmaku');
  for (const [name, fields] of [
    ['idx_danmaku_user', 'user_id'],
    ['idx_danmaku_review', 'course_id,chapter_id,hidden,id'],
  ]) {
    const index = indexes
      .filter((i) => i.Key_name === name)
      .sort((a, b) => a.Seq_in_index - b.Seq_in_index);
    if (index.length && index.map((i) => i.Column_name).join(',') !== fields)
      throw Error('弹幕索引名称冲突');
    if (!index.length) statements.push(`CREATE INDEX ${name} ON danmaku(${fields})`);
  }
  const [[count]] = await db.query('SELECT COUNT(*) AS total FROM danmaku');
  if (apply && statements.length) {
    if (!maintenance) throw Error('停止网站写入后使用 --maintenance');
    const dir =
      backupDir ||
      fileURLToPath(
        new URL(
          '../database/backups/danmaku-' + new Date().toISOString().replace(/[:.]/g, '-') + '/',
          import.meta.url,
        ),
      );
    const [schema] = await db.query('SHOW CREATE TABLE danmaku');
    const [rows] = await db.query('SELECT * FROM danmaku');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'before.json'),
      JSON.stringify({ schema: schema[0]['Create Table'], rows }, null, 2),
    );
    await writeFile(join(dir, 'upgrade.sql'), statements.join(';\n') + ';\n');
    for (const sql of statements) await db.query(sql);
  }
  return {
    applied: apply && statements.length > 0,
    statements,
    userType: type,
    total: Number(count.total),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = await mysql.createConnection(mysqlOptions());
  try {
    console.log(
      JSON.stringify(
        await addDanmakuModeration(db, {
          apply: process.argv.includes('--apply'),
          maintenance: process.argv.includes('--maintenance'),
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.code || error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
