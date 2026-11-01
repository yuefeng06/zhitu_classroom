import { trainAndEvaluate, chronologicalSplit } from '../backend/recommendation-evaluation.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCourses, fitBpr, mergeSignals, MODEL_VERSION } from '../backend/recommendations.mjs';
import { validModel, modelScope } from '../backend/recommendation-store.mjs';
const course = (id, subject, published = 1) => ({
  id,
  subject,
  category: subject === '物理' ? '高中' : '技术',
  teacher: subject,
  title: subject + '课程' + id,
  description: subject,
  published,
});
const courses = [course(1, '物理'), course(2, '物理'), course(3, '数据库'), course(4, '物理', 0)];
test('内容排序：相关性、排除下架、优先新课程与账号隔离', () => {
  const signals = [
    { userId: 1, courseId: 1, weight: 3 },
    { userId: 2, courseId: 3, weight: 3 },
  ];
  const result = rankCourses(courses, signals, 1);
  assert.equal(result.method, 'content');
  assert.equal(result.rows[0].id, 2);
  assert.equal(result.rows.at(-1).id, 1);
  assert.ok(!result.rows.some((c) => c.id === 4));
  assert.equal(rankCourses(courses, signals, 3).method, 'discovery');
  assert.equal(rankCourses(courses, signals, 2).rows.at(-1).id, 3);
  assert.deepEqual(rankCourses([], signals, 1).rows, []);
});
test('同一用户课程去重，收藏与访问权重合并，不虚增流行人数', () => {
  const signals = mergeSignals([
    { user_id: 1, course_id: 2, weight: 3, at: '2026-10-01' },
    { user_id: 1, course_id: 2, weight: 1, at: '2026-10-02' },
  ]);
  assert.deepEqual(signals, [{ userId: 1, courseId: 2, weight: 4, at: '2026-10-02' }]);
  const outcome = trainAndEvaluate(courses, signals);
  assert.equal(outcome.model, null);
  assert.equal(outcome.report.reason, 'insufficient-data');
});
test('BPR确实学习隐反馈排序，可重复训练且全部已知时不会死循环', () => {
  const signals = [
    { userId: 1, courseId: 1, weight: 3 },
    { userId: 2, courseId: 1, weight: 3 },
  ];
  const before = fitBpr([1, 2, 3], signals, { epochs: 0 }),
    after = fitBpr([1, 2, 3], signals);
  const difference = (m) =>
    m.users[1].reduce((sum, x, i) => sum + x * (m.items[1][i] - m.items[2][i]), 0);
  assert.ok(difference(after) > difference(before) + 0.5);
  assert.deepEqual(after, fitBpr([1, 2, 3], signals));
  assert.ok(fitBpr([1], signals).users[1].every(Number.isFinite));
  assert.equal(rankCourses(courses, signals, 1, { model: after }).method, 'hybrid');
  assert.equal(rankCourses(courses, signals, 9, { model: after }).method, 'discovery');
});
test('留出评估报告覆盖两类基线；合成数据仅测试算法，不代表业务效果', () => {
  const catalog = Array.from({ length: 12 }, (_, i) => course(i + 1, i < 6 ? '物理' : '数据库'));
  const signals = Array.from({ length: 12 }, (_, u) =>
    Array.from({ length: 5 }, (_, i) => ({
      userId: u + 1,
      courseId: (u < 6 ? 0 : 6) + ((i + (u % 2)) % 6) + 1,
      weight: 3,
      at: `2026-10-0${i + 1}`,
    })),
  ).flat();
  const { report, model } = trainAndEvaluate(catalog, signals);
  assert.equal(report.evaluation.test.content.users, 12);
  for (const type of ['popularity', 'content', 'hybrid']) {
    const metric = report.evaluation.test[type];
    assert.ok(metric.ndcgAt5 >= 0 && metric.ndcgAt5 <= 1);
    assert.ok(metric.hitRateAt5 >= 0 && metric.hitRateAt5 <= 1);
  }
  assert.equal(Boolean(model), report.enabled);
  if (report.enabled)
    assert.ok(
      report.evaluation.validation.hybrid.ndcgAt5 > report.evaluation.validation.content.ndcgAt5,
    );
});
test('模型拒绝过期、错库、损坏和未通过评估的参数', () => {
  const value = {
    version: MODEL_VERSION,
    scope: modelScope(),
    trainedAt: new Date().toISOString(),
    report: { enabled: true },
    model: fitBpr([1, 2], [{ userId: 1, courseId: 1, weight: 3 }]),
  };
  assert.equal(validModel(value), true);
  assert.equal(validModel({ ...value, scope: 'other' }), false);
  assert.equal(validModel({ ...value, trainedAt: '2020-01-01' }), false);
  assert.equal(validModel({ ...value, report: { enabled: false } }), false);
  assert.equal(
    validModel({ ...value, model: { users: { 1: [Infinity] }, items: { 1: [0] } } }),
    false,
  );
});

test('全局时间分割不拆开同一时刻，训练验证测试边界不重叠', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    at: '2026-10-' + String(i + 1).padStart(2, '0'),
  }));
  const split = chronologicalSplit(rows);
  assert.ok(
    Math.max(...split.train.map((s) => s.time)) < Math.min(...split.validation.map((s) => s.time)),
  );
  assert.ok(
    Math.max(...split.validation.map((s) => s.time)) < Math.min(...split.test.map((s) => s.time)),
  );
  assert.equal(chronologicalSplit([{ at: 'bad' }]), null);
});
import { DatabaseSync } from 'node:sqlite';
import { readSignals, readPopularity } from '../backend/recommendations.mjs';
test('章节收藏聚合为课程兴趣，多集不重复增加权重或人数', async () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec(`CREATE TABLE courses(id INTEGER,published INTEGER); CREATE TABLE chapters(id INTEGER,course_id INTEGER);
  CREATE TABLE favorites(user_id INTEGER,chapter_id INTEGER,created_at TEXT); CREATE TABLE course_visits(user_id INTEGER,course_id INTEGER,updated_at TEXT);
  INSERT INTO courses VALUES(1,1),(2,0); INSERT INTO chapters VALUES(11,1),(12,1),(21,2);
  INSERT INTO favorites VALUES(1,11,'2026-01-01'),(1,12,'2026-01-02'),(2,12,'2026-01-03'),(1,21,'2026-01-04');
  INSERT INTO course_visits VALUES(1,1,'2026-01-05');`);
    const db = { all: async (q, ...args) => sql.prepare(q).all(...args) };
    assert.deepEqual(await readSignals(db, 1), [
      { userId: 1, courseId: 1, weight: 4, at: '2026-01-05' },
    ]);
    assert.equal((await readSignals(db)).length, 2);
    const popular = await readPopularity(db);
    assert.equal(popular.length, 1);
    assert.equal(popular[0].count, 2);
  } finally {
    sql.close();
  }
});
