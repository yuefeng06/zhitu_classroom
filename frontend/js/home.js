import { courseImage } from './course-image.js';
import { mountHandwriting } from './handwriting.js';
import { avatarSource } from './avatar.js';

// A course discovery home, using the same live catalog as the course centre.
export async function renderHome({ app, api, state, escapeHtml: esc, card, bindCards, isCurrent }) {
  const [home, courses, mine, overview] = await Promise.all([
    api('/api/home'),
    api('/api/courses'),
    state.user ? api('/api/me/courses') : null,
    state.user ? api('/api/me/overview') : null,
  ]);
  if (!isCurrent()) return () => {};
  const featured = (home.recommendations || courses).slice(0, 3);
  const lessonLink = (c) => '#/video/' + c.id + (c.chapter_id ? '?chapter=' + c.chapter_id : '');
  app.innerHTML = `<div class="home-page"><section class="home-motto"><div><span class="motto-kicker" data-original-content>LEARN AT YOUR OWN PACE</span><h1 class="home-motto-title" aria-label="按自己的节奏学习" data-original-content lang="zh-CN"><span class="motto-fallback">按自己的节奏学习</span><span class="motto-drawing" aria-hidden="true"></span></h1></div><div class="motto-aside"><p>不必赶路，每一步都算数。</p><button class="motto-replay" type="button"><span aria-hidden="true">↺</span> 重写一遍</button></div></section>
    <section class="spotlight" aria-label="精选课程"><div id="spotlight-content"></div><div class="spotlight-controls"><button type="button" id="spotlight-prev" aria-label="上一门精选课程">‹</button><div class="spotlight-dots" role="group" aria-label="切换精选课程">${featured.map((c, i) => `<button type="button" data-slide="${i}" aria-label="${esc(c.title)}" aria-pressed="${i === 0}"><span></span></button>`).join('')}</div><button type="button" id="spotlight-next" aria-label="下一门精选课程">›</button></div></section>
    <div class="home-columns"><div class="home-main">
      <section class="home-recommendations"><div class="home-section-title"><div><span class="section-dot"></span><h2 id="home-grid-title">为你推荐</h2><small id="home-result-count"></small></div><button type="button" id="home-refresh" class="text-action"><span aria-hidden="true">↻</span> 换一组</button></div><div class="grid home-course-grid" id="home-course-grid"></div><div class="home-catalog-link"><a href="#/courses">去课程中心，发现更多好课 <span>→</span></a><span>${state.catalog.total} 门课程 · ${state.catalog.lessons.toLocaleString()} 个分集</span></div></section>
      <section class="home-directions"><div class="home-section-title"><div><span class="section-dot"></span><h2>找到你的学习方向</h2></div><a href="#/explore">探索更多 ↗</a></div><div class="home-direction-grid">${state.catalog.categories.map((c, i) => `<a href="#/courses?${new URLSearchParams({ category: c.name })}"><span class="direction-symbol direction-${i}">${c.icon}</span><div><h3>${esc(c.name)}</h3><small>${c.count} 门课程</small></div><span aria-hidden="true">↗</span></a>`).join('')}</div></section>
    </div><aside class="home-sidebar" aria-label="学习快捷入口">
      <section class="home-panel home-personal"><div class="home-personal-title"><img data-user-avatar src="${esc(avatarSource(state.user))}" alt="" width="42" height="42"><div><h2 data-original-content>${esc(state.user?.nickname || '你好，学习者')}</h2><p>${state.user ? '欢迎回到你的学习空间' : '让每一次好奇，都有新的收获。'}</p></div></div>${state.user ? `<div class="home-personal-stats"><a href="#/learning"><b>${mine.learning.length}</b><span>最近学习</span></a><a href="#/favorites"><b>${mine.favorites.length}</b><span>书架收藏</span></a><a href="#/profile"><b>${overview.noteCount}</b><span>学习笔记</span></a></div>${home.continuing ? `<a class="home-resume" href="${lessonLink(home.continuing)}"><small>接着上次，继续出发</small><strong data-original-content>${esc(home.continuing.title)}</strong><span>继续学习 →</span></a>` : '<a class="home-signin" href="#/courses">开始我的第一课 →</a>'}` : '<p class="home-personal-intro">收藏感兴趣的课程，留下笔记，下次回来接着学。</p><button id="home-signin" type="button" class="home-signin">登录，开启我的学习</button>'}</section>
      <section class="home-panel"><div class="home-panel-heading"><h2>值得一看的公开课</h2><span>编辑精选</span></div><ol class="home-reading-list">${courses
        .filter((c) => c.category === '大学与技术公开课')
        .slice(0, 4)
        .map(
          (c, i) =>
            `<li><span class="reading-number">${String(i + 1).padStart(2, '0')}</span><a href="#/video/${c.id}"><strong data-original-content>${esc(c.title)}</strong><small>${esc(c.teacher)} · ${c.lessons} 节</small></a></li>`,
        )
        .join('')}</ol></section>
      <section class="home-panel home-study-tips"><div class="home-panel-heading"><h2>学习小贴士</h2><a href="#/explore">学习经验 ↗</a></div><ol class="home-tip-list"><li><span>01</span><p>每次选一个章节，给自己一个容易开始的目标。</p></li><li><span>02</span><p>先尝试回忆，再打开笔记核对。</p></li><li><span>03</span><p>学完写下一句话，留给下次复习。</p></li></ol></section>
      <a class="home-focus-link" href="#/profile"><span aria-hidden="true">◴</span><div><h2>留一段专注时间</h2><p>放下分心，从眼前的一课开始。</p></div><span aria-hidden="true">↗</span></a>
    </aside></div>
    <footer class="home-footer"><a href="#/">知途课堂 <small>ZHITU CLASSROOM</small></a><p>学习是一条路，按照自己的节奏走。</p><a href="#/explore">学习经验 ↗</a><a href="#/profile">我的学习空间 ↗</a></footer>
  </div>`;
  let selected = 0,
    page = 0,
    disposed = false;
  function drawSpotlight() {
    const c = featured[selected];
    if (!c) {
      app.querySelector('.spotlight').hidden = true;
      return;
    }
    const content = app.querySelector('#spotlight-content');
    content.innerHTML = `<img class="spotlight-photo" src="${courseImage(c)}" alt="" width="1000" height="560"><div class="spotlight-shade"></div><div class="spotlight-copy"><span class="spotlight-label">${esc(c.subject || c.category)}</span><h2 data-original-content>${esc(c.title)}</h2><p>${esc(c.teacher)} <span>·</span> ${c.lessons} ${'节课程'} <span>·</span> ${esc(c.subject)}</p><a class="spotlight-action" href="#/video/${c.id}">${'立即学习'} <span aria-hidden="true">→</span></a></div><span class="spotlight-edition" aria-hidden="true">EXPLORE YOUR NEXT CHAPTER</span>`;
    app
      .querySelectorAll('[data-slide]')
      .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.slide) === selected)));
  }
  const defaultOrder = home.recommendations || [
    ...home.popular,
    ...courses.filter((c) => !home.popular.some((p) => p.id === c.id)),
  ];
  function drawCourses() {
    if (disposed) return;
    const rows = defaultOrder;
    const pages = Math.max(1, Math.ceil(rows.length / 6));
    page %= pages;
    const visible = rows.slice(page * 6, page * 6 + 6);
    app.querySelector('#home-course-grid').innerHTML =
      visible
        .map(
          (c) =>
            `<div class="recommendation-item">${card(c)}<p class="recommendation-reason">${esc(c.recommendationReason || '发现新的学习方向')}</p></div>`,
        )
        .join('') || '<p class="empty">暂无匹配课程</p>';
    app.querySelector('#home-grid-title').textContent = '为你推荐';
    app.querySelector('#home-result-count').textContent = `${rows.length} ${'门课程'}`;
    app.querySelector('#home-refresh').disabled = pages <= 1;
    bindCards();
  }
  app.querySelector('#home-refresh').onclick = () => {
    page++;
    drawCourses();
  };
  app.querySelectorAll('[data-slide]').forEach(
    (b) =>
      (b.onclick = () => {
        selected = Number(b.dataset.slide);
        drawSpotlight();
      }),
  );
  app.querySelector('#spotlight-prev').onclick = () => {
    selected = (selected + featured.length - 1) % featured.length;
    drawSpotlight();
  };
  app.querySelector('#spotlight-next').onclick = () => {
    selected = (selected + 1) % featured.length;
    drawSpotlight();
  };
  app
    .querySelector('#home-signin')
    ?.addEventListener('click', () => document.querySelector('#auth').showModal());
  drawSpotlight();
  drawCourses();
  const disposeHandwriting = mountHandwriting(app.querySelector('.home-motto'));
  return () => {
    disposed = true;
    disposeHandwriting();
  };
}
