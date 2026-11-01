import { mountHistory } from './history.js';
import { enhanceSelect } from './select-menu.js';
import { uiText } from './experience.js';
export function mountStudyCollection(
  host,
  {
    d,
    mode = 'favorites',
    state,
    api,
    escapeHtml,
    card,
    bindCards,
    toast,
    isCurrent,
    onHistoryCleared,
  },
) {
  if (mode === 'learning')
    return mountHistory(host, {
      d,
      state,
      api,
      escapeHtml,
      card,
      bindCards,
      toast,
      isCurrent,
      onHistoryCleared,
    });
  host.innerHTML = `<div class="study-workspace-heading"><h2>${mode === 'learning' ? '历史记录' : '我的书架'} <small id="shelf-count">${mode === 'learning' ? d.learning.length : d.favorites.length}</small></h2>${mode === 'favorites' ? '<a href="#/profile?section=history">查看历史记录 ↗</a>' : ''}</div>
  <div class="study-filterbar"><label class="study-search"><span>在收藏视频中查找</span><input id="study-q" type="search" placeholder="视频、课程或讲师"></label><label><span>学习方向</span><select id="study-category"><option value="">全部方向</option>${state.catalog.categories.map((c) => '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>').join('')}</select></label><label><span>排列方式</span><select id="study-sort"><option value="recent">最近添加或访问</option><option value="title">视频名称</option></select></label></div>
  <div class="study-result-line"><p id="study-result" role="status"></p><button type="button" id="study-clear" class="text-action">重置筛选</button></div><div class="grid study-grid" id="study-list"></div>${mode === 'learning' ? '<p class="study-disclaimer">每门课程保留最近一次访问；B站视频的播放进度由原站保存。</p>' : ''}`;
  const q = host.querySelector('#study-q'),
    category = host.querySelector('#study-category'),
    sort = host.querySelector('#study-sort'),
    list = host.querySelector('#study-list');
  const menus = [enhanceSelect(category), enhanceSelect(sort)];
  function render() {
    const keyword = q.value.trim().toLocaleLowerCase();
    let rows = d[mode].filter(
      (c) =>
        (!category.value || c.category === category.value) &&
        (!keyword ||
          [c.chapter_title, c.title, c.teacher, c.subject]
            .join(' ')
            .toLocaleLowerCase()
            .includes(keyword)),
    );
    if (sort.value === 'title')
      rows = [...rows].sort((a, b) => a.chapter_title.localeCompare(b.chapter_title, 'zh-Hans-CN'));
    host.querySelector('#study-result').textContent =
      uiText('找到') + ' ' + rows.length + ' / ' + d[mode].length + ' ' + uiText('个视频');
    list.innerHTML =
      rows
        .map(
          (c) =>
            '<div class="study-course" data-favorite-chapter="' +
            c.chapter_id +
            '">' +
            card({
              ...c,
              title: c.chapter_title,
              duration: c.chapter_duration,
              lessons: 1,
              progress: c.chapter_progress,
            }) +
            '<div class="study-card-footer"><span data-original-content>' +
            escapeHtml(c.title) +
            '</span>' +
            (mode === 'learning' && c.last_visited_at
              ? '<time class="study-visited">' +
                escapeHtml(
                  new Intl.DateTimeFormat(document.documentElement.lang, {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  }).format(new Date(c.last_visited_at.replace(' ', 'T') + 'Z')),
                ) +
                '</time>'
              : '') +
            '<button type="button" data-shelf="' +
            c.chapter_id +
            '" aria-pressed="' +
            c.favorite +
            '">' +
            uiText(c.favorite ? '移出书架' : '加入书架') +
            '</button></div></div>',
        )
        .join('') ||
      '<section class="empty-state"><h3>' +
        uiText(
          d[mode].length
            ? '没有找到匹配视频'
            : mode === 'favorites'
              ? '书架里还没有视频'
              : '暂无学习记录',
        ) +
        '</h3><p>' +
        uiText(
          d[mode].length
            ? '试试其他关键词，或切换课程分类。'
            : mode === 'favorites'
              ? '在播放页收藏当前章节视频，下次可直接回到这一集。'
              : '从感兴趣的一门课开始，学习记录会保存在这里。',
        ) +
        '</p><a class="main-button" href="#/explore">' +
        uiText('发现课程 →') +
        '</a></section>';
    bindCards();
    list.querySelectorAll('[data-favorite-chapter] .card').forEach((element) => {
      const chapterId = Number(element.closest('[data-favorite-chapter]').dataset.favoriteChapter);
      const row = rows.find((c) => c.chapter_id === chapterId);
      element.onclick = () => {
        location.hash = '#/video/' + row.id + '?chapter=' + chapterId;
      };
    });
    list.querySelectorAll('[data-shelf]').forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          const chapterId = Number(button.dataset.shelf);
          const selected = d.favorites.find((c) => c.chapter_id === chapterId);
          if (!selected) return;
          try {
            const result = await api('/api/courses/' + selected.id + '/favorite', {
              method: 'POST',
              body: JSON.stringify({ chapterId, active: false }),
            });
            if (!isCurrent()) return;
            d.favorites = d.favorites.filter((c) => c.chapter_id !== chapterId);
            host.querySelector('#shelf-count').textContent = d[mode].length;
            const profileCount = document.querySelector('.profile-numbers a[href="#/favorites"] b');
            if (profileCount) profileCount.textContent = d.favorites.length;
            render();
            const next = list.querySelector('[data-shelf="' + chapterId + '"]');
            if (next) next.focus();
            else q.focus();
            toast(uiText(result.active ? '已加入书架' : '已移出书架'));
          } catch (e) {
            if (button.isConnected) button.disabled = false;
            toast(e.message);
          }
        }),
    );
  }
  q.oninput = render;
  category.onchange = sort.onchange = render;
  host.querySelector('#study-clear').onclick = () => {
    q.value = '';
    category.value = '';
    sort.value = 'recent';
    menus.forEach((m) => m.sync());
    render();
    q.focus();
  };

  render();
  return () => menus.forEach((m) => m.dispose());
}
