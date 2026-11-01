import { createHash } from 'node:crypto';
import { hashPassword } from './passwords.mjs';

const stamp = (row) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const positive = (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) fail('编号无效');
  return n;
};
const day = (v) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    Number.isNaN(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail('日期无效');
  return v;
};
const definitions = {
  history: {
    table: 'course_visits',
    keys: ['user_id', 'course_id'],
    time: 'updated_at',
    course: 'r.course_id',
    chapter: 'r.chapter_id',
    fields: 'r.user_id,r.course_id,r.chapter_id,r.updated_at',
    remove: true,
  },
  favorites: {
    table: 'favorites',
    keys: ['user_id', 'chapter_id'],
    time: 'created_at',
    course: 'ch.course_id',
    chapter: 'r.chapter_id',
    fields: 'r.user_id,r.chapter_id,r.created_at',
    remove: true,
  },
  checkins: {
    table: 'study_checkins',
    keys: ['user_id', 'checkin_date'],
    time: 'checkin_date',
    fields: 'r.user_id,r.checkin_date,r.created_at',
    remove: true,
  },
  playback: {
    table: 'chapter_playback',
    keys: ['user_id', 'chapter_id'],
    course: 'ch.course_id',
    chapter: 'r.chapter_id',
    fields: 'r.user_id,r.chapter_id,r.current_time,r.duration,r.percent',
  },
  notes: {
    table: 'notes',
    keys: ['user_id', 'id'],
    time: 'created_at',
    course: 'r.course_id',
    chapter: 'r.chapter_id',
    fields: 'r.id,r.user_id,r.course_id,r.chapter_id,r.at_second,r.created_at',
  },
  follows: {
    table: 'follows',
    keys: ['user_id', 'teacher'],
    fields: 'r.user_id,r.teacher',
    remove: true,
  },
};

// Called only after the main admin router has authenticated the administrator.
export function createLearningAdminApi(db) {
  const lock = db.dialect === 'mysql' ? ' FOR UPDATE' : '';
  async function admin(uid) {
    if (!(await db.get('SELECT 1 FROM admin_accounts WHERE user_id=?', uid)))
      fail('需要管理员权限', 403);
  }
  return async ({ req, url, uid, send, body }) => {
    const path = url.pathname,
      method = req.method;
    const password = path.match(/^\/api\/admin\/users\/(\d+)\/password$/);
    if (password) {
      const id = positive(password[1]);
      const read = () => db.get('SELECT id,nickname,password,disabled FROM users WHERE id=?', id);
      const row = await read();
      if (!row) fail('用户不存在', 404);
      if (await db.get('SELECT 1 FROM admin_accounts WHERE user_id=?', id))
        fail('不能在此重置管理员密码', 403);
      if (method === 'GET') return send({ id, nickname: row.nickname, version: stamp(row) });
      if (method !== 'POST') fail('不支持的操作', 405);
      const b = await body(req);
      if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128)
        fail('新密码须为 8–128 位');
      const hash = await hashPassword(b.password);
      await db.transaction(async () => {
        for (const user of [...new Set([uid, id])].sort((a, b) => a - b)) await db.lockUser(user);
        await admin(uid);
        if (await db.get('SELECT 1 FROM admin_accounts WHERE user_id=?', id))
          fail('不能在此重置管理员密码', 403);
        const current = await read();
        if (!current) fail('用户不存在', 404);
        if (b.version !== stamp(current)) fail('账户已更新，请刷新后重试', 409);
        if (b.confirm !== current.nickname) fail('请确认目标昵称');
        await db.run(
          'UPDATE users SET password=?,session_token_hash=NULL,session_expires=NULL WHERE id=?',
          hash,
          id,
        );
      });
      return send({ ok: true });
    }
    const match = path.match(/^\/api\/admin\/learning\/([a-z]+)$/);
    if (match) {
      const kind = match[1],
        d = definitions[kind];
      if (!d) fail('记录类型不存在', 404);
      if (method === 'DELETE') {
        if (!d.remove) fail('此记录仅供查询', 405);
        const b = await body(req),
          target = positive(b.key?.user_id);
        const values = d.keys.map((k) => {
          const v = b.key?.[k];
          if (k === 'checkin_date') return day(v || '');
          if (k === 'teacher') {
            if (typeof v !== 'string' || !v.trim() || v.length > 255) fail('讲师无效');
            return v;
          }
          return positive(v);
        });
        if (b.confirm !== String(target)) fail('请确认目标用户编号');
        const where = d.keys.map((k) => `r.${k}=?`).join(' AND ');
        await db.transaction(async () => {
          for (const user of [...new Set([uid, target])].sort((a, b) => a - b))
            await db.lockUser(user);
          await admin(uid);
          const row = await db.get(
            `SELECT ${d.fields} FROM ${d.table} r WHERE ${where}${lock}`,
            ...values,
          );
          if (!row) fail('记录不存在', 404);
          if (b.version !== stamp(row)) fail('记录已变化，请刷新后重试', 409);
          await db.run(
            `DELETE FROM ${d.table} WHERE ${d.keys.map((k) => `${k}=?`).join(' AND ')}`,
            ...values,
          );
          if (kind === 'history')
            await db.run(
              'INSERT INTO history_resets(user_id,cleared_at) VALUES(?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET cleared_at=excluded.cleared_at',
              target,
            );
        });
        return send({ ok: true });
      }
      if (method !== 'GET') fail('不支持的操作', 405);
      const params = url.searchParams,
        page = positive(params.get('page') || 1);
      if (page > 10000) fail('页码过大');
      let joins = ' LEFT JOIN users u ON u.id=r.user_id';
      if (d.chapter) joins += ` LEFT JOIN chapters ch ON ch.id=${d.chapter}`;
      if (d.course) joins += ` LEFT JOIN courses c ON c.id=${d.course}`;
      const args = [],
        clauses = [];
      const q = (params.get('q') || '').trim().slice(0, 160);
      if (q) {
        clauses.push('(u.nickname LIKE ? OR CAST(r.user_id AS CHAR)=?)');
        args.push('%' + q + '%', q);
      }
      if (params.get('userId')) {
        clauses.push('r.user_id=?');
        args.push(positive(params.get('userId')));
      }
      for (const [key, field] of [
        ['courseId', d.course],
        ['chapterId', d.chapter],
      ]) {
        if (params.get(key)) {
          if (!field) fail('当前类型不支持课程章节筛选');
          clauses.push(field + '=?');
          args.push(positive(params.get(key)));
        }
      }
      const from = params.get('from'),
        to = params.get('to');
      if (from && to && day(from) > day(to)) fail('开始日期不能晚于结束日期');
      for (const [value, end] of [
        [from, false],
        [to, true],
      ]) {
        if (!value) continue;
        day(value);
        if (!d.time) fail('此类型未记录日期，不能按日期筛选');
        if (kind === 'checkins') {
          clauses.push(`r.${d.time}${end ? '<=' : '>='}?`);
          args.push(value);
        } else {
          const date = new Date(value + 'T00:00:00+08:00');
          if (end) date.setUTCDate(date.getUTCDate() + 1);
          clauses.push(`r.${d.time}${end ? '<' : '>='}?`);
          args.push(date.toISOString().slice(0, 23).replace('T', ' '));
        }
      }
      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
      const base = ` FROM ${d.table} r${joins}${where}`;
      const rows = await db.all(
        `SELECT ${d.fields},u.nickname${d.course ? ',c.title AS course_title,c.published' : ''}${d.chapter ? ',ch.title AS chapter_title,ch.course_id AS chapter_course_id' : ''}${base} ORDER BY ${d.time ? 'r.' + d.time + ' DESC,' : ''}${d.keys.map((k) => 'r.' + k + ' DESC').join(',')} LIMIT 30 OFFSET ${(page - 1) * 30}`,
        ...args,
      );
      const fields = d.fields.split(',').map((f) => f.slice(2));
      return send({
        rows: rows.map((r) => ({
          ...r,
          key: Object.fromEntries(d.keys.map((k) => [k, r[k]])),
          version: stamp(Object.fromEntries(fields.map((k) => [k, r[k]]))),
        })),
        total: Number((await db.get('SELECT COUNT(*) AS n' + base, ...args)).n),
        page,
        removable: !!d.remove,
      });
    }
    const dm = path.match(/^\/api\/admin\/danmaku(?:\/(\d+))?$/);
    if (!dm) return false;
    const fields =
      'd.id,d.user_id,d.course_id,d.chapter_id,d.content,d.at_second,d.color,d.hidden,d.created_at';
    if (method === 'GET' && !dm[1]) {
      const p = url.searchParams,
        page = positive(p.get('page') || 1),
        args = [],
        clauses = [];
      if (page > 10000) fail('页码过大');
      for (const key of ['courseId', 'chapterId']) {
        const v = p.get(key);
        if (!v) continue;
        if (key === 'chapterId' && v === 'legacy') {
          clauses.push('d.chapter_id IS NULL');
          continue;
        }
        clauses.push(`d.${key === 'courseId' ? 'course_id' : 'chapter_id'}=?`);
        args.push(positive(v));
      }
      const state = p.get('state');
      if (state) {
        if (!['0', '1'].includes(state)) fail('状态无效');
        clauses.push('d.hidden=?');
        args.push(Number(state));
      }
      const q = (p.get('q') || '').trim().slice(0, 160);
      if (q) {
        clauses.push('d.content LIKE ?');
        args.push('%' + q + '%');
      }
      const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
      const rows = await db.all(
        `SELECT ${fields},u.nickname,c.title AS course_title,ch.title AS chapter_title FROM danmaku d LEFT JOIN users u ON u.id=d.user_id LEFT JOIN courses c ON c.id=d.course_id LEFT JOIN chapters ch ON ch.id=d.chapter_id AND ch.course_id=d.course_id${where} ORDER BY d.id DESC LIMIT 30 OFFSET ${(page - 1) * 30}`,
        ...args,
      );
      return send({
        rows: rows.map((r) => ({
          ...r,
          version: stamp(
            Object.fromEntries(fields.split(',').map((f) => [f.slice(2), r[f.slice(2)]])),
          ),
        })),
        total: Number((await db.get('SELECT COUNT(*) AS n FROM danmaku d' + where, ...args)).n),
        page,
      });
    }
    if (!dm[1] || !['PATCH', 'DELETE'].includes(method)) fail('不支持的操作', 405);
    const id = positive(dm[1]),
      b = await body(req);
    await db.transaction(async () => {
      await db.lockUser(uid);
      await admin(uid);
      const row = await db.get(`SELECT ${fields} FROM danmaku d WHERE id=?${lock}`, id);
      if (!row) fail('弹幕不存在', 404);
      if (b.version !== stamp(row)) fail('记录已更新，请刷新后重试', 409);
      if (method === 'DELETE') {
        if (b.confirm !== String(id)) fail('请确认弹幕编号');
        await db.run('DELETE FROM danmaku WHERE id=?', id);
      } else {
        if (![0, 1].includes(b.hidden)) fail('状态无效');
        await db.run('UPDATE danmaku SET hidden=? WHERE id=?', b.hidden, id);
      }
    });
    return send({ ok: true });
  };
}
