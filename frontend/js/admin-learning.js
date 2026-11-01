import { enhanceSelect } from './select-menu.js';
import { uiText } from './experience.js';

const kinds = {
  history: '历史记录',
  favorites: '章节收藏',
  checkins: '每日打卡',
  playback: '播放进度',
  notes: '笔记元信息',
  follows: '关注讲师',
};
const hints = {
  history: '每门课程保留最近一次访问；清理不删除收藏、笔记或播放进度，并停止用旧进度补回历史。',
  favorites: '收藏对应章节视频，移除后用户书架同步移除；不删除视频或播放进度。',
  checkins: '按北京时间记录主动打卡。只查询或清理异常记录，不代用户补签。',
  playback: '仅原生播放器保存进度；不等同于实际观看时长。旧表未记录更新时间，仅供查询。',
  notes: '仅显示笔记所属章节、时间点和创建时间，不读取或修改私人正文。',
  follows: '可查询或移除关注关系。旧表未记录关注时间，不代用户新增关注。',
};
export function recordTime(value) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const raw = String(value),
    date = new Date(raw.replace(' ', 'T') + (/Z|[+-]\d\d:\d\d$/.test(raw) ? '' : 'Z'));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}
export function mountLearningAdmin({ host, mode, api, esc, toast, live, onDispose }) {
  const isDm = mode === 'danmaku';
  let kind = 'history',
    page = 1,
    request = 0,
    optionsRequest = 0,
    menus = [],
    disposed = false,
    rows = [],
    removable = false;
  const active = () => !disposed && live();
  host.innerHTML = `<div class="admin-record-tabs" role="group" aria-label="${uiText('学习记录类型')}">${
    isDm
      ? ''
      : Object.entries(kinds)
          .map(
            ([key, name]) =>
              `<button type="button" data-record-kind="${key}" aria-pressed="${key === kind}">${uiText(name)}</button>`,
          )
          .join('')
  }</div><p data-record-hint class="helper"></p>
    <form class="admin-filters admin-record-filters"><label><span>${uiText(isDm ? '搜索弹幕内容' : '昵称或用户编号')}</span><input name="q" maxlength="160"></label>${isDm ? `<label><span>${uiText('状态')}</span><select id="record-state" name="state"><option value="">${uiText('全部状态')}</option><option value="0">${uiText('可见')}</option><option value="1">${uiText('已隐藏')}</option></select></label>` : `<label><span>${uiText('用户编号（精确）')}</span><input type="number" name="userId" min="1" step="1"></label>`}
    <label data-course-filter><span>${uiText('所属课程')}</span><select id="record-course" name="courseId"><option value="">${uiText('全部课程')}</option></select></label><label data-course-filter><span>${uiText('所属章节')}</span><select id="record-chapter" name="chapterId"><option value="">${uiText('全部章节')}</option></select></label>
    ${isDm ? '' : `<label data-date-filter><span>${uiText('开始日期（北京时间）')}</span><input type="date" name="from"></label><label data-date-filter><span>${uiText('结束日期（北京时间）')}</span><input type="date" name="to"></label><label data-month-filter hidden><span>${uiText('打卡月份')}</span><input type="month" name="month" value="${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date())}"></label>`}
    <button type="submit" class="soft-button">${uiText('查询')}</button><button type="reset">${uiText('重置')}</button></form><p data-record-error role="alert"></p><div data-record-results aria-live="polite"></div>`;
  const form = host.querySelector('form'),
    results = host.querySelector('[data-record-results]'),
    error = host.querySelector('[data-record-error]');
  const requestedUser = new URLSearchParams(location.hash.split('?')[1] || '').get('userId');
  if (!isDm && /^\d+$/.test(requestedUser || '')) form.elements.userId.value = requestedUser;
  function enhance() {
    menus.forEach((m) => m.dispose());
    form.querySelectorAll('.select-menu').forEach((m) => m.remove());
    menus = [...form.querySelectorAll('select')].map(enhanceSelect);
  }
  onDispose(() => {
    disposed = true;
    menus.forEach((m) => m.dispose());
  });
  function configure() {
    host.querySelector('[data-record-hint]').textContent = uiText(
      isDm
        ? '弹幕对应章节视频；历史作者未记录。支持隐藏、恢复和确认删除，不改写原文。'
        : hints[kind],
    );
    host
      .querySelectorAll('[data-record-kind]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.recordKind === kind)));
    const hasCourse = isDm || !['checkins', 'follows'].includes(kind);
    form.querySelectorAll('[data-course-filter]').forEach((e) => {
      e.hidden = !hasCourse;
      e.querySelector('select').disabled = !hasCourse;
    });
    form.querySelectorAll('[data-date-filter]').forEach((e) => {
      e.hidden = ['checkins', 'follows', 'playback'].includes(kind);
      e.querySelector('input').disabled = e.hidden;
    });
    const month = form.querySelector('[data-month-filter]');
    if (month) {
      month.hidden = kind !== 'checkins';
      month.querySelector('input').disabled = month.hidden;
    }
    enhance();
  }
  async function options() {
    const ticket = ++optionsRequest,
      courseId = form.elements.courseId.value;
    form.elements.chapterId.innerHTML = `<option value="">${uiText('全部章节')}</option>${isDm ? `<option value="legacy">${uiText('历史未绑定章节')}</option>` : ''}`;
    enhance();
    try {
      const data = await api('/api/admin/comment-options?' + new URLSearchParams({ courseId }));
      if (!active() || ticket !== optionsRequest) return;
      form.elements.courseId.innerHTML =
        `<option value="">${uiText('全部课程')}</option>` +
        data.courses
          .map(
            (c) =>
              `<option value="${c.id}">${esc(c.title)}${c.published ? '' : ' · ' + uiText('未发布')}</option>`,
          )
          .join('');
      form.elements.courseId.value = courseId;
      form.elements.chapterId.insertAdjacentHTML(
        'beforeend',
        data.chapters
          .map((c) => `<option value="${c.id}">${c.position}. ${esc(c.title)}</option>`)
          .join(''),
      );
      enhance();
    } catch (e) {
      if (active() && ticket === optionsRequest) error.textContent = e.message;
    }
  }
  form.elements.courseId.onchange = () => {
    options();
  };
  function query() {
    const p = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (value && key !== 'month') p.set(key, value);
    if (!isDm && kind === 'checkins') {
      const month = form.elements.month.value;
      if (!/^\d{4}-\d{2}$/.test(month)) throw Error(uiText('请选择月份'));
      const [year, m] = month.split('-').map(Number);
      p.set('from', month + '-01');
      p.set('to', month + '-' + new Date(Date.UTC(year, m, 0)).getUTCDate());
    }
    p.set('page', page);
    return p;
  }
  const endpoint = () => (isDm ? '/api/admin/danmaku' : '/api/admin/learning/' + kind);
  async function load(next = 1) {
    page = next;
    const ticket = ++request;
    error.textContent = '';
    results.setAttribute('aria-busy', 'true');
    // Remove stale action buttons while a new filter request is in flight.
    results.innerHTML = `<p>${uiText('加载中…')}</p>`;
    try {
      const params = query(),
        data = await api(endpoint() + '?' + params);
      if (!active() || ticket !== request) return;
      if (data.total > 0 && !data.rows.length && page > 1) return load(page - 1);
      rows = data.rows;
      removable = data.removable;
      let calendar = '';
      if (!isDm && kind === 'checkins' && params.get('userId')) {
        const allParams = new URLSearchParams(params);
        allParams.set('page', 1);
        allParams.delete('q');
        const first = await api(endpoint() + '?' + allParams),
          dates = first.rows.map((r) => r.checkin_date);
        if (first.total > 30) {
          allParams.set('page', 2);
          dates.push(...(await api(endpoint() + '?' + allParams)).rows.map((r) => r.checkin_date));
        }
        if (!active() || ticket !== request) return;
        const month = form.elements.month.value,
          [y, m] = month.split('-').map(Number),
          days = new Date(Date.UTC(y, m, 0)).getUTCDate(),
          offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
        calendar = `<section class="admin-checkin-calendar"><h3>${uiText('用户')} #${esc(params.get('userId'))} · ${month}</h3><p>${uiText('有色日期表示已打卡，不表示观看时长。')}</p><div class="admin-checkin-grid">${['一', '二', '三', '四', '五', '六', '日'].map((d) => `<span>${d}</span>`).join('')}${'<span aria-hidden="true"></span>'.repeat(offset)}${Array.from(
          { length: days },
          (_, i) => {
            const date = month + '-' + String(i + 1).padStart(2, '0'),
              done = dates.includes(date);
            return `<span class="${done ? 'checked' : ''}" aria-label="${date} ${uiText(done ? '已打卡' : '未打卡')}">${i + 1}${done ? ' ✓' : ''}</span>`;
          },
        ).join('')}</div></section>`;
      }
      results.innerHTML = `${calendar}<section class="admin-panel"><p>${uiText('记录数')}：${data.total}</p><div class="admin-record-list">${rows.map((r, i) => card(r, i)).join('') || `<p>${uiText('暂无记录')}</p>`}</div><div class="admin-pagination"><button type="button" data-record-prev ${page <= 1 ? 'disabled' : ''}>${uiText('上一页')}</button><span>${page} / ${Math.max(1, Math.ceil(data.total / 30))}</span><button type="button" data-record-next ${page * 30 >= data.total ? 'disabled' : ''}>${uiText('下一页')}</button></div></section>`;
      results.querySelector('[data-record-prev]').onclick = () => load(page - 1);
      results.querySelector('[data-record-next]').onclick = () => load(page + 1);
      results
        .querySelectorAll('[data-record-action]')
        .forEach((b) => (b.onclick = () => mutate(b)));
    } catch (e) {
      if (active() && ticket === request) {
        error.textContent = e.message;
        results.innerHTML = `<button type="button" data-record-retry>${uiText('重试')}</button>`;
        results.querySelector('button').onclick = () => load(page);
      }
    } finally {
      if (active() && ticket === request) results.setAttribute('aria-busy', 'false');
    }
  }
  function card(r, i) {
    const course = r.course_id || r.chapter_course_id;
    const seconds = (n) => Number(n || 0).toFixed(1) + ' s';
    const detail = isDm
      ? `<p class="admin-comment-text" data-original-content>${esc(r.content)}</p><p>${uiText('视频时间点')}：${seconds(r.at_second)} · ${uiText(r.hidden ? '已隐藏' : '可见')}</p>`
      : kind === 'playback'
        ? `<p>${uiText('当前位置')}：${seconds(r.current_time)} / ${seconds(r.duration)} · ${Number(r.percent).toFixed(1)}%</p>`
        : kind === 'notes'
          ? `<p>${uiText('视频时间点')}：${seconds(r.at_second)} · ${uiText('正文保持私有')}</p>`
          : '';
    return `<article class="admin-comment-item"><div class="admin-comment-meta"><span data-original-content>${esc(r.nickname || (r.user_id ? '#' + r.user_id : uiText('历史未记录作者')))}</span>${r.user_id ? `<span>ID ${r.user_id}</span>` : ''}<time>${esc(recordTime(r.checkin_date || r.updated_at || r.created_at))}</time></div><p class="admin-comment-course" data-original-content>${esc(r.course_title || r.teacher || (r.course_id ? '#' + r.course_id : ''))}${r.chapter_id ? '<br>' + esc(r.chapter_title || '#' + r.chapter_id) : isDm ? '<br>' + uiText('历史未绑定章节') : ''}${r.published === 0 ? ' · ' + uiText('已下架') : ''}</p>${detail}<div class="admin-comment-actions">${isDm ? `<button type="button" data-record-action="${r.hidden ? 'restore' : 'hide'}" data-index="${i}">${uiText(r.hidden ? '保留并恢复显示' : '隐藏')}</button>` : ''}${isDm || removable ? `<button type="button" data-record-action="delete" data-index="${i}">${uiText(isDm ? '删除' : '清理记录')}</button>` : `<span class="helper">${uiText('只读')}</span>`}${course && r.chapter_id ? `<a href="#/video/${course}?chapter=${r.chapter_id}">${uiText('查看对应视频')} ↗</a>` : ''}</div></article>`;
  }
  async function mutate(button) {
    const row = rows[Number(button.dataset.index)],
      action = button.dataset.recordAction;
    if (
      action === 'delete' &&
      !confirm(
        `${uiText('确认清理这条记录？此操作不可撤销。')}\n${row.nickname || uiText('历史未记录作者')} · ${row.user_id || row.id}\n${row.course_title || row.teacher || row.checkin_date || ''}\n${row.chapter_title || ''}`,
      )
    )
      return;
    button.disabled = true;
    const ticket = request;
    try {
      await api(endpoint() + (isDm ? '/' + row.id : ''), {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        body: JSON.stringify({
          key: row.key,
          version: row.version,
          confirm: String(isDm ? row.id : row.user_id),
          ...(action === 'delete' ? {} : { hidden: action === 'hide' ? 1 : 0 }),
        }),
      });
      if (active()) {
        toast(uiText('已保存'));
        if (ticket === request) await load(page);
      }
    } catch (e) {
      if (active() && ticket === request) {
        error.textContent = e.message;
        button.disabled = false;
      }
    }
  }
  host.querySelectorAll('[data-record-kind]').forEach(
    (b) =>
      (b.onclick = () => {
        kind = b.dataset.recordKind;
        configure();
        load();
      }),
  );
  form.onsubmit = (e) => {
    e.preventDefault();
    load();
  };
  form.onreset = () =>
    queueMicrotask(() => {
      if (active()) {
        configure();
        options();
        load();
      }
    });
  configure();
  options();
  load();
}
