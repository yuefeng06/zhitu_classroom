import { courseImage } from './course-image.js';
import { mountStudyCollection } from './study-collection.js';
import { mountCheckinCalendar } from './checkin-calendar.js';
import { setupSearch } from './search.js';
import { setupAuth } from './auth.js';
import { setupAvatarEditor, avatarSource } from './avatar.js';
import { renderHome } from './home.js';
import { enhanceSelect } from './select-menu.js';
import { setupNavigation, setupSegments } from './navigation.js';
import { createAccount } from './account.js';
import { setupExperience, uiText } from './experience.js';
import { setupMobileNavigation, syncShell, renderStudio } from './studio.js';
import { createMotion } from './motion.js';
import { mountPlayer } from './player.js';
const app = document.querySelector('#app');
const state = { user: null, catalog: null };
setupMobileNavigation();
const navigation = setupNavigation();
const experience = setupExperience();
let pageVersion = 0;
const motion = createMotion(app);
let toastTimer;
const positions = new Map();
let viewPath = location.hash || '#/';
history.scrollRestoration = 'manual';
let navigationDepth = Number.isInteger(history.state?.zhituDepth) ? history.state.zhituDepth : 0;
history.replaceState({ ...history.state, zhituDepth: navigationDepth }, '');
function updateNavigation(event) {
  if (event?.type === 'hashchange') {
    navigationDepth = Number.isInteger(history.state?.zhituDepth)
      ? history.state.zhituDepth
      : navigationDepth + 1;
    history.replaceState({ ...history.state, zhituDepth: navigationDepth }, '');
  }
  const path = (location.hash || '#/').split('?')[0],
    isVideo = path.startsWith('#/video/');
  const parent = document.querySelector('#page-parent'),
    back = document.querySelector('#page-back');
  document.querySelector('#page-navigation').hidden = path === '#/';
  parent.href = isVideo ? '#/courses' : '#/';
  parent.textContent = isVideo ? '返回课程列表' : '返回首页';
  back.textContent =
    navigationDepth > 0 ? '← 返回上一页' : isVideo ? '← 返回课程列表' : '← 返回首页';
  back.onclick = () => {
    if (navigationDepth > 0) history.back();
    else location.hash = isVideo ? '#/courses' : '#/';
  };
}

addEventListener('scroll', () => positions.set(viewPath, scrollY), { passive: true });
function rememberRoute() {
  const next = location.hash || '#/';
  if (next !== viewPath) {
    positions.set(next, positions.get(viewPath) || 0);
    viewPath = next;
  }
}
const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const account = createAccount({ state, escapeHtml, onLogout: logout });
setupAuth({
  api,
  toast,
  onSignedIn: async (user) => {
    state.user = user;
    account.refresh();
    await route();
  },
});
setupAvatarEditor({
  state,
  api,
  toast,
  onSaved: (user) => {
    state.user = user;
    account.refresh();
    document
      .querySelectorAll('[data-user-avatar]')
      .forEach((img) => (img.src = avatarSource(user)));
  },
});
async function api(url, options = {}) {
  let r;
  try {
    r = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw Error('无法连接服务器，请通过 http://localhost:3000 访问并确认服务已启动');
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error('服务器返回了无效响应');
  }
  if (!r.ok) {
    if (r.status === 401 && !url.includes('/auth/')) {
      state.user = null;
      account.refresh();
      document.querySelector('#auth').showModal();
    }
    throw Error(data.error || '请求失败');
  }
  return data;
}
function toast(text) {
  const e = document.querySelector('#toast');
  clearTimeout(toastTimer);
  e.textContent = text;
  e.classList.add('show');
  toastTimer = setTimeout(() => e.classList.remove('show'), 2600);
}

function cover(c) {
  return `<div class="cover ${escapeHtml(c.accent)}"><img class="course-photo" src="${courseImage(c)}" alt="" loading="lazy" decoding="async" width="640" height="360"><b>${escapeHtml(c.cover?.startsWith('/api/course-covers/') ? c.subject : c.cover)}</b><span>▶</span><i>${escapeHtml(c.duration)}</i></div>`;
}

function card(c) {
  return `<article class="card" data-id="${c.id}" tabindex="0" role="link" aria-label="${escapeHtml(c.title)}">${cover(c)}<h3 data-original-content>${escapeHtml(c.title)}</h3><p><span data-original-content>${escapeHtml(c.teacher)}</span><span>${c.lessons} 节 · ${escapeHtml(c.subject || c.category)}</span></p>${c.progress ? `<div class="mini-progress"><i style="width:${c.progress}%"></i></div>` : ''}</article>`;
}
function bindCards() {
  document.querySelectorAll('.course-photo').forEach((img) => {
    const ready = () => img.parentElement.classList.add('photo-loaded');
    if (img.complete && img.naturalWidth) ready();
    else img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
  });
  document.querySelectorAll('.card').forEach((x) => {
    x.onclick = () => (location.hash = `#/video/${x.dataset.id}`);
    x.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        x.click();
      }
    };
  });
  motion.refresh();
}
async function home() {
  const version = pageVersion;
  const dispose = await renderHome({
    app,
    api,
    state,
    escapeHtml,
    card,
    bindCards,
    isCurrent: () => version === pageVersion,
  });
  if (version !== pageVersion) dispose();
  else disposePage = dispose;
}
async function courses() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const categories = state.catalog.categories;
  let category = params.get('category') || '全部',
    subject = params.get('subject') || '';
  if (['计算机课程', '海外公开课'].includes(category)) category = '大学与技术公开课';
  if (category === '考研公共课') category = '考研课程';
  if (category !== '全部' && !categories.some((c) => c.name === category)) category = '全部';
  app.innerHTML = `<section class="course-head"><em>FIND YOUR NEXT CHAPTER</em><h1>沿着兴趣，找到下一段旅程</h1><p>${state.catalog.total} 门真实课程 · ${state.catalog.lessons.toLocaleString()} 个分集 · 从高中基础到大学公开课</p></section>
    <section class="block catalog-block"><div class="catalog-toolbar"><div class="tabs">${[{ name: '全部', count: state.catalog.total }, ...categories].map((c) => `<button class="${c.name === category ? 'on' : ''}" data-tab="${escapeHtml(c.name)}" aria-pressed="${c.name === category}">${escapeHtml(c.name)} <small>${c.count}</small></button>`).join('')}</div><div class="course-view-toggle" role="group" aria-label="课程展示方式"><button type="button" data-course-view="cards" aria-label="卡片视图" title="卡片视图" aria-pressed="true">▦</button><button type="button" data-course-view="list" aria-label="清单视图" title="清单视图" aria-pressed="false">☷</button></div><div class="sort-label"><span>排序</span><select id="course-sort" aria-label="课程排序"><option value="default">默认顺序</option><option value="lessons">分集最多</option><option value="title">课程名称</option></select></div></div>
    <div class="subject-tabs" id="subject-tabs" aria-label="学科筛选"></div><div class="active-course-query" id="active-course-query" hidden><span>搜索关键词</span><span id="course-query-text" data-original-content></span><button type="button" id="clear-course-query">清除关键词 ×</button></div><p class="result-count" id="result-count" role="status"></p><div id="course-list"></div></section>`;
  const listElement = document.querySelector('#course-list'),
    sort = document.querySelector('#course-sort');
  let query = params.get('q') || '';
  sort.value = ['default', 'lessons', 'title'].includes(params.get('sort'))
    ? params.get('sort')
    : 'default';
  let request = 0;
  const render = async () => {
    const ticket = ++request;
    document.querySelector('#active-course-query').hidden = !query;
    document.querySelector('#course-query-text').textContent = query;
    try {
      const list = await api(
        '/api/courses?' + new URLSearchParams({ category, subject, q: query }),
      );
      if (ticket !== request || !listElement.isConnected) return;
      if (sort.value === 'lessons') list.sort((a, b) => b.lessons - a.lessons || a.id - b.id);
      if (sort.value === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
      document.querySelector('#result-count').textContent =
        '找到 ' + list.length + ' 门课程' + (subject ? ' · ' + subject : '');
      listElement.innerHTML =
        categories
          .map((c) => {
            const courses = list.filter((x) => x.category === c.name);
            return courses.length
              ? `<section class="course-group" data-group="${escapeHtml(c.name)}"><div class="group-heading"><div><span>${c.icon}</span><h2>${escapeHtml(c.name)}</h2><small>${courses.length} 门课程</small></div><p>${escapeHtml(c.description)}</p></div><div class="grid">${courses.map(card).join('')}</div></section>`
              : '';
          })
          .join('') ||
        '<section class="empty-state"><h3>没有找到匹配课程</h3><p>试试其他关键词，或切换课程分类。</p><button class="main-button" id="clear-filters">清除筛选</button></section>';
      bindCards();
      const clear = document.querySelector('#clear-filters');
      if (clear)
        clear.onclick = () => {
          category = '全部';
          subject = '';
          query = '';
          refreshTabs();
          renderSubjects();
          search();
        };
    } catch (e) {
      if (ticket === request && listElement.isConnected) listElement.textContent = e.message;
    }
  };
  const search = () => {
    history.replaceState(
      history.state,
      '',
      '#/courses?' + new URLSearchParams({ category, subject, q: query, sort: sort.value }),
    );
    rememberRoute();
    document.querySelector('#search').value = query;
    searchBox.sync();
    return render();
  };
  const refreshTabs = () =>
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === category);
      b.setAttribute('aria-pressed', String(b.dataset.tab === category));
    });
  function renderSubjects() {
    const options = categories.find((c) => c.name === category)?.subjects || [];
    if (!options.some((x) => x.subject === subject)) subject = '';
    const host = document.querySelector('#subject-tabs');
    host.innerHTML = options.length
      ? `<span>学科</span>${[{ subject: '', label: '全部学科' }, ...options].map((s) => `<button data-subject="${escapeHtml(s.subject)}" class="${subject === s.subject ? 'on' : ''}" aria-pressed="${subject === s.subject}">${escapeHtml(s.label || s.subject)}</button>`).join('')}`
      : '';
    host.querySelectorAll('button').forEach(
      (button) =>
        (button.onclick = () => {
          subject = button.dataset.subject;
          renderSubjects();
          search();
        }),
    );
  }
  document.querySelector('#clear-course-query').onclick = () => {
    query = '';
    search();
  };
  sort.onchange = search;
  document.querySelectorAll('[data-tab]').forEach(
    (button) =>
      (button.onclick = () => {
        category = button.dataset.tab;
        subject = '';
        refreshTabs();
        renderSubjects();
        search();
      }),
  );
  const sortMenu = enhanceSelect(sort);
  renderSubjects();
  const disposeSegments = setupSegments(
    document.querySelector('.catalog-toolbar .tabs'),
    'categories',
  );
  disposePage = () => {
    disposeSegments();
    sortMenu.dispose();
  };
  await render();
}
let disposePage = async () => {};
async function video(id) {
  const version = pageVersion;
  const dispose = await mountPlayer({
    app,
    id,
    api,
    state,
    toast,
    escapeHtml,
    isCurrent: () => version === pageVersion,
    onChapterRoute: rememberRoute,
  });
  if (version !== pageVersion) await dispose();
  else disposePage = dispose;
}

async function learning(favorites = false) {
  const version = pageVersion;
  const d = state.user ? await api('/api/me/courses') : { learning: [], favorites: [] };
  if (version !== pageVersion) return;
  const recent = d.learning[0];
  app.innerHTML = `<section class="block study-dashboard"><div class="title"><div><em>A LITTLE EVERY DAY</em><h1>${favorites ? '我的收藏' : '我的学习'}</h1><p>每天一点，按自己的节奏学习。</p></div><a href="#/explore">寻找下一门课 ↗</a></div><section id="study-checkins"></section>
  ${recent ? `<a class="study-resume" href="#/video/${recent.id}?chapter=${recent.chapter_id || ''}"><img src="${courseImage(recent)}" alt="" width="240" height="150"><div><span class="kicker">CONTINUE YOUR CHAPTER</span><h2 data-original-content>${escapeHtml(recent.title)}</h2><p data-original-content>${escapeHtml(recent.last_opened_title || recent.teacher)}</p><span class="text-action">接着上次学习 →</span></div></a>` : ''}<div id="study-shelf"></div></section>`;
  const collection = mountStudyCollection(app.querySelector('#study-shelf'), {
    d,
    mode: 'favorites',
    state,
    api,
    escapeHtml,
    card,
    bindCards,
    toast,
    isCurrent: () => version === pageVersion,
  });
  const calendar = await mountCheckinCalendar(app.querySelector('#study-checkins'), {
    api,
    user: state.user,
    escapeHtml,
    toast,
  });
  if (version !== pageVersion) {
    collection();
    calendar();
    return;
  }
  disposePage = () => {
    collection();
    calendar();
  };
}
async function route(event) {
  const retired = (location.hash || '#/').split('?')[0];
  if (retired === '#/live' || retired === '#/admin/lives')
    history.replaceState(history.state, '', retired === '#/live' ? '#/courses' : '#/admin');
  updateNavigation(event);
  const destination = location.hash || '#/';
  const version = ++pageVersion;
  positions.set(viewPath, scrollY);
  viewPath = destination;
  const targetY = event?.type === 'hashchange' ? positions.get(destination) || 0 : scrollY;
  const dispose = disposePage;
  disposePage = async () => {};
  await dispose();
  if (version !== pageVersion) return;
  const path = destination.split('?')[0];
  syncShell(path);
  navigation.update(path);
  document.querySelector('#search').value =
    path === '#/courses' ? new URLSearchParams(destination.split('?')[1] || '').get('q') || '' : '';
  searchBox.sync();
  app.innerHTML = '<p class="empty">加载中…</p>';
  try {
    const m = destination.match(/^#\/video\/(\d+)/);
    if (m) await video(m[1]);
    else if (path === '#/courses') await courses();
    else if (path === '#/learning' || path === '#/favorites')
      await learning(path === '#/favorites');
    else if (
      !(await renderStudio({
        app,
        path,
        api,
        state,
        escapeHtml,
        toast,
        card,
        bindCards,
        onDispose: (dispose) => {
          disposePage = dispose;
        },
        isCurrent: () => version === pageVersion,
      }))
    )
      await home();
  } catch (e) {
    if (version === pageVersion) {
      app.innerHTML = '<p class="empty">' + escapeHtml(e.message) + '</p>';
      toast(e.message);
    }
  }
  if (version === pageVersion) {
    viewPath = location.hash || '#/';
    scrollTo({ top: targetY, behavior: 'instant' });
    experience.refresh();
    motion.page();
  }
}
function search(q) {
  const next = '#/courses?' + new URLSearchParams({ q });
  if (location.hash === next) {
    positions.set(next, 0);
    scrollTo({
      top: 0,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  } else location.hash = next;
}
const searchBox = setupSearch({ api, state, onSearch: search, escapeHtml });
async function logout() {
  if (!state.user) return;
  if (!confirm(uiText('退出当前账号？'))) return;
  try {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    state.user = null;
    account.close();
    account.refresh();
    await route();
  } catch (e) {
    toast(e.message);
  }
}
document.addEventListener('zhitu-signout', logout);
addEventListener('hashchange', route);
async function init() {
  try {
    localStorage.removeItem('zhitu-user');
    const [auth, catalog] = await Promise.all([api('/api/auth/me'), api('/api/catalog')]);
    state.user = auth.user;
    state.catalog = catalog;
    account.refresh();
    await route();
  } catch (e) {
    app.textContent = e.message;
  }
}
init();
document.querySelector('#learning').onclick = () => (location.hash = '#/learning');
document.querySelector('#favorites').onclick = () => (location.hash = '#/favorites');
document.querySelector('#create').onclick = () => (location.hash = '#/learning');
