import { createAdminApi } from './admin-api.mjs';
import { createCourseSummaries } from './course-summary.mjs';
import { hashPassword, verifyPassword, createAuthLimiter } from './passwords.mjs';
import { randomBytes } from 'node:crypto';
import { studyDate, shiftDate, checkinSummary } from './checkins.mjs';
import { catalogCategories, normalizeCategory } from './catalog.mjs';
import { avatarPath, decodeAvatar, saveAvatar, discardAvatar, readAvatar } from './avatars.mjs';
import { readSignals, readPopularity, rankCourses } from './recommendations.mjs';
import { loadRecommendationModel, validModel } from './recommendation-store.mjs';

export function createApi(db, withMedia = (chapter) => chapter) {
  const adminApi = createAdminApi(db);
  const modelEnvelope = loadRecommendationModel();
  const allowAuth = createAuthLimiter();
  const { get, all, run } = db;
  const fail = (message, status = 400) => {
    throw Object.assign(new Error(message), { status });
  };
  const text = (value, label, max = 1000) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
      fail(`${label}不能为空且不能超过 ${max} 字符`);
    return value.trim();
  };
  const summaries = createCourseSummaries(db);
  const summary = async (c, uid) => (await summaries([c], uid))[0];
  const learningRows = async (uid) =>
    await all(
      `SELECT c.*,r.updated_at AS last_visited_at FROM courses c JOIN (
    SELECT course_id,MAX(updated_at) AS updated_at FROM (
      SELECT course_id,updated_at FROM progress WHERE user_id=? AND NOT EXISTS (SELECT 1 FROM history_resets WHERE user_id=progress.user_id)
      UNION ALL SELECT course_id,updated_at FROM course_visits WHERE user_id=?
    ) activity GROUP BY course_id
  ) r ON r.course_id=c.id WHERE c.published=1 ORDER BY r.updated_at DESC,c.id DESC`,
      uid,
      uid,
    );
  const body = async (req, limit = 16384) => {
    let raw = '',
      size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) fail('请求内容过大', 413);
      raw += chunk;
    }
    try {
      const data = JSON.parse(raw || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data)) fail('无效 JSON');
      return data;
    } catch {
      fail('请求必须是有效 JSON');
    }
  };
  return async (req, res, url) => {
    const send = (data, status = 200) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(data));
    };
    try {
      const token =
        req.headers.cookie
          ?.split(';')
          .map((x) => x.trim())
          .find((x) => x.startsWith('zhitu-session='))
          ?.slice(14) || '';
      const uid =
        (
          await get(
            'SELECT user_id FROM sessions WHERE token=? AND expires>? AND NOT EXISTS (SELECT 1 FROM account_status s WHERE s.user_id=sessions.user_id AND s.disabled=1)',
            token,
            Date.now(),
          )
        )?.user_id || 0;
      const user = async () =>
        (await get('SELECT id,nickname,avatar FROM users WHERE id=?', uid)) || null;
      const auth = () => {
        if (!uid) fail('请先登录', 401);
      };
      const path = url.pathname,
        method = req.method;
      if (
        path.startsWith('/api/admin/') ||
        path === '/api/articles' ||
        /^\/api\/articles\/\d+$/.test(path)
      )
        return await adminApi({ req, url, uid, send, body });
      if (method === 'GET' && path === '/api/health')
        return send({ ok: true, database: db.dialect });
      if (method === 'GET' && path === '/api/catalog')
        return send({
          total: (await get('SELECT COUNT(*) AS n FROM courses WHERE published=1')).n,
          lessons: (await get('SELECT SUM(lessons) AS n FROM courses WHERE published=1')).n,
          categories: await Promise.all(
            catalogCategories.map(async (category) => ({
              ...category,
              count: (
                await get(
                  'SELECT COUNT(*) AS n FROM courses WHERE published=1 AND category=?',
                  category.name,
                )
              ).n,
              subjects: await all(
                "SELECT subject,COUNT(*) AS count FROM courses WHERE published=1 AND category=? AND subject<>'' GROUP BY subject ORDER BY MIN(id)",
                category.name,
              ),
            })),
          ),
        });
      if (method === 'GET' && path === '/api/auth/me') return send({ user: await user() });
      if (method === 'GET' && avatarPath.test(path)) {
        try {
          const image = await readAvatar(path);
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public,max-age=31536000,immutable',
          });
          return res.end(image);
        } catch (error) {
          if (error.code === 'ENOENT') fail('头像不存在', 404);
          throw error;
        }
      }
      if (method === 'POST' && path === '/api/me/avatar') {
        auth();
        const data = await body(req, 280100);
        const avatar =
          data.reset === true ? '/avatar-cheese.jpg' : await saveAvatar(decodeAvatar(data.image));
        try {
          await run('UPDATE users SET avatar=? WHERE id=?', avatar, uid);
        } catch (error) {
          if (!data.reset) await discardAvatar(avatar);
          throw error;
        }
        return send({ user: await user() });
      }
      if (method === 'POST' && path === '/api/auth/logout') {
        await run('DELETE FROM sessions WHERE token=?', token);
        res.setHeader('Set-Cookie', 'zhitu-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        return send({ ok: true });
      }
      if (method === 'POST' && ['/api/auth/login', '/api/auth/register'].includes(path)) {
        allowAuth(req.socket.remoteAddress || 'local');
        const b = await body(req),
          nickname = text(b.nickname, '昵称', 50);
        text(b.password, '密码', 128);
        let u;
        if (path.endsWith('/register')) {
          if (b.password.length < 6) fail('密码至少需要 6 位');
          if (await get('SELECT id FROM users WHERE nickname=?', nickname))
            fail('昵称已被使用', 409);
          const id = Number(
            (
              await run(
                'INSERT INTO users(nickname,password,avatar) VALUES(?,?,?)',
                nickname,
                await hashPassword(b.password),
                Array.from(nickname)[0],
              )
            ).lastInsertRowid,
          );
          u = await get('SELECT id,nickname,avatar FROM users WHERE id=?', id);
        } else {
          u = await get('SELECT * FROM users WHERE nickname=?', nickname);
          if (!u) fail('账号或密码错误', 401);
          if (await get('SELECT 1 FROM account_status WHERE user_id=? AND disabled=1', u.id))
            fail('账号已停用', 403);
          if (!(await verifyPassword(b.password, u.password))) fail('账号或密码错误', 401);
        }
        await run('DELETE FROM sessions WHERE expires<=?', Date.now());
        const session = randomBytes(32).toString('hex');
        await run(
          'INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',
          session,
          u.id,
          Date.now() + 7 * 86400000,
        );
        res.setHeader(
          'Set-Cookie',
          `zhitu-session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
        );
        return send({ user: { id: u.id, nickname: u.nickname, avatar: u.avatar } });
      }
      if (method === 'GET' && path === '/api/courses') {
        const q = (url.searchParams.get('q') || '').trim(),
          requestedCategory = url.searchParams.get('category') || '全部';
        const category = normalizeCategory(requestedCategory),
          subject = url.searchParams.get('subject') || '';
        return send(
          await summaries(
            await all(
              `SELECT * FROM courses WHERE published=1 AND (?='' OR title LIKE ? OR teacher LIKE ? OR category LIKE ? OR description LIKE ? OR subject LIKE ?) AND (?='全部' OR category=?) AND (?='' OR subject=?) ORDER BY id`,
              q,
              ...Array(5).fill(`%${q}%`),
              category,
              category,
              subject,
              subject,
            ),
            uid,
          ),
        );
      }
      if (method === 'GET' && path === '/api/home') {
        const continuing = (await learningRows(uid))[0];
        const envelope = await modelEnvelope;
        const ranked = rankCourses(
          await all('SELECT * FROM courses WHERE published=1'),
          uid ? await readSignals(db, uid) : [],
          uid,
          {
            popularity: await readPopularity(db),
            model: validModel(envelope) ? envelope.model : null,
          },
        );
        const recommendations = await summaries(ranked.rows, uid);
        const resume = continuing ? await summary(continuing, uid) : null;
        return send({
          popular: recommendations.slice(0, 6),
          recommendations,
          recommendationMethod: ranked.method,
          continuing: resume ? { ...resume, percent: resume.progress } : null,
        });
      }
      if (method === 'GET' && path === '/api/me/overview') {
        auth();
        return send({
          joinedAt: (await get('SELECT created_at FROM users WHERE id=?', uid)).created_at,
          noteCount: (
            await get(
              'SELECT COUNT(*) AS n FROM notes n JOIN courses c ON c.id=n.course_id WHERE n.user_id=? AND c.published=1',
              uid,
            )
          ).n,
          following: await all(
            'SELECT teacher FROM follows f WHERE user_id=? AND EXISTS(SELECT 1 FROM courses c WHERE c.teacher=f.teacher AND c.published=1) ORDER BY teacher',
            uid,
          ),
          recentNotes: await all(
            'SELECT n.id,n.course_id,n.chapter_id,n.at_second,n.content,n.created_at,c.title AS course_title,ch.title AS chapter_title FROM notes n JOIN courses c ON c.id=n.course_id JOIN chapters ch ON ch.id=n.chapter_id WHERE n.user_id=? AND c.published=1 ORDER BY n.id DESC LIMIT 3',
            uid,
          ),
        });
      }
      if (method === 'GET' && path === '/api/me/notes') {
        auth();
        return send(
          await all(
            'SELECT n.id,n.course_id,n.chapter_id,n.at_second,n.content,n.created_at,c.title AS course_title,ch.title AS chapter_title FROM notes n JOIN courses c ON c.id=n.course_id JOIN chapters ch ON ch.id=n.chapter_id WHERE n.user_id=? AND c.published=1 ORDER BY n.id DESC',
            uid,
          ),
        );
      }
      if (path === '/api/me/checkins' && ['GET', 'POST'].includes(method)) {
        auth();
        const today = studyDate();
        if (method === 'POST') {
          const data = await body(req);
          if (Object.keys(data).length) fail('打卡日期与账号由服务器确定');
          await db.transaction(async () => {
            await db.lockUser(uid);
            if (
              !(await get(
                'SELECT 1 FROM study_checkins WHERE user_id=? AND checkin_date=?',
                uid,
                today,
              ))
            )
              await run('INSERT INTO study_checkins(user_id,checkin_date) VALUES(?,?)', uid, today);
          });
        }
        const rows = await all(
          'SELECT checkin_date FROM study_checkins WHERE user_id=? AND checkin_date>=? AND checkin_date<=? ORDER BY checkin_date',
          uid,
          shiftDate(today, -364),
          today,
        );
        return send(
          checkinSummary(
            rows.map((r) => r.checkin_date),
            today,
          ),
        );
      }
      if (method === 'GET' && path === '/api/me/courses') {
        auth();
        return send({
          learning: await summaries(await learningRows(uid), uid),
          favorites: await summaries(
            await all(
              'SELECT c.* FROM favorites f JOIN courses c ON c.id=f.course_id WHERE f.user_id=? AND c.published=1 ORDER BY f.created_at DESC,c.id DESC',
              uid,
            ),
            uid,
          ),
        });
      }
      if (method === 'DELETE' && path === '/api/me/history') {
        auth();
        const data = await body(req);
        if (Object.keys(data).length) fail('清除范围由当前登录账号确定');
        await db.transaction(async () => {
          await db.lockUser(uid);
          await run('DELETE FROM course_visits WHERE user_id=?', uid);
          await run(
            'INSERT INTO history_resets(user_id,cleared_at) VALUES(?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET cleared_at=excluded.cleared_at',
            uid,
          );
        });
        return send({ ok: true });
      }
      if (method === 'GET' && path === '/api/lives')
        return send(
          await Promise.all(
            (await all('SELECT * FROM live_events WHERE published=1 ORDER BY starts_at')).map(
              async (x) => ({
                ...x,
                reserved: !!(await get(
                  'SELECT 1 FROM reservations WHERE user_id=? AND live_id=?',
                  uid,
                  x.id,
                )),
              }),
            ),
          ),
        );
      const reservation = path.match(/^\/api\/lives\/(\d+)\/reservation$/);
      if (method === 'POST' && reservation) {
        auth();
        const id = Number(reservation[1]);
        const live = await get('SELECT * FROM live_events WHERE id=? AND published=1', id);
        if (!live) fail('直播不存在', 404);
        if (new Date(live.starts_at) <= new Date()) fail('直播已开始，无法预约');
        await run('INSERT OR IGNORE INTO reservations(user_id,live_id) VALUES(?,?)', uid, id);
        return send({ reserved: true });
      }
      const noteDelete = path.match(/^\/api\/notes\/(\d+)$/);
      if (method === 'DELETE' && noteDelete) {
        auth();
        const result = await run(
          'DELETE FROM notes WHERE id=? AND user_id=?',
          Number(noteDelete[1]),
          uid,
        );
        if (!result.changes) fail('笔记不存在', 404);
        return send({ ok: true });
      }
      const match = path.match(
        /^\/api\/courses\/(\d+)(?:\/(favorite|coin|follow|progress|comments|danmaku|notes|visit))?$/,
      );
      if (match) {
        const id = Number(match[1]),
          kind = match[2],
          c = await get('SELECT * FROM courses WHERE id=?', id);
        if (!c) fail('课程不存在', 404);
        if (method === 'GET' && kind === 'notes') {
          auth();
          return send(
            await all(
              'SELECT * FROM notes WHERE user_id=? AND course_id=? ORDER BY id DESC',
              uid,
              id,
            ),
          );
        }
        if (method === 'GET' && !kind) {
          const chapters = await all(
            'SELECT * FROM chapters WHERE course_id=? ORDER BY position',
            id,
          );
          const playback = new Map(
            (
              await all(
                'SELECT p.* FROM chapter_playback p JOIN chapters c ON c.id=p.chapter_id WHERE p.user_id=? AND c.course_id=?',
                uid,
                id,
              )
            ).map((p) => [
              p.chapter_id,
              { current_time: p.current_time, duration: p.duration, percent: p.percent },
            ]),
          );
          return send({
            course: await summary(c, uid),
            chapters: chapters.map((chapter) => ({
              ...withMedia(chapter),
              playback: playback.get(chapter.id) || null,
            })),
            comments: await all(
              'SELECT comments.*,users.nickname,users.avatar FROM comments JOIN users ON users.id=comments.user_id WHERE course_id=? AND NOT EXISTS (SELECT 1 FROM comment_moderation m WHERE m.comment_id=comments.id AND m.hidden=1) ORDER BY comments.id DESC',
              id,
            ),
            danmaku: await all('SELECT * FROM danmaku WHERE course_id=? ORDER BY at_second', id),
            followed: !!(await get(
              'SELECT 1 FROM follows WHERE user_id=? AND teacher=?',
              uid,
              c.teacher,
            )),
          });
        }
        if (method === 'POST' && kind) {
          auth();
          const b = await body(req);
          if (kind === 'visit') {
            if (!c.published) fail('课程已下架', 404);
            if (
              !Number.isInteger(b.chapterId) ||
              !(await get('SELECT 1 FROM chapters WHERE id=? AND course_id=?', b.chapterId, id))
            )
              fail('章节不属于该课程');
            await db.transaction(async () => {
              await db.lockUser(uid);
              await run(
                `INSERT INTO course_visits(user_id,course_id,chapter_id,updated_at) VALUES(?,?,?,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id,course_id) DO UPDATE SET chapter_id=excluded.chapter_id,updated_at=excluded.updated_at`,
                uid,
                id,
                b.chapterId,
              );
            });
            return send({ ok: true });
          }
          if (['favorite', 'coin', 'follow'].includes(kind)) {
            const table = { favorite: 'favorites', coin: 'coins', follow: 'follows' }[kind],
              column = kind === 'follow' ? 'teacher' : 'course_id',
              value = kind === 'follow' ? c.teacher : id;
            const active = await db.transaction(async () => {
              await db.lockUser(uid);
              const exists = !!(await get(
                `SELECT 1 FROM ${table} WHERE user_id=? AND ${column}=?`,
                uid,
                value,
              ));
              if (exists)
                await run(`DELETE FROM ${table} WHERE user_id=? AND ${column}=?`, uid, value);
              else await run(`INSERT INTO ${table}(user_id,${column}) VALUES(?,?)`, uid, value);
              return !exists;
            });
            return send({ active });
          }
          if (kind === 'progress') {
            if (
              !Number.isInteger(b.chapterId) ||
              !(await get('SELECT 1 FROM chapters WHERE id=? AND course_id=?', b.chapterId, id))
            )
              fail('章节不属于该课程');
            if (
              withMedia(await get('SELECT * FROM chapters WHERE id=?', b.chapterId)).video_kind ===
              'bilibili'
            )
              fail('B站播放器的进度由原站管理');
            if (
              !Number.isFinite(b.currentTime) ||
              !Number.isFinite(b.duration) ||
              b.duration <= 0 ||
              b.duration > 86400 ||
              b.currentTime < 0 ||
              b.currentTime > b.duration
            )
              fail('播放时间或视频时长无效');
            const chapterPercent = Math.min(100, (b.currentTime / b.duration) * 100);
            const percent = await db.transaction(async () => {
              await db.lockUser(uid);
              await run(
                `INSERT INTO chapter_playback(user_id,chapter_id,current_time,duration,percent) VALUES(?,?,?,?,?) ON CONFLICT(user_id,chapter_id) DO UPDATE SET current_time=excluded.current_time,duration=excluded.duration,percent=MAX(chapter_playback.percent,excluded.percent)`,
                uid,
                b.chapterId,
                b.currentTime,
                b.duration,
                chapterPercent,
              );
              const percent = Math.round(
                (
                  await get(
                    'SELECT AVG(COALESCE(p.percent,0)) AS percent FROM chapters c LEFT JOIN chapter_playback p ON p.chapter_id=c.id AND p.user_id=? WHERE c.course_id=?',
                    uid,
                    id,
                  )
                ).percent || 0,
              );
              await run(
                `INSERT INTO progress(user_id,course_id,chapter_id,percent,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,course_id) DO UPDATE SET chapter_id=excluded.chapter_id,percent=excluded.percent,updated_at=CURRENT_TIMESTAMP`,
                uid,
                id,
                b.chapterId,
                percent,
              );
              return percent;
            });
            return send({ ok: true, percent });
          }
          if (kind === 'notes') {
            const content = text(b.content, '笔记', 2000);
            if (
              !Number.isInteger(b.chapterId) ||
              !(await get('SELECT 1 FROM chapters WHERE id=? AND course_id=?', b.chapterId, id))
            )
              fail('章节不属于该课程');
            if (!Number.isFinite(b.atSecond) || b.atSecond < 0 || b.atSecond > 86400)
              fail('笔记时间无效');
            const result = await run(
              'INSERT INTO notes(user_id,course_id,chapter_id,at_second,content) VALUES(?,?,?,?,?)',
              uid,
              id,
              b.chapterId,
              b.atSecond,
              content,
            );
            return send(
              await get('SELECT * FROM notes WHERE id=?', Number(result.lastInsertRowid)),
              201,
            );
          }
          const content = text(
            b.content,
            kind === 'comments' ? '评论' : '弹幕',
            kind === 'comments' ? 1000 : 100,
          );
          if (kind === 'comments')
            await run(
              'INSERT INTO comments(course_id,user_id,content) VALUES(?,?,?)',
              id,
              uid,
              content,
            );
          else {
            const second = b.atSecond ?? 8,
              color = b.color ?? '#ffffff';
            if (!Number.isFinite(second) || second < 0 || !/^#[0-9a-f]{6}$/i.test(color))
              fail('弹幕时间或颜色无效');
            if (
              b.chapterId !== undefined &&
              !(await get('SELECT 1 FROM chapters WHERE id=? AND course_id=?', b.chapterId, id))
            )
              fail('章节不属于该课程');
            await run(
              'INSERT INTO danmaku(course_id,content,at_second,color,chapter_id) VALUES(?,?,?,?,?)',
              id,
              content,
              second,
              color,
              b.chapterId ?? null,
            );
          }
          return send({ ok: true });
        }
      }
      fail('接口不存在', 404);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY')
        error = Object.assign(new Error('记录已存在，请刷新后重试'), { status: 409 });
      if (!error.status) console.error('API database error:', error.code || error.name);
      return send({ error: error.status ? error.message : '服务器内部错误' }, error.status || 500);
    }
  };
}
