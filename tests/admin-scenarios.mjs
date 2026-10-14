import assert from 'node:assert/strict';
export async function checkAdminApi(base, grant) {
  let cookie = '';
  const request = async (path, method = 'GET', body, status = 200, session = cookie) => {
    const r = await fetch(base + path, {
      method,
      headers: { Cookie: session, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, status, JSON.stringify({ path, status: r.status, data }));
    if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return data;
  };
  await request('/api/admin/dashboard', 'GET', undefined, 401);
  const admin = (
    await request('/api/auth/register', 'POST', { nickname: '管理验证', password: 'admin-test' })
  ).user;
  await request('/api/admin/dashboard', 'GET', undefined, 403);
  await grant(admin.id);
  assert.ok((await request('/api/admin/dashboard')).courses >= 33);
  const oldCookie = cookie;
  await request('/api/auth/login', 'POST', { nickname: '管理验证', password: 'admin-test' });
  assert.notEqual(cookie, oldCookie);
  await request('/api/me/notes', 'GET', undefined, 401, oldCookie);
  // Signing out a superseded session must not revoke the replacement session.
  const oldLogout = await fetch(base + '/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: oldCookie },
  });
  assert.equal(oldLogout.status, 200);
  assert.equal((await request('/api/auth/me')).user.id, admin.id);
  const adminCookie = cookie;
  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () =>
      fetch(base + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '并发唯一账号', password: 'concurrent-test' }),
      }).then((r) => r.status),
    ),
  );
  assert.equal(concurrent.filter((s) => s === 200).length, 1);
  assert.equal(concurrent.filter((s) => s === 409).length, 7);
  const regular = (
    await request('/api/auth/register', 'POST', {
      nickname: '普通权限验证',
      password: 'member-test',
      role: 'admin',
    })
  ).user;
  const regularCookie = cookie;
  await request('/api/admin/courses', 'GET', undefined, 403);
  await request('/api/courses/17/comments', 'POST', { content: '待审核测试内容' });
  cookie = adminCookie;
  const courses = (await request('/api/admin/courses')).rows,
    c = courses.find((c) => c.id === 17),
    retired = courses.find((c) => c.id === 9);
  const edited = await request('/api/admin/courses/17', 'PATCH', { ...c, title: '测试课程编辑' });
  assert.equal((await request('/api/courses/17')).course.title, '测试课程编辑');
  await request('/api/admin/courses/17', 'PATCH', { ...c, title: '冲突修改' }, 409);
  await request('/api/admin/courses/17', 'PATCH', { ...edited, published: 0 });
  assert.ok(!(await request('/api/courses')).some((c) => c.id === 17));
  await request('/api/admin/courses/9', 'PATCH', { ...retired, published: 1 }, 400);
  const draft = await request(
    '/api/admin/articles',
    'POST',
    {
      title: '测试随笔',
      summary: '摘要',
      content: '<script>unsafe</script>\n纯文本',
      source_url: '',
      published: 0,
    },
    201,
  );
  await request('/api/articles/' + draft.id, 'GET', undefined, 404, '');
  await request(
    '/api/admin/articles/' + draft.id,
    'PATCH',
    { ...draft, source_url: 'javascript:alert(1)' },
    400,
  );
  const published = await request('/api/admin/articles/' + draft.id, 'PATCH', {
    ...draft,
    published: 1,
  });
  assert.equal(
    (await request('/api/articles/' + draft.id, 'GET', undefined, 200, '')).title,
    '测试随笔',
  );
  assert.ok(
    (await request('/api/articles', 'GET', undefined, 200, '')).some((a) => a.id === draft.id),
  );
  const comments = (await request('/api/admin/comments')).rows,
    comment = comments.find((c) => c.content === '待审核测试内容');
  const hidden = await request('/api/admin/comments/' + comment.id, 'PATCH', {
    ...comment,
    hidden: 1,
  });
  assert.ok(!(await request('/api/courses/17')).comments.some((c) => c.id === comment.id));
  await request('/api/admin/comments/' + comment.id, 'PATCH', { ...hidden, hidden: 0 });
  assert.ok((await request('/api/courses/17')).comments.some((c) => c.id === comment.id));
  const users = (await request('/api/admin/users')).rows;
  assert.ok(
    users.every(
      (u) =>
        !('password' in u) &&
        !('token' in u) &&
        !('session_token_hash' in u) &&
        !('session_expires' in u),
    ),
  );
  const member = users.find((u) => u.id === regular.id);
  const disabled = await request('/api/admin/users/' + member.id, 'PATCH', {
    ...member,
    disabled: 1,
  });
  await request('/api/me/notes', 'GET', undefined, 401, regularCookie);
  await request(
    '/api/auth/login',
    'POST',
    { nickname: '普通权限验证', password: 'member-test' },
    403,
  );
  await request('/api/admin/users/' + member.id, 'PATCH', { ...disabled, disabled: 0 });
  const self = users.find((u) => u.id === admin.id);
  await request('/api/admin/users/' + self.id, 'PATCH', { ...self, disabled: 1 }, 400);
  await request('/api/admin/audit', 'GET', undefined, 404);
  await request('/api/admin/articles/' + published.id, 'PATCH', { ...published, published: 0 });
  await request('/api/articles/' + published.id, 'GET', undefined, 404, '');
}
