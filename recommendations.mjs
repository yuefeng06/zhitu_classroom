// Content ranking + optional, offline-trained BPR matrix factorization.
// No note contents, passwords or playback-completion assumptions enter this module.
export const MODEL_VERSION = 3;
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
export function mergeSignals(rows) {
  const pairs = new Map();
  for (const row of rows) {
    const userId = Number(row.user_id),
      courseId = Number(row.course_id);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(courseId)) continue;
    const key = `${userId}:${courseId}`,
      old = pairs.get(key);
    pairs.set(key, {
      userId,
      courseId,
      weight: Math.min(6, (old?.weight || 0) + Number(row.weight || 1)),
      at: [old?.at || '', String(row.at || '')].sort().at(-1),
    });
  }
  return [...pairs.values()].sort((a, b) => a.userId - b.userId || a.courseId - b.courseId);
}
export async function readSignals(db, uid = null) {
  const where = uid === null ? '' : ' AND s.user_id=?',
    args = uid === null ? [] : [uid, uid];
  return mergeSignals(
    await db.all(
      `
    SELECT s.user_id,s.course_id,3 AS weight,s.created_at AS at FROM favorites s JOIN courses c ON c.id=s.course_id WHERE c.published=1${where}
    UNION ALL SELECT s.user_id,s.course_id,1 AS weight,s.updated_at AS at FROM course_visits s JOIN courses c ON c.id=s.course_id WHERE c.published=1${where}`,
      ...args,
    ),
  );
}
export async function readPopularity(db) {
  return db.all(`SELECT course_id,COUNT(*) AS count FROM (
    SELECT f.user_id,f.course_id FROM favorites f JOIN courses c ON c.id=f.course_id WHERE c.published=1
    UNION SELECT v.user_id,v.course_id FROM course_visits v JOIN courses c ON c.id=v.course_id WHERE c.published=1
  ) interactions GROUP BY course_id`);
}
let vectorCache;
function vectors(courses) {
  const key = JSON.stringify(
    courses.map(({ id, title, description, category, subject, teacher }) => ({
      id,
      title,
      description,
      category,
      subject,
      teacher,
    })),
  );
  if (vectorCache?.key === key) return vectorCache.value;
  const docs = courses.map((c) => {
    const tokens = [
      `category:${c.category}`,
      `subject:${c.subject}`,
      `subject:${c.subject}`,
      `teacher:${c.teacher}`,
    ];
    const value = `${c.title || ''} ${c.description || ''}`.toLowerCase();
    tokens.push(...(value.match(/[a-z0-9+#]+/g) || []));
    for (const word of value.match(/[\u3400-\u9fff]+/g) || [])
      for (let i = 0; i < word.length - 1; i++) tokens.push(word.slice(i, i + 2));
    const counts = new Map();
    for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
    return counts;
  });
  const df = new Map();
  for (const doc of docs) for (const t of doc.keys()) df.set(t, (df.get(t) || 0) + 1);
  const value = new Map(
    courses.map((c, i) => {
      const v = new Map(
        [...docs[i]].map(([t, n]) => [
          t,
          (1 + Math.log(n)) * (1 + Math.log((courses.length + 1) / (df.get(t) + 1))),
        ]),
      );
      const norm = Math.hypot(...v.values()) || 1;
      return [Number(c.id), new Map([...v].map(([t, n]) => [t, n / norm]))];
    }),
  );
  vectorCache = { key, value };
  return value;
}
export function rankCourses(courses, signals, uid, { model = null, popularity = null } = {}) {
  const active = courses.filter((c) => Number(c.published) === 1),
    features = vectors(active);
  const history = signals.filter((s) => s.userId === uid && features.has(s.courseId));
  const seen = new Set(history.map((s) => s.courseId)),
    profile = new Map();
  for (const s of history)
    for (const [t, n] of features.get(s.courseId))
      profile.set(t, (profile.get(t) || 0) + n * s.weight);
  const norm = Math.hypot(...profile.values()) || 1;
  for (const [t, n] of profile) profile.set(t, n / norm);
  const counts = new Map();
  if (popularity) for (const p of popularity) counts.set(Number(p.course_id), Number(p.count));
  else for (const s of signals) counts.set(s.courseId, (counts.get(s.courseId) || 0) + 1);
  const max = Math.max(1, ...counts.values()),
    userVector = history.length ? model?.users?.[uid] : null;
  const method = userVector ? 'hybrid' : history.length ? 'content' : 'discovery';
  const rows = active
    .map((c) => {
      const similarity = [...features.get(Number(c.id))].reduce(
        (sum, [t, n]) => sum + n * (profile.get(t) || 0),
        0,
      );
      const popular = (counts.get(Number(c.id)) || 0) / max,
        item = model?.items?.[c.id];
      const learned = userVector && item ? sigmoid(dot(userVector, item)) : 0.5;
      const score = userVector
        ? 0.65 * similarity + 0.25 * learned + 0.1 * popular
        : history.length
          ? 0.9 * similarity + 0.1 * popular
          : popular;
      const reason = seen.has(Number(c.id))
        ? '重温学过的课程'
        : method === 'hybrid'
          ? '结合学习兴趣推荐'
          : similarity > 0 && history.length
            ? '与你关注的课程相关'
            : popular > 0
              ? '学习者正在关注'
              : '发现新的学习方向';
      return {
        ...c,
        recommendationReason: reason,
        recommendationScore: score,
        _seen: seen.has(Number(c.id)),
      };
    })
    .sort(
      (a, b) =>
        Number(a._seen) - Number(b._seen) ||
        b.recommendationScore - a.recommendationScore ||
        Number(a.id) - Number(b.id),
    );
  return { method, rows: rows.map(({ _seen, ...c }) => c) };
}
function random(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function fitBpr(courseIds, signals, { epochs = 160, dimensions = 8, seed = 42 } = {}) {
  const rng = random(seed),
    users = {},
    items = {},
    known = new Map();
  const vector = () => Array.from({ length: dimensions }, () => 0.2 * (rng() - 0.5));
  for (const id of courseIds) items[id] = vector();
  for (const s of signals) {
    if (!items[s.courseId]) continue;
    users[s.userId] ??= vector();
    if (!known.has(s.userId)) known.set(s.userId, new Set());
    known.get(s.userId).add(s.courseId);
  }
  const negatives = new Map(
    [...known].map(([u, ids]) => [u, courseIds.filter((id) => !ids.has(id))]),
  );
  const examples = signals.filter((s) => items[s.courseId] && negatives.get(s.userId)?.length);
  if (!examples.length) return { users, items };
  for (let epoch = 0; epoch < epochs; epoch++)
    for (let n = 0; n < examples.length * 3; n++) {
      const s = examples[Math.floor(rng() * examples.length)],
        choices = negatives.get(s.userId);
      const u = users[s.userId],
        i = items[s.courseId],
        j = items[choices[Math.floor(rng() * choices.length)]];
      const gradient = sigmoid(-(dot(u, i) - dot(u, j))),
        rate = 0.04 * Math.min(3, s.weight);
      for (let d = 0; d < dimensions; d++) {
        const old = u[d],
          positive = i[d],
          negative = j[d];
        u[d] += rate * (gradient * (positive - negative) - 0.02 * old);
        i[d] += rate * (gradient * old - 0.02 * positive);
        j[d] += rate * (-gradient * old - 0.02 * negative);
      }
    }
  return { users, items };
}
