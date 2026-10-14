import { mountStudyCollection } from './study-collection.js';
import { avatarSource } from './avatar.js';
import { uiText } from './experience.js';
export async function renderProfile({
  app,
  api,
  state,
  escapeHtml: esc,
  toast,
  isCurrent,
  card,
  bindCards,
}) {
  const user = state.user;
  const [mine, overview, notes] = user
    ? await Promise.all([api('/api/me/courses'), api('/api/me/overview'), api('/api/me/notes')])
    : [null, null, []];
  if (!isCurrent()) return;
  const directions = Object.entries(
    (mine?.learning || []).reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + 1;
      return acc;
    }, {}),
  );
  app.innerHTML =
    '<section class="studio-page profile-page"><div class="studio-heading"><span class="kicker">MY LEARNING SPACE</span><h1>我的学习档案</h1><p>整理笔记、回顾足迹，留一点时间给自己。</p></div><div class="profile-card"><button class="profile-avatar avatar-preview-trigger" aria-label="更换头像" type="button"><img data-user-avatar src="' +
    esc(avatarSource(user)) +
    '" alt="我的头像" width="84" height="84"><span class="avatar-edit-badge" aria-hidden="true">✎</span></button><div><span class="profile-greeting">A LITTLE CURIOSITY, EVERY DAY</span><h2 data-original-content>' +
    esc(user?.nickname || '你好，学习者') +
    '</h2><p>' +
    (user ? '欢迎回来，今天也按自己的节奏学习。' : '登录后同步课程书架、章节记录和笔记。') +
    '</p>' +
    (overview
      ? '<small class="profile-joined">加入知途 <time>' +
        esc(overview.joinedAt.slice(0, 10)) +
        '</time></small>'
      : '') +
    '</div><button id="profile-auth" class="main-button">' +
    (user ? '界面设置' : '登录 / 注册') +
    '</button></div><div class="profile-numbers"><a href="#profile-history" id="history-shortcut"><b>' +
    (mine?.learning.length ?? '—') +
    '</b>最近访问</a><a href="#/favorites"><b>' +
    (mine?.favorites.length ?? '—') +
    '</b>书架收藏</a><a href="#profile-notes" id="notes-shortcut"><b>' +
    (overview?.noteCount ?? '—') +
    '</b>学习笔记</a><a href="#profile-following" id="following-shortcut"><b>' +
    (overview?.following.length ?? '—') +
    '</b>关注讲师</a></div><section id="profile-history" class="profile-history"></section><div class="profile-columns"><div><section class="personal-notes" id="profile-notes"><div class="section-label"><div><span class="kicker">KEEP WHAT YOU LEARN</span><h2>我的笔记库</h2></div><button id="export-notes" class="text-action" type="button">导出笔记</button></div><p class="helper">找回一个知识点，把零散记录串起来。</p><div class="notes-filters"><input type="search" id="notes-q" aria-label="搜索我的笔记" placeholder="搜索笔记、课程或章节"><select id="notes-course" aria-label="按课程筛选笔记"><option value="">全部课程</option></select></div><p id="notes-count" class="helper" role="status"></p><div id="personal-notes-list"></div></section><section class="learning-footprint"><div class="section-label"><h2>最近探索的方向</h2><span>按访问课程统计</span></div>' +
    (directions.length
      ? directions
          .map(
            ([name, count]) =>
              '<a href="#/profile?section=history"><span>' +
              esc(name) +
              '</span><i style="--share:' +
              (count / (mine.learning.length || 1)) * 100 +
              '%"></i><b>' +
              count +
              '</b></a>',
          )
          .join('')
      : '<p class="helper">打开一门课程，开始留下你的学习足迹。</p>') +
    '</section></div><aside><section class="focus-panel"><span class="kicker">TIME TO FOCUS</span><h2>留一段专注时间</h2><p>选一个时长，从眼前的一件事开始。</p><div class="focus-presets" role="group" aria-label="专注时长"><button data-minutes="15">15 min</button><button data-minutes="25">25 min</button><button data-minutes="45">45 min</button></div><output id="focus-clock" aria-label="剩余时间" data-original-content>25:00</output><div class="focus-actions"><button id="focus-toggle" class="soft-button">开始专注</button><button id="focus-reset" class="focus-reset">重新计时</button></div><p id="focus-status" role="status">计时仅保存在当前标签页，不计入课程学习进度。</p></section><section class="following-panel" id="profile-following"><div class="section-label"><h2>关注的讲师</h2></div>' +
    (overview?.following.length
      ? '<div class="teacher-tags">' +
        overview.following
          .map(
            (t) =>
              '<a data-original-content href="#/courses?' +
              new URLSearchParams({ q: t.teacher }) +
              '">' +
              esc(t.teacher) +
              '</a>',
          )
          .join('') +
        '</div>'
      : '<p class="helper">在课程页关注讲师，方便下次找到。</p>') +
    '</section></aside></div><div class="section-label"><h2>学习服务</h2><span>让学习井然有序</span></div><div class="settings-list">' +
    [
      ['#/favorites', '我的书架', '查看收藏的课程'],
      ['#/admin', '管理工作台', '课程与内容维护 · 需要管理员权限'],
    ]
      .map(
        ([href, t, d]) =>
          '<a href="' +
          href +
          '"><div><b>' +
          t +
          '</b><small>' +
          d +
          '</small></div><span class="settings-chevron">↗</span></a>',
      )
      .join('') +
    '</div>' +
    (user ? '<button id="profile-signout" class="profile-signout">退出登录</button>' : '') +
    '<div class="profile-note"><span>知途课堂 / ZHITU</span><p>学习是一条路，按照自己的节奏走。</p></div></section>';
  const openAuth = () => document.querySelector('#auth').showModal();
  app.querySelector('#profile-auth').onclick = user
    ? () => document.querySelector('#appearance-button').click()
    : openAuth;
  const signout = app.querySelector('#profile-signout');
  if (signout) signout.onclick = () => document.dispatchEvent(new Event('zhitu-signout'));
  for (const id of ['history', 'notes', 'following'])
    app.querySelector('#' + id + '-shortcut').onclick = (e) => {
      e.preventDefault();
      const section = app.querySelector('#profile-' + id);
      section.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      });
      section.tabIndex = -1;
      section.focus({ preventScroll: true });
    };
  app.querySelector('.avatar-preview-trigger').onclick = () =>
    document.dispatchEvent(new Event('zhitu-avatar-edit'));
  setupNotes(app, notes, user, esc, toast);
  const disposeHistory = mountStudyCollection(app.querySelector('#profile-history'), {
    d: mine || { learning: [], favorites: [] },
    mode: 'learning',
    state,
    api,
    escapeHtml: esc,
    card,
    bindCards,
    toast,
    isCurrent,
    onHistoryCleared: () => {
      app.querySelector('#history-shortcut b').textContent = '0';
      const footprint = app.querySelector('.learning-footprint');
      footprint.querySelectorAll('a,.helper').forEach((el) => el.remove());
      const empty = document.createElement('p');
      empty.className = 'helper';
      empty.textContent = uiText('打开一门课程，开始留下你的学习足迹。');
      footprint.append(empty);
    },
  });
  setupFocus(app, user);
  const frame = requestAnimationFrame(() => {
    if (
      isCurrent() &&
      new URLSearchParams(location.hash.split('?')[1]).get('section') === 'history'
    )
      app.querySelector('#history-shortcut').click();
  });
  return () => {
    disposeHistory();
    clearInterval(focusInterval);
    cancelAnimationFrame(frame);
  };
}

let focusInterval;
function setupFocus(app, user) {
  clearInterval(focusInterval);
  const panel = app.querySelector('.focus-panel'),
    clock = panel.querySelector('#focus-clock'),
    toggle = panel.querySelector('#focus-toggle'),
    status = panel.querySelector('#focus-status');
  const key = 'zhitu-focus-' + (user?.id ?? 'guest');
  let timer = { duration: 25 * 60, remaining: 25 * 60, end: null };
  try {
    const saved = JSON.parse(sessionStorage.getItem(key));
    if (
      saved &&
      [900, 1500, 2700].includes(saved.duration) &&
      Number.isFinite(saved.remaining) &&
      saved.remaining >= 0 &&
      saved.remaining <= saved.duration &&
      (saved.end === null || Number.isFinite(saved.end))
    )
      timer = saved;
  } catch {}
  const save = () => {
    try {
      sessionStorage.setItem(key, JSON.stringify(timer));
    } catch {}
  };
  function paint() {
    if (timer.end !== null) {
      timer.remaining = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
      if (!timer.remaining) {
        timer.end = null;
        save();
      }
    }
    clock.textContent =
      String(Math.floor(timer.remaining / 60)).padStart(2, '0') +
      ':' +
      String(timer.remaining % 60).padStart(2, '0');
    toggle.textContent = uiText(
      timer.end !== null
        ? '暂停计时'
        : timer.remaining === 0
          ? '再来一段'
          : timer.remaining < timer.duration
            ? '继续计时'
            : '开始专注',
    );
    status.textContent = uiText(
      timer.remaining === 0
        ? '这段专注已结束，起身休息一下吧。'
        : timer.end !== null
          ? '正在计时，切换页面后仍会继续。'
          : '计时仅保存在当前标签页，不计入课程学习进度。',
    );
    panel.querySelectorAll('[data-minutes]').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.minutes) * 60 === timer.duration));
      b.disabled = timer.end !== null;
    });
  }
  toggle.onclick = () => {
    if (timer.end !== null) {
      timer.remaining = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
      timer.end = null;
    } else {
      if (!timer.remaining) timer.remaining = timer.duration;
      timer.end = Date.now() + timer.remaining * 1000;
    }
    save();
    paint();
  };
  panel.querySelector('#focus-reset').onclick = () => {
    timer.remaining = timer.duration;
    timer.end = null;
    save();
    paint();
  };
  panel.querySelectorAll('[data-minutes]').forEach(
    (b) =>
      (b.onclick = () => {
        timer = {
          duration: Number(b.dataset.minutes) * 60,
          remaining: Number(b.dataset.minutes) * 60,
          end: null,
        };
        save();
        paint();
      }),
  );
  paint();
  focusInterval = setInterval(() => {
    if (!panel.isConnected) {
      clearInterval(focusInterval);
      return;
    }
    paint();
  }, 500);
}

function setupNotes(app, notes, user, esc, toast) {
  const input = app.querySelector('#notes-q'),
    select = app.querySelector('#notes-course'),
    list = app.querySelector('#personal-notes-list'),
    download = app.querySelector('#export-notes');
  const courses = new Map(notes.map((n) => [n.course_id, n.course_title]));
  select.innerHTML += [...courses]
    .map(
      ([id, title]) =>
        '<option data-original-content value="' + id + '">' + esc(title) + '</option>',
    )
    .join('');
  input.disabled = select.disabled = !user;
  let filtered = [];
  const time = (seconds) =>
    Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  function render() {
    const query = input.value.trim().toLocaleLowerCase();
    filtered = notes.filter(
      (n) =>
        (!select.value || String(n.course_id) === select.value) &&
        (!query ||
          [n.content, n.course_title, n.chapter_title]
            .join(' ')
            .toLocaleLowerCase()
            .includes(query)),
    );
    app.querySelector('#notes-count').textContent =
      uiText('笔记') + ' ' + filtered.length + ' / ' + notes.length;
    download.disabled = !filtered.length;
    list.innerHTML =
      filtered
        .map(
          (n) =>
            '<article class="notebook-entry"><div><span data-original-content>' +
            esc(n.course_title) +
            '</span><time>' +
            esc(n.created_at.slice(0, 10)) +
            '</time></div><p data-original-content>' +
            esc(n.content) +
            '</p><a href="#/video/' +
            n.course_id +
            '?chapter=' +
            n.chapter_id +
            '&t=' +
            n.at_second +
            '"><span data-original-content>' +
            time(n.at_second) +
            ' · ' +
            esc(n.chapter_title) +
            '</span><small>' +
            uiText('回到对应章节 ↗') +
            '</small></a></article>',
        )
        .join('') ||
      '<div class="profile-empty"><h3>' +
        uiText(!user ? '登录后查看私有笔记' : notes.length ? '没有匹配的笔记' : '把灵感留下来') +
        '</h3><p>' +
        uiText(notes.length ? '换一个关键词或课程试试。' : '在课程详情页保存笔记，随时回来复习。') +
        '</p></div>';
  }
  input.oninput = render;
  select.onchange = render;
  download.onclick = () => {
    const text =
      '# ' +
      uiText('我的笔记库') +
      '\n\n' +
      filtered
        .map(
          (n) =>
            '## ' +
            n.course_title +
            '\n\n' +
            n.chapter_title +
            ' · ' +
            time(n.at_second) +
            '\n\n' +
            n.content +
            '\n\n' +
            new URL(
              '/#/video/' + n.course_id + '?chapter=' + n.chapter_id + '&t=' + n.at_second,
              location.origin,
            ).href,
        )
        .join('\n\n---\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' })),
      link = document.createElement('a');
    link.href = url;
    link.download = 'zhitu-notes-' + new Date().toISOString().slice(0, 10) + '.md';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(uiText('已导出当前筛选的笔记'));
  };
  render();
}
