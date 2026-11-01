import { readFileSync } from 'node:fs';
import { writeFile, rename, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { catalogSources } from './catalog.mjs';

export function loadMedia(file) {
  let config = JSON.parse(readFileSync(file, 'utf8'));
  const validate = (source) => {
    if (
      !source ||
      typeof source.label !== 'string' ||
      !source.label.trim() ||
      source.label.length > 500
    )
      throw Error('视频源需要 label');
    if (source.kind === 'local') {
      if (!/^\/api\/videos\/\d+\/[a-f0-9-]{36}\.(mp4|webm)$/.test(source.url))
        throw Error('本地视频地址无效');
      return {
        video_kind: 'direct',
        video_url: source.url,
        video_label: source.label,
        source_page: null,
        is_demo: false,
      };
    }
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
    if (source.kind && source.kind !== 'direct') throw Error('视频类型无效');
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
  const fallback = null; // Never substitute a demo clip for an unconfigured lesson.
  const chapters = Object.fromEntries(
    Object.entries({ ...catalogSources, ...config.chapters }).map(([id, source]) => [
      id,
      validate(source),
    ]),
  );
  const resolve = (chapter) => ({
    ...chapter,
    ...(chapters[chapter.id] ||
      fallback || {
        video_url: null,
        video_label: '本节视频尚未发布',
        source_page: null,
        is_demo: false,
      }),
  });
  const source = (id) => config.chapters?.[id] || catalogSources[id] || null;
  const stamp = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  resolve.source = (id) => ({ source: source(id), version: stamp(source(id)) });
  let pending = Promise.resolve();
  resolve.save = (id, value, expected) => {
    const task = pending.then(async () => {
      if (expected !== stamp(source(id)))
        throw Object.assign(Error('视频源已更新，请重新打开'), { status: 409 });
      let parsed;
      try {
        parsed = validate(value);
      } catch (e) {
        throw Object.assign(e, { status: 400 });
      }
      const next = { ...config, chapters: { ...config.chapters, [id]: value } };
      const backup = join(dirname(file), 'data', 'media-backups');
      await mkdir(backup, { recursive: true });
      await copyFile(file, join(backup, randomUUID() + '.json'));
      const temp = file + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(next, null, 2) + '\n');
      await rename(temp, file);
      config = next;
      chapters[id] = parsed;
      return resolve.source(id);
    });
    pending = task.catch(() => {});
    return task;
  };
  return resolve;
}
