import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
const db = new DatabaseSync('zhitu.db', { readOnly: true });
const names = [
  'users',
  'courses',
  'chapters',
  'live_events',
  'sessions',
  'follows',
  'favorites',
  'coins',
  'comments',
  'danmaku',
  'progress',
  'course_visits',
  'chapter_playback',
  'notes',
  'reservations',
];
const labels = {
  users: '用户',
  courses: '课程',
  chapters: '章节',
  live_events: '直播',
  sessions: '登录会话',
  follows: '讲师关注',
  favorites: '课程收藏',
  coins: '课程投币',
  comments: '课程讨论',
  danmaku: '弹幕',
  progress: '课程进度',
  course_visits: '最近访问',
  chapter_playback: '章节播放',
  notes: '学习笔记',
  reservations: '直播预约',
};
const tables = names.map((name) => ({
  name,
  label: labels[name],
  sql: db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(name).sql,
  cols: db.prepare('PRAGMA table_info(' + name + ')').all(),
  fks: db.prepare('PRAGMA foreign_key_list(' + name + ')').all(),
}));
const quote = (v) =>
  v === null
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : "'" + String(v).replaceAll("'", "''") + "'";
const data = ['courses', 'chapters']
  .map((name) => {
    const rows = db
      .prepare(
        name === 'courses'
          ? 'SELECT * FROM courses WHERE published=1 ORDER BY id'
          : 'SELECT ch.* FROM chapters ch JOIN courses c ON c.id=ch.course_id WHERE c.published=1 ORDER BY ch.id',
      )
      .all();
    const cols = Object.keys(rows[0]);
    return rows
      .map(
        (r) =>
          'INSERT INTO ' +
          name +
          ' (' +
          cols.join(',') +
          ') VALUES (' +
          cols.map((c) => quote(r[c])).join(',') +
          ');',
      )
      .join('\n');
  })
  .join('\n\n');
fs.writeFileSync(
  'database/zhitu_sqlite.sql',
  '-- SQLite 当前结构快照；仅用于空数据库初始化，不覆盖现有库。\n-- 不包含账号、密码、会话或个人学习数据。\nPRAGMA foreign_keys=ON;\nBEGIN;\n' +
    tables.map((t) => t.sql + ';').join('\n\n') +
    '\n\n' +
    data +
    '\nCOMMIT;\n',
);
function type(c) {
  if (c.type === 'REAL') return 'DOUBLE';
  if (c.type === 'INTEGER') return 'BIGINT';
  if (c.name === 'token') return 'VARCHAR(128)';
  if (c.name === 'password') return 'VARCHAR(255)';
  if (c.name === 'nickname' || c.name === 'teacher') return 'VARCHAR(100)';
  if (['created_at', 'updated_at'].includes(c.name)) return 'DATETIME(3)';
  if (['content', 'description'].includes(c.name)) return 'TEXT';
  if (c.name === 'title') return 'VARCHAR(500)';
  return 'VARCHAR(255)';
}
let mysql =
  "-- MySQL 8.0+ 初始化参考，与 SQLite 运行结构对应。\n-- 只在空库执行；不含 DROP、不覆盖已有表，不是旧版 MySQL 的迁移脚本。\n-- 后端默认使用 MySQL；旧库升级请运行 npm run db:migrate，不直接导入本文件。\n-- password 字段存储 scrypt 摘要；sessions.expires 为 Unix 毫秒。\nSET NAMES utf8mb4;\nSET SESSION sql_mode = CONCAT_WS(',', @@sql_mode, 'NO_BACKSLASH_ESCAPES');\nCREATE DATABASE IF NOT EXISTS zhitu_classroom CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE zhitu_classroom;\n\n";
for (const t of tables) {
  const pk = t.cols.filter((c) => c.pk).sort((a, b) => a.pk - b.pk);
  let defs = t.cols.map(
    (c) =>
      '  `' +
      c.name +
      '` ' +
      type(c) +
      (c.notnull || c.pk ? ' NOT NULL' : ' NULL') +
      (c.name === 'id' && pk.length === 1 ? ' AUTO_INCREMENT' : '') +
      (c.dflt_value !== null
        ? ' DEFAULT ' +
          (c.dflt_value === 'CURRENT_TIMESTAMP' ? 'CURRENT_TIMESTAMP(3)' : c.dflt_value)
        : ''),
  );
  defs.push('  PRIMARY KEY (' + pk.map((c) => '`' + c.name + '`').join(',') + ')');
  if (t.name === 'users') defs.push('  UNIQUE KEY uq_users_nickname (nickname)');
  for (const fk of t.fks)
    defs.push(
      '  CONSTRAINT fk_' +
        t.name +
        '_' +
        fk.from +
        ' FOREIGN KEY (`' +
        fk.from +
        '`) REFERENCES `' +
        fk.table +
        '` (`' +
        fk.to +
        '`)',
    );
  mysql +=
    'CREATE TABLE `' +
    t.name +
    '` (\n' +
    defs.join(',\n') +
    "\n) ENGINE=InnoDB COMMENT='" +
    t.label +
    "';\n\n";
}
mysql +=
  '-- 仅导入当前上架的真实课程及章节。视频源映射见 JSON，不导入演示课程。\nSTART TRANSACTION;\n' +
  data +
  '\nCOMMIT;\n';
fs.writeFileSync('database/zhitu_mysql.sql', mysql);
if (process.argv.includes('--sql-only')) {
  const check = new DatabaseSync(':memory:');
  check.exec(fs.readFileSync('database/zhitu_sqlite.sql', 'utf8'));
  console.log(
    JSON.stringify({
      courses: check.prepare('SELECT COUNT(*) n FROM courses').get().n,
      chapters: check.prepare('SELECT COUNT(*) n FROM chapters').get().n,
      foreignKeys: check.prepare('PRAGMA foreign_key_check').all(),
      integrity: check.prepare('PRAGMA integrity_check').all(),
    }),
  );
  check.close();
  db.close();
  process.exit(0);
}
let mmd = 'erDiagram\n';
for (const t of tables) {
  mmd += '  ' + t.name + ' {\n';
  for (const c of t.cols) {
    const keys = [
      ...(c.pk ? ['PK'] : []),
      ...(t.name === 'users' && c.name === 'nickname' ? ['UK'] : []),
      ...(t.fks.some((f) => f.from === c.name) ? ['FK'] : []),
    ];
    mmd += '    ' + c.type + ' ' + c.name + (keys.length ? ' ' + keys.join(',') : '') + '\n';
  }
  mmd += '  }\n';
}
for (const t of tables)
  for (const f of t.fks) {
    const col = t.cols.find((c) => c.name === f.from);
    mmd +=
      '  ' + f.table + (col.notnull ? ' ||' : ' |o') + '--o{ ' + t.name + ' : "' + f.from + '"\n';
  }
mmd += '  chapters |o..o{ progress : "chapter_id logical only"\n';
fs.writeFileSync('database/ER.mmd', mmd);
// A presentation overview grouped by business, with repeated parent nodes for legibility.
const groups = [
  { title: '01  用户与会话', parents: ['users'], children: ['sessions', 'follows'] },
  {
    title: '02  学习记录',
    parents: ['users', 'courses', 'chapters'],
    children: ['progress', 'course_visits', 'chapter_playback', 'notes'],
  },
  {
    title: '03  课程与互动',
    parents: ['users', 'courses', 'chapters'],
    children: ['favorites', 'coins', 'comments', 'danmaku'],
  },
  { title: '04  直播预约', parents: ['users', 'live_events'], children: ['reservations'] },
];
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
let svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="2280" viewBox="0 0 1800 2280"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10" fill="none" stroke="#6b8b77" stroke-width="1.5"/></marker></defs><rect width="1800" height="2280" fill="#f4f2e9"/><g font-family="Microsoft YaHei,Arial,sans-serif" fill="#283b34"><text x="60" y="66" font-size="32" font-weight="bold">知途课堂 · 数据库 ER 关系图</text><text x="60" y="106" font-size="17">15 张实际业务表 · SQLite 运行结构 / MySQL 对应脚本 · 2026-09-21</text><text x="60" y="140" font-size="15" fill="#68786b">PK 主键　FK 外键　UK 唯一键　箭头：父实体 1 → 子记录 0..N；可空外键的父端为 0..1。重复父节点代表同一张表。</text>';
const colors = ['#56796b', '#ac8858', '#7997aa'];
for (let gi = 0; gi < groups.length; gi++) {
  const g = groups[gi],
    y = 175 + gi * 475;
  svg +=
    '<rect x="40" y="' +
    y +
    '" width="1720" height="450" rx="20" fill="#fdfcf7" stroke="#dedfd4"/><text x="66" y="' +
    (y + 36) +
    '" font-size="23" font-weight="bold">' +
    g.title +
    '</text>';
  let parentPos = {};
  g.parents.forEach((p, i) => {
    const x = 70 + i * 530;
    parentPos[p] = x + 240;
    svg +=
      '<rect x="' +
      x +
      '" y="' +
      (y + 58) +
      '" width="480" height="60" rx="10" fill="' +
      colors[i % 3] +
      '"/><text x="' +
      (x + 18) +
      '" y="' +
      (y + 84) +
      '" fill="white" font-size="18">' +
      p +
      ' · ' +
      labels[p] +
      '</text><text x="' +
      (x + 18) +
      '" y="' +
      (y + 107) +
      '" fill="white" font-size="13">PK id' +
      (p === 'chapters' ? '　FK course_id → courses' : p === 'users' ? '　UK nickname' : '') +
      '</text>';
  });
  if (g.parents.includes('chapters'))
    svg +=
      '<text x="1180" y="' +
      (y + 140) +
      '" font-size="12" fill="#68786b">courses 1 → chapters 0..N（每章属于一门课）</text>';
  g.children.forEach((name, j) => {
    const t = tables.find((t) => t.name === name),
      x = 70 + j * 420,
      top = y + 194;
    const fks = [
      ...t.fks,
      ...(name === 'progress' ? [{ from: 'chapter_id', table: 'chapters', logical: true }] : []),
    ];
    fks.forEach((f, k) => {
      if (!parentPos[f.table]) return;
      const color = colors[g.parents.indexOf(f.table) % 3];
      const tx = x + 45 + k * 90,
        py = y + 151 + k * 10;
      svg +=
        '<path d="M' +
        parentPos[f.table] +
        ' ' +
        (y + 118) +
        ' V' +
        py +
        ' H' +
        tx +
        ' V' +
        top +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="1.4" opacity=".7" marker-end="url(#arrow)"' +
        (f.logical ? ' stroke-dasharray="5 4"' : '') +
        '/>';
    });
    svg +=
      '<rect x="' +
      x +
      '" y="' +
      top +
      '" width="390" height="232" rx="12" fill="#fffefa" stroke="#bfcbbb"/><path d="M' +
      (x + 12) +
      ' ' +
      top +
      'h366q12 0 12 12v28H' +
      x +
      'v-28q0-12 12-12" fill="#e3e9dc"/><text x="' +
      (x + 14) +
      '" y="' +
      (top + 27) +
      '" font-size="17" font-weight="bold">' +
      name +
      ' · ' +
      t.label +
      '</text>';
    t.cols.forEach((c, ci) => {
      const fk = t.fks.find((f) => f.from === c.name);
      svg +=
        '<text x="' +
        (x + 14) +
        '" y="' +
        (top + 61 + ci * 23) +
        '" font-size="13">' +
        esc((c.pk ? 'PK ' : '') + (fk ? 'FK ' : '') + c.name + (fk ? ' → ' + fk.table : '')) +
        '</text>';
    });
  });
}
svg +=
  '<text x="60" y="2126" font-size="17" font-weight="bold">实现边界</text><text x="60" y="2162" font-size="15">虚线：progress.chapter_id 是逻辑关联，当前 SQLite 未声明该外键。实线关系与 PRAGMA foreign_key_list 对应。</text><text x="60" y="2193" font-size="15">讲师以 teacher 文本保存；视频地址 / BVID / CID / 分P 来自 JSON 配置。管理端演示修改在 localStorage，不属于数据库实体。</text><text x="60" y="2224" font-size="15">此图突出实体关联；父实体的完整字段、类型、可空性与关联基数详见 ER.mmd、ER说明.md 和 SQL 文件。</text></g></svg>';
fs.writeFileSync('database/ER-physical.svg', svg);
fs.writeFileSync(
  'database/ER说明.md',
  '# 数据库结构与 ER 图\n\n![物理关系图](ER-physical.svg)\n\n## 文件说明\n\n- zhitu_sqlite.sql：运行库结构快照及公开课程数据，可在空 SQLite 库导入。\n- zhitu_mysql.sql：与运行模型对应的 MySQL 8.0+ 初始化脚本，仅用于空库，不是旧库升级脚本；没有 DROP。\n- ER-physical.svg：分业务展示的关系图，父节点在多个分区重复表示同一实体。\n- ER.mmd：包含全部字段的 Mermaid ER 源文件。\n\n后端默认驱动为 MySQL；原 zhitu.db 保留为迁移源。当前服务实际驱动请查看 /api/health。本文字段快照从 SQLite 只读导出，不清除账号、笔记、收藏或历史记录。导出只含已上架课程和章节，不包含密码摘要、会话令牌或个人数据。MySQL 中的 BIGINT、VARCHAR、DATETIME、DOUBLE 对应 SQLite 的动态类型；MySQL 主键隐含非空，SQLite 的部分旧复合主键列仍可空。\n\n## 关键关系与边界\n\n用户与课程经收藏、投币、进度、最近访问等关联表形成多对多关系；用户与章节通过播放记录关联。课程包含章节，用户可为课程章节保存多条笔记、讨论。直播与用户通过预约表关联。\n\nprogress.chapter_id 仅是逻辑关联，并未在运行库声明外键，图中用虚线；其他外键据实际库生成。会话 user_id、预约 user_id/live_id 和弹幕 chapter_id 在 SQLite 中可空。应用层还验证章节属于课程，不能把单列外键当作跨列一致性约束。\n\n讲师以文本存储，未独立建教师表；弹幕未存用户外键；B站视频映射来自 media-sources.json 与 database/video-catalog.json，未虚构视频源表。管理员原型的账号状态、直播草稿、审核状态保存在浏览器，当前不代表正式后台数据库功能。\n\n## 数据字典\n\n' +
    tables
      .map(
        (t) =>
          '### ' +
          t.name +
          ' · ' +
          t.label +
          '\n\n| 字段 | SQLite 类型 | PK | 非空声明 | 默认值 | 外键 |\n|---|---|---|---|---|---|\n' +
          t.cols
            .map(
              (c) =>
                '| ' +
                [
                  c.name,
                  c.type,
                  c.pk || '',
                  c.notnull ? '是' : '否',
                  c.dflt_value ?? '—',
                  t.fks
                    .filter((f) => f.from === c.name)
                    .map((f) => f.table + '.' + f.to)
                    .join(',') || '—',
                ].join(' | ') +
                ' |',
            )
            .join('\n'),
      )
      .join('\n\n') +
    '\n',
);
const fresh = new DatabaseSync(':memory:');
fresh.exec(fs.readFileSync('database/zhitu_sqlite.sql', 'utf8'));
console.log(
  JSON.stringify({
    tables: tables.length,
    courses: fresh.prepare('select count(*) n from courses').get().n,
    chapters: fresh.prepare('select count(*) n from chapters').get().n,
    foreignKeys: fresh.prepare('pragma foreign_key_check').all(),
    integrity: fresh.prepare('pragma integrity_check').all(),
  }),
);
fresh.close();
db.close();
