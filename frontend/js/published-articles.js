import { uiText } from './experience.js';
import { renderArticleMarkdown } from './article-markdown.js';
export async function mountPublishedArticles(host, { api, escapeHtml: esc, isCurrent, toast }) {
  let disposed = false,
    dialog;
  try {
    const rows = await api('/api/articles');
    if (!isCurrent()) return () => {};
    if (rows.length)
      host.innerHTML = `<div class="section-label"><h2>${uiText('学习经验，换个思路')}</h2></div><div class="published-articles">${rows.map((r) => `<button class="published-article ${r.title === '提问的智慧' ? 'published-feature' : ''}" data-article="${r.id}">${r.title === '提问的智慧' ? '<img src="/discovery-images/graduate.jpg" alt="图书馆阅读空间" width="320" height="180">' : ''}<div><h3 data-original-content>${esc(r.title)}</h3><p data-original-content>${esc(r.summary)}</p><span>${uiText('阅读全文 ↗')}</span></div></button>`).join('')}</div>`;
    else host.innerHTML = '<p class="helper">暂无已发布文章。</p>';
    host.querySelectorAll('[data-article]').forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            const article = await api('/api/articles/' + b.dataset.article);
            if (disposed || !isCurrent()) return;
            dialog?.remove();
            dialog = document.createElement('dialog');
            dialog.className = 'published-reader';
            const baseUrl = article.source_url?.includes('catb.org/~esr/faqs/smart-questions')
              ? 'https://github.com/ryanhanwu/How-To-Ask-Questions-The-Smart-Way/blob/master/'
              : article.source_url || 'https://example.invalid/';
            dialog.setAttribute('aria-label', article.title);
            dialog.innerHTML = `<button type="button" class="text-action">${uiText('关闭文章 ×')}</button><h2 data-original-content>${esc(article.title)}</h2><div data-original-content class="published-body">${renderArticleMarkdown(article.content, { baseUrl })}</div>${article.source_url ? `<a href="${esc(article.source_url)}" target="_blank" rel="noopener noreferrer">${uiText('阅读原文')} ↗</a>` : ''}`;
            dialog.querySelectorAll('a[href^="#"]').forEach(
              (link) =>
                (link.onclick = (e) => {
                  e.preventDefault();
                  const id = decodeURIComponent(link.getAttribute('href').slice(1));
                  const target = [...dialog.querySelectorAll('[id]')].find((el) => el.id === id);
                  target?.scrollIntoView({ block: 'start' });
                  target?.focus({ preventScroll: true });
                }),
            );
            document.body.append(dialog);
            if (dialog.querySelector('.published-body > h1')?.textContent === article.title)
              dialog.querySelector(':scope > h2').hidden = true;
            dialog.querySelector('button').onclick = () => dialog.close();
            const opened = dialog;
            dialog.onclose = () => {
              opened.remove();
              if (dialog === opened) dialog = null;
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
