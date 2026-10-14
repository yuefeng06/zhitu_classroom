import { avatarSource } from './avatar.js';
export function createAccount({ state, escapeHtml: esc, onLogout }) {
  const button = document.querySelector('#account');
  button.innerHTML =
    '<img src="/avatar-cheese.jpg" data-user-avatar alt="我的头像" width="36" height="36">';
  button.setAttribute('aria-label', '个人菜单');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'account-panel');
  const panel = document.createElement('section');
  panel.id = 'account-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', '个人菜单');
  button.parentElement.append(panel);
  const close = (focus = false) => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  };
  // Render outside the menu so navigation can close it without cutting off the glow.
  function glow(event) {
    const target = event.target.closest('a,button');
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = target.getBoundingClientRect(),
      dot = document.createElement('span');
    dot.className = 'account-click-glow';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.left = (event.detail ? event.clientX : rect.left + rect.width / 2) + 'px';
    dot.style.top = (event.detail ? event.clientY : rect.top + rect.height / 2) + 'px';
    document.body.append(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
    setTimeout(() => dot.remove(), 700);
  }
  panel.addEventListener('click', glow, true);
  button.addEventListener('click', glow);
  function refresh() {
    const user = state.user;
    button.querySelector('img').src = avatarSource(user);
    document.querySelector('#auth-entry').hidden = !!user;
    button.dataset.signedIn = String(!!user);
    panel.innerHTML =
      '<div class="account-summary"><img data-user-avatar src="' +
      esc(avatarSource(user)) +
      '" alt="" width="48" height="48"><div><strong data-original-content>' +
      esc(user?.nickname || '你好，学习者') +
      '</strong><small>' +
      (user ? '欢迎回到你的学习空间' : '登录后保存学习记录') +
      '</small></div></div><div class="account-links"><a href="#/profile">个人中心 <span>↗</span></a><a href="#/profile?section=history">历史记录 <span>↗</span></a><a href="#/favorites">我的书架 <span>↗</span></a><button type="button" id="account-avatar">更换头像 <span>↗</span></button><button type="button" id="account-appearance">界面设置 <span>◌</span></button></div><button type="button" id="account-session" class="account-session">' +
      (user ? '退出登录' : '登录 / 注册') +
      '</button>';
    panel.querySelector('#account-avatar').onclick = () => {
      close();
      document.dispatchEvent(new Event('zhitu-avatar-edit'));
    };
    panel.querySelector('#account-appearance').onclick = () => {
      close();
      document.querySelector('#appearance-button').click();
    };
    panel.querySelector('#account-session').onclick = () => {
      close();
      if (state.user) onLogout();
      else document.querySelector('#auth').showModal();
    };
    panel.querySelectorAll('a').forEach((a) => (a.onclick = () => close()));
  }
  button.onclick = () => {
    if (panel.hidden) {
      refresh();
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    } else close();
  };
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (panel.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...panel.querySelectorAll('a,button')],
        i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[
        i < 0
          ? e.key === 'ArrowDown'
            ? 0
            : items.length - 1
          : (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
      ].focus();
    }
  });
  document.addEventListener('focusin', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target)) close();
  });
  addEventListener('hashchange', () => close());
  refresh();
  return { refresh, close };
}
