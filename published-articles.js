import { uiText } from './experience.js';
export async function mountPublishedArticles(host, { api, escapeHtml: esc, isCurrent, toast }) {
  let disposed = false,
    dialog;
  try {
    const rows = await api('/api/articles');
    if (!isCurrent()) return () => {};
    if (rows.length)
      host.innerHTML = `<div class="section-label"><h2>${uiText('学习随笔')}</h2></div><div class="published-articles">${rows.map((r) => `<button class="published-article" data-article="${r.id}"><h3 data-original-content>${esc(r.title)}</h3><p data-original-content>${esc(r.summary)}</p><span>${uiText('阅读全文 ↗')}</span></button>`).join('')}</div>`;
    host.querySelectorAll('[data-article]').forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            const article = await api('/api/articles/' + b.dataset.article);
            if (disposed || !isCurrent()) return;
            dialog?.remove();
            dialog = document.createElement('dialog');
            dialog.className = 'published-reader';
            dialog.innerHTML = `<button type="button" class="text-action">${uiText('关闭文章 ×')}</button><h2 data-original-content>${esc(article.title)}</h2><div data-original-content class="published-body">${esc(article.content)}</div>${article.source_url ? `<a href="${esc(article.source_url)}" target="_blank" rel="noopener noreferrer">${uiText('阅读原文')} ↗</a>` : ''}`;
            document.body.append(dialog);
            dialog.querySelector('button').onclick = () => dialog.close();
            dialog.onclose = () => {
              if (!disposed) b.focus();
            };
            dialog.showModal();
          } catch (e) {
            toast(e.message);
          }
        }),
    );
  } catch (e) {
    if (isCurrent()) host.innerHTML = `<p class="helper">${esc(e.message)}</p>`;
  }
  return () => {
    disposed = true;
    dialog?.close();
    dialog?.remove();
  };
}
