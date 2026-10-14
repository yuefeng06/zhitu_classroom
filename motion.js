export function createMotion(app) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const tracked = new Set(),
    animations = new Map();
  let pageAnimation;
  const cancel = (element) => {
    animations.get(element)?.cancel();
    animations.delete(element);
  };
  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const { target, isIntersecting, boundingClientRect } of entries) {
              cancel(target);
              if (isIntersecting && !reduced.matches && !target.contains(document.activeElement)) {
                const offset = boundingClientRect.top < 0 ? -14 : 18;
                const animation = target.animate(
                  [
                    { opacity: 0.28, translate: `0 ${offset}px` },
                    { opacity: 1, translate: '0 0' },
                  ],
                  { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' },
                );
                animations.set(target, animation);
                animation.onfinish = () => animations.delete(target);
              }
            }
          },
          { threshold: 0.08 },
        )
      : null;
  function refresh() {
    for (const element of tracked)
      if (!element.isConnected) {
        observer?.unobserve(element);
        cancel(element);
        tracked.delete(element);
      }
    if (!observer) return;
    app
      .querySelectorAll(
        '.card,.hero-copy,.group-heading,.title,.continue,.empty-state,.description,.notes-panel,.path-card,.study-stats,.home-panel,.home-direction-grid>a,.study-post,.personal-notes,.focus-panel,.discovery-card',
      )
      .forEach((element) => {
        if (!tracked.has(element)) {
          tracked.add(element);
          observer.observe(element);
        }
      });
    updateScroll();
  }
  reduced.addEventListener('change', () => {
    pageAnimation?.cancel();
    for (const element of animations.keys()) cancel(element);
    updateScroll();
  });
  app.addEventListener('focusin', (event) => {
    for (const element of animations.keys()) if (element.contains(event.target)) cancel(element);
  });
  const top = document.querySelector('#back-to-top'),
    progress = document.querySelector('#page-progress');
  const scenery = document.querySelector('.landscape-image');
  let scheduled = false;
  function updateScroll() {
    const length = document.documentElement.scrollHeight - innerHeight;
    if (scenery)
      scenery.style.transform = `translate3d(0,${reduced.matches ? 0 : -Math.min(180, (Math.max(0, scrollY) / Math.max(length, innerHeight)) * 180)}px,0)`;
    progress.style.transform = `scaleX(${length > 0 ? Math.min(1, scrollY / length) : 0})`;
    const visible = scrollY > 450;
    top.classList.toggle('visible', visible);
    top.tabIndex = visible ? 0 : -1;
    top.setAttribute('aria-hidden', String(!visible));
    document.querySelector('header').classList.toggle('is-scrolled', scrollY > 20);
  }
  addEventListener(
    'scroll',
    () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          updateScroll();
        });
      }
    },
    { passive: true },
  );
  addEventListener('resize', updateScroll);
  top.onclick = () => scrollTo({ top: 0, behavior: reduced.matches ? 'instant' : 'smooth' });
  document.addEventListener(
    'click',
    (event) => {
      if (reduced.matches) return;
      const target = event.target.closest('button,.main-button,.spotlight-action');
      if (!target || target.disabled || target.closest('#account-panel') || target.id === 'account')
        return;
      const rect = target.getBoundingClientRect(),
        dot = document.createElement('span');
      dot.className = 'interaction-pulse';
      dot.setAttribute('aria-hidden', 'true');
      dot.style.left = (event.detail ? event.clientX : rect.left + rect.width / 2) + 'px';
      dot.style.top = (event.detail ? event.clientY : rect.top + rect.height / 2) + 'px';
      document.body.append(dot);
      const effect = dot.animate(
        [
          { opacity: 0.55, transform: 'translate(-50%,-50%) scale(.2)' },
          { opacity: 0, transform: 'translate(-50%,-50%) scale(1.7)' },
        ],
        { duration: 480, easing: 'ease-out' },
      );
      effect.finished.then(
        () => dot.remove(),
        () => dot.remove(),
      );
    },
    true,
  );
  return {
    refresh,
    page() {
      refresh();
      pageAnimation?.cancel();
      if (!reduced.matches)
        pageAnimation = app.animate([{ opacity: 0.6 }, { opacity: 1 }], {
          duration: 220,
          easing: 'ease-out',
        });
    },
  };
}
