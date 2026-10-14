import '../config.mjs';
import mysql from 'mysql2/promise';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mysqlOptions } from '../config.mjs';
import { videoCatalog, normalizeCategory, retiredCourseIds } from '../catalog.mjs';

// Incremental course content only: never migrate accounts or delete chapters.
export async function syncMysqlCatalog({ ids, unpublishIds = [], apply = false, backupDir } = {}) {
  if (
    !ids?.length ||
    ids.some((id) => !Number.isSafeInteger(id) || !videoCatalog.some((c) => c.id === id))
  )
    throw Error('请指定有效的 --ids 课程编号');
  if (unpublishIds.some((id) => !retiredCourseIds.includes(id) || ids.includes(id)))
    throw Error('下架编号须在已停用课程清单中且不能同时更新');
  const selected = videoCatalog.filter((c) => ids.includes(c.id));
  const db = await mysql.createConnection(mysqlOptions());
  const selectedIds = selected.map((c) => c.id);
  const affectedIds = [...new Set([...selectedIds, ...unpublishIds])];
  const placeholders = affectedIds.map(() => '?').join(',');
  try {
    const [[lock]] = await db.query("SELECT GET_LOCK('zhitu-catalog-sync',5) AS acquired");
    if (lock.acquired !== 1) throw Error('课程目录正在更新，请稍后重试');
    await db.beginTransaction();
    const [courses] = await db.query(
      `SELECT * FROM courses WHERE id IN (${placeholders}) FOR UPDATE`,
      affectedIds,
    );
    const [chapters] = await db.query(
      `SELECT * FROM chapters WHERE course_id IN (${placeholders}) FOR UPDATE`,
      affectedIds,
    );
    if (unpublishIds.some((id) => !courses.some((c) => c.id === id)))
      throw Error('待下架课程不存在');
    const expected = new Map(
      selected.flatMap((c) => c.pages.map((p) => [c.id * 10000 + p.page, c.id])),
    );
    for (const c of selected) {
      if (
        !c.pages.length ||
        c.pages.some(
          (p, i) =>
            p.page !== i + 1 ||
            !Number.isSafeInteger(p.cid) ||
            p.cid <= 0 ||
            !Number.isFinite(p.seconds) ||
            p.seconds < 0,
        )
      )
        throw Error('分集元数据不完整：' + c.id);
    }
    if (chapters.some((c) => selectedIds.includes(c.course_id) && !expected.has(c.id)))
      throw Error('存在目录之外的旧章节；请先人工确认历史记录映射，当前更新已停止');
    const chapterKeys = [...expected.keys()];
    const [occupied] = await db.query(
      `SELECT id,course_id FROM chapters WHERE id IN (${chapterKeys.map(() => '?').join(',')})`,
      chapterKeys,
    );
    if (occupied.some((c) => expected.get(c.id) !== c.course_id))
      throw Error('章节编号与其他课程冲突');
    const report = {
      courses: selected.map((c) => ({
        id: c.id,
        title: c.title,
        bvid: c.bvid,
        chapters: c.pages.length,
      })),
      unpublished: unpublishIds,
      applied: apply,
    };
    if (!apply) {
      await db.rollback();
      return report;
    }
    const directory =
      backupDir ||
      fileURLToPath(
        new URL(
          '../database/backups/catalog-' + new Date().toISOString().replace(/[:.]/g, '-') + '/',
          import.meta.url,
        ),
      );
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'before.json'),
      JSON.stringify({ database: mysqlOptions().database, courses, chapters }, null, 2),
    );
    const courseSql = `INSERT INTO courses(id,title,category,teacher,description,cover,accent,lessons,students,duration,level,published,subject)
      VALUES(?,?,?,?,?,?,?,?,0,?,?,1,?) ON DUPLICATE KEY UPDATE title=VALUES(title),category=VALUES(category),teacher=VALUES(teacher),description=VALUES(description),cover=VALUES(cover),accent=VALUES(accent),lessons=VALUES(lessons),duration=VALUES(duration),level=VALUES(level),published=1,subject=VALUES(subject)`;
    for (const c of selected) {
      const seconds = c.pages.reduce((n, p) => n + p.seconds, 0);
      await db.execute(courseSql, [
        c.id,
        c.title,
        normalizeCategory(c.category),
        c.teacher,
        `原站课程：${c.sourceTitle}。已收录 ${c.pages.length} 个分集，可在右侧目录切换。使用 Bilibili 原站播放器，播放权限与后续更新以原站为准。`,
        c.cover,
        c.accent,
        c.pages.length,
        `${Math.floor(seconds / 3600)}小时${Math.floor(seconds / 60) % 60}分钟`,
        c.level,
        c.subject || '',
      ]);
      for (const p of c.pages) {
        const duration = [
          Math.floor(p.seconds / 3600),
          Math.floor(p.seconds / 60) % 60,
          p.seconds % 60,
        ]
          .map((n, i) => (i ? String(n).padStart(2, '0') : String(n)))
          .join(':')
          .replace(/^0:/, '');
        await db.execute(
          'INSERT INTO chapters(id,course_id,title,duration,is_free,position) VALUES(?,?,?,?,1,?) ON DUPLICATE KEY UPDATE title=VALUES(title),duration=VALUES(duration),position=VALUES(position)',
          [c.id * 10000 + p.page, c.id, p.title, duration, p.page],
        );
      }
    }
    for (const id of unpublishIds)
      await db.execute('UPDATE courses SET published=0 WHERE id=?', [id]);
    await db.commit();
    return { ...report, backupDirectory: directory };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const ids = process.argv
      .find((a) => a.startsWith('--ids='))
      ?.slice(6)
      .split(',')
      .map(Number);
    const unpublishIds =
      process.argv
        .find((a) => a.startsWith('--unpublish-ids='))
        ?.slice(16)
        .split(',')
        .map(Number) || [];
    console.log(
      JSON.stringify(
        await syncMysqlCatalog({ ids, unpublishIds, apply: process.argv.includes('--apply') }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error('课程更新失败：' + (error.code || error.message));
    process.exitCode = 1;
  }
}
