export function setupAuth({ api, onSignedIn, toast }) {
  const dialog = document.querySelector('#auth');
  dialog.setAttribute('aria-labelledby', 'auth-title');
  dialog.innerHTML = `<button class="close" type="button" aria-label="关闭">×</button>
    <div class="auth-brand"><img src="/logo-mark.svg" alt="" width="40" height="40"><span>ZHITU CLASSROOM</span></div>
    <h2 id="auth-title">欢迎回到知途</h2><p id="auth-description">登录后，继续你的学习旅程。</p>
    <div class="auth-tabs" role="group" aria-label="登录或注册"><span class="auth-tab-slider" aria-hidden="true"></span><button type="button" data-auth-mode="login" aria-pressed="true">登录</button><button type="button" data-auth-mode="register" aria-pressed="false">注册</button></div>
    <form id="auth-form"><label for="nickname">昵称</label><input id="nickname" name="username" autocomplete="username" required maxlength="50" placeholder="请输入昵称">
    <label for="password">密码</label><div class="password-field"><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128" placeholder="请输入密码"><button type="button" id="password-visibility" aria-label="显示密码" aria-pressed="false">显示</button></div>
    <div id="confirm-field" hidden><label for="confirm-password">确认密码</label><input id="confirm-password" type="password" autocomplete="new-password" maxlength="128" placeholder="再次输入密码"></div>
    <p id="auth-error" role="alert" hidden></p><button id="login" type="submit" class="main-button">登录</button>
    <button id="register" type="button" class="link-button">没有账号？立即注册</button></form>
    <p class="auth-footnote">收藏课程、记录笔记，让学习积累下来。</p>`;
  const form = dialog.querySelector('form'),
    password = dialog.querySelector('#password'),
    confirm = dialog.querySelector('#confirm-password'),
    submit = dialog.querySelector('#login'),
    error = dialog.querySelector('#auth-error');
  let mode = 'login',
    busy = false;
  const showError = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  function setMode(next) {
    if (busy) return;
    mode = next;
    const register = mode === 'register';
    dialog.classList.toggle('register-mode', register);
    dialog.querySelector('#auth-title').textContent = register
      ? '在知途，开始新的学习'
      : '欢迎回到知途';
    dialog.querySelector('#auth-description').textContent = register
      ? '创建一个账号，收藏你的下一门好课。'
      : '登录后，继续你的学习旅程。';
    dialog
      .querySelectorAll('[data-auth-mode]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.authMode === mode)));
    dialog.querySelector('#confirm-field').hidden = !register;
    confirm.required = register;
    confirm.value = '';
    password.autocomplete = register ? 'new-password' : 'current-password';
    password.minLength = register ? 6 : 1;
    password.placeholder = register ? '设置至少 6 位密码' : '请输入密码';
    submit.textContent = register ? '注册并登录' : '登录';
    dialog.querySelector('#register').textContent = register
      ? '已有账号？去登录'
      : '没有账号？立即注册';
    error.hidden = true;
  }
  dialog
    .querySelectorAll('[data-auth-mode]')
    .forEach((b) => (b.onclick = () => setMode(b.dataset.authMode)));
  dialog.querySelector('#register').onclick = () =>
    setMode(mode === 'login' ? 'register' : 'login');
  dialog.querySelector('.close').onclick = () => dialog.close();
  dialog.querySelector('#password-visibility').onclick = (e) => {
    const shown = password.type === 'password';
    password.type = shown ? 'text' : 'password';
    e.currentTarget.textContent = shown ? '隐藏' : '显示';
    e.currentTarget.setAttribute('aria-label', shown ? '隐藏密码' : '显示密码');
    e.currentTarget.setAttribute('aria-pressed', String(shown));
  };
  form.addEventListener('input', () => {
    error.hidden = true;
  });
  password.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const nickname = dialog.querySelector('#nickname').value.trim();
    if (!nickname) return showError('请输入昵称');
    if (mode === 'register' && password.value !== confirm.value)
      return showError('两次输入的密码不一致');
    busy = true;
    submit.disabled = true;
    dialog.setAttribute('aria-busy', 'true');
    error.hidden = true;
    submit.textContent = '正在处理…';
    dialog.querySelectorAll('[data-auth-mode],#register').forEach((b) => (b.disabled = true));
    try {
      const data = await api('/api/auth/' + mode, {
        method: 'POST',
        body: JSON.stringify({ nickname, password: password.value }),
      });
      dialog.close();
      await onSignedIn(data.user);
      toast('欢迎，' + data.user.nickname);
    } catch (e) {
      showError(e.message);
    } finally {
      busy = false;
      submit.disabled = false;
      dialog.removeAttribute('aria-busy');
      dialog.querySelectorAll('[data-auth-mode],#register').forEach((b) => (b.disabled = false));
      submit.textContent = mode === 'register' ? '注册并登录' : '登录';
    }
  };
  dialog.addEventListener('close', () => {
    password.value = '';
    confirm.value = '';
    password.type = 'password';
    const toggle = dialog.querySelector('#password-visibility');
    toggle.textContent = '显示';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', '显示密码');
    error.hidden = true;
  });
  document.querySelector('#auth-entry').onclick = () => {
    setMode('login');
    dialog.showModal();
  };
}
