export function createCourseSummaries(db) {
  return async (courses, uid) => {
    if (!courses.length) return [];
    if (!uid)
      return courses.map((c) => ({
        ...c,
        favorite: false,
        coin: false,
        progress: 0,
        chapter_id: null,
        last_opened_title: null,
      }));
    const ids = [...new Set(courses.map((c) => Number(c.id)))],
      marks = ids.map(() => '?').join(',');
    const [progress, visits, favorites, coins] = await Promise.all([
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
        `SELECT course_id FROM favorites WHERE user_id=? AND course_id IN (${marks})`,
        uid,
        ...ids,
      ),
      db.all(
        `SELECT course_id FROM coins WHERE user_id=? AND course_id IN (${marks})`,
        uid,
        ...ids,
      ),
    ]);
    const p = new Map(progress.map((r) => [Number(r.course_id), r])),
      v = new Map(visits.map((r) => [Number(r.course_id), r]));
    const f = new Set(favorites.map((r) => Number(r.course_id))),
      k = new Set(coins.map((r) => Number(r.course_id)));
    return courses.map((c) => ({
      ...c,
      favorite: f.has(Number(c.id)),
      coin: k.has(Number(c.id)),
      progress: p.get(Number(c.id))?.percent || 0,
      chapter_id: v.get(Number(c.id))?.chapter_id || p.get(Number(c.id))?.chapter_id || null,
      last_opened_title: v.get(Number(c.id))?.title || null,
    }));
  };
}
