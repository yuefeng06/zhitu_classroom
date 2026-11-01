import { videoCatalog } from './catalog.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import './config.mjs';
import { openDatabase } from './database.mjs';
import { fileURLToPath } from 'node:url';
import { loadMedia } from './media.mjs';

const PORT = process.env.PORT || 3000;
const root = fileURLToPath(new URL('../', import.meta.url));
import { createApi } from './backend.mjs';
const db = await openDatabase();
const api = createApi(
  db,
  loadMedia(process.env.MEDIA_CONFIG_PATH || join(root, 'media-sources.json')),
);
const assets = {
  '/admin.js': 'frontend/js/admin.js',
  '/admin-user.js': 'frontend/js/admin-user.js',
  '/admin-learning.js': 'frontend/js/admin-learning.js',
  '/published-articles.js': 'frontend/js/published-articles.js',
  '/article-markdown.js': 'frontend/js/article-markdown.js',
  '/course-image.js': 'frontend/js/course-image.js',
  '/history.js': 'frontend/js/history.js',
  '/checkin-calendar.js': 'frontend/js/checkin-calendar.js',
  '/study-collection.js': 'frontend/js/study-collection.js',
  '/handwriting.js': 'frontend/js/handwriting.js',
  '/handwriting-data.js': 'frontend/js/handwriting-data.js',
  '/licenses/ARPHICPL.txt': 'licenses/ARPHICPL.txt',
  '/licenses/handwriting-sources.md': 'licenses/handwriting-sources.md',
  '/search.js': 'frontend/js/search.js',
  '/auth.js': 'frontend/js/auth.js',
  '/avatar.js': 'frontend/js/avatar.js',
  '/home.js': 'frontend/js/home.js',
  '/theme.css': 'frontend/css/theme.css',
  '/logo-mark.svg': 'frontend/assets/logo-mark.svg',
  '/logo.svg': 'frontend/assets/logo.svg',
  '/select-menu.js': 'frontend/js/select-menu.js',
  '/study-posts.js': 'frontend/js/study-posts.js',
  '/navigation.js': 'frontend/js/navigation.js',
  '/avatar-cheese.jpg': 'avatar-cheese.jpg',
  '/account.js': 'frontend/js/account.js',
  '/profile.js': 'frontend/js/profile.js',
  '/experience.js': 'frontend/js/experience.js',
  '/landscape.svg': 'frontend/assets/landscape.svg',
  '/studio.js': 'frontend/js/studio.js',
  '/studio.css': 'frontend/css/studio.css',
  '/': 'frontend/index.html',
  '/index.html': 'frontend/index.html',
  '/app.js': 'frontend/js/app.js',
  '/player.js': 'frontend/js/player.js',
  '/motion.js': 'frontend/js/motion.js',
  '/styles.css': 'frontend/css/styles.css',
};
for (const id of new Set([9, ...videoCatalog.map((c) => c.id)]))
  assets['/course-images/' + id + '.jpg'] = 'frontend/assets/course-images/' + id + '.jpg';
for (const name of ['high-school', 'graduate', 'civil', 'technology'])
  assets['/discovery-images/' + name + '.jpg'] =
    'frontend/assets/discovery-images/' + name + '.jpg';
const mime = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const server = http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await db.withRequest(() => api(req, res, url));
      let file = assets[url.pathname];
      if (!file || !['GET', 'HEAD'].includes(req.method))
        return res.writeHead(404).end('Not found');
      let content;
      try {
        content = await readFile(join(root, file));
      } catch (error) {
        if (file !== 'avatar-cheese.jpg' || error.code !== 'ENOENT') throw error;
        file = 'frontend/assets/logo-mark.svg';
        content = await readFile(join(root, file));
      }
      res.writeHead(200, {
        'Content-Type': mime[extname(file)],
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      console.error(error);
      res
        .writeHead(500, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: '服务器内部错误' }));
    }
  })
  .listen(PORT, () => console.log(`知途课堂已启动：http://localhost:${server.address().port}`));

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
