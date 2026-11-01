import { handwritingData } from './handwriting-data.js';

let nextDrawing = 0;
export function mountHandwriting(host) {
  const phrase = '按自己的节奏学习',
    drawing = host.querySelector('.motto-drawing'),
    replay = host.querySelector('.motto-replay');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'),
    id = ++nextDrawing;
  let animations = [],
    disposed = false,
    run = 0;
  drawing.innerHTML = [...phrase]
    .map((character, index) => {
      const data = handwritingData[character];
      const outlines = data.strokes.map((path) => `<path d="${path}"/>`).join('');
      const strokes = data.strokes
        .map((path, j) => {
          const clip = `ink-${id}-${index}-${j}`,
            median = data.medians[j].map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
          return `<clipPath id="${clip}"><path d="${path}"/></clipPath><path class="writing-stroke" clip-path="url(#${clip})" d="${median}" fill="none" stroke="currentColor" stroke-width="200" stroke-linecap="round" stroke-linejoin="round"/>`;
        })
        .join('');
      return `<svg class="motto-character" data-character="${character}" viewBox="0 0 1024 1024" focusable="false"><g transform="translate(0 900) scale(1 -1)"><g class="writing-outline">${outlines}</g>${strokes}</g></svg>`;
    })
    .join('');
  const characters = [...drawing.querySelectorAll('svg')];
  const strokes = [...drawing.querySelectorAll('.writing-stroke')].map((path) => ({
    path,
    length: path.getTotalLength() + 210,
  }));
  for (const { path, length } of strokes) {
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = '0';
  }
  host.classList.add('writing-ready');
  function cancel() {
    run++;
    animations.forEach((animation) => animation.cancel());
    animations = [];
  }
  function finish() {
    cancel();
    host.dataset.writing = 'complete';
    for (const { path } of strokes) path.style.strokeDashoffset = '0';
  }
  function play() {
    cancel();
    replay.hidden = reduced.matches;
    if (disposed) return;
    if (reduced.matches || typeof drawing.animate !== 'function') {
      finish();
      return;
    }
    const current = run;
    host.dataset.writing = 'active';
    let delay = 220;
    for (const character of characters) {
      const paths = [...character.querySelectorAll('.writing-stroke')];
      // Keep the pace of each character similar while respecting stroke order.
      const duration = Math.min(145, 620 / paths.length);
      for (const path of paths) {
        const length = path.getTotalLength() + 210;
        path.style.strokeDashoffset = '0';
        animations.push(
          path.animate([{ strokeDashoffset: String(length) }, { strokeDashoffset: '0' }], {
            duration,
            delay,
            fill: 'both',
            easing: 'linear',
          }),
        );
        delay += duration;
      }
      delay += 80;
    }
    animations.at(-1)?.finished.then(
      () => {
        if (!disposed && current === run) finish();
      },
      () => {},
    );
  }
  const reflect = () => {
    replay.hidden = reduced.matches;
    if (reduced.matches) finish();
  };
  reduced.addEventListener('change', reflect);
  replay.onclick = play;
  play();
  return () => {
    disposed = true;
    cancel();
    reduced.removeEventListener('change', reflect);
    replay.onclick = null;
  };
}
