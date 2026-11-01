import { posts } from '../frontend/js/study-posts.js';
import { readFile } from 'node:fs/promises';
export async function editorialEntries() {
  const entries = posts.map((p) => ({
    title: p.title,
    summary: p.summary,
    source_url: p.url,
    content: [
      `作者：${p.author}\n来源：${p.source}\n原文：${p.original}`,
      p.summary,
      ...p.points,
      `原文摘录：\n${p.quote || ''}\n\n中文译文：\n${p.translation || ''}`,
      `练习建议：\n${p.practice}`,
    ].join('\n\n'),
  }));
  entries.push({
    title: '提问的智慧',
    summary: '阅读完整指南，了解如何准备、描述与追问。Eric S. Raymond · Rick Moen / 中文译本。',
    source_url: 'http://www.catb.org/~esr/faqs/smart-questions.html',
    content: await readFile(new URL('../articles/README-zh_CN.md', import.meta.url), 'utf8'),
  });

  return entries;
}
