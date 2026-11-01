import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCourseSummaries } from '../backend/course-summary.mjs';
import { hashPassword, verifyPassword, createAuthLimiter } from '../backend/passwords.mjs';
import { renderArticleMarkdown } from '../frontend/js/article-markdown.js';
import { readFile } from 'node:fs/promises';

test('数据库文章：全文目录锚点和安全转义', async () => {
  const raw = await readFile(new URL('../articles/README-zh_CN.md', import.meta.url), 'utf8');
  const html = renderArticleMarkdown(raw, {
    baseUrl: 'https://github.com/ryanhanwu/How-To-Ask-Questions-The-Smart-Way/blob/master/',
  });
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(id), id);
  assert.ok(ids.size > 40);
  const unsafe = renderArticleMarkdown(
    '<script>alert(1)</script>\n\n[x](javascript:alert)\n\n[ok](https://example.com)',
  );
  assert.ok(!unsafe.includes('<script>') && !unsafe.includes('href="javascript:'));
  assert.ok(unsafe.includes('&lt;script&gt;') && unsafe.includes('href="https://example.com/"'));
});
test('批量课程摘要保持归属与顺序，匿名零附加查询', async () => {
  let calls = 0;
  const summarize = createCourseSummaries({
    all: async (sql, ...args) => {
      calls++;
      assert.equal(args[0], 7);
      if (sql.includes('FROM favorites')) return [{ course_id: 2, count: 1 }];
      if (sql.includes('FROM progress')) return [{ course_id: 1, chapter_id: 9, percent: 30 }];
      return [];
    },
  });
  const courses = [{ id: 2 }, { id: 1 }];
  const rows = await summarize(courses, 7);
  assert.equal(calls, 3);
  assert.equal(rows[0].favorite_chapter_count, 1);
  assert.equal(rows[1].progress, 30);
  assert.equal(rows[1].chapter_id, 9);
  calls = 0;
  assert.ok(
    (await summarize(courses, 0)).every((c) => !c.favorite_chapter_count && c.progress === 0),
  );
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
