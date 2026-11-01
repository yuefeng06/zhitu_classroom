import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  const created = await request(
    '/api/admin/courses',
    'POST',
    {
      title: '管理员新增课程',
      teacher: '真实讲师',
      category: '大学与技术公开课',
      subject: '编程',
      description: '后台维护的课程',
    },
    201,
  );
  assert.equal(created.published, 0);
  await request('/api/admin/courses/' + created.id, 'PATCH', { ...created, published: 1 }, 400);
  const chapter = await request(
    '/api/admin/courses/' + created.id + '/chapters',
    'POST',
    { title: '第一课', position: 1, duration: '12:30' },
    201,
  );
  await request(
    '/api/admin/courses/' + created.id + '/chapters',
    'POST',
    { title: '重复序号', position: 1, duration: '01:00' },
    409,
  );
  const chapter2 = await request(
    '/api/admin/courses/' + created.id + '/chapters/' + chapter.id,
    'PATCH',
    { ...chapter, title: '新版第一课' },
  );
  await request(
    '/api/admin/courses/' + created.id + '/chapters/' + chapter.id,
    'PATCH',
    { ...chapter, title: '冲突' },
    409,
  );
  const refreshed = (await request('/api/admin/courses?q=' + encodeURIComponent('管理员新增课程')))
    .rows[0];
  assert.equal(refreshed.lessons, 1);
  let released = await request('/api/admin/courses/' + created.id, 'PATCH', {
    ...refreshed,
    published: 1,
  });
  assert.equal((await request('/api/courses/' + created.id)).chapters[0].title, chapter2.title);
  assert.equal((await request('/api/courses/' + created.id)).chapters[0].video_url, null);
  const picture = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==',
    'base64',
  );
  const coverResponse = await fetch(base + '/api/admin/courses/' + created.id + '/cover', {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'image/png', 'X-Row-Version': released.version },
    body: picture,
  });
  assert.equal(coverResponse.status, 201);
  released = await coverResponse.json();
  assert.match(released.cover, /^\/api\/course-covers\//);
  assert.equal((await fetch(base + released.cover)).headers.get('content-type'), 'image/png');
  const sourcePath = '/api/admin/courses/' + created.id + '/chapters/' + chapter.id + '/source';
  const initialSource = await request(sourcePath);
  const video = Buffer.from(
    '000000206674797069736f6d0000020069736f6d69736f32617663316d703431',
    'hex',
  );
  const upload = async (bytes, session = cookie, expected = initialSource.version) =>
    fetch(base + sourcePath.replace(/source$/, 'upload'), {
      method: 'PUT',
      headers: { Cookie: session, 'Content-Type': 'video/mp4', 'X-Source-Version': expected },
      body: bytes,
    });
  assert.equal((await upload(video, '')).status, 401);
  assert.equal((await upload(Buffer.alloc(32))).status, 400);
  const uploadResponse = await upload(video);
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  assert.equal((await upload(video)).status, 409);
  assert.equal(
    (await request('/api/courses/' + created.id)).chapters[0].video_url,
    uploaded.source.url,
  );
  const partial = await fetch(base + uploaded.source.url, { headers: { Range: 'bytes=4-7' } });
  assert.equal(partial.status, 206);
  assert.equal(await partial.text(), 'ftyp');
  assert.equal(
    (await fetch(base + uploaded.source.url, { headers: { Range: 'bytes=9999-' } })).status,
    416,
  );
  assert.equal(
    (await fetch(base + uploaded.source.url, { method: 'HEAD' })).headers.get('content-length'),
    String(video.length),
  );
  await request(
    '/api/admin/courses/' + created.id + '/chapters/' + chapter.id,
    'DELETE',
    { version: chapter2.version, confirm: chapter2.title },
    409,
  );
  assert.ok((await request('/api/admin/courses?state=0')).rows.every((r) => r.published === 0));
  await request('/api/courses/' + created.id + '/comments', 'POST', {
    chapterId: chapter.id,
    content: '章节删除关联保护',
  });
  await request('/api/admin/courses/' + created.id, 'PATCH', { ...released, published: 0 });
  await request(
    '/api/admin/courses/' + created.id + '/chapters/' + chapter.id,
    'DELETE',
    {
      version: chapter2.version,
      confirm: chapter2.title,
    },
    409,
  );
  const protectedComment = (await request('/api/admin/comments?chapterId=' + chapter.id)).rows[0];
  await request('/api/admin/comments/' + protectedComment.id, 'DELETE', {
    version: protectedComment.version,
    confirm: String(protectedComment.id),
  });
  assert.equal((await fetch(base + uploaded.source.url)).status, 404);
  assert.equal((await fetch(base + released.cover)).status, 404);
  assert.equal(
    (await fetch(base + uploaded.source.url, { headers: { Cookie: cookie } })).status,
    200,
  );
  await request('/api/admin/courses/' + created.id + '/chapters/' + chapter.id, 'DELETE', {
    version: chapter2.version,
    confirm: chapter2.title,
  });
  assert.equal(
    (await fetch(base + uploaded.source.url, { headers: { Cookie: cookie } })).status,
    404,
  );
  const emptyCourse = await request('/api/admin/courses/' + created.id);
  assert.equal(emptyCourse.lessons, 0);
  await request('/api/admin/courses/' + created.id, 'DELETE', {
    version: emptyCourse.version,
    confirm: String(created.id),
  });
  await request('/api/courses/' + created.id, 'GET', undefined, 404);
  const newUser = await request(
    '/api/admin/users',
    'POST',
    { nickname: '管理员添加用户', password: 'test-user-123' },
    201,
  );
  const avatarPath = '/api/admin/users/' + newUser.id + '/avatar';
  await request('/api/admin/users/' + newUser.id + '/detail', 'GET', undefined, 401, '');
  await request(avatarPath, 'POST', { reset: true }, 401, '');
  await request(
    avatarPath,
    'POST',
    { version: newUser.version, confirm: newUser.nickname, image: 'invalid' },
    400,
  );
  await request(
    avatarPath,
    'POST',
    { version: newUser.version, confirm: '错误账号', reset: true },
    400,
  );
  const image =
    'data:image/jpeg;base64,' +
    (await readFile('frontend/assets/course-images/9.jpg')).toString('base64');
  const avatarUser = await request(avatarPath, 'POST', {
    version: newUser.version,
    confirm: newUser.nickname,
    image,
  });
  assert.match(avatarUser.avatar, /^\/api\/avatars\/[a-f0-9]{40}\.jpg$/);
  assert.equal((await fetch(base + avatarUser.avatar)).status, 200);
  await request(
    avatarPath,
    'POST',
    { version: newUser.version, confirm: newUser.nickname, reset: true },
    409,
  );
  const savedAdminCookie = cookie;
  await request('/api/auth/login', 'POST', {
    nickname: newUser.nickname,
    password: 'test-user-123',
  });
  assert.equal((await request('/api/auth/me')).user.avatar, avatarUser.avatar);
  await request('/api/admin/users/' + newUser.id + '/detail', 'GET', undefined, 403);
  await request(
    avatarPath,
    'POST',
    { version: avatarUser.version, confirm: newUser.nickname, reset: true },
    403,
  );
  cookie = savedAdminCookie;
  const resetUser = await request(avatarPath, 'POST', {
    version: avatarUser.version,
    confirm: newUser.nickname,
    reset: true,
  });
  assert.equal(resetUser.avatar, '/avatar-cheese.jpg');
  await request('/api/admin/users/' + admin.id + '/avatar', 'POST', { reset: true }, 403);
  const changedUser = await request('/api/admin/users/' + newUser.id, 'PATCH', {
    ...resetUser,
    nickname: '管理员修改用户',
    disabled: 1,
  });
  await request('/api/admin/users/' + newUser.id, 'DELETE', {
    version: changedUser.version,
    confirm: String(newUser.id),
  });
  await request('/api/admin/users/' + newUser.id, 'GET', undefined, 404);
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
  const linkedChapter = (await request('/api/courses/17')).chapters[0];
  await request('/api/admin/comment-options', 'GET', undefined, 403);
  await request('/api/courses/17/comments', 'POST', { content: '缺少章节' }, 400);
  await request(
    '/api/courses/17/comments',
    'POST',
    { chapterId: 390001, content: '错误课程章节' },
    400,
  );
  await request('/api/courses/17/comments?chapterId=390001', 'GET', undefined, 400);
  await request('/api/courses/17/comments', 'POST', {
    chapterId: linkedChapter.id,
    content: '待审核测试内容',
  });
  await request('/api/courses/17/favorite', 'POST', { chapterId: linkedChapter.id, active: true });
  await request('/api/courses/17/follow', 'POST', { active: true });
  await request(
    '/api/courses/17/notes',
    'POST',
    { chapterId: linkedChapter.id, atSecond: 15, content: '不应泄露的私有笔记正文' },
    201,
  );
  await request('/api/me/checkins', 'POST', {});
  cookie = adminCookie;
  const chapterOptions = await request('/api/admin/comment-options?courseId=17');
  const otherChapter = chapterOptions.chapters.find((ch) => ch.id !== linkedChapter.id);
  assert.ok(otherChapter);
  await request('/api/courses/17/comments', 'POST', {
    chapterId: otherChapter.id,
    content: '另一集的评论',
  });
  const ownComments = await request('/api/courses/17/comments?chapterId=' + linkedChapter.id);
  assert.ok(ownComments.some((r) => r.content === '待审核测试内容'));
  assert.ok(!ownComments.some((r) => r.content === '另一集的评论'));
  const otherComments = await request('/api/courses/17/comments?chapterId=' + otherChapter.id);
  assert.ok(otherComments.some((r) => r.content === '另一集的评论'));
  assert.ok(!otherComments.some((r) => r.content === '待审核测试内容'));
  assert.deepEqual(
    (await request('/api/courses/17?chapterId=' + otherChapter.id)).comments,
    otherComments,
  );
  const filtered = await request('/api/admin/comments?courseId=17&chapterId=' + linkedChapter.id);
  assert.ok(filtered.rows.every((r) => r.course_id === 17 && r.chapter_id === linkedChapter.id));
  assert.ok(
    filtered.rows.some((r) => r.nickname === regular.nickname && r.chapter_title && r.course_title),
  );
  const legacy = await request('/api/admin/comments?chapterId=legacy');
  assert.ok(legacy.rows.length > 0 && legacy.rows.every((r) => r.chapter_id === null));
  await request('/api/admin/comments?courseId=17&chapterId=390001', 'GET', undefined, 400);
  const second = (
    await request('/api/admin/comments?courseId=17&chapterId=' + otherChapter.id)
  ).rows.find((r) => r.content === '另一集的评论');
  await request('/api/admin/comments/' + second.id, 'DELETE', {
    version: second.version,
    confirm: String(second.id),
  });
  assert.ok(
    !(await request('/api/courses/17/comments?chapterId=' + otherChapter.id)).some(
      (r) => r.id === second.id,
    ),
  );
  const detail = await request('/api/admin/users/' + regular.id + '/detail');
  assert.equal(detail.stats.notes, 1);
  assert.equal(detail.stats.favorites, 1);
  assert.equal(detail.stats.follows, 1);
  assert.equal(detail.stats.study_checkins, 1);
  assert.equal(detail.stats.comments, 1);
  assert.equal(detail.following.length, 1);
  assert.ok(detail.following[0].courses >= 1);
  assert.equal(JSON.stringify(detail).includes('不应泄露'), false);
  assert.equal('content' in detail, false);
  assert.deepEqual(
    Object.keys(detail.user).sort(),
    ['id', 'nickname', 'avatar', 'created_at', 'disabled', 'is_admin', 'version'].sort(),
  );
  await request('/api/admin/users/' + regular.id + '/detail?page=1.5', 'GET', undefined, 400);
  await request('/api/admin/users/999999999/detail', 'GET', undefined, 404);
  const courses = (await request('/api/admin/courses')).rows,
    c = courses.find((c) => c.id === 17),
    retired = courses.find((c) => c.id === 9);
  const edited = await request('/api/admin/courses/17', 'PATCH', { ...c, title: '测试课程编辑' });
  assert.equal((await request('/api/courses/17')).course.title, '测试课程编辑');
  await request('/api/admin/courses/17', 'PATCH', { ...c, title: '冲突修改' }, 409);
  await request('/api/admin/courses/17', 'PATCH', { ...edited, published: 0 });
  assert.ok(!(await request('/api/courses')).some((c) => c.id === 17));
  const protectedChapter = await request('/api/admin/courses/17/chapters/' + linkedChapter.id);
  await request(
    '/api/admin/courses/17/chapters/' + linkedChapter.id,
    'DELETE',
    { version: protectedChapter.version, confirm: protectedChapter.title },
    409,
  );
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
  await request('/api/admin/comments/' + comment.id, 'PATCH', { ...comment, hidden: 0 }, 409);
  assert.ok(
    !(await request('/api/courses/17/comments?chapterId=' + linkedChapter.id)).some(
      (c) => c.id === comment.id,
    ),
  );
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
    '/api/admin/users/' + member.id,
    'DELETE',
    { version: disabled.version, confirm: String(member.id) },
    409,
  );
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
  const removeArticle = await request('/api/admin/articles/' + published.id);
  await request('/api/admin/articles/' + published.id, 'DELETE', {
    version: removeArticle.version,
    confirm: String(published.id),
  });
  await request('/api/admin/articles/' + published.id, 'GET', undefined, 404);
  const removeComment = await request('/api/admin/comments/' + comment.id);
  await request('/api/admin/comments/' + comment.id, 'DELETE', {
    version: removeComment.version,
    confirm: String(comment.id),
  });
  assert.ok(!(await request('/api/courses/17')).comments.some((c) => c.id === comment.id));
}
