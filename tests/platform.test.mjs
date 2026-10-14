import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCourseSummaries } from '../course-summary.mjs';
import { hashPassword, verifyPassword, createAuthLimiter } from '../passwords.mjs';
test('批量课程摘要保持归属与顺序，匿名零附加查询', async () => {
  let calls = 0;
  const summarize = createCourseSummaries({
    all: async (sql, ...args) => {
      calls++;
      assert.equal(args[0], 7);
      if (sql.includes('FROM favorites')) return [{ course_id: 2 }];
      if (sql.includes('FROM progress')) return [{ course_id: 1, chapter_id: 9, percent: 30 }];
      return [];
    },
  });
  const courses = [{ id: 2 }, { id: 1 }];
  const rows = await summarize(courses, 7);
  assert.equal(calls, 4);
  assert.equal(rows[0].favorite, true);
  assert.equal(rows[1].progress, 30);
  assert.equal(rows[1].chapter_id, 9);
  calls = 0;
  assert.ok((await summarize(courses, 0)).every((c) => !c.favorite && c.progress === 0));
  assert.equal(calls, 0);
});
test('异步密码兼容现有摘要，限流窗口恢复', async () => {
  const hash = await hashPassword('hello-123');
  assert.equal(await verifyPassword('hello-123', hash), true);
  assert.equal(await verifyPassword('bad', hash), false);
  assert.equal(await verifyPassword('bad', 'malformed'), false);
  let time = 0;
  const allow = createAuthLimiter({ now: () => time, limit: 2, windowMs: 50 });
  allow('ip');
  allow('ip');
  assert.throws(
    () => allow('ip'),
    (e) => e.status === 429,
  );
  allow('other');
  time = 51;
  allow('ip');
});
