import { enhanceSelect } from './select-menu.js';
import { uiText } from './experience.js';
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
    audit: '操作审计',
  };
  const key = path.split('/')[2] || 'dashboard',
    kind = sections[key] ? key : 'dashboard';
  let disposed = false,
    page = 1,
    currentDialog = null,
    menus = [];
  const live = () => !disposed && isCurrent();
  onDispose(() => {
    disposed = true;
    menus.forEach((m) => m.dispose());
    currentDialog?.close();
    currentDialog?.remove();
  });
  let initial;
  try {
    initial = await api('/api/admin/' + kind);
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
    )}</nav><a class="return-app" href="#/profile">← ${uiText('返回个人中心')}</a></aside><section class="admin-main"><div class="admin-top"><span>${uiText('管理工作台')}</span><a href="#/profile">${uiText('返回用户端')} ↗</a></div><div class="admin-heading"><h1>${uiText(sections[kind])}</h1>${kind === 'articles' ? `<button id="admin-create" class="soft-button">${uiText('新建文章')}</button>` : ''}</div><div id="admin-content"></div></section></div>`;
  const content = app.querySelector('#admin-content');
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
        )}</div><section class="admin-panel"><h2>${uiText('内容工作台')}</h2><p>${uiText('课程、文章和讨论的修改将保存到服务器，并记录操作审计。')}</p><a href="#/admin/courses">${uiText('课程管理')} →</a></section>`;
      return;
    }
    const rows = kind === 'audit' ? data : data.rows;
    content.innerHTML = `<section class="admin-panel"><p role="status">${uiText('记录数')}：${kind === 'audit' ? rows.length : data.total}</p><div class="table-scroll"><table class="admin-table"><thead><tr><th>ID</th><th>${uiText('内容')}</th><th>${uiText('状态')}</th>${kind === 'audit' ? '' : `<th>${uiText('操作')}</th>`}</tr></thead><tbody>${rows.map((r) => `<tr><td>${r.id}</td><td data-original-content>${esc(kind === 'audit' ? `${r.action} · ${r.target_id} · ${r.created_at}` : r.title || r.nickname || r.content)}</td><td>${kind === 'audit' ? esc('账号 ' + r.actor_id) : uiText(kind === 'users' ? (r.is_admin ? '管理员' : r.disabled ? '已停用' : '正常') : kind === 'comments' ? (r.hidden ? '已隐藏' : '可见') : r.published ? '已发布' : '未发布')}</td>${kind === 'audit' ? '' : `<td><button type="button" class="text-action" data-edit="${r.id}" ${kind === 'users' && r.is_admin ? 'disabled' : ''}>${uiText('编辑')}</button></td>`}</tr>`).join('')}</tbody></table></div>${!rows.length ? `<p class="helper">${uiText('暂无记录')}</p>` : ''}${kind === 'audit' ? '' : `<div class="admin-pagination"><button data-prev ${page <= 1 ? 'disabled' : ''}>${uiText('上一页')}</button><span>${page} / ${Math.max(1, Math.ceil(data.total / 50))}</span><button data-next ${page * 50 >= data.total ? 'disabled' : ''}>${uiText('下一页')}</button></div>`}</section>`;
    content
      .querySelectorAll('[data-edit]')
      .forEach(
        (button) =>
          (button.onclick = () => edit(rows.find((r) => r.id === Number(button.dataset.edit)))),
      );
    content.querySelector('[data-prev]')?.addEventListener('click', () => load(page - 1));
    content.querySelector('[data-next]')?.addEventListener('click', () => load(page + 1));
  }
  async function load(next = page) {
    try {
      const data = await api('/api/admin/' + kind + '?page=' + next);
      if (live()) {
        page = next;
        draw(data);
      }
    } catch (e) {
      if (live()) toast(e.message);
    }
  }
  function edit(row) {
    currentDialog?.remove();
    menus.forEach((m) => m.dispose());
    menus = [];
    const fresh = !row;
    row ??= { title: '', summary: '', content: '', source_url: '', published: 0 };
    const fields =
      kind === 'courses'
        ? [
            ['title', '课程名称'],
            ['teacher', '讲师'],
            ['category', '分类'],
            ['subject', '学科'],
            ['description', '简介', 'textarea'],
          ]
        : kind === 'articles'
          ? [
              ['title', '标题'],
              ['summary', '摘要', 'textarea'],
              ['content', '正文', 'textarea'],
              ['source_url', '来源链接'],
            ]
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
    dialog.innerHTML = `<form><h2 id="admin-editor-title">${uiText(fresh ? '新建文章' : '编辑')}</h2>${kind === 'comments' ? `<blockquote data-original-content>${esc(row.content)}</blockquote>` : ''}${fields.map(([name, label, type]) => `<label>${uiText(label)}${type === 'textarea' ? `<textarea name="${name}" rows="${name === 'content' ? 10 : 3}" required>${esc(row[name] || '')}</textarea>` : `<input name="${name}" value="${esc(row[name] || '')}" ${name === 'source_url' ? 'type="url"' : 'required'}>`}</label>`).join('')}<label><span>${uiText('状态')}</span><select id="admin-state" name="${stateKey}">${labels.map((label, i) => `<option value="${i}" ${Number(row[stateKey]) === i ? 'selected' : ''}>${uiText(label)}</option>`).join('')}</select></label><p role="alert" class="admin-error"></p><div class="dialog-actions"><button type="button" data-cancel>${uiText('取消')}</button><button type="submit" class="soft-button">${uiText('保存')}</button></div></form>`;
    document.body.append(dialog);
    menus.push(enhanceSelect(dialog.querySelector('select')));
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
      const save = dialog.querySelector('[type=submit]');
      if (save.disabled) return;
      save.disabled = true;
      const values = Object.fromEntries(new FormData(e.target));
      values[stateKey] = Number(values[stateKey]);
      if (!fresh) values.version = row.version;
      try {
        await api('/api/admin/' + kind + (fresh ? '' : '/' + row.id), {
          method: fresh ? 'POST' : 'PATCH',
          body: JSON.stringify(values),
        });
        if (kind === 'courses') state.catalog = await api('/api/catalog');
        if (live()) {
          dialog.close();
          await load();
          toast(uiText('已保存'));
        }
      } catch (error) {
        if (live()) dialog.querySelector('[role=alert]').textContent = error.message;
      } finally {
        save.disabled = false;
      }
    };
  }
  app.querySelector('#admin-create')?.addEventListener('click', () => edit(null));
  draw(initial);
  return true;
}
