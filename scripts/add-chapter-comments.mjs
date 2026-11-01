import '../backend/config.mjs';
import mysql from 'mysql2/promise';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mysqlOptions } from '../backend/config.mjs';

export async function addChapterComments(
  db,
  { apply = false, maintenance = false, backupDir } = {},
) {
  const [columns] = await db.query(
    "SELECT TABLE_NAME AS t,COLUMN_NAME AS c,COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('chapters','comments')",
  );
  const type = columns.find((c) => c.t === 'chapters' && c.c === 'id')?.type;
  if (!/^(?:bigint|int)(?:\(\d+\))?(?: unsigned)?$/i.test(type || ''))
    throw Error('无法确认章节编号类型');
  const column = columns.find((c) => c.t === 'comments' && c.c === 'chapter_id');
  if (column && column.type !== type) throw Error('评论章节编号类型不匹配，请先人工核实');
  const [indexes] = await db.query('SHOW INDEX FROM comments');
  const index = indexes
    .filter((i) => i.Key_name === 'idx_comments_chapter')
    .sort((a, b) => a.Seq_in_index - b.Seq_in_index);
  if (
    index.length &&
    index.map((i) => i.Column_name).join(',') !== 'course_id,chapter_id,hidden,id'
  )
    throw Error('评论索引名称冲突');
  const statements = [];
  if (!column)
    statements.push(`ALTER TABLE comments ADD COLUMN chapter_id ${type} NULL DEFAULT NULL`);
  if (!index.length)
    statements.push(
      'CREATE INDEX idx_comments_chapter ON comments(course_id,chapter_id,hidden,id)',
    );
  const [[counts]] = await db.query(
    `SELECT COUNT(*) AS total,${column ? 'SUM(chapter_id IS NULL)' : 'COUNT(*)'} AS legacy FROM comments`,
  );
  if (apply && statements.length) {
    if (!maintenance) throw Error('应用升级须停止网站写入，并提供 --maintenance');
    const directory =
      backupDir ||
      fileURLToPath(
        new URL(
          '../database/backups/chapter-comments-' +
            new Date().toISOString().replace(/[:.]/g, '-') +
            '/',
          import.meta.url,
        ),
      );
    const [schema] = await db.query('SHOW CREATE TABLE comments');
    const [rows] = await db.query('SELECT * FROM comments');
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'before.json'),
      JSON.stringify({ schema: schema[0]['Create Table'], rows }, null, 2),
    );
    await writeFile(join(directory, 'upgrade.sql'), statements.join(';\n') + ';\n');
    // MySQL DDL commits implicitly. No comment content or chapter assignment is rewritten.
    for (const sql of statements) await db.query(sql);
  }
  return {
    applied: apply && statements.length > 0,
    statements,
    chapterType: type,
    total: Number(counts.total),
    legacy: Number(counts.legacy || 0),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = await mysql.createConnection(mysqlOptions());
  try {
    console.log(
      JSON.stringify(
        await addChapterComments(db, {
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
