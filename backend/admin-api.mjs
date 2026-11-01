import { uploadVideo, discardVideo } from './video-files.mjs';
import { createLearningAdminApi } from './admin-learning-api.mjs';
import { saveCover, discardCover } from './course-covers.mjs';
import { hashPassword } from './passwords.mjs';
import { decodeAvatar, saveAvatar, discardAvatar } from './avatars.mjs';
import { createHash } from 'node:crypto';
import { retiredCourseIds, catalogCategories } from './catalog.mjs';
const version = (row) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
const withVersion = (row) => ({ ...row, version: version(row) });
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const string = (v, label, max) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail(label + '不能为空或过长');
  return v.trim();
};
const flag = (v) => {
  if (v !== 0 && v !== 1) fail('状态必须是 0 或 1');
  return v;
};
export function createAdminApi(db, media) {
  const learningAdmin = createLearningAdminApi(db);
  const configs = {
    courses: {
      table: 'courses',
      select:
        'SELECT id,title,teacher,category,subject,description,cover,accent,level,duration,lessons,published FROM courses',
    },
    articles: {
      table: 'admin_articles',
      select: 'SELECT id,title,summary,content,source_url,published,updated_at FROM admin_articles',
    },
    comments: {
      table: 'comments',
      select:
        'SELECT c.id,c.content,c.course_id,c.chapter_id,c.user_id,c.created_at,c.hidden FROM comments c',
    },
    users: {
      table: 'users',
      select:
        'SELECT u.id,u.nickname,u.avatar,u.created_at,u.disabled,CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END AS is_admin FROM users u LEFT JOIN admin_accounts a ON a.user_id=u.id',
    },
  };
  const one = (kind, id) =>
    db.get(
      configs[kind].select +
        ` WHERE ${kind === 'comments' ? 'c.' : kind === 'users' ? 'u.' : ''}id=?`,
      id,
    );
  const article = (b) => {
    if (typeof b.content === 'string' && Buffer.byteLength(b.content, 'utf8') > 65000)
      fail('正文超过数据库容量（65000 字节）');
    const source = typeof b.source_url === 'string' ? b.source_url.trim() : '';
    if (source) {
      let url;
      try {
        url = new URL(source);
      } catch {
        fail('来源链接无效');
      }
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        source.length > 1000 ||
        url.username ||
        url.password
      )
        fail('仅支持公开 HTTP(S) 来源链接');
    }
    return [
      string(b.title, '标题', 160),
      string(b.summary, '摘要', 500),
      string(b.content, '正文', 60000),
      source,
      flag(b.published),
    ];
  };
  return async ({ req, url, uid, send, body }) => {
    const path = url.pathname,
      method = req.method;
    if (path === '/api/articles' && method === 'GET') {
      return send(
        await db.all(
          'SELECT id,title,summary,source_url FROM admin_articles WHERE published=1 ORDER BY id DESC LIMIT 100',
        ),
      );
    }
    const publicArticle = path.match(/^\/api\/articles\/(\d+)$/);
    if (publicArticle && method === 'GET') {
      const row = await db.get(
        'SELECT id,title,summary,content,source_url FROM admin_articles WHERE id=? AND published=1',
        Number(publicArticle[1]),
      );
      if (!row) fail('文章不存在', 404);
      return send(row);
    }
    if (!path.startsWith('/api/admin/')) return false;
    if (!uid) fail('请先登录', 401);
    if (!(await db.get('SELECT 1 FROM admin_accounts WHERE user_id=?', uid)))
      fail('需要管理员权限', 403);
    const learningResult = await learningAdmin({ req, url, uid, send, body });
    if (learningResult !== false) return learningResult;
    if (path === '/api/admin/comment-options' && method === 'GET') {
      const courseId = Number(url.searchParams.get('courseId') || 0);
      if (!Number.isSafeInteger(courseId) || courseId < 0) fail('课程编号无效');
      return send({
        courses: await db.all('SELECT id,title,published FROM courses ORDER BY id DESC'),
        chapters: courseId
          ? await db.all(
              'SELECT id,title,position FROM chapters WHERE course_id=? ORDER BY position,id',
              courseId,
            )
          : [],
      });
    }
    const userDetail = path.match(/^\/api\/admin\/users\/(\d+)\/(detail|avatar)$/);
    if (userDetail) {
      const id = Number(userDetail[1]);
      const row = await one('users', id);
      if (!row) fail('用户不存在', 404);
      if (userDetail[2] === 'detail' && method === 'GET') {
        const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page')) || 1));
        if (!Number.isInteger(page)) fail('页码无效');
        const stats = {};
        // Aggregate private learning data only; never select note contents.
        for (const table of [
          'notes',
          'favorites',
          'follows',
          'course_visits',
          'study_checkins',
          'comments',
        ])
          stats[table] = Number(
            (await db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`, id)).n,
          );
        const following = await db.all(
          `SELECT f.teacher,(SELECT COUNT(*) FROM courses c WHERE c.teacher=f.teacher AND c.published=1) AS courses FROM follows f WHERE f.user_id=? ORDER BY f.teacher LIMIT 20 OFFSET ${(page - 1) * 20}`,
          id,
        );
        return send({ user: withVersion(row), stats, following, page });
      }
      if (userDetail[2] !== 'avatar' || method !== 'POST') fail('不支持的操作', 405);
      if (row.is_admin) fail('管理员请在个人中心修改自己的头像', 403);
      const b = await body(req, 281000);
      if (b.version !== version(row)) fail('用户资料已更新，请刷新后重试', 409);
      if (b.confirm !== row.nickname) fail('请确认目标用户昵称');
      const avatar =
        b.reset === true ? '/avatar-cheese.jpg' : await saveAvatar(decodeAvatar(b.image));
      try {
        const updated = await db.transaction(async () => {
          await db.lockUser(uid);
          await db.lockUser(id);
          const current = await one('users', id);
          if (!current) fail('用户不存在', 404);
          if (current.is_admin) fail('管理员请在个人中心修改自己的头像', 403);
          if (b.version !== version(current)) fail('用户资料已更新，请刷新后重试', 409);
          await db.run('UPDATE users SET avatar=? WHERE id=?', avatar, id);
          return one('users', id);
        });
        return send(withVersion(updated));
      } catch (error) {
        if (b.reset !== true) await discardAvatar(avatar);
        throw error;
      }
    }
    if (path === '/api/admin/dashboard' && method === 'GET') {
      const counts = {};
      for (const table of ['users', 'courses', 'admin_articles', 'comments'])
        counts[table] = Number((await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n);
      counts.published = Number(
        (await db.get('SELECT COUNT(*) AS n FROM courses WHERE published=1')).n,
      );
      counts.database = db.dialect;
      counts.activity = {};
      for (const table of ['favorites', 'notes', 'course_visits', 'study_checkins'])
        counts.activity[table] = Number((await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n);
      counts.missingChapters = Number(
        (
          await db.get(
            'SELECT COUNT(*) AS n FROM courses WHERE published=1 AND NOT EXISTS(SELECT 1 FROM chapters WHERE course_id=courses.id)',
          )
        ).n,
      );
      return send(counts);
    }
    const coverUpload = path.match(/^\/api\/admin\/courses\/(\d+)\/cover$/);
    if (coverUpload && method === 'PUT') {
      const id = Number(coverUpload[1]);
      const before = await one('courses', id);
      if (!before) fail('课程不存在', 404);
      if (req.headers['x-row-version'] !== version(before)) fail('课程已修改，请刷新', 409);
      const name = await saveCover(req);
      try {
        const row = await db.transaction(async () => {
          await db.lockUser(uid);
          if (db.dialect === 'mysql')
            await db.get('SELECT id FROM courses WHERE id=? FOR UPDATE', id);
          const current = await one('courses', id);
          if (!current || version(current) !== req.headers['x-row-version'])
            fail('课程已修改，请刷新', 409);
          await db.run(
            'UPDATE courses SET cover=? WHERE id=?',
            `/api/course-covers/${id}/${name}`,
            id,
          );
          return one('courses', id);
        });
        return send(withVersion(row), 201);
      } catch (e) {
        await discardCover(name);
        throw e;
      }
    }
    const upload = path.match(/^\/api\/admin\/courses\/(\d+)\/chapters\/(\d+)\/upload$/);
    if (upload && method === 'PUT') {
      const courseId = Number(upload[1]),
        chapterId = Number(upload[2]);
      if (
        !(await db.get('SELECT id FROM chapters WHERE id=? AND course_id=?', chapterId, courseId))
      )
        fail('章节不存在', 404);
      const expected = req.headers['x-source-version'];
      if (expected !== media.source(chapterId).version) fail('视频源已更新，请重新打开', 409);
      const stored = await uploadVideo(req);
      try {
        const result = await db.transaction(async () => {
          await db.lockUser(uid);
          if (db.dialect === 'mysql')
            await db.get('SELECT id FROM courses WHERE id=? FOR UPDATE', courseId);
          if (
            !(await db.get(
              'SELECT id FROM chapters WHERE id=? AND course_id=?',
              chapterId,
              courseId,
            ))
          )
            fail('章节已删除', 409);
          return media.save(
            chapterId,
            {
              kind: 'local',
              url: `/api/videos/${chapterId}/${stored.name}`,
              label: '本站上传视频',
            },
            expected,
          );
        });
        return send({ ...result, size: stored.size }, 201);
      } catch (e) {
        await discardVideo(stored.name);
        throw e;
      }
    }
    const chapterRoute = path.match(
      /^\/api\/admin\/courses\/(\d+)\/chapters(?:\/(\d+))?(\/source)?$/,
    );
    if (chapterRoute) {
      const courseId = Number(chapterRoute[1]),
        chapterId = Number(chapterRoute[2]);
      if (!(await one('courses', courseId))) fail('课程不存在', 404);
      if (chapterRoute[3]) {
        if (
          !(await db.get('SELECT id FROM chapters WHERE id=? AND course_id=?', chapterId, courseId))
        )
          fail('章节不存在', 404);
        if (method === 'GET') return send(media.source(chapterId));
        if (method !== 'PATCH') fail('不支持的操作', 405);
        const b = await body(req);
        return send(
          await db.transaction(async () => {
            await db.lockUser(uid);
            if (db.dialect === 'mysql')
              await db.get('SELECT id FROM courses WHERE id=? FOR UPDATE', courseId);
            if (
              !(await db.get(
                'SELECT id FROM chapters WHERE id=? AND course_id=?',
                chapterId,
                courseId,
              ))
            )
              fail('章节已删除', 409);
            if (b.source?.kind === 'local' && b.source.url !== media.source(chapterId).source?.url)
              fail('本地视频必须通过上传绑定');
            return media.save(chapterId, b.source, b.version);
          }),
        );
      }
      if (method === 'DELETE' && chapterId) {
        const b = await body(req);
        await db.transaction(async () => {
          await db.lockUser(uid);
          if (db.dialect === 'mysql')
            await db.get('SELECT id FROM courses WHERE id=? FOR UPDATE', courseId);
          const row = await db.get(
            'SELECT * FROM chapters WHERE id=? AND course_id=?',
            chapterId,
            courseId,
          );
          if (!row) fail('章节不存在', 404);
          if (b.version !== version(row)) fail('章节已修改，请刷新', 409);
          if (b.confirm !== row.title) fail('请确认章节名称');
          for (const table of [
            'favorites',
            'notes',
            'comments',
            'progress',
            'chapter_playback',
            'course_visits',
            'danmaku',
          ]) {
            if (await db.get(`SELECT 1 FROM ${table} WHERE chapter_id=?`, chapterId))
              fail('该章节存在收藏、笔记、评论或学习记录，请保留章节或下架课程', 409);
          }
          if ((await one('courses', courseId)).published) fail('请先下架课程再删除章节', 409);
          await db.run('DELETE FROM chapters WHERE id=?', chapterId);
          await db.run(
            'UPDATE courses SET lessons=(SELECT COUNT(*) FROM chapters WHERE course_id=?) WHERE id=?',
            courseId,
            courseId,
          );
        });
        return send({ ok: true });
      }
      if (method === 'GET' && chapterId) {
        const row = await db.get(
          'SELECT * FROM chapters WHERE id=? AND course_id=?',
          chapterId,
          courseId,
        );
        if (!row) fail('章节不存在', 404);
        return send(withVersion(row));
      }
      if (method === 'GET')
        return send(
          (
            await db.all('SELECT * FROM chapters WHERE course_id=? ORDER BY position,id', courseId)
          ).map(withVersion),
        );
      if (
        !['POST', 'PATCH'].includes(method) ||
        (method === 'PATCH' && !chapterId) ||
        (method === 'POST' && chapterId)
      )
        fail('不支持的操作', 405);
      const b = await body(req);
      const position = Number(b.position);
      if (!Number.isInteger(position) || position < 1 || position > 65535)
        fail('章节序号必须为 1–65535');
      const row = await db.transaction(async () => {
        await db.lockUser(uid);
        if (db.dialect === 'mysql')
          await db.get('SELECT id FROM courses WHERE id=? FOR UPDATE', courseId);
        if (!(await one('courses', courseId))) fail('课程已删除', 404);
        if (chapterId) {
          const previous = await db.get(
            'SELECT * FROM chapters WHERE id=? AND course_id=?',
            chapterId,
            courseId,
          );
          if (!previous) fail('章节不存在', 404);
          if (version(previous) !== b.version) fail('章节已修改，请刷新重试', 409);
        }
        if (
          await db.get(
            'SELECT id FROM chapters WHERE course_id=? AND position=? AND id<>?',
            courseId,
            position,
            chapterId || 0,
          )
        )
          fail('该章节序号已使用', 409);
        const values = [string(b.title, '章节标题', 160), string(b.duration, '时长', 30), position];
        let target = chapterId;
        if (target)
          await db.run(
            'UPDATE chapters SET title=?,duration=?,position=? WHERE id=?',
            ...values,
            target,
          );
        else
          target = Number(
            (
              await db.run(
                'INSERT INTO chapters(title,duration,position,course_id,is_free) VALUES(?,?,?,?,1)',
                ...values,
                courseId,
              )
            ).lastInsertRowid,
          );
        await db.run(
          'UPDATE courses SET lessons=(SELECT COUNT(*) FROM chapters WHERE course_id=?) WHERE id=?',
          courseId,
          courseId,
        );
        return db.get('SELECT * FROM chapters WHERE id=?', target);
      });
      return send(withVersion(row), chapterId ? 200 : 201);
    }
    if (path === '/api/admin/courses' && method === 'POST') {
      const b = await body(req);
      if (!catalogCategories.some((c) => c.name === b.category)) fail('课程分类无效');
      const result = await db.transaction(async () => {
        await db.lockUser(uid);
        return db.run(
          'INSERT INTO courses(title,teacher,category,subject,description,cover,accent,lessons,students,duration,level,published) VALUES(?,?,?,?,?,?,?,0,0,?,?,0)',
          string(b.title, '课程名称', 160),
          string(b.teacher, '讲师', 100),
          b.category,
          string(b.subject, '学科', 100),
          string(b.description, '简介', 4000),
          string(b.cover || '课程', '封面文字', 100),
          'rose',
          string(b.duration || '待完善', '总时长', 100),
          string(b.level || '入门', '难度', 100),
        );
      });
      return send(withVersion(await one('courses', Number(result.lastInsertRowid))), 201);
    }
    const match = path.match(/^\/api\/admin\/(courses|articles|comments|users)(?:\/(\d+))?$/);
    if (!match) fail('管理接口不存在', 404);
    const kind = match[1],
      id = Number(match[2]);
    if (method === 'GET' && id) {
      const row = await one(kind, id);
      if (!row) fail('记录不存在', 404);
      return send(withVersion(row));
    }
    if (method === 'DELETE' && id) {
      const b = await body(req);
      await db.transaction(async () => {
        await db.lockUser(uid);
        if (db.dialect === 'mysql')
          await db.get(`SELECT id FROM ${configs[kind].table} WHERE id=? FOR UPDATE`, id);
        const row = await one(kind, id);
        if (!row) fail('记录不存在', 404);
        if (b.version !== version(row)) fail('记录已修改，请刷新', 409);
        if (b.confirm !== String(id)) fail('请确认记录编号');
        if (kind === 'courses') {
          if (row.published) fail('请先下架课程', 409);
          for (const table of [
            'chapters',
            'notes',
            'comments',
            'danmaku',
            'progress',
            'course_visits',
          ])
            if (await db.get(`SELECT 1 FROM ${table} WHERE course_id=?`, id))
              fail('课程仍有章节或学习互动记录，请先维护关联内容；有学习记录时仅下架', 409);
        }
        if (kind === 'users') {
          if (row.is_admin || !row.disabled) fail('仅可删除已停用的普通账号', 409);
          for (const table of [
            'favorites',
            'notes',
            'progress',
            'chapter_playback',
            'course_visits',
            'study_checkins',
            'comments',
            'danmaku',
            'follows',
            'reservations',
          ])
            if (await db.get(`SELECT 1 FROM ${table} WHERE user_id=?`, id))
              fail('账号已有学习或互动记录，请保持停用以保留数据', 409);
          await db.run('DELETE FROM history_resets WHERE user_id=?', id);
        }
        await db.run(`DELETE FROM ${configs[kind].table} WHERE id=?`, id);
      });
      return send({ ok: true });
    }
    if (kind === 'users' && !id && method === 'POST') {
      const b = await body(req);
      const nickname = string(b.nickname, '昵称', 100),
        password = string(b.password, '初始密码', 128);
      if (password.length < 6) fail('密码至少六位');
      if (await db.get('SELECT id FROM users WHERE nickname=?', nickname)) fail('昵称已存在', 409);
      const result = await db.run(
        'INSERT INTO users(nickname,password,avatar,disabled) VALUES(?,?,?,?)',
        nickname,
        await hashPassword(password),
        Array.from(nickname)[0],
        flag(b.disabled ?? 0),
      );
      return send(withVersion(await one(kind, Number(result.lastInsertRowid))), 201);
    }
    if (method === 'GET' && !id) {
      const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page')) || 1));
      if (!Number.isInteger(page)) fail('页码无效');
      const prefix = kind === 'comments' ? 'c.' : kind === 'users' ? 'u.' : '';
      const q = (url.searchParams.get('q') || '').trim().slice(0, 160);
      const state = url.searchParams.get('state') || '';
      if (state && !['0', '1'].includes(state)) fail('状态无效');
      const field = kind === 'users' ? 'u.nickname' : kind === 'comments' ? 'c.content' : 'title';
      const status =
        prefix + (kind === 'users' ? 'disabled' : kind === 'comments' ? 'hidden' : 'published');
      let where = ` WHERE (?='' OR ${field} LIKE ?) AND (?='' OR ${status}=?)`;
      const args = [q, '%' + q + '%', state, state || 0];
      if (kind === 'comments') {
        const courseId = url.searchParams.get('courseId') || '';
        const chapterId = url.searchParams.get('chapterId') || '';
        for (const [key, value] of [
          ['course_id', courseId],
          ['chapter_id', chapterId],
        ]) {
          if (!value) continue;
          if (key === 'chapter_id' && value === 'legacy') {
            where += ' AND c.chapter_id IS NULL';
            continue;
          }
          const id = Number(value);
          if (!Number.isSafeInteger(id) || id <= 0) fail('课程或章节编号无效');
          where += ` AND c.${key}=?`;
          args.push(id);
        }
        if (
          courseId &&
          chapterId &&
          chapterId !== 'legacy' &&
          !(await db.get(
            'SELECT 1 FROM chapters WHERE id=? AND course_id=?',
            Number(chapterId),
            Number(courseId),
          ))
        )
          fail('章节不属于所选课程');
      }
      const records = (
        await db.all(
          configs[kind].select +
            where +
            ` ORDER BY ${prefix}id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`,
          ...args,
        )
      ).map(withVersion);
      if (kind === 'comments' && records.length) {
        const labels = await db.all(
          `SELECT c.id,u.nickname,co.title AS course_title,ch.title AS chapter_title,ch.position AS chapter_position FROM comments c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN courses co ON co.id=c.course_id LEFT JOIN chapters ch ON ch.id=c.chapter_id AND ch.course_id=c.course_id WHERE c.id IN (${records.map(() => '?').join(',')})`,
          ...records.map((r) => r.id),
        );
        for (const record of records)
          Object.assign(
            record,
            labels.find((label) => label.id === record.id),
          );
      }
      return send({
        rows: records,
        page,
        total: Number(
          (
            await db.get(
              `SELECT COUNT(*) AS n FROM (${configs[kind].select + where}) filtered`,
              ...args,
            )
          ).n,
        ),
      });
    }
    if (kind === 'articles' && !id && method === 'POST') {
      const data = article(await body(req, 250000));
      const row = await db.transaction(async () => {
        await db.lockUser(uid);
        const result = await db.run(
          'INSERT INTO admin_articles(title,summary,content,source_url,published) VALUES(?,?,?,?,?)',
          ...data,
        );
        const target = Number(result.lastInsertRowid);
        return one(kind, target);
      });
      return send(withVersion(row), 201);
    }
    if (method !== 'PATCH' || !Number.isSafeInteger(id) || id <= 0) fail('不支持的操作', 405);
    const b = await body(req, 250000);
    const updated = await db.transaction(async () => {
      await db.lockUser(uid);
      if (db.dialect === 'mysql')
        await db.get(`SELECT id FROM ${configs[kind].table} WHERE id=? FOR UPDATE`, id);
      const row = await one(kind, id);
      if (!row) fail('记录不存在', 404);
      if (b.version !== version(row)) fail('记录已被更新，请刷新后重试', 409);
      if (kind === 'courses') {
        const published = flag(b.published);
        if (published && retiredCourseIds.includes(id)) fail('此课程已明确停用，不能重新上架');
        if (published && !(await db.get('SELECT id FROM chapters WHERE course_id=?', id)))
          fail('请先添加章节再上架');
        if (!catalogCategories.some((c) => c.name === b.category)) fail('课程分类无效');
        await db.run(
          'UPDATE courses SET title=?,teacher=?,category=?,subject=?,description=?,published=?,cover=?,duration=?,level=? WHERE id=?',
          string(b.title, '课程名', 160),
          string(b.teacher, '讲师', 100),
          b.category,
          string(b.subject, '学科', 100),
          string(b.description, '简介', 4000),
          published,
          string(b.cover ?? row.cover, '封面文字', 100),
          string(b.duration ?? row.duration, '总时长', 100),
          string(b.level ?? row.level, '难度', 100),
          id,
        );
      } else if (kind === 'articles') {
        await db.run(
          'UPDATE admin_articles SET title=?,summary=?,content=?,source_url=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
          ...article(b),
          id,
        );
      } else if (kind === 'comments') {
        await db.run('UPDATE comments SET hidden=? WHERE id=?', flag(b.hidden), id);
      } else {
        if (row.is_admin) fail('管理员账号不能在此停用');
        if (b.nickname !== undefined) {
          const nickname = string(b.nickname, '昵称', 100);
          if (await db.get('SELECT id FROM users WHERE nickname=? AND id<>?', nickname, id))
            fail('昵称已存在', 409);
          await db.run('UPDATE users SET nickname=? WHERE id=?', nickname, id);
        }
        const disabled = flag(b.disabled);
        await db.run('UPDATE users SET disabled=? WHERE id=?', disabled, id);
        if (disabled)
          await db.run(
            'UPDATE users SET session_token_hash=NULL,session_expires=NULL WHERE id=?',
            id,
          );
      }
      return one(kind, id);
    });
    return send(withVersion(updated));
  };
}
