import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrateChapterFavorites } from '../scripts/migrate-chapter-favorites.mjs';
export async function checkChapterFavoriteMigration(db, dir) {
  await db.query('CREATE DATABASE zhitu_favorites_test');
  await db.query('USE zhitu_favorites_test');
  try {
    for (const sql of [
      'CREATE TABLE users(id BIGINT UNSIGNED PRIMARY KEY)',
      'CREATE TABLE courses(id BIGINT UNSIGNED PRIMARY KEY)',
      'CREATE TABLE chapters(id BIGINT UNSIGNED PRIMARY KEY,course_id BIGINT UNSIGNED,position INT)',
      'CREATE TABLE course_visits(user_id BIGINT UNSIGNED,course_id BIGINT UNSIGNED,chapter_id BIGINT UNSIGNED,PRIMARY KEY(user_id,course_id))',
      'CREATE TABLE favorites(user_id BIGINT UNSIGNED,course_id BIGINT UNSIGNED,created_at DATETIME,PRIMARY KEY(user_id,course_id),KEY idx_course(course_id))',
      'INSERT INTO users VALUES(1)',
      'INSERT INTO courses VALUES(1),(2),(3),(4)',
      'INSERT INTO chapters VALUES(11,1,1),(12,1,2),(21,2,2),(22,2,1),(31,3,1)',
      "INSERT INTO favorites VALUES(1,1,'2026-01-01'),(1,2,'2026-01-02'),(1,3,'2026-01-03'),(1,4,'2026-01-04')",
      'INSERT INTO course_visits VALUES(1,1,12),(1,3,12)',
    ])
      await db.query(sql);
    await assert.rejects(migrateChapterFavorites(db), /没有章节/);
    await db.query('DELETE FROM favorites WHERE course_id=4');
    const before = await migrateChapterFavorites(db);
    assert.equal(before.recent, 1);
    assert.equal(before.first, 2);
    await assert.rejects(migrateChapterFavorites(db, { apply: true }), /maintenance/);
    const backupDir = join(dir, 'chapter-favorites-backup');
    await migrateChapterFavorites(db, { apply: true, maintenance: true, backupDir });
    const [rows] = await db.query('SELECT * FROM favorites ORDER BY chapter_id');
    assert.deepEqual(
      rows.map((r) => r.chapter_id),
      [12, 22, 31],
    );
    assert.equal(rows[0].created_at, '2026-01-01 00:00:00');
    const [cols] = await db.query('SHOW COLUMNS FROM favorites');
    assert.equal(cols.find((c) => c.Field === 'chapter_id').Type, 'bigint unsigned');
    assert.ok(!cols.some((c) => c.Field === 'course_id'));
    assert.equal(
      (await migrateChapterFavorites(db, { apply: true, maintenance: true })).alreadyCurrent,
      true,
    );
    const rollback = await readFile(join(backupDir, 'rollback.sql'), 'utf8');
    for (const sql of rollback
      .replace(/^--.*$/gm, '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.query(sql);
    assert.equal((await migrateChapterFavorites(db)).favorites, 3);
  } finally {
    await db.query('USE zhitu_test');
    await db.query('DROP DATABASE zhitu_favorites_test');
  }
}
