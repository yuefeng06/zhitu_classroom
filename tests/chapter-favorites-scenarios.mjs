import assert from 'node:assert/strict';
export async function checkChapterFavorites(base) {
  let cookie = '';
  async function req(path, body, status = 200) {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(r.status, status, path);
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return r.json();
  }
  await req('/api/courses/39/favorite', { chapterId: 390001 }, 401);
  await req('/api/auth/register', { nickname: '章节收藏回归', password: 'chapter-test-pass' });
  const owner = cookie;
  await req('/api/courses/39/favorite', {}, 400);
  await req('/api/courses/39/favorite', { chapterId: 170001 }, 400);
  await req('/api/courses/39/favorite', { chapterId: 999999 }, 400);
  await req('/api/courses/39/favorite', { chapterId: 390001, active: 'true' }, 400);
  await req('/api/courses/4/favorite', { chapterId: 1, active: true }, 404);
  for (const chapterId of [390001, 390002])
    await req('/api/courses/39/favorite', { chapterId, active: true, userId: 1 });
  await Promise.all(
    Array.from({ length: 3 }, () =>
      req('/api/courses/39/favorite', { chapterId: 390001, active: true }),
    ),
  );
  let detail = await req('/api/courses/39');
  assert.equal(detail.course.favorite_chapter_count, 2);
  assert.deepEqual(
    detail.chapters.filter((c) => c.favorite).map((c) => c.id),
    [390001, 390002],
  );
  const saved = (await req('/api/me/courses')).favorites;
  assert.equal(saved.length, 2);
  assert.ok(
    saved.every(
      (c) =>
        c.id === 39 &&
        c.chapter_title &&
        typeof c.chapter_duration === 'string' &&
        c.chapter_duration.length > 0,
    ),
  );
  await req('/api/auth/register', { nickname: '章节收藏另一账号', password: 'chapter-test-pass' });
  assert.equal((await req('/api/me/courses')).favorites.length, 0);
  assert.ok((await req('/api/courses/39')).chapters.every((c) => !c.favorite));
  await req('/api/courses/39/favorite', { chapterId: 390001, active: false });
  cookie = owner;
  assert.equal((await req('/api/me/courses')).favorites.length, 2);
  await req('/api/courses/39/favorite', { chapterId: 390001, active: false });
  await req('/api/courses/39/favorite', { chapterId: 390001, active: false });
  assert.deepEqual(
    (await req('/api/me/courses')).favorites.map((c) => c.chapter_id),
    [390002],
  );
}
