import '../backend/config.mjs';
import mysql from 'mysql2/promise';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mysqlOptions } from '../backend/config.mjs';

export async function migrateChapterFavorites(
  db,
  { apply = false, maintenance = false, backupDir } = {},
) {
  const [[info]] = await db.query('SELECT DATABASE() AS name');
  const lockName = 'zhitu-chapter-favorites:' + info.name;
  const [[lock]] = await db.query('SELECT GET_LOCK(?,5) AS acquired', [lockName]);
  if (lock.acquired !== 1) throw Error('已有收藏迁移在运行');
  try {
    const [columns] = await db.query(
      "SELECT COLUMN_NAME AS name,COLUMN_TYPE AS type,IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='favorites'",
    );
    if (!columns.length) throw Error('缺少 favorites 表，拒绝迁移');
    const [indexes] = await db.query('SHOW INDEX FROM favorites');
    const pk = indexes
      .filter((i) => i.Key_name === 'PRIMARY')
      .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
      .map((i) => i.Column_name);
    if (!columns.some((c) => c.name === 'course_id')) {
      if (
        pk.join(',') !== 'user_id,chapter_id' ||
        !columns.some((c) => c.name === 'chapter_id' && c.nullable === 'NO')
      )
        throw Error('现有收藏结构无法识别');
      return { database: info.name, applied: false, alreadyCurrent: true };
    }
    if (pk.join(',') !== 'user_id,course_id') throw Error('旧收藏主键不符合预期');
    const [[fks]] = await db.query(
      "SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND (TABLE_NAME='favorites' OR REFERENCED_TABLE_NAME='favorites')",
    );
    if (fks.n) throw Error('请先完成无外键结构精简迁移');
    const [[type]] = await db.query(
      "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='chapters' AND COLUMN_NAME='id'",
    );
    if (!/^(bigint|int)(\(\d+\))?( unsigned)?$/i.test(type?.type || ''))
      throw Error('无法确认章节编号类型');
    const [mapping] = await db.query(`SELECT f.user_id,f.course_id,f.created_at,
      COALESCE(vch.id,(SELECT ch.id FROM chapters ch WHERE ch.course_id=f.course_id ORDER BY ch.position,ch.id LIMIT 1)) AS chapter_id,
      CASE WHEN vch.id IS NULL THEN 'first' ELSE 'recent' END AS selected_by
      FROM favorites f LEFT JOIN course_visits v ON v.user_id=f.user_id AND v.course_id=f.course_id
      LEFT JOIN chapters vch ON vch.id=v.chapter_id AND vch.course_id=f.course_id
      ORDER BY f.user_id,f.course_id`);
    if (mapping.some((r) => r.chapter_id === null))
      throw Error('有旧收藏对应的课程没有章节，请先处理；未删除任何收藏');
    const [[orphans]] = await db.query(
      'SELECT COUNT(*) AS n FROM favorites f LEFT JOIN users u ON u.id=f.user_id LEFT JOIN courses c ON c.id=f.course_id WHERE u.id IS NULL OR c.id IS NULL',
    );
    if (orphans.n) throw Error('旧收藏存在无效用户或课程关联，未修改');
    const report = {
      database: info.name,
      applied: false,
      favorites: mapping.length,
      recent: mapping.filter((r) => r.selected_by === 'recent').length,
      first: mapping.filter((r) => r.selected_by === 'first').length,
    };
    if (!apply) return report;
    if (!maintenance) throw Error('请停止网站及其他业务写入，并指定 --maintenance');
    const directory =
      backupDir ||
      fileURLToPath(
        new URL(
          '../database/backups/chapter-favorites-' +
            new Date().toISOString().replace(/[:.]/g, '-') +
            '/',
          import.meta.url,
        ),
      );
    await mkdir(directory, { recursive: true });
    const [[ddl]] = await db.query('SHOW CREATE TABLE favorites');
    const [rows] = await db.query('SELECT * FROM favorites');
    const original = ddl['Create Table'];
    await writeFile(
      join(directory, 'before.json'),
      JSON.stringify({ database: info.name, ddl: original, rows, mapping }, null, 2),
      { flag: 'wx', mode: 0o600 },
    );
    const literal = (v) =>
      v === null
        ? 'NULL'
        : typeof v === 'number'
          ? String(v)
          : 'CONVERT(0x' + Buffer.from(String(v)).toString('hex') + ' USING utf8mb4)';
    const restore = [
      '-- 仅在停机且本次迁移后尚无新写入时恢复；先核对目标库。',
      'USE `' + info.name.replaceAll('`', '``') + '`;',
      original.replace('CREATE TABLE `favorites`', 'CREATE TABLE `_favorites_course_restore`') +
        ';',
      ...rows.map(
        (r) =>
          'INSERT INTO `_favorites_course_restore` (' +
          Object.keys(r)
            .map((k) => '`' + k + '`')
            .join(',') +
          ') VALUES (' +
          Object.values(r).map(literal).join(',') +
          ');',
      ),
      'RENAME TABLE favorites TO _favorites_chapter_restore_old, _favorites_course_restore TO favorites;',
      'DROP TABLE _favorites_chapter_restore_old;',
    ];
    await writeFile(join(directory, 'rollback.sql'), restore.join('\n') + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    // The final ALTER removes course_id and changes the key atomically. MySQL DDL is not transactional.
    if (!columns.some((c) => c.name === 'chapter_id'))
      await db.query('ALTER TABLE favorites ADD COLUMN chapter_id ' + type.type + ' NULL');
    await db.beginTransaction();
    try {
      for (const row of mapping)
        await db.execute('UPDATE favorites SET chapter_id=? WHERE user_id=? AND course_id=?', [
          row.chapter_id,
          row.user_id,
          row.course_id,
        ]);
      await db.commit();
    } catch (e) {
      await db.rollback();
      throw e;
    }
    await db.query(
      'ALTER TABLE favorites DROP PRIMARY KEY, DROP COLUMN course_id, MODIFY COLUMN chapter_id ' +
        type.type +
        " NOT NULL, ADD PRIMARY KEY(user_id,chapter_id), ADD KEY idx_favorites_chapter(chapter_id), COMMENT='章节视频收藏表'",
    );
    const [after] = await db.query(
      'SELECT user_id,chapter_id,created_at FROM favorites ORDER BY user_id,chapter_id',
    );
    if (
      after.length !== mapping.length ||
      mapping.some(
        (r) =>
          !after.some(
            (a) =>
              a.user_id === r.user_id &&
              a.chapter_id === r.chapter_id &&
              String(a.created_at) === String(r.created_at),
          ),
      )
    )
      throw Error('迁移后收藏数量或时间校验失败；请保持停机并检查备份');
    await writeFile(
      join(directory, 'result.json'),
      JSON.stringify({ ...report, applied: true }, null, 2),
    );
    return { ...report, applied: true, backupDirectory: directory };
  } finally {
    await db.query('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let db;
  try {
    db = await mysql.createConnection(mysqlOptions());
    console.log(
      JSON.stringify(
        await migrateChapterFavorites(db, {
          apply: process.argv.includes('--apply'),
          maintenance: process.argv.includes('--maintenance'),
        }),
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(e.code || e.message);
    process.exitCode = 1;
  } finally {
    await db?.end();
  }
}
