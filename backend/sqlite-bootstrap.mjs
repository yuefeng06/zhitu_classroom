import { scryptSync, randomBytes } from 'node:crypto';
import { syncVideoCatalog } from './catalog.mjs';
export function initializeSqlite(db) {
  // Reject legacy files before any writes; historical SQLite data is not the business store.
  if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get() &&
    !db
      .prepare('PRAGMA table_info(users)')
      .all()
      .some((c) => c.name === 'session_token_hash')
  )
    throw Error(
      '旧 SQLite 结构不再用于业务启动；请使用独立新测试库，MySQL 业务库使用 simplify-schema 增量迁移',
    );
  if (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='favorites'").get() &&
    db
      .prepare('PRAGMA table_info(favorites)')
      .all()
      .some((c) => c.name === 'course_id')
  )
    throw Error('旧 SQLite 收藏仍按课程保存；请保留原库，使用新隔离测试库');
  const hash = (password) => {
    const salt = randomBytes(16).toString('hex');
    return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  };
  db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, nickname TEXT UNIQUE NOT NULL, password TEXT NOT NULL, avatar TEXT DEFAULT '学', following INTEGER DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0, session_token_hash TEXT UNIQUE, session_expires INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS study_checkins (user_id INTEGER NOT NULL,checkin_date TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,checkin_date));
CREATE TABLE IF NOT EXISTS history_resets (user_id INTEGER PRIMARY KEY,cleared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS admin_accounts (user_id INTEGER PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS admin_articles (id INTEGER PRIMARY KEY,title TEXT NOT NULL,summary TEXT NOT NULL,content TEXT NOT NULL,source_url TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, teacher TEXT NOT NULL, description TEXT NOT NULL, cover TEXT NOT NULL, accent TEXT NOT NULL, lessons INTEGER NOT NULL, students INTEGER DEFAULT 0, duration TEXT NOT NULL, level TEXT DEFAULT '入门', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS chapters (id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, title TEXT NOT NULL, duration TEXT NOT NULL, is_free INTEGER DEFAULT 0, position INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS progress (user_id INTEGER NOT NULL, course_id INTEGER NOT NULL, chapter_id INTEGER, percent INTEGER DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, course_id));
CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, chapter_id));
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, chapter_id INTEGER DEFAULT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, likes INTEGER DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS danmaku (id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL, content TEXT NOT NULL, at_second INTEGER DEFAULT 8, color TEXT DEFAULT '#ffffff', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS follows (user_id INTEGER NOT NULL, teacher TEXT NOT NULL, PRIMARY KEY(user_id, teacher));`);
  if (
    !db
      .prepare('PRAGMA table_info(comments)')
      .all()
      .some((c) => c.name === 'chapter_id')
  )
    db.exec('ALTER TABLE comments ADD COLUMN chapter_id INTEGER DEFAULT NULL');
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_comments_chapter ON comments(course_id,chapter_id,hidden,id)',
  );

  const count = db.prepare('SELECT count(*) AS n FROM courses').get().n;
  const dmColumns = db.prepare('PRAGMA table_info(danmaku)').all();
  for (const [name, definition] of [
    ['chapter_id', 'INTEGER NULL DEFAULT NULL'],
    ['user_id', 'INTEGER NULL DEFAULT NULL'],
    ['hidden', 'INTEGER NOT NULL DEFAULT 0'],
  ])
    if (!dmColumns.some((c) => c.name === name))
      db.exec(`ALTER TABLE danmaku ADD COLUMN ${name} ${definition}`);
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_danmaku_user ON danmaku(user_id); CREATE INDEX IF NOT EXISTS idx_danmaku_review ON danmaku(course_id,chapter_id,hidden,id)',
  );
  if (!count) {
    db.exec(`INSERT INTO users (id,nickname,password,avatar,following) VALUES (1,'林同学','123456','林',12),(2,'学习搭子','123456','搭',4),(3,'考研小周','123456','周',8);
  INSERT INTO courses (id,title,category,teacher,description,cover,accent,lessons,students,duration,level) VALUES
  (1,'2027 考研英语阅读全程班','考研公共课','李然','从词汇、长难句到阅读方法，建立稳定的阅读解题能力。','英语阅读','blue',86,128043,'42小时','基础到强化'),
  (2,'考研数学高等数学基础精讲','考研公共课','陈铭','系统梳理极限、导数、积分等核心章节，配套例题与练习。','高等数学','green',112,96520,'56小时','基础'),
  (3,'行测判断推理高分突破','考公课程','周扬','聚焦图形、定义、类比与逻辑判断，掌握高频解题技巧。','判断推理','orange',64,82105,'31小时','强化'),
  (4,'Python 数据分析实战','计算机课程','林川','从 Python 基础到数据清洗与可视化，完成一个真实分析项目。','PYTHON','navy',48,64217,'24小时','项目实战'),
  (5,'申论写作结构化提升','考公课程','沈静','通过真题拆解和逐段批改，训练概括、对策与文章写作。','申论写作','rose',36,51064,'18小时','强化'),
  (6,'前端开发项目课','计算机课程','顾舟','使用 HTML、CSS 和 JavaScript 完成可展示的前端项目。','WEB DEV','gold',52,47260,'28小时','项目实战'),
  (7,'大学生职业表达课','其他课程','王宁','提升表达、协作与面试沟通能力。','职业表达','purple',24,21803,'12小时','入门'),
  (8,'考研政治核心考点梳理','考研公共课','刘思','用知识框架串起高频考点和时政专题。','考研政治','red',72,73520,'36小时','强化');
  INSERT INTO chapters (course_id,title,duration,is_free,position) VALUES
  (4,'课程导学与环境准备','12:35',1,1),(4,'Python 基础语法回顾','28:10',1,2),(4,'Pandas 数据清洗','32:48',0,3),(4,'数据分组与聚合','26:32',0,4),(4,'数据可视化报告','30:15',0,5),
  (1,'阅读题型概览','18:20',1,1),(1,'长难句拆解方法','31:05',1,2),(1,'细节题定位训练','27:40',0,3),(1,'主旨题与态度题','25:18',0,4),
  (2,'函数与极限','30:20',1,1),(2,'一元函数微分学','35:10',0,2),(2,'不定积分与定积分','38:40',0,3),
  (3,'图形推理规律','25:10',1,1),(3,'定义判断定位','22:40',0,2),(3,'类比推理关系','19:05',0,3);
  INSERT INTO progress(user_id,course_id,chapter_id,percent) VALUES(1,4,3,64);
  INSERT INTO favorites(user_id,chapter_id) VALUES(1,6),(1,1);
  INSERT INTO comments(course_id,user_id,content,likes) VALUES(4,2,'老师讲得很清楚，Pandas 这部分终于听明白了！',16),(4,3,'希望后面能多讲一些真实数据集的案例。',8);
  INSERT INTO danmaku(course_id,content,at_second,color) VALUES(4,'老师讲得太清楚了',4,'#ffffff'),(4,'这一步很关键！',10,'#ffd86b'),(4,'收藏了，晚上复习',17,'#b7f4d0');`);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS live_events (id INTEGER PRIMARY KEY, title TEXT NOT NULL, teacher TEXT NOT NULL, starts_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reservations (user_id INTEGER, live_id INTEGER, PRIMARY KEY(user_id,live_id));`);
  for (const u of db.prepare('SELECT id,password FROM users').all()) {
    if (!u.password.startsWith('scrypt:'))
      db.prepare('UPDATE users SET password=? WHERE id=?').run(hash(u.password), u.id);
  }
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  db.exec(`CREATE TABLE IF NOT EXISTS course_visits (
    user_id INTEGER NOT NULL,course_id INTEGER NOT NULL,
    chapter_id INTEGER NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id,course_id));`);
  if (!all('PRAGMA table_info(live_events)').some((c) => c.name === 'published'))
    db.exec('ALTER TABLE live_events ADD COLUMN published INTEGER NOT NULL DEFAULT 1');
  run(
    "UPDATE live_events SET published=0 WHERE (id=1 AND title='考研英语阅读长难句答疑' AND teacher='李然') OR (id=2 AND title='行测数量关系高频题型' AND teacher='周扬')",
  );
  db.exec(`INSERT OR IGNORE INTO courses (id,title,category,teacher,description,cover,accent,lessons,students,duration,level) VALUES
    (9,'2027 武忠祥考研数学 · 高等数学全程课','考研公共课','武忠祥','用户提供的 Bilibili 课程资源。原站标题：最新【2027武忠祥十七堂课重点题型】【武忠祥强化课全完结】2027武忠祥考研数学高等数学基础篇2027+武忠祥强化班冲刺班-全系列。该链接当前为一个完整视频，使用原站播放器，播放权限与可用性以原站为准。','高数 · 武忠祥','green',1,0,'4小时36分钟','基础与强化');
    INSERT OR IGNORE INTO chapters (id,course_id,title,duration,is_free,position) VALUES (9001,9,'高等数学全程课 · 原站完整视频','4:36:23',1,1);`);
  syncVideoCatalog(db);
  db.exec(`CREATE TABLE IF NOT EXISTS chapter_playback (
    user_id INTEGER NOT NULL, chapter_id INTEGER NOT NULL,
    current_time REAL NOT NULL DEFAULT 0, duration REAL NOT NULL, percent REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id,chapter_id));
    CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, course_id INTEGER NOT NULL,
    chapter_id INTEGER NOT NULL, at_second REAL NOT NULL, content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  if (!all('PRAGMA table_info(danmaku)').some((x) => x.name === 'chapter_id'))
    db.exec('ALTER TABLE danmaku ADD COLUMN chapter_id INTEGER');
}
