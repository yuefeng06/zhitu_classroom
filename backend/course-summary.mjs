export function createCourseSummaries(db) {
  return async (courses, uid) => {
    if (!courses.length) return [];
    if (!uid)
      return courses.map((c) => ({
        ...c,
        favorite_chapter_count: 0,
        progress: 0,
        chapter_id: null,
        last_opened_title: null,
      }));
    const ids = [...new Set(courses.map((c) => Number(c.id)))],
      marks = ids.map(() => '?').join(',');
    const [progress, visits, favorites] = await Promise.all([
      db.all(
        `SELECT course_id,chapter_id,percent FROM progress WHERE user_id=? AND course_id IN (${marks})`,
        uid,
        ...ids,
      ),
      db.all(
        `SELECT v.course_id,v.chapter_id,c.title FROM course_visits v JOIN chapters c ON c.id=v.chapter_id WHERE v.user_id=? AND v.course_id IN (${marks})`,
        uid,
        ...ids,
      ),
      db.all(
        `SELECT ch.course_id,COUNT(*) AS count FROM favorites f JOIN chapters ch ON ch.id=f.chapter_id WHERE f.user_id=? AND ch.course_id IN (${marks}) GROUP BY ch.course_id`,
        uid,
        ...ids,
      ),
    ]);
    const p = new Map(progress.map((r) => [Number(r.course_id), r])),
      v = new Map(visits.map((r) => [Number(r.course_id), r]));
    const f = new Map(favorites.map((r) => [Number(r.course_id), Number(r.count)]));
    return courses.map((c) => ({
      ...c,
      favorite_chapter_count: f.get(Number(c.id)) || 0,
      progress: p.get(Number(c.id))?.percent || 0,
      chapter_id: v.get(Number(c.id))?.chapter_id || p.get(Number(c.id))?.chapter_id || null,
      last_opened_title: v.get(Number(c.id))?.title || null,
    }));
  };
}
