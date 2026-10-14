import { readFileSync } from 'node:fs';

// Committed public metadata: startup works offline and never scrapes video streams.
export const videoCatalog = JSON.parse(
  readFileSync(new URL('./database/video-catalog.json', import.meta.url), 'utf8'),
);
// Explicitly retired courses keep their historical rows and associations.
export const retiredCourseIds = [9];
export const catalogCategories = [
  { name: '高中课程', icon: '高', description: '六大学科，基础与高考复习' },
  { name: '考研课程', icon: '研', description: '公共课、计算机 408 与电路原理' },
  { name: '考公课程', icon: '公', description: '逻辑判断、言语理解与数量关系' },
  { name: '大学与技术公开课', icon: '学', description: '编程、人工智能与大学基础课程' },
];
export const normalizeCategory = (category) =>
  ['计算机课程', '海外公开课'].includes(category)
    ? '大学与技术公开课'
    : category === '考研公共课'
      ? '考研课程'
      : category;
const chapterId = (course, page) => course.id * 10000 + page.page;
const duration = (seconds) =>
  [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((n, i) => (i ? String(n).padStart(2, '0') : String(n)))
    .join(':')
    .replace(/^0:/, '');
export const catalogSources = Object.fromEntries(
  videoCatalog.flatMap((course) =>
    course.pages.map((page) => [
      chapterId(course, page),
      {
        kind: 'bilibili',
        bvid: course.bvid,
        cid: page.cid,
        page: page.page,
        label: `${course.teacher} · ${page.title} · Bilibili 原站播放器`,
      },
    ]),
  ),
);

export function syncVideoCatalog(db) {
  if (
    !db
      .prepare('PRAGMA table_info(courses)')
      .all()
      .some((c) => c.name === 'published')
  )
    db.exec('ALTER TABLE courses ADD COLUMN published INTEGER NOT NULL DEFAULT 1');
  if (
    !db
      .prepare('PRAGMA table_info(courses)')
      .all()
      .some((c) => c.name === 'subject')
  )
    db.exec("ALTER TABLE courses ADD COLUMN subject TEXT NOT NULL DEFAULT ''");
  db.exec('BEGIN');
  try {
    // Hide old demonstration cards without deleting users' notes or learning records.
    db.prepare('UPDATE courses SET published=0 WHERE id BETWEEN 1 AND 8').run();
    db.prepare("UPDATE courses SET category='考研课程',subject='数学' WHERE id=9").run();
    for (const id of retiredCourseIds)
      db.prepare('UPDATE courses SET published=0 WHERE id=?').run(id);
    const courseStatement =
      db.prepare(`INSERT INTO courses(id,title,category,teacher,description,cover,accent,lessons,students,duration,level,published,subject)
      VALUES(?,?,?,?,?,?,?,?,0,?,?,1,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,teacher=excluded.teacher,
      description=excluded.description,cover=excluded.cover,accent=excluded.accent,lessons=excluded.lessons,duration=excluded.duration,level=excluded.level,published=1,subject=excluded.subject`);
    const chapterStatement =
      db.prepare(`INSERT INTO chapters(id,course_id,title,duration,is_free,position) VALUES(?,?,?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,duration=excluded.duration,position=excluded.position`);
    for (const course of videoCatalog) {
      const seconds = course.pages.reduce((sum, page) => sum + page.seconds, 0);
      const time = `${Math.floor(seconds / 3600)}小时${Math.floor(seconds / 60) % 60}分钟`;
      courseStatement.run(
        course.id,
        course.title,
        normalizeCategory(course.category),
        course.teacher,
        `原站课程：${course.sourceTitle}。已收录 ${course.pages.length} 个分集，可在右侧目录切换。使用 Bilibili 原站播放器，播放权限与后续更新以原站为准。`,
        course.cover,
        course.accent,
        course.pages.length,
        time,
        course.level,
        course.subject || '',
      );
      for (const page of course.pages)
        chapterStatement.run(
          chapterId(course, page),
          course.id,
          page.title,
          duration(page.seconds),
          page.page,
        );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
