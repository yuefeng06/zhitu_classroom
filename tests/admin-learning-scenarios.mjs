import assert from 'node:assert/strict';
export async function checkLearningAdmin(base, grant, seed) {
  let cookie = '';
  const req = async (path, method = 'GET', body, status = 200, session = cookie) => {
    const response = await fetch(base + path, {
      method,
      headers: { Cookie: session, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, status, path + ' ' + JSON.stringify(data));
    if (response.headers.has('set-cookie'))
      cookie = response.headers.get('set-cookie').split(';')[0];
    return data;
  };
  await req('/api/admin/learning/history', 'GET', undefined, 401);
  const user = (
    await req('/api/auth/register', 'POST', {
      nickname: '学习维护普通账号',
      password: 'member-test-pass',
    })
  ).user;
  const memberCookie = cookie;
  await req('/api/admin/learning/history', 'GET', undefined, 403);
  await req('/api/admin/danmaku', 'GET', undefined, 403);
  await req('/api/admin/users/' + user.id + '/password', 'POST', { password: 'unauthorized' }, 403);
  const course = await req('/api/courses/39'),
    ch = course.chapters[0],
    other = course.chapters[1];
  await req('/api/courses/39/visit', 'POST', { chapterId: ch.id });
  await req('/api/courses/39/favorite', 'POST', { chapterId: ch.id, active: true });
  await req('/api/courses/39/follow', 'POST', { active: true });
  const note = await req(
    '/api/courses/39/notes',
    'POST',
    { chapterId: ch.id, atSecond: 12, content: '绝不返回的笔记正文' },
    201,
  );
  await req('/api/me/checkins', 'POST', {});
  await req('/api/courses/39/danmaku', 'POST', { content: '缺少章节' }, 400);
  await req('/api/courses/39/danmaku', 'POST', { chapterId: 170001, content: '错误章节' }, 400);
  await req('/api/courses/39/danmaku', 'POST', {
    chapterId: ch.id,
    content: '章节弹幕审核',
    atSecond: 8,
  });
  const admin = (
    await req('/api/auth/register', 'POST', {
      nickname: '学习维护管理员',
      password: 'admin-test-pass',
    })
  ).user;
  await grant(admin.id);
  const adminCookie = cookie;
  await seed(user.id, ch.id);
  const list = (type, extra = '') =>
    req('/api/admin/learning/' + type + '?userId=' + user.id + extra);
  const history = (await list('history')).rows[0];
  assert.equal(history.chapter_id, ch.id);
  assert.equal(history.nickname, user.nickname);
  assert.equal((await list('history', '&from=2000-01-01&to=2000-01-02')).total, 0);
  const favorite = (await list('favorites')).rows[0];
  assert.equal(favorite.chapter_id, ch.id);
  assert.equal(favorite.course_title, course.course.title);
  const notes = await list('notes');
  assert.equal(notes.rows[0].id, note.id);
  assert.equal('content' in notes.rows[0], false);
  assert.ok(!JSON.stringify(notes).includes('绝不返回'));
  assert.equal((await list('playback')).rows[0].current_time, 12);
  const following = (await list('follows')).rows[0];
  assert.equal(following.teacher, course.course.teacher);
  const checked = (await list('checkins')).rows[0];
  assert.match(checked.checkin_date, /^\d{4}-\d{2}-\d{2}$/);
  for (const url of [
    'history?page=1.5',
    'checkins?from=2026-02-30',
    'history?from=2026-11-01&to=2026-10-01',
    'history?userId=-1',
    'playback?from=2026-01-01',
  ])
    await req('/api/admin/learning/' + url, 'GET', undefined, 400);
  await req('/api/admin/learning/history', 'POST', {}, 405);
  await req('/api/admin/learning/notes', 'DELETE', { key: notes.rows[0].key }, 405);
  await req(
    '/api/admin/learning/playback',
    'DELETE',
    { key: { user_id: user.id, chapter_id: ch.id } },
    405,
  );
  await req('/api/courses/39/visit', 'POST', { chapterId: other.id }, 200, memberCookie);
  await req(
    '/api/admin/learning/history',
    'DELETE',
    { key: history.key, version: history.version, confirm: String(user.id) },
    409,
    adminCookie,
  );
  const remove = async (type, row) => {
    await req(
      '/api/admin/learning/' + type,
      'DELETE',
      { key: row.key, version: row.version, confirm: 'incorrect' },
      400,
      adminCookie,
    );
    await req(
      '/api/admin/learning/' + type,
      'DELETE',
      { key: row.key, version: row.version, confirm: String(user.id) },
      200,
      adminCookie,
    );
  };
  await remove('history', (await list('history')).rows[0]);
  assert.equal(
    (await req('/api/me/courses', 'GET', undefined, 200, memberCookie)).learning.length,
    0,
  );
  assert.equal((await list('playback')).total, 1);
  assert.equal((await list('notes')).total, 1);
  assert.equal((await list('favorites')).total, 1);
  await remove('favorites', favorite);
  assert.equal(
    (await req('/api/me/courses', 'GET', undefined, 200, memberCookie)).favorites.length,
    0,
  );
  await remove('checkins', checked);
  assert.equal((await req('/api/me/checkins', 'GET', undefined, 200, memberCookie)).total, 0);
  await remove('follows', following);
  assert.equal((await req('/api/courses/39', 'GET', undefined, 200, memberCookie)).followed, false);
  const dm = (await req('/api/admin/danmaku?courseId=39&chapterId=' + ch.id)).rows.find(
    (r) => r.content === '章节弹幕审核',
  );
  assert.equal(dm.user_id, user.id);
  assert.equal(dm.nickname, user.nickname);
  assert.equal(
    (await req('/api/courses/39/danmaku?chapterId=' + other.id)).some((r) => r.id === dm.id),
    false,
  );
  await req('/api/admin/danmaku/' + dm.id, 'PATCH', { version: dm.version, hidden: 1 });
  assert.equal(
    (await req('/api/courses/39/danmaku?chapterId=' + ch.id)).some((r) => r.id === dm.id),
    false,
  );
  await req('/api/admin/danmaku/' + dm.id, 'PATCH', { version: dm.version, hidden: 0 }, 409);
  const hidden = (await req('/api/admin/danmaku?state=1&courseId=39')).rows.find(
    (r) => r.id === dm.id,
  );
  await req('/api/admin/danmaku/' + dm.id, 'PATCH', { version: hidden.version, hidden: 0 });
  assert.equal(
    (await req('/api/courses/39/danmaku?chapterId=' + ch.id)).some((r) => r.id === dm.id),
    true,
  );
  const visible = (await req('/api/admin/danmaku?state=0&courseId=39')).rows.find(
    (r) => r.id === dm.id,
  );
  await req('/api/admin/danmaku/' + dm.id, 'DELETE', {
    version: visible.version,
    confirm: String(dm.id),
  });
  assert.equal(
    (await req('/api/courses/39/danmaku?chapterId=' + ch.id)).some((r) => r.id === dm.id),
    false,
  );
  await req('/api/admin/users/' + admin.id + '/password', 'GET', undefined, 403);
  const target = await req('/api/admin/users/' + user.id + '/password');
  assert.deepEqual(Object.keys(target).sort(), ['id', 'nickname', 'version']);
  await req(
    '/api/admin/users/' + user.id + '/password',
    'POST',
    { ...target, password: 'short', confirm: user.nickname },
    400,
  );
  await req('/api/admin/users/' + user.id + '/password', 'POST', {
    ...target,
    password: 'new-member-pass',
    confirm: user.nickname,
  });
  await req('/api/auth/me', 'GET', undefined, 200, memberCookie).then((d) =>
    assert.equal(d.user, null),
  );
  await req('/api/me/notes', 'GET', undefined, 401, memberCookie);
  await req(
    '/api/admin/users/' + user.id + '/password',
    'POST',
    { ...target, password: 'newer-member-pass', confirm: user.nickname },
    409,
  );
  await req(
    '/api/auth/login',
    'POST',
    { nickname: user.nickname, password: 'member-test-pass' },
    401,
  );
  await req('/api/auth/login', 'POST', { nickname: user.nickname, password: 'new-member-pass' });
  assert.equal(
    (await req('/api/me/notes')).some((r) => r.id === note.id),
    true,
  );
}
