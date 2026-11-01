import { avatarSource } from './avatar.js';
import { uiText } from './experience.js';

export function userJoinedDate(value) {
  if (!value) return '—';
  const raw = String(value);
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

export function openAdminUser({ id, api, escapeHtml: esc, onSaved, onEdit, isCurrent }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'admin-dialog admin-user-dialog';
  dialog.setAttribute('aria-labelledby', 'admin-user-title');
  dialog.innerHTML = `<header class="admin-user-heading"><h2 id="admin-user-title">${uiText('用户详情')}</h2><button type="button" data-close>${uiText('关闭')}</button></header><p role="alert" class="admin-error"></p><div data-user-body aria-busy="true">${uiText('加载中…')}</div>`;
  const focusTarget = document.activeElement;
  document.body.append(dialog);
  dialog.showModal();
  let disposed = false,
    request = 0,
    busy = false,
    imageRevision = 0,
    data,
    image = '';
  const live = () => !disposed && dialog.open && isCurrent();
  const alert = dialog.querySelector('[role=alert]');
  const container = dialog.querySelector('[data-user-body]');
  const showError = (error) => {
    if (live()) alert.textContent = error.message;
  };
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    disposed = true;
    imageRevision++;
    if (focusTarget?.isConnected && isCurrent() && !document.querySelector('dialog[open]'))
      focusTarget.focus();
    dialog.remove();
  });
  async function load(page = 1) {
    const ticket = ++request;
    alert.textContent = '';
    container.setAttribute('aria-busy', 'true');
    try {
      const result = await api(`/api/admin/users/${id}/detail?page=${page}`);
      if (!live() || ticket !== request) return;
      data = result;
      imageRevision++;
      image = '';
      draw();
    } catch (error) {
      showError(error);
      if (live() && !data) {
        container.innerHTML = `<button type="button" data-retry>${uiText('重试')}</button>`;
        container.querySelector('[data-retry]').onclick = () => load(page);
      }
    } finally {
      if (live() && ticket === request) container.setAttribute('aria-busy', 'false');
    }
  }
  function draw() {
    const { user, stats, following, page } = data;
    const pages = Math.max(1, Math.ceil(stats.follows / 20));
    container.innerHTML = `<section class="admin-user-identity"><img src="${esc(avatarSource(user))}" alt="${uiText('当前头像')}" width="72" height="72"><div><h3 data-original-content>${esc(user.nickname)}</h3><p>ID ${user.id} · ${uiText(user.is_admin ? '管理员' : user.disabled ? '已停用' : '正常')}</p><p>${uiText('注册日期')}：${esc(userJoinedDate(user.created_at))}</p></div>${!user.is_admin ? `<button type="button" data-edit-user>${uiText('编辑资料')}</button><button type="button" data-edit-avatar>${uiText('更换头像')}</button>` : ''}</section>
      <section><h3>${uiText('学习与互动概览')}</h3><dl class="admin-user-stats">${Object.entries({
        notes: '私有笔记',
        favorites: '收藏视频',
        follows: '关注讲师',
        course_visits: '最近访问课程',
        study_checkins: '累计打卡天数',
        comments: '发表讨论',
      })
        .map(
          ([key, label]) =>
            `<div><dt>${uiText(label)}</dt><dd data-stat="${key}">${stats[key]}</dd></div>`,
        )
        .join(
          '',
        )}</dl><p class="helper">${uiText('统计包含已下架内容的保留记录。访问数量不是观看次数，打卡不代表学习时长。')}</p></section>
      <section class="admin-user-section"><h3>${uiText('笔记库')}</h3><p>${uiText('仅显示笔记数量，私人笔记正文由用户本人查看和维护。')}</p></section>
      <section class="admin-user-section"><h3>${uiText('关注的讲师')}</h3><p class="helper">${uiText('关注由用户产生，可在学习记录管理中清理；课程数量只计算已上架课程。')}</p><ul class="admin-following">${following.length ? following.map((item) => `<li><span data-original-content>${esc(item.teacher)}</span><small>${Number(item.courses)} ${uiText('门已上架课程')}</small></li>`).join('') : `<li>${uiText('尚未关注讲师')}</li>`}</ul>${pages > 1 ? `<div class="admin-pagination"><button type="button" data-prev-follow ${page <= 1 ? 'disabled' : ''}>${uiText('上一页')}</button><span>${page} / ${pages}</span><button type="button" data-next-follow ${page >= pages ? 'disabled' : ''}>${uiText('下一页')}</button></div>` : ''}</section>
      <section class="admin-user-section"><h3>${uiText('头像维护')}</h3>${user.is_admin ? `<p>${uiText('管理员请在个人中心修改自己的头像。')}</p>` : `<p>${uiText('选择图片后预览，确认保存才会替换此用户头像。')}</p><label class="admin-avatar-file">${uiText('选择头像图片')}<input type="file" data-avatar-file accept="image/jpeg,image/png,image/webp"></label><p class="helper">${uiText('支持 JPG、PNG、WebP，最大 4 MB；居中裁剪为正方形。')}</p><div class="admin-avatar-preview" hidden><img data-avatar-preview width="96" height="96" alt="${uiText('新头像预览')}"><span>${uiText('新头像预览')}</span></div><div class="dialog-actions"><button type="button" data-reset-avatar>${uiText('恢复默认头像')}</button><button type="button" data-save-avatar disabled>${uiText('保存头像')}</button></div><p role="status" data-avatar-status></p>`}</section>`;
    container.insertAdjacentHTML(
      'beforeend',
      `<section class="admin-user-section"><h3>${uiText('学习记录管理')}</h3><p>${uiText('历史、章节收藏、打卡、播放进度和笔记元信息可在学习记录管理中按用户编号查询。')}</p><a href="#/admin/learning" data-open-learning>${uiText('打开学习记录管理')} →</a></section>${!user.is_admin ? `<section class="admin-user-section"><h3>${uiText('重置登录密码')}</h3><p class="helper">${uiText('重置后原密码和已有登录会话失效。请通过安全方式告知本人。')}</p><form data-reset-password><label>${uiText('新密码')}<input type="password" name="newPassword" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>${uiText('再次输入新密码')}<input type="password" name="repeatPassword" autocomplete="new-password" minlength="8" maxlength="128" required></label><button type="submit">${uiText('确认重置密码')}</button><p role="status" data-password-status></p></form></section>` : ''}`,
    );
    container.querySelector('[data-open-learning]').href = '#/admin/learning?userId=' + id;
    container.querySelector('[data-open-learning]').onclick = () => dialog.close();
    const passwordForm = container.querySelector('[data-reset-password]');
    if (passwordForm)
      passwordForm.onsubmit = async (e) => {
        e.preventDefault();
        if (busy) return;
        const output = passwordForm.querySelector('[data-password-status]');
        const next = passwordForm.elements.newPassword.value;
        if (next !== passwordForm.elements.repeatPassword.value) {
          output.textContent = uiText('两次输入的密码不一致');
          return;
        }
        if (!confirm(`${uiText('确认重置此用户密码并退出其登录？')}\n${user.nickname} (ID ${id})`))
          return;
        busy = true;
        passwordForm.querySelector('button').disabled = true;
        try {
          const target = await api(`/api/admin/users/${id}/password`);
          if (!live()) return;
          await api(`/api/admin/users/${id}/password`, {
            method: 'POST',
            body: JSON.stringify({
              password: next,
              confirm: user.nickname,
              version: target.version,
            }),
          });
          if (live()) {
            passwordForm.reset();
            output.textContent = uiText('密码已重置，原登录已失效。');
          }
        } catch (error) {
          if (live()) output.textContent = error.message;
        } finally {
          busy = false;
          if (live()) passwordForm.querySelector('button').disabled = false;
        }
      };
    container.querySelector('[data-edit-user]')?.addEventListener('click', () => onEdit(user));
    container.querySelector('[data-prev-follow]')?.addEventListener('click', () => load(page - 1));
    container.querySelector('[data-next-follow]')?.addEventListener('click', () => load(page + 1));
    container
      .querySelector('[data-edit-avatar]')
      ?.addEventListener('click', () => container.querySelector('[data-avatar-file]').focus());
    container.querySelector('[data-avatar-file]')?.addEventListener('change', chooseImage);
    container
      .querySelector('[data-save-avatar]')
      ?.addEventListener('click', () => saveAvatar(false));
    container
      .querySelector('[data-reset-avatar]')
      ?.addEventListener('click', () => saveAvatar(true));
  }
  async function chooseImage(event) {
    const file = event.target.files[0],
      revision = ++imageRevision;
    image = '';
    alert.textContent = '';
    container.querySelector('[data-save-avatar]').disabled = true;
    container.querySelector('.admin-avatar-preview').hidden = true;
    if (!file) return;
    let bitmap;
    try {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 4 * 1024 * 1024
      )
        throw Error(uiText('请选择不超过 4 MB 的 JPG、PNG 或 WebP 图片'));
      bitmap = await createImageBitmap(file);
      if (!live() || revision !== imageRevision) return;
      if (bitmap.width * bitmap.height > 40000000)
        throw Error(uiText('图片尺寸过大，请选择较小的图片'));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d'),
        size = Math.min(bitmap.width, bitmap.height);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 256, 256);
      context.drawImage(
        bitmap,
        (bitmap.width - size) / 2,
        (bitmap.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      image = canvas.toDataURL('image/jpeg', 0.88);
      container.querySelector('[data-avatar-preview]').src = image;
      container.querySelector('.admin-avatar-preview').hidden = false;
      container.querySelector('[data-save-avatar]').disabled = false;
    } catch (error) {
      if (revision === imageRevision) showError(error);
    } finally {
      bitmap?.close();
    }
  }
  async function saveAvatar(reset) {
    if (busy || (!reset && !image)) return;
    if (
      !confirm(
        `${uiText(reset ? '确认恢复该用户的默认头像？' : '确认替换该用户的头像？')}\n${data.user.nickname} (ID ${id})`,
      )
    )
      return;
    busy = true;
    alert.textContent = '';
    dialog.querySelectorAll('button,input').forEach((element) => {
      element.disabled = true;
    });
    try {
      await api(`/api/admin/users/${id}/avatar`, {
        method: 'POST',
        body: JSON.stringify({
          version: data.user.version,
          confirm: data.user.nickname,
          ...(reset ? { reset: true } : { image }),
        }),
      });
      if (!live()) return;
      await onSaved();
      await load(data.page);
      if (live() && container.querySelector('[data-avatar-status]'))
        container.querySelector('[data-avatar-status]').textContent = uiText('头像已保存');
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      if (live()) {
        dialog.querySelectorAll('button,input').forEach((element) => {
          element.disabled = false;
        });
        const save = container.querySelector('[data-save-avatar]');
        if (save) save.disabled = !image;
        const prev = container.querySelector('[data-prev-follow]'),
          next = container.querySelector('[data-next-follow]');
        if (prev) prev.disabled = data.page <= 1;
        if (next) next.disabled = data.page * 20 >= data.stats.follows;
      }
    }
  }
  load();
  return () => {
    disposed = true;
    imageRevision++;
    dialog.close();
    dialog.remove();
  };
}
