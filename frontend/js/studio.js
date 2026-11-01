import { courseImage } from './course-image.js';
import { renderAdmin } from './admin.js';
import { mountPublishedArticles } from './published-articles.js';
import { uiText } from './experience.js';
import { renderProfile } from './profile.js';
const icons = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  explore: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  learn: 'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v16h-6a4 4 0 0 0-3 1 4 4 0 0 0-3-1H3Zm9 2v15',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  chart: 'M4 20V10m8 10V4m8 16v-7',
  video: 'M3 5h13v14H3Zm13 5 5-3v10l-5-3',
  chat: 'M3 3h18v14H8l-5 4Z',
  arrow: 'm9 5 7 7-7 7',
};
export const icon = (name) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="' +
  (icons[name] || icons.learn) +
  '"/></svg>';
export function setupMobileNavigation() {
  document.querySelector('#mobile-nav').innerHTML = [
    ['#/', 'home', '首页'],
    ['#/explore', 'explore', '发现'],
    ['#/learning', 'learn', '学习'],
    ['#/profile', 'user', '我的'],
  ]
    .map(([href, i, t]) => '<a href="' + href + '">' + icon(i) + '<span>' + t + '</span></a>')
    .join('');
}
export function syncShell(path) {
  const admin = path.startsWith('#/admin');
  document.body.classList.toggle('admin-mode', admin);
  const active =
    path.startsWith('#/video/') || path === '#/courses'
      ? '#/explore'
      : path === '#/favorites'
        ? '#/learning'
        : path;
  document.querySelectorAll('#mobile-nav a').forEach((a) => {
    const on = a.getAttribute('href') === active;
    a.classList.toggle('selected', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
export async function renderStudio({
  app,
  path,
  api,
  state,
  escapeHtml: esc,
  toast,
  isCurrent,
  card,
  bindCards,
  onDispose,
}) {
  const headline = (k, t, p) =>
    '<div class="studio-heading"><span class="kicker">' +
    k +
    '</span><h1>' +
    t +
    '</h1><p>' +
    p +
    '</p></div>';
  if (path === '#/explore') {
    const courses = await api('/api/courses');
    if (!isCurrent()) return true;
    const images = ['high-school', 'graduate', 'civil', 'technology'];
    const picks = state.catalog.categories.map((category) => ({
      label: category.name,
      items: courses
        .filter((c) => c.category === category.name)
        .slice(0, 2)
        .map((c) => [c.id, '先试看第一节，再安排适合自己的学习节奏。']),
    }));
    app.innerHTML =
      '<section class="studio-page discovery-page">' +
      headline(
        'A PLACE TO BEGIN',
        '找到值得开始的一课',
        '选一个方向，或者先从下面的入门建议开始。',
      ) +
      '<div class="section-label"><h2>按方向探索</h2><a href="#/courses">全部课程 →</a></div><div class="discovery-grid">' +
      state.catalog.categories
        .map(
          (c, i) =>
            '<a class="discovery-card photo-direction" href="#/courses?' +
            new URLSearchParams({ category: c.name }) +
            '"><img src="/discovery-images/' +
            images[i] +
            '.jpg" alt="" width="1000" height="650" loading="lazy"><div><small>' +
            c.count +
            ' 门课程</small><h3>' +
            esc(c.name) +
            '</h3><span>进入分类 ↗</span></div></a>',
        )
        .join('') +
      '</div><section class="discovery-starters"><div class="section-label"><div><span class="kicker">START WITH A QUESTION</span><h2>从哪门课开始？</h2></div><span>按学习目的，找到第一步</span></div><div class="starter-options" role="group" aria-label="选择学习目的">' +
      picks
        .map(
          (p, i) =>
            '<button type="button" data-pick="' +
            i +
            '" aria-pressed="' +
            (i === 0) +
            '">' +
            p.label +
            '</button>',
        )
        .join('') +
      '</div><p id="starter-summary" class="helper" role="status"></p><div id="starter-list" class="starter-list"></div></section><section class="discovery-guide"><div><span class="kicker">BEFORE YOU START</span><h2>让第一课更轻松</h2><p>课程之外，几个实用的小建议。</p></div><div class="guide-questions"><details><summary>没有基础，怎样开始？</summary><p>先看第一节，确认讲解节奏适合自己。编程课可以边看边运行示例；数学课先试做一道例题。</p></details><details><summary>一门课太长，怎样安排？</summary><p>一次只选一个章节。学完后写下一句总结，下一次从最近学习里继续。</p></details><details><summary>遇到听不懂的地方怎么办？</summary><p>暂停并记下问题，在课程页保存时间笔记。补充相关基础后，再回到这个章节复习。</p></details></div></section></section>';
    function choose(index) {
      const picked = picks[index];
      app
        .querySelectorAll('[data-pick]')
        .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.pick) === index)));
      const items = picked.items
        .map(([id, reason]) => ({ course: courses.find((c) => c.id === id), reason }))
        .filter((x) => x.course);
      app.querySelector('#starter-summary').textContent =
        uiText(picked.label) + ' · ' + uiText('先试看一节，再决定学习节奏');
      app.querySelector('#starter-list').innerHTML = items
        .map(
          ({ course: c, reason }, i) =>
            '<a class="starter-course" href="#/video/' +
            c.id +
            '"><img src="' +
            courseImage(c) +
            '" alt="" width="160" height="110" loading="lazy"><div><small>0' +
            (i + 1) +
            '</small><h3 data-original-content>' +
            esc(c.title) +
            '</h3><p>' +
            reason +
            '</p><span>打开课程 ↗</span></div></a>',
        )
        .join('');
    }
    app
      .querySelectorAll('[data-pick]')
      .forEach((b) => (b.onclick = () => choose(Number(b.dataset.pick))));
    choose(0);
    const published = document.createElement('section');
    published.className = 'study-experiences';
    app.querySelector('.discovery-guide').before(published);
    const dispose = await mountPublishedArticles(published, {
      api,
      escapeHtml: esc,
      isCurrent,
      toast,
    });
    if (isCurrent()) onDispose(dispose);
    else dispose();
    return true;
  }
  if (path === '#/profile') {
    const dispose = await renderProfile({
      app,
      api,
      state,
      escapeHtml: esc,
      toast,
      isCurrent,
      card,
      bindCards,
    });
    if (dispose) {
      if (isCurrent()) onDispose(dispose);
      else dispose();
    }
    return true;
  }
  if (!path.startsWith('#/admin')) return false;
  return renderAdmin({ app, path, api, state, escapeHtml: esc, toast, isCurrent, onDispose });
}
