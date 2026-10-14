import { readFileSync } from 'node:fs';
import { catalogSources } from './catalog.mjs';

export function loadMedia(file) {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const validate = (source) => {
    if (!source || typeof source.label !== 'string') throw Error('视频源需要 label');
    if (source.kind === 'bilibili') {
      if (
        !/^BV[0-9A-Za-z]{10}$/.test(source.bvid) ||
        !Number.isInteger(source.page) ||
        source.page < 1
      )
        throw Error('Bilibili 视频编号或分P无效');
      if (source.cid !== undefined && (!Number.isSafeInteger(source.cid) || source.cid <= 0))
        throw Error('Bilibili 分集 cid 无效');
      return {
        video_kind: 'bilibili',
        video_url: null,
        embed_url: `https://player.bilibili.com/player.html?bvid=${source.bvid}&page=${source.page}${source.cid ? `&cid=${source.cid}` : ''}&autoplay=0&high_quality=1`,
        video_label: source.label,
        source_page: `https://www.bilibili.com/video/${source.bvid}/?p=${source.page}`,
        is_demo: false,
      };
    }
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw Error('视频源必须是 HTTP(S) 直链');
    if (source.sourcePage && !['http:', 'https:'].includes(new URL(source.sourcePage).protocol))
      throw Error('来源页面地址无效');
    return {
      video_kind: 'direct',
      video_url: url.href,
      video_label: source.label,
      source_page: source.sourcePage || null,
      is_demo: source.demo === true,
    };
  };
  const fallback = config.default ? validate(config.default) : null;
  const chapters = Object.fromEntries(
    Object.entries({ ...catalogSources, ...config.chapters }).map(([id, source]) => [
      id,
      validate(source),
    ]),
  );
  return (chapter) => ({
    ...chapter,
    ...(chapters[chapter.id] ||
      fallback || {
        video_url: null,
        video_label: '本节视频尚未发布',
        source_page: null,
        is_demo: false,
      }),
  });
}
