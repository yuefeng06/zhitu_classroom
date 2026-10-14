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
export function createAdminApi(db) {
  const configs = {
    courses: {
      table: 'courses',
      select: 'SELECT id,title,teacher,category,subject,description,published FROM courses',
    },
    articles: {
      table: 'admin_articles',
      select: 'SELECT id,title,summary,content,source_url,published,updated_at FROM admin_articles',
    },
    comments: {
      table: 'comments',
      select: 'SELECT c.id,c.content,c.course_id,c.user_id,c.created_at,c.hidden FROM comments c',
    },
    users: {
      table: 'users',
      select:
        'SELECT u.id,u.nickname,u.created_at,u.disabled,CASE WHEN a.user_id IS NULL THEN 0 ELSE 1 END AS is_admin FROM users u LEFT JOIN admin_accounts a ON a.user_id=u.id',
    },
  };
  const one = (kind, id) =>
    db.get(
      configs[kind].select +
        ` WHERE ${kind === 'comments' ? 'c.' : kind === 'users' ? 'u.' : ''}id=?`,
      id,
    );
  const article = (b) => {
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
      string(b.content, '正文', 20000),
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
    if (path === '/api/admin/dashboard' && method === 'GET') {
      const counts = {};
      for (const table of ['users', 'courses', 'admin_articles', 'comments'])
        counts[table] = Number((await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n);
      counts.published = Number(
        (await db.get('SELECT COUNT(*) AS n FROM courses WHERE published=1')).n,
      );
      return send(counts);
    }
    const match = path.match(/^\/api\/admin\/(courses|articles|comments|users)(?:\/(\d+))?$/);
    if (!match) fail('管理接口不存在', 404);
    const kind = match[1],
      id = Number(match[2]);
    if (method === 'GET' && !id) {
      const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page')) || 1));
      if (!Number.isInteger(page)) fail('页码无效');
      const prefix = kind === 'comments' ? 'c.' : kind === 'users' ? 'u.' : '';
      return send({
        rows: (
          await db.all(
            configs[kind].select + ` ORDER BY ${prefix}id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`,
          )
        ).map(withVersion),
        page,
        total: Number((await db.get(`SELECT COUNT(*) AS n FROM ${configs[kind].table}`)).n),
      });
    }
    if (kind === 'articles' && !id && method === 'POST') {
      const data = article(await body(req, 90000));
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
    const b = await body(req, 90000);
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
        if (!catalogCategories.some((c) => c.name === b.category)) fail('课程分类无效');
        await db.run(
          'UPDATE courses SET title=?,teacher=?,category=?,subject=?,description=?,published=? WHERE id=?',
          string(b.title, '课程名', 160),
          string(b.teacher, '讲师', 100),
          b.category,
          string(b.subject, '学科', 100),
          string(b.description, '简介', 4000),
          published,
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
