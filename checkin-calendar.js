import { uiText } from './experience.js';

const shift = (date, n) =>
  new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export function mountCheckinCalendar(host, { api, user, escapeHtml: esc, toast }) {
  let data,
    disposed = false,
    busy = false,
    revision = 0;
  const resize = new ResizeObserver(() => {
    const scroll = host.querySelector('.checkin-scroll');
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
  });
  resize.observe(host);
  host.className = 'checkin-panel';
  host.innerHTML =
    '<div class="checkin-heading"><div><span class="kicker">ONE DAY AT A TIME</span><h2>每天一点，慢慢积累</h2><p>留下今天的学习印记，按自己的节奏前进。</p></div><button id="checkin-action" type="button" class="soft-button"></button></div><div id="checkin-content"></div>';
  const action = host.querySelector('#checkin-action'),
    content = host.querySelector('#checkin-content');
  function paint() {
    if (disposed) return;
    action.disabled = busy || !!data?.checkedToday;
    action.textContent = uiText(
      !user ? '登录后打卡' : busy ? '正在保存…' : data?.checkedToday ? '今日已打卡' : '今日打卡',
    );
    if (!user) {
      content.innerHTML =
        '<p class="helper">' + uiText('登录后查看打卡日历，记录会随账号保存。') + '</p>';
      return;
    }
    if (!data) return;
    const checked = new Set(data.dates),
      offset = (new Date(data.start + 'T00:00:00Z').getUTCDay() + 6) % 7,
      weeks = Math.ceil((offset + 365) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => {
      const index = i - offset;
      if (index < 0 || index >= 365)
        return '<span class="checkin-spacer" aria-hidden="true"></span>';
      const date = shift(data.start, index),
        done = checked.has(date),
        label = date + ' · ' + uiText(done ? '已打卡' : '未打卡');
      return (
        '<button type="button" class="checkin-day' +
        (done ? ' checked' : '') +
        (date === data.today ? ' today' : '') +
        '" data-date="' +
        date +
        '" title="' +
        esc(label) +
        '" aria-label="' +
        esc(label) +
        '" tabindex="' +
        (date === data.today ? '0' : '-1') +
        '"></button>'
      );
    }).join('');
    const months = Array.from({ length: weeks }, (_, w) => {
      const day = shift(data.start, w * 7 - offset);
      let label = '';
      for (let n = 0; n < 7; n++) {
        const date = shift(day, n);
        if (
          date >= data.start &&
          date <= data.today &&
          (date.endsWith('-01') || date === data.start)
        )
          label = new Intl.DateTimeFormat(document.documentElement.lang, {
            month: 'short',
            timeZone: 'UTC',
          }).format(new Date(date + 'T00:00:00Z'));
      }
      return '<span>' + esc(label) + '</span>';
    }).join('');
    content.innerHTML =
      '<div class="checkin-stats"><span>' +
      uiText('近 365 天') +
      ' · ' +
      uiText('已打卡') +
      ' <b>' +
      data.total +
      '</b> ' +
      uiText('天') +
      '</span><span>' +
      uiText('连续打卡') +
      ' <b>' +
      data.streak +
      '</b> ' +
      uiText('天') +
      '</span></div><div class="checkin-scroll" tabindex="0" role="group" aria-label="' +
      uiText('近一年打卡日历，可左右滚动') +
      '"><div class="checkin-months" style="--weeks:' +
      weeks +
      '" aria-hidden="true">' +
      months +
      '</div><div class="checkin-chart"><div class="checkin-weekdays" aria-hidden="true">' +
      ['一', '二', '三', '四', '五', '六', '日']
        .map((d) => '<span>' + uiText('周' + d) + '</span>')
        .join('') +
      '</div><div class="checkin-grid">' +
      cells +
      '</div></div></div><div class="checkin-caption"><span id="checkin-day-detail" role="status">' +
      esc(data.today) +
      ' · ' +
      uiText(data.checkedToday ? '已打卡' : '未打卡') +
      '</span><span class="checkin-legend"><i></i>' +
      uiText('未打卡') +
      ' <i class="checked"></i>' +
      uiText('已打卡') +
      '</span></div><p class="checkin-note">' +
      uiText('按北京时间每日打卡一次；只记录主动打卡，不代表观看时长或课程完成度。') +
      '</p>';
    const days = [...content.querySelectorAll('.checkin-day')];
    const select = (button) => {
      days.forEach((b) => {
        b.tabIndex = b === button ? 0 : -1;
        b.classList.toggle('selected', b === button);
      });
      content.querySelector('#checkin-day-detail').textContent = button.title;
    };
    days.forEach((button, i) => {
      button.onclick = () => select(button);
      button.onkeydown = (e) => {
        const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (delta !== undefined || ['Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const target =
            days[
              e.key === 'Home' ? 0 : e.key === 'End' ? 364 : Math.max(0, Math.min(364, i + delta))
            ];
          select(target);
          target.focus();
        }
      };
    });
    const scroll = content.querySelector('.checkin-scroll');
    scroll.scrollLeft = scroll.scrollWidth;
  }
  async function refresh() {
    if (!user || disposed || busy) return;
    const ticket = ++revision;
    try {
      const next = await api('/api/me/checkins');
      if (disposed || ticket !== revision) return;
      data = next;
      paint();
    } catch (e) {
      if (!disposed && ticket === revision) {
        data = undefined;
        content.textContent = uiText('暂时无法加载打卡记录，请重试。');
        action.disabled = false;
        action.textContent = uiText('重新加载');
      }
    }
  }
  action.onclick = async () => {
    if (!user) {
      document.querySelector('#auth').showModal();
      return;
    }
    if (!data) {
      await refresh();
      return;
    }
    if (busy || data.checkedToday) return;
    busy = true;
    revision++;
    paint();
    try {
      data = await api('/api/me/checkins', { method: 'POST', body: '{}' });
      if (!disposed) toast(uiText('今天的努力，已记下。'));
    } catch (e) {
      if (!disposed) toast(e.message);
    } finally {
      busy = false;
      paint();
    }
  };
  paint();
  refresh();
  const onVisible = () => {
    if (!document.hidden) refresh();
  };
  let lastLanguage = document.documentElement.lang;
  const languageObserver = new MutationObserver(() => {
    const next = document.documentElement.lang;
    if (next !== lastLanguage) {
      lastLanguage = next;
      paint();
    }
  });
  languageObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  });
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const timer = setInterval(() => {
    if (
      !document.hidden &&
      data &&
      new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) !== data.today
    )
      refresh();
  }, 60000);
  return () => {
    disposed = true;
    resize.disconnect();
    languageObserver.disconnect();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    action.onclick = null;
  };
}
