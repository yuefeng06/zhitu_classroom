import '../backend/config.mjs';
import { openDatabase } from '../backend/database.mjs';
import { editorialEntries } from './editorial-entries.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const db = await openDatabase();
try {
  const previous = await db.all('SELECT * FROM admin_articles');
  const entries = await editorialEntries();
  const missing = entries.filter((e) => !previous.some((p) => p.source_url === e.source_url));
  if (missing.some((e) => Buffer.byteLength(e.content, 'utf8') > 65000))
    throw Error('正文超出 TEXT 容量');
  console.log(
    JSON.stringify({
      database: db.dialect,
      existing: previous.length,
      toImport: missing.length,
      apply: process.argv.includes('--apply'),
    }),
  );
  if (process.argv.includes('--apply') && missing.length) {
    const directory = join('data', 'article-backups');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, Date.now() + '.json'), JSON.stringify(previous, null, 2), {
      flag: 'wx',
    });
    await db.transaction(async () => {
      for (const e of missing)
        await db.run(
          'INSERT INTO admin_articles(title,summary,content,source_url,published) VALUES(?,?,?,?,1)',
          e.title,
          e.summary,
          e.content,
          e.source_url,
        );
    });
    console.log('已导入，旧精选与全文可由文章管理维护。');
  }
} finally {
  await db.close();
}
