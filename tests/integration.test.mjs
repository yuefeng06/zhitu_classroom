import { checkAdminApi } from './admin-scenarios.mjs';
import { videoCatalog } from '../catalog.mjs';
import { studyDate, checkinSummary } from '../checkins.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('前后端接口与持久化完整流程', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'zhitu-test-'));
  const database = join(dir, 'test.db');
  let child,
    base,
    cookie = '',
    savedAvatar;
  const start = async () => {
    child = spawn(process.execPath, ['server.mjs'], {
      env: {
        ...process.env,
        AVATAR_DIR: join(dir, 'avatars'),
        DB_CLIENT: 'sqlite',
        PORT: '0',
        DB_PATH: database,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Resolve the assigned port from the server startup message.
    let output = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('启动超时')), 10000);
      child.once('error', reject);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(Error('服务提前退出 ' + code + ' ' + output));
      });
      child.stderr.on('data', (x) => (output += x));
      child.stdout.on('data', (x) => {
        output += x;
        const m = output.match(/http:\/\/localhost:(\d+)/);
        if (m) {
          base = 'http://localhost:' + m[1];
          clearTimeout(timer);
          resolve();
        }
      });
    });
  };
  const stop = async () => {
    if (child && child.exitCode === null) {
      const ended = once(child, 'exit');
      child.kill();
      await ended;
    }
  };
  t.after(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (path, body, status = 200, headers = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    assert.equal(response.status, status, path);
    const session = response.headers.get('set-cookie');
    if (session) cookie = session.split(';')[0];
    return response.json();
  };
  await start();
  await t.test('页面和 API 同源，数据库不能下载', async () => {
    for (const path of ['/', '/app.js', '/styles.css'])
      assert.equal((await fetch(base + path)).status, 200);
    for (const path of ['/zhitu.db', '/server.mjs', '/.env.example', '/database/zhitu_mysql.sql'])
      assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await request('/api/health')).ok, true);
    assert.equal((await request('/api/home')).popular.length, 6);
    assert.equal((await request('/api/courses?q=Python')).length, 1);
    assert.ok(
      (await request('/api/courses?category=' + encodeURIComponent('考公课程'))).every(
        (c) => c.category === '考公课程',
      ),
    );
    assert.equal((await request('/api/courses/8')).chapters.length, 0);
  });
  await t.test('33门真实课程、学科筛选与全部分集映射', async () => {
    const courses = await request('/api/courses');
    assert.deepEqual(
      courses.map((c) => c.id),
      Array.from({ length: 33 }, (_, i) => i + 10),
    );
    const home = await request('/api/home');
    assert.equal(home.recommendations.length, 33);
    assert.equal(new Set(home.recommendations.map((c) => c.id)).size, 33);
    assert.ok(home.recommendations.every((c) => c.published === 1 && c.id >= 10));
    assert.equal(home.recommendationMethod, 'discovery');
    assert.equal((await request('/api/courses?q=' + encodeURIComponent('武忠祥'))).length, 0);
    assert.equal((await request('/api/courses/9')).course.published, 0);
    const expected = videoCatalog.map((c) => [c.id, c.bvid, c.pages.length]);
    for (const [id, bvid, count] of expected) {
      const detail = await request('/api/courses/' + id);
      assert.equal(detail.course.lessons, count);
      assert.equal(detail.chapters.length, count);
      for (const [i, chapter] of detail.chapters.entries()) {
        const url = new URL(chapter.embed_url);
        assert.equal(url.searchParams.get('bvid'), bvid);
        assert.equal(url.searchParams.get('page'), String(i + 1));
        assert.ok(Number(url.searchParams.get('cid')) > 0);
        assert.equal(chapter.is_demo, false);
      }
    }
    for (const [category, count] of [
      ['高中课程', 8],
      ['考研课程', 12],
      ['考公课程', 3],
      ['大学与技术公开课', 10],
    ])
      assert.equal(
        (await request('/api/courses?category=' + encodeURIComponent(category))).length,
        count,
      );
    assert.equal((await request('/api/courses?q=' + encodeURIComponent('翁恺')))[0].id, 14);
    assert.equal((await request('/api/courses?q=' + encodeURIComponent('申论'))).length, 0);
    const catalog = await request('/api/catalog');
    assert.equal(catalog.total, 33);
    assert.equal(catalog.lessons, 2205);
    assert.equal(catalog.categories.length, 4);
    assert.deepEqual(
      (
        await request(
          '/api/courses?' + new URLSearchParams({ category: '高中课程', subject: '物理' }),
        )
      ).map((c) => c.id),
      [17, 18, 19],
    );
    assert.deepEqual(
      (
        await request(
          '/api/courses?' + new URLSearchParams({ category: '考研课程', subject: '408 专业课' }),
        )
      ).map((c) => c.id),
      [23, 24, 25, 26],
    );
    assert.equal((await request('/api/courses?q=SQL'))[0].id, 30);
    for (const [id, count] of [
      [16, 198],
      [20, 200],
      [29, 70],
      [31, 98],
      [32, 1],
      [33, 217],
      [34, 59],
      [35, 245],
      [36, 32],
      [37, 78],
      [38, 14],
    ])
      assert.equal((await request('/api/courses/' + id)).chapters.length, count);
    assert.equal(
      (await request('/api/courses?category=' + encodeURIComponent('考研公共课'))).length,
      12,
    );
    for (const legacy of ['计算机课程', '海外公开课'])
      assert.equal(
        (await request('/api/courses?category=' + encodeURIComponent(legacy))).length,
        10,
      );
    assert.deepEqual(
      (await request('/api/courses?subject=' + encodeURIComponent('人工智能'))).map((c) => c.id),
      [34],
    );
  });
  await t.test('登录注册和服务端认证', async () => {
    await request('/api/courses/4/favorite', {}, 401, { 'X-User-Id': '1' });
    await request('/api/auth/login', { nickname: '林同学', password: 'wrong' }, 401);
    assert.equal(
      (await request('/api/auth/login', { nickname: '林同学', password: '123456' })).user.nickname,
      '林同学',
    );
    assert.equal((await request('/api/auth/me')).user.id, 1);
    await request('/api/auth/logout', {});
    await request('/api/auth/register', { nickname: '接口测试', password: 'test123' });
    await request('/api/auth/register', { nickname: '接口测试', password: 'test123' }, 409);
  });
  await t.test('首页推荐随收藏变化，忽略伪造账号并隔离模型文件', async () => {
    assert.equal((await request('/api/home')).recommendationMethod, 'discovery');
    await request('/api/courses/17/favorite', {});
    const personalized = await request('/api/home?userId=1');
    assert.equal(personalized.recommendationMethod, 'content');
    assert.ok([18, 19].includes(personalized.recommendations[0].id));
    assert.equal(personalized.recommendations.at(-1).id, 17);
    assert.equal(
      (await request('/api/home?userId=999', undefined, 200, { Cookie: '', 'X-User-Id': '1' }))
        .recommendationMethod,
      'discovery',
    );
    for (const path of [
      '/data/recommendations/model.json',
      '/recommendations.mjs',
      '/recommendation-store.mjs',
    ])
      assert.equal((await fetch(base + path)).status, 404);
    await request('/api/courses/17/favorite', {});
    assert.equal((await request('/api/home')).recommendationMethod, 'discovery');
  });
  await t.test('头像上传、身份隔离、文件验证和恢复默认', async () => {
    const image =
      'data:image/jpeg;base64,' + (await readFile('course-images/9.jpg')).toString('base64');
    await request('/api/me/avatar', { image }, 401, { Cookie: '' });
    await request('/api/me/avatar', { image: 'data:image/svg+xml;base64,PHN2Zz4=' }, 400);
    await request('/api/me/avatar', { image: 'data:image/jpeg;base64,' + 'A'.repeat(300000) }, 413);
    const owner = (await request('/api/auth/me')).user;
    const result = await request('/api/me/avatar', { image, userId: 1 });
    assert.equal(result.user.id, owner.id);
    assert.match(result.user.avatar, /^\/api\/avatars\/[a-f0-9]{40}\.jpg$/);
    const picture = await fetch(base + result.user.avatar);
    assert.equal(picture.headers.get('content-type'), 'image/jpeg');
    assert.equal(picture.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(
      Buffer.from(await picture.arrayBuffer()),
      await readFile('course-images/9.jpg'),
    );
    const db = new DatabaseSync(database);
    assert.equal(db.prepare('SELECT avatar FROM users WHERE id=1').get().avatar, '林');
    db.close();
    assert.equal(
      (await request('/api/me/avatar', { reset: true })).user.avatar,
      '/avatar-cheese.jpg',
    );
    savedAvatar = (await request('/api/me/avatar', { image })).user.avatar;
    assert.equal((await request('/api/auth/me')).user.avatar, savedAvatar);
    await request('/api/auth/register', { nickname: '短密码不可注册', password: '123' }, 400);
  });
  await t.test('打卡身份隔离、服务器日期、并发幂等与重启保留', async () => {
    assert.equal((await fetch(base + '/api/me/checkins')).status, 401);
    assert.equal(
      (await fetch(base + '/api/me/checkins', { method: 'POST', headers: { 'X-User-Id': '1' } }))
        .status,
      401,
    );
    assert.equal((await request('/api/me/checkins')).total, 0);
    await request('/api/me/checkins', { userId: 1, date: '2000-01-01' }, 400);
    const replies = await Promise.all(
      Array.from({ length: 5 }, () => request('/api/me/checkins', {})),
    );
    for (const r of replies) {
      assert.equal(r.total, 1);
      assert.equal(r.checkedToday, true);
      assert.equal(r.today, studyDate());
    }
    const owner = cookie;
    await request('/api/auth/register', { nickname: '打卡隔离用户', password: 'test-checkin' });
    assert.equal((await request('/api/me/checkins')).total, 0);
    cookie = owner;
    await stop();
    await start();
    assert.equal((await request('/api/me/checkins')).total, 1);
  });
  await t.test('收藏、投币、关注、评论、弹幕、学习和预约', async () => {
    for (const action of ['favorite', 'coin', 'follow'])
      assert.equal((await request('/api/courses/4/' + action, {})).active, true);
    await request('/api/courses/4/comments', { content: '联调评论 <script>example</script>' });
    await request('/api/courses/4/danmaku', { content: '联调弹幕' });
    const detail = await request('/api/courses/4');
    assert.equal(detail.course.favorite, true);
    assert.equal(detail.course.coin, true);
    assert.equal(detail.followed, true);
    assert.ok(detail.comments.some((c) => c.content.includes('联调评论')));
    assert.ok(detail.danmaku.some((c) => c.content === '联调弹幕'));
    await request('/api/courses/4/progress', {
      chapterId: detail.chapters[1].id,
      currentTime: 72,
      duration: 100,
    });
    assert.equal((await request('/api/courses/4')).course.chapter_id, detail.chapters[1].id);
    assert.equal((await request('/api/home')).continuing, null);
    assert.deepEqual(await request('/api/me/courses'), { learning: [], favorites: [] });
    assert.deepEqual(await request('/api/lives'), []);
    await request('/api/courses/39/favorite', {});
    const fixture = new DatabaseSync(database);
    fixture
      .prepare('INSERT INTO live_events(id,title,teacher,starts_at) VALUES(99,?,?,?)')
      .run('测试专用直播', '测试讲师', '2099-09-23T19:30:00+08:00');
    fixture.close();
    const lives = await request('/api/lives');
    await request('/api/lives/' + lives[0].id + '/reservation', {});
    assert.equal((await request('/api/lives')).find((x) => x.id === lives[0].id).reserved, true);
  });
  await t.test('真实视频源、逐章节进度和私有时间笔记', async () => {
    const direct = await request('/api/courses/4');
    assert.equal(direct.chapters[0].video_kind, 'direct');
    assert.match(direct.chapters[0].video_url, /^https:/);
    const bili = await request('/api/courses/39');
    assert.equal(bili.chapters.length, 22);
    assert.equal(bili.chapters[0].video_kind, 'bilibili');
    assert.match(bili.chapters[0].embed_url, /BV1AuoMBBE2p/);
    assert.equal(direct.chapters[1].playback.current_time, 72);
    await request('/api/courses/4/progress', {
      chapterId: direct.chapters[1].id,
      currentTime: 20,
      duration: 100,
    });
    assert.equal((await request('/api/courses/4')).course.progress, 14);
    assert.equal((await request('/api/courses/4')).chapters[1].playback.current_time, 20);
    const note = await request(
      '/api/courses/4/notes',
      { chapterId: direct.chapters[1].id, atSecond: 20, content: '带时间点的学习笔记' },
      201,
    );
    assert.equal((await request('/api/courses/4/notes'))[0].id, note.id);
    const guest = await fetch(base + '/api/courses/4/notes');
    assert.equal(guest.status, 401);
    const ownerCookie = cookie;
    await request('/api/auth/register', { nickname: '另一个用户', password: 'password' });
    assert.equal((await request('/api/courses/4/notes')).length, 0);
    assert.equal(
      (
        await fetch(base + '/api/notes/' + note.id, {
          method: 'DELETE',
          headers: { Cookie: cookie },
        })
      ).status,
      404,
    );
    cookie = ownerCookie;
    await request(
      '/api/courses/4/notes',
      { chapterId: 390001, atSecond: 0, content: '错误章节' },
      400,
    );
    await request(
      '/api/courses/4/progress',
      { chapterId: 1, currentTime: 200, duration: 100 },
      400,
    );
    await request('/api/courses/4/progress', { chapterId: 1, currentTime: 0, duration: 0 }, 400);
    const deleteResponse = await fetch(base + '/api/notes/' + note.id, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await request('/api/courses/4/notes')).length, 0);
    await request(
      '/api/courses/4/notes',
      { chapterId: direct.chapters[0].id, atSecond: 3, content: '重启保留' },
      201,
    );
  });
  await t.test('错误请求不会中断服务', async () => {
    await request('/api/courses/4/comments', '{', 400);
    await request('/api/courses/4/comments', { content: 42 }, 400);
    await request(
      '/api/courses/4/progress',
      { chapterId: 999, currentTime: 25, duration: 100 },
      400,
    );
    await request('/api/courses/4/progress', { chapterId: 1, currentTime: -1, duration: 100 }, 400);
    await request('/api/courses/999/follow', {}, 404);
    assert.equal((await request('/api/health')).ok, true);
  });
  await t.test('真实课程访问记录与原站播放进度分开保存', async () => {
    assert.equal(
      (
        await fetch(base + '/api/courses/10/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapterId: 100001 }),
        })
      ).status,
      401,
    );
    await request('/api/courses/39/visit', { chapterId: 100001 }, 400);
    await request('/api/courses/4/visit', { chapterId: 1 }, 404);
    await request('/api/courses/10/visit', { chapterId: 100001 });
    await request('/api/courses/10/visit', { chapterId: 100002 });
    const course = (await request('/api/courses/10')).course;
    assert.equal(course.chapter_id, 100002);
    assert.equal(course.progress, 0);
    assert.ok(course.last_opened_title);
    assert.equal((await request('/api/home')).continuing.id, 10);
    const cookieOwner = cookie;
    await request('/api/auth/login', { nickname: '另一个用户', password: 'password' });
    assert.equal((await request('/api/me/courses')).learning.length, 0);
    cookie = cookieOwner;
  });
  await t.test('个人概览只展示当前用户的真实课程笔记', async () => {
    assert.equal((await fetch(base + '/api/me/overview')).status, 401);
    assert.equal((await fetch(base + '/api/me/notes')).status, 401);
    const note = await request(
      '/api/courses/39/notes',
      { chapterId: 390001, atSecond: 15, content: '个人页私有笔记' },
      201,
    );
    const overview = await request('/api/me/overview');
    assert.equal(overview.noteCount, 1);
    assert.equal(overview.recentNotes[0].id, note.id);
    assert.ok(overview.joinedAt);
    assert.deepEqual(
      (await request('/api/me/notes')).map((n) => n.id),
      [note.id],
    );
    assert.equal(overview.password, undefined);
    assert.equal(overview.following.length, 0);
    const owner = cookie;
    await request('/api/auth/login', { nickname: '另一个用户', password: 'password' });
    assert.equal((await request('/api/me/overview')).noteCount, 0);
    assert.deepEqual((await request('/api/me/overview')).recentNotes, []);
    assert.deepEqual(await request('/api/me/notes'), []);
    cookie = owner;
    for (let i = 0; i < 4; i++)
      await request(
        '/api/courses/39/notes',
        { chapterId: 390001, atSecond: i, content: '笔记库分页外记录 ' + i },
        201,
      );
    assert.equal((await request('/api/me/notes')).length, 5);
  });
  await t.test('重启后清除旧演示入口，保留真实课程与预约', async () => {
    const fixture = new DatabaseSync(database);
    fixture.exec(
      "INSERT INTO live_events(id,title,teacher,starts_at) VALUES(1,'考研英语阅读长难句答疑','李然','2099-09-23T19:30:00+08:00'),(2,'行测数量关系高频题型','周扬','2099-09-25T19:30:00+08:00')",
    );
    const uid = fixture.prepare("SELECT id FROM users WHERE nickname='接口测试'").get().id;
    fixture.prepare('INSERT INTO reservations VALUES(?,1)').run(uid);
    fixture
      .prepare('INSERT INTO progress(user_id,course_id,chapter_id,percent) VALUES(?,39,390001,0)')
      .run(uid);
    fixture.close();
    await stop();
    await start();
    assert.equal((await request('/api/auth/me')).user.nickname, '接口测试');
    assert.equal((await request('/api/auth/me')).user.avatar, savedAvatar);
    assert.deepEqual(
      (await request('/api/me/courses')).learning.map((c) => c.id).sort((a, b) => a - b),
      [10, 39],
    );
    assert.equal((await request('/api/courses/10')).course.chapter_id, 100002);
    assert.deepEqual(
      (await request('/api/me/courses')).favorites.map((c) => c.id),
      [39],
    );
    assert.deepEqual(
      (await request('/api/lives')).map((c) => c.id),
      [99],
    );
    await request('/api/lives/1/reservation', {}, 404);
    await request('/api/lives/2/reservation', {}, 404);
    assert.equal((await request('/api/me/courses')).favorites.length, 1);
    assert.ok((await request('/api/lives')).some((x) => x.reserved));
    assert.equal((await request('/api/courses/4/notes'))[0].content, '重启保留');
    await request('/api/auth/logout', {});
    assert.equal((await request('/api/auth/me')).user, null);
    await request('/api/courses/4/favorite', {}, 401);
    const check = new DatabaseSync(database);
    assert.ok(
      check
        .prepare('SELECT password FROM users')
        .all()
        .every((x) => x.password.startsWith('scrypt:')),
    );
    check.close();
  });
  await t.test('清除历史需要本人会话，保留进度笔记收藏，重启不复现旧记录', async () => {
    const clear = async (session = cookie, data) =>
      fetch(base + '/api/me/history', {
        method: 'DELETE',
        headers: { Cookie: session, 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    assert.equal((await clear('')).status, 401);
    const { user } = await request('/api/auth/register', {
      nickname: '历史清理本人',
      password: 'history-test',
    });
    await request('/api/courses/17/visit', { chapterId: 170001 });
    await request('/api/courses/17/favorite', {});
    await request(
      '/api/courses/17/notes',
      { chapterId: 170001, atSecond: 15, content: '清历史保留笔记' },
      201,
    );
    const fixture = new DatabaseSync(database);
    fixture
      .prepare('INSERT INTO progress(user_id,course_id,chapter_id,percent) VALUES(?,17,170001,25)')
      .run(user.id);
    fixture
      .prepare(
        'INSERT INTO chapter_playback(user_id,chapter_id,current_time,duration,percent) VALUES(?,170001,25,100,25)',
      )
      .run(user.id);
    fixture.close();
    const owner = cookie;
    await request('/api/auth/register', { nickname: '历史清理另一个人', password: 'history-test' });
    await request('/api/courses/18/visit', { chapterId: 180001 });
    const other = cookie;
    cookie = owner;
    assert.equal((await clear(owner, { userId: 1 })).status, 400);
    assert.equal((await request('/api/me/courses')).learning.length, 1);
    assert.equal((await clear()).status, 200);
    assert.equal((await clear()).status, 200);
    assert.deepEqual((await request('/api/me/courses')).learning, []);
    assert.equal((await request('/api/me/courses')).favorites[0].id, 17);
    assert.equal((await request('/api/me/notes'))[0].content, '清历史保留笔记');
    const detail = await request('/api/courses/17');
    assert.equal(detail.course.progress, 25);
    assert.equal(detail.chapters[0].playback.current_time, 25);
    cookie = other;
    assert.equal((await request('/api/me/courses')).learning[0].id, 18);
    cookie = owner;
    await stop();
    await start();
    assert.deepEqual((await request('/api/me/courses')).learning, []);
    assert.equal((await request('/api/home')).continuing, null);
    await request('/api/courses/17/visit', { chapterId: 170001 });
    assert.equal((await request('/api/me/courses')).learning[0].id, 17);
  });
  await t.test('正式后台权限、课程文章审核、审计及并发注册', async () => {
    await checkAdminApi(base, async (uid) => {
      const fixture = new DatabaseSync(database);
      fixture.prepare('INSERT INTO admin_accounts(user_id) VALUES(?)').run(uid);
      fixture.close();
    });
  });
});

test('北京时间跨日、闰日、断签与滚动窗口', () => {
  assert.equal(studyDate(new Date('2026-10-01T15:59:59Z')), '2026-10-01');
  assert.equal(studyDate(new Date('2026-10-01T16:00:00Z')), '2026-10-02');
  assert.equal(checkinSummary(['2024-02-28', '2024-02-29'], '2024-03-01').streak, 2);
  assert.equal(checkinSummary(['2024-02-28'], '2024-03-01').streak, 0);
  const summary = checkinSummary(
    ['2020-01-01', '2026-10-02', '2026-10-02', '2026-10-03'],
    '2026-10-02',
  );
  assert.equal(summary.total, 1);
  assert.equal(summary.streak, 1);
});
