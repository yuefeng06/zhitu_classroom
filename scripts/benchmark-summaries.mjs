import '../backend/config.mjs';
import mysql from 'mysql2/promise';
import { mysqlOptions } from '../backend/config.mjs';
import { createCourseSummaries } from '../backend/course-summary.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
const connection = await mysql.createConnection(mysqlOptions());
try {
  // All writes use connection-local TEMPORARY tables; no real user record is read.
  const definitions = {
    progress:
      'user_id BIGINT,course_id BIGINT,chapter_id BIGINT,percent INT,PRIMARY KEY(user_id,course_id)',
    course_visits:
      'user_id BIGINT,course_id BIGINT,chapter_id BIGINT,PRIMARY KEY(user_id,course_id)',
    favorites: 'user_id BIGINT,chapter_id BIGINT,PRIMARY KEY(user_id,chapter_id)',
    chapters: 'id BIGINT PRIMARY KEY,course_id BIGINT,title VARCHAR(60)',
  };
  for (const [name, ddl] of Object.entries(definitions))
    await connection.query(`CREATE TEMPORARY TABLE bench_${name} (${ddl})`);
  let count = 0;
  const query = async (sql, args) => {
    count++;
    return (
      await connection.execute(
        sql.replace(/\b(progress|course_visits|favorites|chapters)\b/g, 'bench_$1'),
        args,
      )
    )[0];
  };
  const db = {
    all: (sql, ...args) => query(sql, args),
    get: async (sql, ...args) => (await query(sql, args))[0],
  };
  const batch = createCourseSummaries(db);
  const legacy = async (courses) =>
    Promise.all(
      courses.map(async (c) => {
        const p = await db.get('SELECT * FROM progress WHERE user_id=? AND course_id=?', 1, c.id);
        const v = await db.get(
          'SELECT v.chapter_id,c.title FROM course_visits v JOIN chapters c ON c.id=v.chapter_id WHERE v.user_id=? AND v.course_id=?',
          1,
          c.id,
        );
        return {
          ...c,
          favorite_chapter_count: (
            await db.get(
              'SELECT COUNT(*) AS count FROM favorites f JOIN chapters ch ON ch.id=f.chapter_id WHERE f.user_id=? AND ch.course_id=?',
              1,
              c.id,
            )
          ).count,
          progress: p?.percent || 0,
          chapter_id: v?.chapter_id || p?.chapter_id || null,
          last_opened_title: v?.title || null,
        };
      }),
    );
  const report = {
    date: '2026-10-07',
    scope: 'MySQL connection-local synthetic tables; course summary function, not HTTP load test',
    rounds: 20,
    results: [],
  };
  for (const size of [33, 330]) {
    for (const name of Object.keys(definitions))
      await connection.query(`DELETE FROM bench_${name}`);
    for (let id = 1; id <= size; id++) {
      await connection.query('INSERT INTO bench_chapters VALUES(?,?,?)', [id, id, 'fixture']);
      await connection.query('INSERT INTO bench_course_visits VALUES(1,?,?)', [id, id]);
      await connection.query('INSERT INTO bench_progress VALUES(1,?,?,25)', [id, id]);
    }
    const courses = Array.from({ length: size }, (_, i) => ({ id: i + 1, title: 'fixture ' + i })),
      samples = { legacy: [], batch: [] },
      queries = {};
    for (let round = -3; round < 20; round++)
      for (const name of round % 2 ? ['legacy', 'batch'] : ['batch', 'legacy']) {
        count = 0;
        const start = performance.now();
        const rows = await (name === 'legacy' ? legacy(courses) : batch(courses, 1));
        const elapsed = performance.now() - start;
        if (
          rows.length !== size ||
          rows.some((r) => r.progress !== 25 || r.last_opened_title !== 'fixture')
        )
          throw Error('结果不一致');
        if (round >= 0) {
          samples[name].push(elapsed);
          queries[name] = count;
        }
      }
    const stats = {};
    for (const name of Object.keys(samples)) {
      const sorted = [...samples[name]].sort((a, b) => a - b);
      stats[name] = { queries: queries[name], medianMs: sorted[10], p95Ms: sorted[18] };
    }
    report.results.push({ courses: size, ...stats });
  }
  await mkdir('thesis/evidence', { recursive: true });
  await writeFile('thesis/evidence/summary-benchmark.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await connection.end();
}
