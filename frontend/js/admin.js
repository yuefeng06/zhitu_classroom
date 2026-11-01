import { enhanceSelect } from './select-menu.js';
import { uiText } from './experience.js';
import { avatarSource } from './avatar.js';
import { openAdminUser, userJoinedDate } from './admin-user.js';
import { mountLearningAdmin } from './admin-learning.js';
export async function renderAdmin({
  app,
  path,
  api,
  state,
  escapeHtml: esc,
  toast,
  isCurrent,
  onDispose,
}) {
  const sections = {
    dashboard: '数据看板',
    courses: '课程管理',
    articles: '文章管理',
    comments: '讨论审核',
    users: '用户管理',
    learning: '学习记录管理',
    danmaku: '弹幕管理',
  };
  const key = (path.split('/')[2] || 'dashboard').split('?')[0],
    kind = sections[key] ? key : 'dashboard';
  let disposed = false,
    page = 1,
    query = '',
    filter = '',
    requestId = 0,
    currentDialog = null,
    filterMenu = null,
    courseFilterMenu = null,
    chapterFilterMenu = null,
    commentCourse = '',
    commentChapter = '',
    commentOptionsTicket = 0,
    activeUpload = null,
    disposeUser = null,
    menus = [];
  function closeEditor() {
    disposeUser?.();
    disposeUser = null;
    activeUpload?.abort();
    activeUpload = null;
    menus.forEach((m) => m.dispose());
    menus = [];
    currentDialog?.close();
    currentDialog?.remove();
  }
  const live = () => !disposed && isCurrent();
  onDispose(() => {
    disposed = true;
    menus.forEach((m) => m.dispose());
    filterMenu?.dispose();
    courseFilterMenu?.dispose();
    chapterFilterMenu?.dispose();
    closeEditor();
  });
  let initial;
  try {
    initial = await api('/api/admin/' + (kind === 'learning' ? 'dashboard' : kind));
  } catch (error) {
    if (live())
      app.innerHTML = `<section class="studio-page"><h1>${uiText('管理工作台')}</h1><p>${esc(error.message)}</p><a href="#/profile">${uiText('返回个人中心')}</a></section>`;
    return true;
  }
  if (!live()) return true;
  app.innerHTML = `<div class="admin-shell"><aside class="admin-sidebar"><a class="admin-brand" href="#/admin">知途 <span>${uiText('管理工作台')}</span></a><nav aria-label="${uiText('管理端导航')}">${Object.entries(
    sections,
  )
    .map(
      ([k, t]) => `<a class="${k === kind ? 'current' : ''}" href="#/admin/${k}">${uiText(t)}</a>`,
    )
    .join(
      '',
    )}</nav><a class="return-app" href="#/profile">← ${uiText('返回个人中心')}</a></aside><section class="admin-main"><div class="admin-top"><span>${uiText('管理工作台')}</span><a href="#/profile">${uiText('返回用户端')} ↗</a></div><div class="admin-heading"><h1>${uiText(sections[kind])}</h1>${['articles', 'courses', 'users'].includes(kind) ? `<button id="admin-create" class="soft-button">${uiText(kind === 'courses' ? '新建课程' : kind === 'users' ? '新建用户' : '新建文章')}</button>` : ''}</div><form id="admin-filters" class="admin-filters"><input name="q" aria-label="搜索内容" placeholder="搜索课程、昵称或内容"><select name="state" aria-label="筛选状态"><option value="">全部状态</option><option value="1">${kind === 'users' ? '已停用' : kind === 'comments' ? '已隐藏' : '已发布'}</option><option value="0">${kind === 'users' ? '正常' : kind === 'comments' ? '可见' : '未发布'}</option></select><button type="submit" class="soft-button">搜索</button><button type="reset">重置</button></form><div id="admin-content"></div></section></div>`;
  const content = app.querySelector('#admin-content');
  const filters = app.querySelector('#admin-filters');
  if (['learning', 'danmaku'].includes(kind)) {
    filters.remove();
    mountLearningAdmin({ host: content, mode: kind, api, esc, toast, live, onDispose });
    return true;
  }
  filters.hidden = kind === 'dashboard';
  filters.querySelector('select').id = 'admin-filter-state';
  filterMenu = enhanceSelect(filters.querySelector('select'));
  if (kind === 'comments') {
    filters.elements.q.placeholder = uiText('搜索评论内容');
    filters.insertAdjacentHTML(
      'afterbegin',
      `<label><span>${uiText('所属课程')}</span><select id="admin-comment-course" name="courseId"><option value="">${uiText('全部课程')}</option></select></label><label><span>${uiText('所属章节')}</span><select id="admin-comment-chapter" name="chapterId"><option value="">${uiText('全部章节')}</option><option value="legacy">${uiText('历史课程评论（未绑定章节）')}</option></select></label>`,
    );
    chapterFilterMenu = enhanceSelect(filters.elements.chapterId);
    courseFilterMenu = enhanceSelect(filters.elements.courseId);
    filters.elements.courseId.onchange = () => {
      commentCourse = filters.elements.courseId.value;
      commentChapter = '';
      loadCommentOptions(commentCourse);
      load(1);
    };
    filters.elements.chapterId.onchange = () => {
      commentChapter = filters.elements.chapterId.value;
      load(1);
    };
  }
  async function loadCommentOptions(courseId = '') {
    const ticket = ++commentOptionsTicket;
    chapterFilterMenu?.dispose();
    filters.elements.chapterId.nextElementSibling?.remove();
    filters.elements.chapterId.innerHTML = `<option value="">${uiText('全部章节')}</option><option value="legacy">${uiText('历史课程评论（未绑定章节）')}</option>`;
    chapterFilterMenu = enhanceSelect(filters.elements.chapterId);
    try {
      const options = await api('/api/admin/comment-options?' + new URLSearchParams({ courseId }));
      if (!live() || ticket !== commentOptionsTicket) return;
      courseFilterMenu?.dispose();
      filters.elements.courseId.nextElementSibling?.remove();
      filters.elements.courseId.innerHTML =
        `<option value="">${uiText('全部课程')}</option>` +
        options.courses
          .map(
            (c) =>
              `<option value="${c.id}">${esc(c.title)}${c.published ? '' : ' · ' + uiText('未发布')}</option>`,
          )
          .join('');
      filters.elements.courseId.value = courseId;
      courseFilterMenu = enhanceSelect(filters.elements.courseId);
      chapterFilterMenu?.dispose();
      filters.elements.chapterId.nextElementSibling?.remove();
      filters.elements.chapterId.insertAdjacentHTML(
        'beforeend',
        options.chapters
          .map((ch) => `<option value="${ch.id}">${ch.position}. ${esc(ch.title)}</option>`)
          .join(''),
      );
      filters.elements.chapterId.value = commentChapter;
      chapterFilterMenu = enhanceSelect(filters.elements.chapterId);
    } catch (error) {
      if (live() && ticket === commentOptionsTicket) toast(error.message);
    }
  }
  filters.onsubmit = (e) => {
    e.preventDefault();
    query = filters.elements.q.value;
    filter = filters.elements.state.value;
    load(1);
  };
  filters.onreset = () => {
    query = '';
    filter = '';
    if (kind === 'comments') {
      commentCourse = commentChapter = '';
      loadCommentOptions();
    }
    load(1);
  };
  function draw(data) {
    if (kind === 'dashboard') {
      content.innerHTML = `<div class="metric-grid">${[
        ['注册用户', data.users],
        ['上架课程', data.published],
        ['管理文章', data.admin_articles],
        ['课程讨论', data.comments],
      ]
        .map(
          ([name, count]) =>
            `<article><span>${uiText(name)}</span><b>${Number(count)}</b></article>`,
        )
        .join(
          '',
        )}</div><section class="admin-panel"><h2>${uiText('内容工作台')}</h2><p>当前数据源：${esc(data.database)} · 缺少章节的上架课程：${data.missingChapters}</p><dl class="admin-activity">${Object.entries(
        data.activity || {},
      )
        .map(
          ([k, v]) =>
            `<div><dt>${esc({ favorites: '章节收藏', notes: '私有笔记总数', course_visits: '最近访问记录', study_checkins: '累计打卡' }[k])}</dt><dd>${v}</dd></div>`,
        )
        .join(
          '',
        )}</dl><p>${uiText('课程、文章和讨论的修改将保存到服务器。')}</p><a href="#/admin/courses">${uiText('课程管理')} →</a></section>`;
      return;
    }
    const rows = data.rows;
    content.innerHTML = `<section class="admin-panel"><p role="status">${uiText('记录数')}：${data.total}</p><div class="table-scroll"><table class="admin-table"><thead><tr><th>ID</th><th>${uiText('内容')}</th><th>${uiText('状态')}</th><th>${uiText('操作')}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.id}</td><td data-original-content>${esc(r.title || r.nickname || r.content)}</td><td>${uiText(kind === 'users' ? (r.is_admin ? '管理员' : r.disabled ? '已停用' : '正常') : kind === 'comments' ? (r.hidden ? '已隐藏' : '可见') : r.published ? '已发布' : '未发布')}</td>${`<td><button type="button" class="text-action" data-edit="${r.id}" ${kind === 'users' && r.is_admin ? 'disabled' : ''}>${uiText('编辑')}</button> <button class="text-action" data-delete="${r.id}" ${kind === 'users' && r.is_admin ? 'disabled' : ''}>删除</button>${kind === 'courses' ? ` <button class="text-action" data-cover="${r.id}">更换封面</button> <button class="text-action" data-chapters="${r.id}">${uiText('章节 / 上传视频')}</button> <a href="#/video/${r.id}">前台预览 ↗</a>` : ''}</td>`}</tr>`).join('')}</tbody></table></div>${!rows.length ? `<p class="helper">${uiText('暂无记录')}</p>` : ''}${`<div class="admin-pagination"><button data-prev ${page <= 1 ? 'disabled' : ''}>${uiText('上一页')}</button><span>${page} / ${Math.max(1, Math.ceil(data.total / 50))}</span><button data-next ${page * 50 >= data.total ? 'disabled' : ''}>${uiText('下一页')}</button></div>`}</section>`;
    if (kind === 'comments') {
      content.innerHTML = `<section class="admin-panel"><p role="status">${uiText('记录数')}：${data.total}</p><p class="helper">${uiText('评论按章节视频展示。旧评论保留在历史课程评论中，不自动归入某一集。')}</p><div class="admin-comment-list">${rows.map((row) => `<article class="admin-comment-item"><div class="admin-comment-meta"><span data-original-content>${esc(row.nickname || '用户 #' + row.user_id)}</span><time>${esc(row.created_at || '')}</time><span>${uiText(row.hidden ? '已隐藏' : '可见')}</span></div><p class="admin-comment-course" data-original-content>${esc(row.course_title || '课程 #' + row.course_id)}<br>${row.chapter_id ? esc((row.chapter_position ? row.chapter_position + '. ' : '') + (row.chapter_title || '章节 #' + row.chapter_id)) : uiText('历史课程评论（未绑定章节）')}</p><p class="admin-comment-text" data-original-content>${esc(row.content)}</p><div class="admin-comment-actions"><button type="button" data-moderate="${row.id}" data-hidden="0" ${row.hidden ? '' : 'disabled'}>${uiText(row.hidden ? '保留并恢复显示' : '已保留')}</button><button type="button" data-moderate="${row.id}" data-hidden="1" ${row.hidden ? 'disabled' : ''}>${uiText('隐藏')}</button><button type="button" data-delete="${row.id}">${uiText('删除')}</button>${row.chapter_id ? `<a href="#/video/${row.course_id}?chapter=${row.chapter_id}">${uiText('查看对应视频')} ↗</a>` : ''}</div></article>`).join('') || `<p class="helper">${uiText('暂无记录')}</p>`}</div><div class="admin-pagination"><button data-prev ${page <= 1 ? 'disabled' : ''}>${uiText('上一页')}</button><span>${page} / ${Math.max(1, Math.ceil(data.total / 50))}</span><button data-next ${page * 50 >= data.total ? 'disabled' : ''}>${uiText('下一页')}</button></div></section>`;
      content.querySelectorAll('[data-moderate]').forEach((button) => {
        button.onclick = async () => {
          const row = rows.find((r) => r.id === Number(button.dataset.moderate));
          button.disabled = true;
          try {
            await api('/api/admin/comments/' + row.id, {
              method: 'PATCH',
              body: JSON.stringify({ version: row.version, hidden: Number(button.dataset.hidden) }),
            });
            if (live()) {
              await load();
              toast(uiText('已保存'));
            }
          } catch (error) {
            if (live()) {
              button.disabled = false;
              toast(error.message);
            }
          }
        };
      });
    }
    if (kind === 'users') {
      content.innerHTML = `<section class="admin-panel"><p role="status">${uiText('记录数')}：${data.total}</p><p class="helper">${uiText('打开用户详情，查看学习统计、关注讲师或维护头像。')}</p><div class="table-scroll"><table class="admin-table"><thead><tr><th>${uiText('用户')}</th><th>${uiText('注册日期')}</th><th>${uiText('状态')}</th><th>${uiText('操作')}</th></tr></thead><tbody>${rows.map((row) => `<tr><td><div class="admin-user-cell"><img src="${esc(avatarSource(row))}" alt="" width="42" height="42"><div><span data-original-content>${esc(row.nickname)}</span><small>ID ${row.id}</small></div></div></td><td>${esc(userJoinedDate(row.created_at))}</td><td>${uiText(row.is_admin ? '管理员' : row.disabled ? '已停用' : '正常')}</td><td><button type="button" class="text-action" data-user-detail="${row.id}">${uiText('用户详情')}</button> <button type="button" class="text-action" data-edit="${row.id}" ${row.is_admin ? 'disabled' : ''}>${uiText('编辑')}</button> <button type="button" class="text-action" data-delete="${row.id}" ${row.is_admin ? 'disabled' : ''}>${uiText('删除')}</button></td></tr>`).join('')}</tbody></table></div>${!rows.length ? `<p class="helper">${uiText('暂无记录')}</p>` : ''}<div class="admin-pagination"><button data-prev ${page <= 1 ? 'disabled' : ''}>${uiText('上一页')}</button><span>${page} / ${Math.max(1, Math.ceil(data.total / 50))}</span><button data-next ${page * 50 >= data.total ? 'disabled' : ''}>${uiText('下一页')}</button></div></section>`;
      content.querySelectorAll('[data-user-detail]').forEach((button) => {
        button.onclick = () => {
          closeEditor();
          disposeUser = openAdminUser({
            id: Number(button.dataset.userDetail),
            api,
            escapeHtml: esc,
            onSaved: () => load(),
            onEdit: edit,
            isCurrent: live,
          });
        };
      });
    }
    content
      .querySelectorAll('[data-edit]')
      .forEach(
        (button) =>
          (button.onclick = () => edit(rows.find((r) => r.id === Number(button.dataset.edit)))),
      );
    content
      .querySelectorAll('[data-delete]')
      .forEach(
        (b) =>
          (b.onclick = () => removeRecord(rows.find((r) => r.id === Number(b.dataset.delete)))),
      );
    content
      .querySelectorAll('[data-chapters]')
      .forEach((b) => (b.onclick = () => chapters(Number(b.dataset.chapters))));
    content
      .querySelectorAll('[data-cover]')
      .forEach(
        (b) => (b.onclick = () => coverForm(rows.find((r) => r.id === Number(b.dataset.cover)))),
      );
    content.querySelector('[data-prev]')?.addEventListener('click', () => load(page - 1));
    content.querySelector('[data-next]')?.addEventListener('click', () => load(page + 1));
  }
  async function load(next = page) {
    const ticket = ++requestId;
    try {
      const data = await api(
        '/api/admin/' +
          kind +
          '?' +
          new URLSearchParams({
            page: next,
            q: query,
            state: filter,
            ...(kind === 'comments' ? { courseId: commentCourse, chapterId: commentChapter } : {}),
          }),
      );
      if (ticket !== requestId) return;
      if (live()) {
        page = next;
        draw(data);
      }
    } catch (e) {
      if (live()) toast(e.message);
    }
  }
  function edit(row) {
    closeEditor();
    menus.forEach((m) => m.dispose());
    menus = [];
    const fresh = !row;
    row ??= {
      category: state.catalog.categories[0].name,
      cover: '课程',
      duration: '待完善',
      level: '入门',
      title: '',
      summary: '',
      content: '',
      source_url: '',
      published: 0,
      disabled: 0,
    };
    const fields =
      kind === 'courses'
        ? [
            ['title', '课程名称'],
            ['teacher', '讲师'],
            ['category', '分类'],
            ['subject', '学科'],
            ['description', '简介', 'textarea'],
            ['cover', '封面文字 / 已上传图片地址'],
            ['duration', '总时长'],
            ['level', '难度'],
          ]
        : kind === 'articles'
          ? [
              ['title', '标题'],
              ['summary', '摘要', 'textarea'],
              ['content', '正文', 'textarea'],
              ['source_url', '来源链接'],
            ]
          : kind === 'users'
            ? [['nickname', '昵称'], ...(fresh ? [['password', '初始密码', 'password']] : [])]
            : [];
    const stateKey = kind === 'users' ? 'disabled' : kind === 'comments' ? 'hidden' : 'published';
    const labels =
      kind === 'users'
        ? ['正常', '已停用']
        : kind === 'comments'
          ? ['可见', '已隐藏']
          : ['未发布', '已发布'];
    const dialog = document.createElement('dialog');
    currentDialog = dialog;
    dialog.className = 'admin-dialog';
    dialog.setAttribute('aria-labelledby', 'admin-editor-title');
    const mediaEntry =
      kind === 'courses'
        ? `<section class="admin-course-media"><h3>${uiText('视频与章节')}</h3><p>${uiText('每个视频对应一个章节。先保存当前资料，再添加章节或上传视频。')}</p><button type="submit" class="soft-button" data-open-chapters>${uiText(fresh ? '保存并添加章节 / 上传视频' : '保存并管理章节 / 上传视频')}</button></section>`
        : '';
    dialog.innerHTML = `<form><h2 id="admin-editor-title">${uiText(fresh ? (kind === 'courses' ? '新建课程（草稿）' : kind === 'users' ? '新建普通账号' : '新建文章') : '编辑')}</h2>${kind === 'comments' ? `<blockquote data-original-content>${esc(row.content)}</blockquote>` : ''}${fields.map(([name, label, type]) => `<label>${uiText(label)}${name === 'category' ? `<select name="category">${state.catalog.categories.map((c) => `<option value="${esc(c.name)}" ${c.name === row.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : type === 'textarea' ? `<textarea name="${name}" rows="${name === 'content' ? 10 : 3}" required>${esc(row[name] || '')}</textarea>` : `<input name="${name}" value="${esc(row[name] || '')}" ${name === 'source_url' ? 'type="url"' : name === 'password' ? 'type="password" minlength="6" required' : 'required'}>`}</label>`).join('')}<label><span>${uiText('状态')}</span><select id="admin-state" name="${stateKey}">${labels.map((label, i) => `<option value="${i}" ${Number(row[stateKey]) === i ? 'selected' : ''}>${uiText(label)}</option>`).join('')}</select></label><p role="alert" class="admin-error"></p><div class="dialog-actions"><button type="button" data-cancel>${uiText('取消')}</button><button type="submit" class="soft-button">${uiText('保存')}</button></div></form>`;
    document.body.append(dialog);
    if (mediaEntry) dialog.querySelector('h2').insertAdjacentHTML('afterend', mediaEntry);
    dialog.querySelectorAll('select').forEach((select) => menus.push(enhanceSelect(select)));
    dialog.showModal();
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.onclose = () => {
      if (live())
        (
          app.querySelector(`[data-edit="${row.id}"]`) || app.querySelector('#admin-create')
        )?.focus();
    };
    dialog.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const saves = [...dialog.querySelectorAll('[type=submit]')];
      if (saves.some((button) => button.disabled)) return;
      saves.forEach((button) => {
        button.disabled = true;
      });
      const openChapters = kind === 'courses' && e.submitter?.hasAttribute('data-open-chapters');
      const values = Object.fromEntries(new FormData(e.target));
      values[stateKey] = Number(values[stateKey]);
      if (!fresh) values.version = row.version;
      try {
        const saved = await api('/api/admin/' + kind + (fresh ? '' : '/' + row.id), {
          method: fresh ? 'POST' : 'PATCH',
          body: JSON.stringify(values),
        });
        if (kind === 'courses') state.catalog = await api('/api/catalog');
        if (live()) {
          dialog.close();
          await load();
          toast(uiText('已保存'));
          if (openChapters && live()) await chapters(saved.id);
        }
      } catch (error) {
        if (live()) dialog.querySelector('[role=alert]').textContent = error.message;
      } finally {
        saves.forEach((button) => {
          button.disabled = false;
        });
      }
    };
  }
  async function removeRecord(row) {
    const description =
      kind === 'courses'
        ? '课程必须先下架，并且不能有章节或学习记录。'
        : kind === 'users'
          ? '仅删除已停用且没有学习记录的普通账号。'
          : '删除后前台不再显示，无法直接撤销。';
    if (!confirm('确认删除 #' + row.id + '？' + description)) return;
    try {
      await api('/api/admin/' + kind + '/' + row.id, {
        method: 'DELETE',
        body: JSON.stringify({ version: row.version, confirm: String(row.id) }),
      });
      if (kind === 'courses') state.catalog = await api('/api/catalog');
      await load(1);
      toast('已删除');
    } catch (e) {
      toast(e.message);
    }
  }
  async function chapters(courseId) {
    try {
      const rows = await api('/api/admin/courses/' + courseId + '/chapters');
      if (!live()) return;
      closeEditor();
      const d = document.createElement('dialog');
      currentDialog = d;
      d.className = 'admin-dialog admin-chapters';
      d.innerHTML = `<h2>${uiText('章节 / 上传视频')}</h2><p>${uiText('新增章节后即可上传 MP4 / WebM，也可为已有章节更换视频。')}</p><button data-new>${uiText('新增章节并上传视频')}</button><button data-close>关闭</button>${rows.length ? '' : `<p class="helper">${uiText('还没有章节，请先新增章节，再选择视频文件上传。')}</p>`}<div class="table-scroll"><table class="admin-table"><thead><tr><th>序号</th><th>章节</th><th>时长</th><th>操作</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.position}</td><td>${esc(r.title)}</td><td>${esc(r.duration)}</td><td><button data-chapter="${r.id}">编辑</button> <button data-source="${r.id}">${uiText('上传 / 更换视频')}</button> <button data-remove-chapter="${r.id}">删除</button></td></tr>`).join('')}</tbody></table></div>`;
      document.body.append(d);
      d.showModal();
      d.querySelector('[data-close]').onclick = () => d.close();
      d.querySelector('[data-new]').onclick = () =>
        chapterForm(courseId, { position: Math.max(0, ...rows.map((r) => r.position)) + 1 });
      d.querySelectorAll('[data-chapter]').forEach(
        (b) =>
          (b.onclick = () =>
            chapterForm(
              courseId,
              rows.find((r) => r.id === Number(b.dataset.chapter)),
            )),
      );
      d.querySelectorAll('[data-remove-chapter]').forEach(
        (b) =>
          (b.onclick = async () => {
            const r = rows.find((r) => r.id === Number(b.dataset.removeChapter));
            if (!confirm('删除章节“' + r.title + '”？有学习关联时会拒绝删除。')) return;
            try {
              await api('/api/admin/courses/' + courseId + '/chapters/' + r.id, {
                method: 'DELETE',
                body: JSON.stringify({ version: r.version, confirm: r.title }),
              });
              state.catalog = await api('/api/catalog');
              await chapters(courseId);
            } catch (e) {
              toast(e.message);
            }
          }),
      );
      d.querySelectorAll('[data-source]').forEach(
        (b) => (b.onclick = () => sourceForm(courseId, Number(b.dataset.source))),
      );
    } catch (e) {
      if (live()) toast(e.message);
    }
  }
  function formDialog(title, fields, submit, back) {
    closeEditor();
    const d = document.createElement('dialog');
    currentDialog = d;
    d.className = 'admin-dialog';
    d.innerHTML = `<form><h2>${esc(title)}</h2>${fields}<p role="alert" class="admin-error"></p><div class="dialog-actions"><button type="button">返回章节</button><button type="submit" class="soft-button">保存</button></div></form>`;
    document.body.append(d);
    d.querySelectorAll('select').forEach((select, i) => {
      select.id = 'admin-form-select-' + i;
      menus.push(enhanceSelect(select));
    });
    d.showModal();
    d.querySelector('.dialog-actions [type=button]').onclick = back;
    d.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const b = d.querySelector('[type=submit]');
      if (b.disabled) return;
      b.disabled = true;
      try {
        await submit(Object.fromEntries(new FormData(e.target)));
        if (live()) {
          await back();
          toast('已保存');
        }
      } catch (e) {
        if (live()) d.querySelector('[role=alert]').textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
  }
  function chapterForm(courseId, row) {
    let createdId;
    const fields = [
      ['title', '章节标题', 'text'],
      ['duration', '时长（如 12:30）', 'text'],
      ['position', '章节序号', 'number'],
    ]
      .map(
        ([k, l, t]) =>
          `<label>${l}<input name="${k}" type="${t}" required value="${esc(String(row[k] || ''))}" ${t === 'number' ? 'min="1" max="65535"' : ''}></label>`,
      )
      .join('');
    formDialog(
      uiText(row.id ? '编辑章节' : '新增章节，下一步上传视频'),
      fields,
      async (values) => {
        const saved = await api(
          '/api/admin/courses/' + courseId + '/chapters' + (row.id ? '/' + row.id : ''),
          {
            method: row.id ? 'PATCH' : 'POST',
            body: JSON.stringify({ ...values, version: row.version }),
          },
        );
        if (!row.id) createdId = saved.id;
        state.catalog = await api('/api/catalog');
      },
      () => (createdId ? sourceForm(courseId, createdId) : chapters(courseId)),
    );
    if (!row.id)
      currentDialog.querySelector('[type=submit]').textContent = uiText('保存并上传视频');
  }
  function coverForm(row) {
    formDialog(
      '更换课程封面',
      '<p>选择 JPEG 或 PNG，最大 2 MB；建议使用横向 16:9 图片。</p><input name="coverfile" type="file" accept="image/jpeg,image/png" required aria-label="选择课程封面">',
      async () => {
        const file = currentDialog.querySelector('[name=coverfile]').files[0];
        if (!file) throw Error('请选择图片');
        if (file.size > 2 * 1024 * 1024) throw Error('封面不能超过 2 MB');
        const response = await fetch('/api/admin/courses/' + row.id + '/cover', {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'X-Row-Version': row.version },
          body: file,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || '封面上传失败');
      },
      async () => {
        closeEditor();
        await load();
      },
    );
    currentDialog.querySelector('.dialog-actions [type=button]').textContent = '返回课程列表';
    currentDialog.querySelector('[type=submit]').textContent = '上传并保存';
  }
  async function sourceForm(courseId, id) {
    try {
      const endpoint = '/api/admin/courses/' + courseId + '/chapters/' + id + '/source',
        data = await api(endpoint);
      if (!live()) return;
      const row = data.source || { kind: 'bilibili', page: 1, label: '' };
      const fields =
        `<section class="video-upload-box"><h3>上传自己的视频</h3><input id="admin-video-file" type="file" accept="video/mp4,video/webm,.mp4,.webm" aria-label="选择视频文件"><button id="admin-video-upload" type="button">上传并绑定本章节</button><progress id="admin-upload-progress" value="0" max="100" hidden></progress><p id="admin-upload-status" role="status">支持 MP4 / WebM，默认上限 512 MB。已有视频会在上传成功后被替换。</p></section><p>请使用该章节的真实来源；B 站填写 BVID / CID / 分 P，直链填写可播放的视频地址。保存后立即生效。</p><label>类型<select name="kind"><option value="bilibili" ${row.kind === 'bilibili' ? 'selected' : ''}>Bilibili</option><option value="direct" ${row.kind === 'direct' ? 'selected' : ''}>HTTP(S) 视频直链</option><option value="local" ${row.kind === 'local' ? 'selected' : 'disabled'}>本站上传视频（已绑定）</option></select></label>` +
        [
          ['label', '来源说明'],
          ['bvid', 'BVID'],
          ['cid', 'CID（可选）'],
          ['page', '分 P'],
          ['url', '视频直链 URL'],
        ]
          .map(
            ([k, l]) =>
              `<label>${l}<input name="${k}" value="${esc(String(row[k] || ''))}"></label>`,
          )
          .join('');
      formDialog(
        '配置视频源',
        fields,
        (values) => {
          if (values.kind === 'local') return Promise.resolve();
          const source =
            values.kind === 'bilibili'
              ? {
                  kind: 'bilibili',
                  label: values.label,
                  bvid: values.bvid,
                  page: Number(values.page),
                  ...(values.cid ? { cid: Number(values.cid) } : {}),
                }
              : { kind: 'direct', label: values.label, url: values.url, demo: false };
          return api(endpoint, {
            method: 'PATCH',
            body: JSON.stringify({ source, version: data.version }),
          });
        },
        () => chapters(courseId),
      );
      const uploadButton = currentDialog.querySelector('#admin-video-upload');
      const sourceKind = currentDialog.querySelector('[name=kind]');
      const localOption = sourceKind.querySelector('[value=local]');
      const sourceDialog = currentDialog;
      const updateSourceFields = () => {
        const kind = sourceKind.value;
        for (const name of ['label', 'bvid', 'cid', 'page', 'url']) {
          const input = sourceDialog.querySelector(`[name=${name}]`);
          input.closest('label').hidden =
            kind === 'local' ||
            (kind === 'bilibili' ? name === 'url' : ['bvid', 'cid', 'page'].includes(name));
        }
        sourceDialog.querySelector('[type=submit]').textContent =
          kind === 'local' ? '完成' : '保存视频源';
      };
      sourceKind.addEventListener('change', updateSourceFields);
      if (row.kind === 'local') sourceKind.value = 'local';
      sourceKind.dispatchEvent(new Event('change', { bubbles: true }));
      uploadButton.onclick = () => {
        const d = currentDialog,
          file = d.querySelector('#admin-video-file').files[0],
          status = d.querySelector('#admin-upload-status'),
          progress = d.querySelector('progress');
        if (!file) {
          status.textContent = '请先选择视频文件';
          return;
        }
        if (!/\.(mp4|webm)$/i.test(file.name)) {
          status.textContent = '请选择 MP4 或 WebM';
          return;
        }
        const request = new XMLHttpRequest();
        activeUpload = request;
        uploadButton.disabled = true;
        const save = d.querySelector('[type=submit]');
        save.disabled = true;
        progress.hidden = false;
        status.textContent = '正在上传，请勿关闭窗口…';
        request.open('PUT', endpoint.replace(/source$/, 'upload'));
        request.setRequestHeader(
          'Content-Type',
          /\.webm$/i.test(file.name) ? 'video/webm' : 'video/mp4',
        );
        request.setRequestHeader('X-Source-Version', data.version);
        request.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            progress.value = (e.loaded / e.total) * 100;
            status.textContent = '已上传 ' + Math.round(progress.value) + '%';
          }
        };
        request.onload = () => {
          if (!live() || currentDialog !== d || !d.open) return;
          activeUpload = null;
          uploadButton.disabled = false;
          save.disabled = false;
          let result;
          try {
            result = JSON.parse(request.responseText);
          } catch {
            status.textContent = '服务器响应异常';
            return;
          }
          if (request.status === 201) {
            data.version = result.version;
            status.textContent = '上传成功，已绑定章节。课程发布后可在前台播放。';
            d.querySelector('[name=url]').value = result.source.url;
            localOption.disabled = false;
            sourceKind.value = 'local';
            sourceKind.dispatchEvent(new Event('change', { bubbles: true }));
          } else status.textContent = result.error || '上传失败';
        };
        request.onerror = () => {
          if (!live() || currentDialog !== d || !d.open) return;
          activeUpload = null;
          uploadButton.disabled = false;
          save.disabled = false;
          status.textContent = '上传中断，请重试';
        };
        const previousClose = d.onclose;
        d.onclose = () => {
          request.abort();
          previousClose?.();
        };
        request.send(file);
      };
    } catch (e) {
      if (live()) toast(e.message);
    }
  }
  app.querySelector('#admin-create')?.addEventListener('click', () => edit(null));
  draw(initial);
  if (kind === 'comments') loadCommentOptions();
  return true;
}
