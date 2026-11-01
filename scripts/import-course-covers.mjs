import { readFile, writeFile, mkdir } from 'node:fs/promises';
const catalog = JSON.parse(
  await readFile(new URL('../database/video-catalog.json', import.meta.url), 'utf8'),
);
const requested = process.argv
  .find((a) => a.startsWith('--ids='))
  ?.slice(6)
  .split(',')
  .map(Number);
const allCourses = catalog;
if (requested?.some((id) => !allCourses.some((c) => c.id === id))) throw Error('存在未知课程编号');
const courses = requested ? allCourses.filter((c) => requested.includes(c.id)) : allCourses;
await mkdir(new URL('../frontend/assets/course-images/', import.meta.url), { recursive: true });
const sources = [];
for (let i = 0; i < courses.length; i += 3) {
  const rows = await Promise.all(
    courses.slice(i, i + 3).map(async (c) => {
      const response = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + c.bvid, {
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      const fallback = data.code !== 0 || !data.data?.pic;
      if (fallback && c.id !== 9) throw Error('Missing original cover ' + c.id);
      const url = fallback
        ? 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fm=jpg&w=640&h=360&fit=crop&q=80'
        : data.data.pic.replace(/^http:/, 'https:') + '@640w_360h_1c.jpg';
      const image = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!image.ok) throw Error('Image failed ' + c.id);
      const bytes = Buffer.from(await image.arrayBuffer());
      if (bytes[0] !== 255 || bytes[1] !== 216) throw Error('Invalid JPEG ' + c.id);
      await writeFile(
        new URL('../frontend/assets/course-images/' + c.id + '.jpg', import.meta.url),
        bytes,
      );
      return {
        id: c.id,
        title: c.title,
        source: fallback
          ? 'https://unsplash.com/photos/mathematics-computation-05A-kdOH6Hw'
          : 'https://www.bilibili.com/video/' + c.bvid + '/',
        image: url,
        credit: fallback ? 'Antoine Dautry / Unsplash' : data.data.owner.name,
        bytes: bytes.length,
      };
    }),
  );
  sources.push(...rows);
  console.log('Covers ' + sources.length + '/' + courses.length);
}
const file = new URL('../database/cover-sources.json', import.meta.url);
const previous = requested ? JSON.parse(await readFile(file, 'utf8')) : [];
const combined = new Map(previous.map((row) => [row.id, row]));
for (const row of sources) combined.set(row.id, row);
await writeFile(
  file,
  JSON.stringify(
    [...combined.values()].sort((a, b) => a.id - b.id),
    null,
    2,
  ) + '\n',
);
