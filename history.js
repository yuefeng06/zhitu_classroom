import { uiText } from './experience.js';
const trash =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/></svg>';

export function mountHistory(
  host,
  {
    d,
    state,
    api,
    escapeHtml: esc,
    card,
    bindCards,
    toast,
    isCurrent,
    onHistoryCleared = () => {},
  },
) {
  let disposed = false,
    busy = false,
    observer,
    frame;
  const live = () => !disposed && isCurrent();
  const dialog = document.createElement('dialog');
  dialog.className = 'history-confirm';
  dialog.setAttribute('aria-labelledby', 'history-confirm-title');
  dialog.setAttribute('aria-describedby', 'history-confirm-copy');
  dialog.innerHTML = `<h2 id="history-confirm-title">${uiText('清除全部历史记录？')}</h2><p id="history-confirm-copy">${uiText('将清除当前账号的课程访问记录，收藏、笔记和播放进度会保留。此操作无法撤销。')}</p><p class="history-error" role="alert"></p><div class="history-confirm-actions"><button type="button" data-cancel>${uiText('取消')}</button><button type="button" data-confirm>${uiText('确认清除')}</button></div>`;
  document.body.append(dialog);
  const cancel = dialog.querySelector('[data-cancel]'),
    confirm = dialog.querySelector('[data-confirm]');
  const behavior = () =>
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
  function draw() {
    observer?.disconnect();
    cancelAnimationFrame(frame);
    host.innerHTML = `<div class="study-workspace-heading"><h2 tabindex="-1">${uiText('历史记录')} <small>${d.learning.length}</small></h2><div class="history-actions"><div class="history-scroll-actions"><button type="button" data-history-prev aria-label="${uiText('较新的记录')}" title="${uiText('较新的记录')}">←</button><button type="button" data-history-next aria-label="${uiText('较早的记录')}" title="${uiText('较早的记录')}">→</button></div><button type="button" id="history-clear" aria-label="${uiText('清除历史记录')}" title="${uiText('清除历史记录')}" ${!state.user || !d.learning.length ? 'disabled' : ''}>${trash}</button></div></div>
      ${
        d.learning.length
          ? `<p class="history-caption">${uiText('沿时间轴回顾，左右滑动查看更早的课程。')}</p><div id="study-list" class="history-timeline" tabindex="0" role="region" aria-label="${uiText('课程访问时间轴')}">${d.learning
              .map((c) => {
                const raw = String(c.last_visited_at || ''),
                  date = new Date(
                    raw.replace(' ', 'T') + (/(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? '' : 'Z'),
                  );
                const valid = Number.isFinite(date.getTime());
                const dateText = valid
                  ? new Intl.DateTimeFormat(document.documentElement.lang, {
                      timeZone: 'Asia/Shanghai',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    }).format(date)
                  : uiText('未记录时间');
                const clockText = valid
                  ? new Intl.DateTimeFormat(document.documentElement.lang, {
                      timeZone: 'Asia/Shanghai',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    }).format(date)
                  : '';
                return `<div class="history-stop"><div class="history-point"><time class="study-visited" ${valid ? `datetime="${date.toISOString()}"` : ''}>${esc(dateText)} <span>${esc(clockText)}</span></time></div><div class="study-course">${card(c)}<div class="study-card-footer"><span data-original-content>${esc(c.last_opened_title || c.subject || c.teacher)}</span></div></div></div>`;
              })
              .join(
                '',
              )}</div><p class="study-disclaimer">${uiText('时间轴显示北京时间，每门课程仅保留最近一次访问，不代表观看时长。')}</p>`
          : `<div class="history-empty" role="status"><p>${uiText('暂无学习记录')}</p><a href="#/courses">${uiText('发现课程 →')}</a></div>`
      }`;
    bindCards();
    host.querySelector('#history-clear').onclick = () => {
      dialog.querySelector('.history-error').textContent = '';
      dialog.showModal();
      cancel.focus();
    };
    const scroller = host.querySelector('.history-timeline'),
      arrows = host.querySelector('.history-scroll-actions');
    if (!scroller) {
      arrows.hidden = true;
      return;
    }
    const prev = host.querySelector('[data-history-prev]'),
      next = host.querySelector('[data-history-next]');
    const sync = () => {
      const max = scroller.scrollWidth - scroller.clientWidth;
      arrows.hidden = max <= 1;
      prev.disabled = scroller.scrollLeft <= 1;
      next.disabled = scroller.scrollLeft >= max - 1;
    };
    const scroll = (direction) =>
      scroller.scrollBy({
        left:
          direction * (scroller.querySelector('.history-stop').getBoundingClientRect().width + 20),
        behavior: behavior(),
      });
    prev.onclick = () => scroll(-1);
    next.onclick = () => scroll(1);
    scroller.onscroll = sync;
    scroller.onkeydown = (e) => {
      if (e.target !== scroller) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') scroll(e.key === 'ArrowLeft' ? -1 : 1);
        else
          scroller.scrollTo({
            left: e.key === 'Home' ? 0 : scroller.scrollWidth,
            behavior: behavior(),
          });
      }
    };
    observer = new ResizeObserver(sync);
    observer.observe(scroller);
    frame = requestAnimationFrame(sync);
  }
  cancel.onclick = () => dialog.close();
  dialog.oncancel = (e) => {
    if (busy) e.preventDefault();
  };
  dialog.onclose = () => {
    if (live())
      (host.querySelector('#history-clear:not(:disabled)') || host.querySelector('h2')).focus({
        preventScroll: true,
      });
  };
  confirm.onclick = async () => {
    if (busy) return;
    busy = true;
    cancel.disabled = confirm.disabled = true;
    dialog.querySelector('.history-error').textContent = '';
    try {
      await api('/api/me/history', { method: 'DELETE' });
      if (!live()) return;
      d.learning = [];
      onHistoryCleared();
      dialog.close();
      draw();
      host.querySelector('h2').focus({ preventScroll: true });
      toast(uiText('历史记录已清除'));
    } catch (error) {
      if (live()) dialog.querySelector('.history-error').textContent = error.message;
    } finally {
      busy = false;
      cancel.disabled = confirm.disabled = false;
    }
  };
  draw();
  return () => {
    disposed = true;
    observer?.disconnect();
    cancelAnimationFrame(frame);
    dialog.close();
    dialog.remove();
  };
}
