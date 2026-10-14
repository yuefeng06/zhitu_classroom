import { uiText } from './experience.js';

// Search history is browser-local and separated by account, including guests.
export function setupSearch({ api, state, onSearch, escapeHtml: esc }) {
  const form = document.querySelector('.search'),
    input = form.querySelector('#search');
  const panel = document.createElement('div');
  panel.id = 'search-panel';
  panel.className = 'search-panel';
  panel.hidden = true;
  panel.dataset.originalContent = '';
  form.append(panel);
  const clear = form.querySelector('#search-clear');
  const submitButton = form.querySelector('#search-submit');
  const teaser = document.createElement('span');
  teaser.className = 'search-teaser';
  teaser.dataset.originalContent = '';
  teaser.setAttribute('aria-hidden', 'true');
  form.append(teaser);
  input.removeAttribute('placeholder');
  submitButton.dataset.originalContent = '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let courses = [],
    courseIndex = 0,
    rotationTimer,
    teaserAnimation,
    hovering = false,
    suspended = false;
  function stopRotation() {
    clearTimeout(rotationTimer);
    teaserAnimation?.cancel();
  }
  function scheduleRotation() {
    clearTimeout(rotationTimer);
    if (
      suspended ||
      document.hidden ||
      reduced.matches ||
      hovering ||
      form.contains(document.activeElement) ||
      input.value ||
      courses.length < 2
    )
      return;
    rotationTimer = setTimeout(() => {
      courseIndex = (courseIndex + 1) % courses.length;
      drawTeaser(true);
      scheduleRotation();
    }, 5000);
  }
  function drawTeaser(animate = false) {
    const course = courses[courseIndex];
    teaser.hidden = !!input.value || document.activeElement === input;
    teaser.textContent = course?.title || uiText('浏览全部课程');
    teaser.dataset.courseId = course?.id || '';
    const action = input.value
      ? uiText('搜索')
      : course
        ? uiText('打开课程') + '：' + course.title
        : uiText('浏览全部课程');
    submitButton.setAttribute('aria-label', action);
    submitButton.title = action;
    teaserAnimation?.cancel();
    if (animate && !teaser.hidden && !reduced.matches)
      teaserAnimation = teaser.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 360, easing: 'ease-out' },
      );
  }
  api('/api/courses')
    .then((rows) => {
      courses = rows.filter((c) => c.id && c.title);
      drawTeaser();
      scheduleRotation();
    })
    .catch(() => {
      drawTeaser();
    });
  form.addEventListener('pointerenter', () => {
    hovering = true;
    stopRotation();
  });
  form.addEventListener('pointerleave', () => {
    hovering = false;
    scheduleRotation();
  });
  form.addEventListener('focusin', () => {
    stopRotation();
    drawTeaser();
  });
  form.addEventListener('focusout', () => {
    queueMicrotask(() => {
      drawTeaser();
      scheduleRotation();
    });
  });
  document.addEventListener('visibilitychange', () => {
    stopRotation();
    scheduleRotation();
  });
  reduced.addEventListener('change', () => {
    stopRotation();
    drawTeaser();
    scheduleRotation();
  });
  // The header persists across SPA routes; pause its timer while the page is suspended.
  addEventListener('pagehide', () => {
    suspended = true;
    stopRotation();
  });
  addEventListener('pageshow', () => {
    suspended = false;
    scheduleRotation();
  });
  drawTeaser();
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'search-options');
  input.setAttribute('aria-expanded', 'false');
  let options = [],
    active = -1,
    timer,
    controller,
    revision = 0,
    composing = false;
  const memory = new Map();
  const key = () => `zhitu-search-history:${state.user?.id ?? 'guest'}`;
  const normalize = (value) => value.trim().replace(/\s+/g, ' ').slice(0, 100);
  function history() {
    if (memory.has(key())) return memory.get(key());
    try {
      const value = JSON.parse(localStorage.getItem(key()) || '[]');
      return Array.isArray(value)
        ? value
            .filter((x) => typeof x === 'string' && x.trim())
            .map(normalize)
            .slice(0, 8)
        : [];
    } catch {
      return memory.get(key()) || [];
    }
  }
  function save(items) {
    memory.set(key(), items);
    try {
      localStorage.setItem(key(), JSON.stringify(items));
    } catch {}
  }
  function remember(value) {
    const q = normalize(value);
    if (q)
      save(
        [q, ...history().filter((x) => x.toLocaleLowerCase() !== q.toLocaleLowerCase())].slice(
          0,
          8,
        ),
      );
  }
  function close() {
    clearTimeout(timer);
    controller?.abort();
    revision++;
    panel.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function highlight(value, q) {
    const text = String(value || ''),
      at = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
    return q && at >= 0
      ? esc(text.slice(0, at)) +
          '<mark>' +
          esc(text.slice(at, at + q.length)) +
          '</mark>' +
          esc(text.slice(at + q.length))
      : esc(text);
  }
  function render(items, title, message = '') {
    options = items;
    active = -1;
    input.removeAttribute('aria-activedescendant');
    panel.innerHTML = `<div class="search-panel-heading"><span>${esc(uiText(title))}</span>${title === '最近搜索' && items.length ? '<button type="button" id="search-history-clear" aria-label="' + esc(uiText('清空历史')) + '" title="' + esc(uiText('清空历史')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg></button>' : ''}</div><div id="search-options" role="listbox" aria-label="${esc(uiText('搜索建议'))}">${items.map((item, i) => `<button type="button" role="option" aria-selected="false" tabindex="-1" id="search-option-${i}" data-search-option="${i}"><span class="search-option-icon" aria-hidden="true">${item.id ? '↗' : '↶'}</span><span class="search-option-copy"><span>${highlight(item.title, input.value.trim())}</span>${item.meta ? '<small>' + esc(item.meta) + '</small>' : ''}</span></button>`).join('')}</div>${message ? '<p class="search-message" role="status">' + esc(uiText(message)) + '</p>' : ''}${input.value.trim() ? '<button type="button" id="search-all">' + esc(uiText('查看全部搜索结果')) + ' <span aria-hidden="true">→</span></button>' : '<p class="search-footnote">' + esc(uiText('搜索历史仅保存在当前浏览器')) + '</p>'}`;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  async function suggest() {
    clearTimeout(timer);
    controller?.abort();
    const ticket = ++revision,
      q = normalize(input.value);
    clear.hidden = !input.value;
    drawTeaser();
    if (!q) {
      render(
        history().map((title) => ({ title })),
        '最近搜索',
        history().length ? '' : '输入课程、讲师或学科开始搜索',
      );
      return;
    }
    render([], '课程提示', '正在查找课程…');
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const rows = await api('/api/courses?' + new URLSearchParams({ q }), {
          signal: controller.signal,
        });
        if (ticket !== revision) return;
        render(
          rows.slice(0, 6).map((c) => ({
            id: c.id,
            title: c.title,
            meta: c.teacher + ' · ' + uiText(c.category),
          })),
          '课程提示',
          rows.length ? '' : '没有找到匹配课程，试试其他关键词',
        );
      } catch {
        if (ticket === revision) render([], '课程提示', '暂时无法加载提示，仍可回车搜索');
      }
    }, 180);
  }
  function submit() {
    const q = normalize(input.value);
    input.value = q;
    remember(q);
    close();
    input.blur();
    drawTeaser();
    if (!q && courses[courseIndex]) location.hash = '#/video/' + courses[courseIndex].id;
    else onSearch(q);
  }
  function choose(index) {
    const item = options[index];
    if (!item) return;
    if (item.id) {
      remember(input.value);
      close();
      input.blur();
      location.hash = '#/video/' + item.id;
    } else {
      input.value = item.title;
      submit();
    }
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!composing) submit();
  };
  input.addEventListener('focus', () => {
    if (panel.hidden) suggest();
  });
  input.addEventListener('input', (e) => {
    clear.hidden = !input.value;
    drawTeaser();
    scheduleRotation();
    if (!composing && !e.isComposing) suggest();
  });
  input.addEventListener('compositionstart', () => {
    composing = true;
    close();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    suggest();
  });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || composing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!panel.hidden && active >= 0) choose(active);
      else submit();
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    if (panel.hidden) {
      suggest();
      return;
    }
    if (!options.length) return;
    active =
      (active + (e.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + options.length) %
      options.length;
    panel
      .querySelectorAll('[role=option]')
      .forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', 'search-option-' + active);
    panel.querySelector('#search-option-' + active).scrollIntoView({ block: 'nearest' });
  });
  clear.onclick = () => {
    input.value = '';
    input.focus();
    suggest();
  };
  panel.addEventListener('click', (e) => {
    const option = e.target.closest('[data-search-option]');
    if (option) choose(Number(option.dataset.searchOption));
    else if (e.target.closest('#search-history-clear')) {
      save([]);
      input.focus();
      suggest();
    } else if (e.target.closest('#search-all')) submit();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!form.contains(e.target)) close();
  });
  form.addEventListener('focusout', (e) => {
    if (!form.contains(e.relatedTarget)) close();
  });
  let lastLanguage = document.documentElement.lang;
  const languageObserver = new MutationObserver(() => {
    const next = document.documentElement.lang;
    if (next === lastLanguage) return;
    lastLanguage = next;
    drawTeaser();
    if (!panel.hidden) suggest();
  });
  languageObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  });
  return {
    close,
    sync() {
      clear.hidden = !input.value;
      close();
      drawTeaser();
      scheduleRotation();
    },
  };
}
