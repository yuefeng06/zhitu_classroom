export function setupNavigation() {
  const primary = document.querySelector('#primary-nav');
  const bars = [primary, document.querySelector('#mobile-nav')].map((nav) => {
    const pill = document.createElement('span');
    pill.className = 'nav-slider';
    pill.setAttribute('aria-hidden', 'true');
    nav.prepend(pill);
    return { nav, pill };
  });
  // The header persists across routes. Preview changes only the pill, never the route or aria-current.
  const hoverInput = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const events = new AbortController();
  let scheduled = false,
    frame,
    hovered = null,
    disposed = false;
  function measure() {
    scheduled = false;
    if (disposed) return;
    for (const { nav, pill } of bars) {
      const active =
        nav === primary
          ? hovered || nav.querySelector('a.active')
          : nav.querySelector('a.selected');
      if (!active || !nav.offsetWidth) {
        pill.hidden = true;
        nav.classList.remove('slider-ready');
        continue;
      }
      // Retain fractional flex widths and measure from the pill's containing block.
      const rect = active.getBoundingClientRect(),
        host = nav.getBoundingClientRect();
      pill.hidden = false;
      pill.style.width = rect.width + 'px';
      pill.style.height = rect.height + 'px';
      pill.style.transform = `translate3d(${rect.left - host.left - nav.clientLeft + nav.scrollLeft}px,${rect.top - host.top - nav.clientTop + nav.scrollTop}px,0)`;
      nav.classList.add('slider-ready');
    }
  }
  function schedule() {
    if (!disposed && !scheduled) {
      scheduled = true;
      frame = requestAnimationFrame(measure);
    }
  }
  function preview(link) {
    if (hovered === link) return;
    hovered?.classList.remove('nav-preview');
    hovered = link;
    hovered?.classList.add('nav-preview');
    schedule();
  }
  const reset = () => preview(null);
  primary.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType !== 'mouse' || !hoverInput.matches) return;
      const link = e.target.closest('a');
      if (link?.parentElement === primary) preview(link);
    },
    { signal: events.signal },
  );
  primary.addEventListener('pointerleave', reset, { signal: events.signal });
  primary.addEventListener('pointercancel', reset, { signal: events.signal });
  primary.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse') reset();
    },
    { signal: events.signal },
  );
  // A mouse press also focuses its link, before click changes the route. Clearing
  // preview here would send the pill back to the old page while the button is held.
  primary.addEventListener(
    'focusin',
    (e) => {
      if (e.target.matches(':focus-visible')) reset();
    },
    { signal: events.signal },
  );
  primary.addEventListener('keydown', reset, { signal: events.signal });
  hoverInput.addEventListener('change', reset, { signal: events.signal });
  addEventListener('blur', reset, { signal: events.signal });
  const observer = new ResizeObserver(schedule);
  for (const { nav } of bars) {
    observer.observe(nav);
    nav.querySelectorAll('a').forEach((a) => observer.observe(a));
  }
  addEventListener('resize', schedule, { signal: events.signal });
  document.fonts?.ready.then(schedule);
  for (const { nav } of bars)
    nav.addEventListener(
      'keydown',
      (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const links = [...nav.querySelectorAll('a')],
          current = links.indexOf(e.target);
        if (current < 0) return;
        e.preventDefault();
        const index =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? links.length - 1
              : (current + (e.key === 'ArrowRight' ? 1 : links.length - 1)) % links.length;
        links[index].focus();
      },
      { signal: events.signal },
    );
  function update(path) {
    reset();
    const active = path.startsWith('#/video/')
      ? '#/courses'
      : path === '#/favorites'
        ? '#/learning'
        : path;
    primary.querySelectorAll('a').forEach((a) => {
      const on = a.getAttribute('href') === active;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    measure();
  }
  update((location.hash || '#/').split('?')[0]);
  return {
    update,
    dispose() {
      disposed = true;
      events.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      hovered?.classList.remove('nav-preview');
      bars.forEach(({ nav, pill }) => {
        pill.remove();
        nav.classList.remove('slider-ready');
      });
    },
  };
}
const segmentPositions = new Map();
export function setupSegments(host, key) {
  const pill = document.createElement('span');
  pill.className = 'segment-slider';
  pill.setAttribute('aria-hidden', 'true');
  host.prepend(pill);
  host.classList.add('sliding-tabs');
  let frame,
    disposed = false;
  const previous = segmentPositions.get(key);
  if (previous) {
    pill.style.width = previous.width + 'px';
    pill.style.transform = 'translateX(' + previous.left + 'px)';
  }
  function measure() {
    if (disposed) return;
    const active = host.querySelector('.on');
    if (!active) return;
    const left = active.offsetLeft,
      width = active.offsetWidth;
    pill.style.width = width + 'px';
    pill.style.height = active.offsetHeight + 'px';
    pill.style.transform = 'translateX(' + left + 'px)';
    segmentPositions.set(key, { left, width });
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(host);
  host.querySelectorAll('button,a').forEach((el) => resize.observe(el));
  const changes = new MutationObserver(schedule);
  changes.observe(host, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    characterData: true,
    childList: true,
  });
  const keydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const buttons = [...host.querySelectorAll('button,a')].filter((b) => !b.disabled),
      current = buttons.indexOf(e.target);
    if (current < 0) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : (current + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  };
  host.addEventListener('keydown', keydown);
  if (previous) {
    void pill.offsetWidth;
    host.classList.add('segments-ready');
    schedule();
  } else {
    measure();
    requestAnimationFrame(() => {
      if (!disposed) host.classList.add('segments-ready');
    });
  }
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    changes.disconnect();
    host.removeEventListener('keydown', keydown);
  };
}
