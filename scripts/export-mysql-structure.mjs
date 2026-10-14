import '../config.mjs';
import mysql from 'mysql2/promise';
import { mysqlOptions } from '../config.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Read metadata only. Never export accounts, password hashes or session values.
const directory = fileURLToPath(new URL('../database/', import.meta.url));
const order = [
  'users',
  'history_resets',
  'study_checkins',
  'courses',
  'chapters',
  'comments',
  'live_events',
  'notes',
  'favorites',
  'progress',
  'coins',
  'reservations',
  'course_visits',
  'chapter_playback',
  'sessions',
  'follows',
  'danmaku',
];
const labels = {
  history_resets: '历史清除标记表',
  study_checkins: '每日学习打卡表',
  users: '用户表',
  courses: '课程表',
  chapters: '章节表',
  comments: '评论表',
  live_events: '直播表',
  notes: '学习笔记表',
  favorites: '课程收藏表',
  progress: '课程学习进度表',
  coins: '课程投币表',
  reservations: '直播预约表',
  course_visits: '最近学习访问表',
  chapter_playback: '章节播放记录表',
  sessions: '登录会话表',
  follows: '讲师关注表',
  danmaku: '弹幕表',
};
const purposes = {
  history_resets: '每账号保存最近清除时间，防止旧播放进度补回访问历史；不删除播放进度。',
  study_checkins: '记录用户按北京时间主动打卡的日期，每账号每天唯一，不代表观看时长。',
  users: '保存用户身份、昵称、密码摘要及头像信息。',
  courses: '保存课程目录及上架信息；分类和学科分别使用 category、subject。',
  chapters: '保存课程分集、时长和展示顺序，每个章节归属于一门课程。',
  comments: '记录用户对课程发表的评论。',
  live_events: '保存直播主题、讲师、开始时间和发布状态。',
  notes: '保存用户在指定课程章节、指定视频时间点留下的私有笔记。',
  favorites: '实现 ER 图中用户与课程之间的多对多收藏关系。',
  progress: '实现 ER 图中的学习关系，记录用户在每门课程上的章节与完成百分比。',
  coins: '实现 ER 图中用户与课程之间的多对多投币关系。',
  reservations: '实现 ER 图中用户与直播之间的多对多预约关系。',
  course_visits: '记录用户最近打开的课程章节；访问记录不等于观看进度。',
  chapter_playback: '记录原生直链播放器的章节秒数和完成百分比；B 站播放器不自动回传秒数。',
  sessions: '保存登录会话与失效时间，支撑服务端身份校验。',
  follows: '记录用户关注的讲师名称；当前没有独立讲师实体表。',
  danmaku: '保存课程弹幕内容、出现时间和颜色，可关联到具体章节。',
};
const shared = {
  id: '记录编号',
  user_id: '关联用户编号',
  course_id: '关联课程编号',
  chapter_id: '关联章节编号',
  title: '标题',
  teacher: '讲师姓名',
  content: '文本内容',
  created_at: '创建时间',
  updated_at: '更新时间',
  published: '发布状态，接口使用 1 表示发布，0 表示未发布',
  duration: '展示用时长文本',
  percent: '完成百分比，业务范围为 0–100',
};
const descriptions = {
  history_resets: {
    user_id: '用户编号，主键与用户外键',
    cleared_at: '最近确认清除历史的服务端时间，UTC',
  },
  study_checkins: {
    checkin_date: '打卡业务日期，由服务器按 Asia/Shanghai 确定，客户端不能补签',
    created_at: '服务端写入时间，UTC',
  },
  users: {
    id: '用户编号',
    nickname: '登录昵称；唯一性以本次采集的实际索引为准',
    password: 'scrypt 密码摘要，不存储明文密码',
    avatar: '头像标识或资源值，可空',
    following: '旧版关注数量字段；当前关注列表从 follows 查询',
  },
  courses: {
    id: '课程编号',
    title: '课程名称',
    category: '学习方向，例如高中课程、考研课程',
    subject: '具体学科，例如数学、Python',
    description: '课程简介及原站资源说明',
    cover: '封面标签文字；课程图片按课程 ID 读取静态资源',
    accent: '课程配色标识',
    lessons: '课程分集数量',
    students: '历史学习人数展示字段，并非实时学习记录计数',
    duration: '课程总时长展示文本',
    level: '课程难度或学习阶段',
    status: '旧版状态字段，保留兼容；当前接口使用 published',
    published: '当前课程上架标记，1 为上架、0 为下架',
  },
  chapters: {
    id: '章节编号',
    title: '章节标题',
    duration: '章节时长展示文本，例如 12:35',
    is_free: '是否免费，业务约定 1 为免费、0 为非免费',
    position: '章节在课程中的展示顺序',
  },
  comments: {
    id: '评论编号',
    content: '评论内容；当前接口最多接受 1,000 字符',
    likes: '评论点赞数',
  },
  live_events: {
    id: '直播编号',
    title: '直播主题',
    starts_at: '计划开始时间字符串；当前物理类型为 VARCHAR，不是 DATETIME',
  },
  notes: {
    id: '笔记编号',
    at_second: '视频时间点，单位秒，可含小数',
    content: '笔记正文；当前接口最多接受 2,000 字符',
  },
  progress: {
    chapter_id: '最近播放章节，可空；已有真实外键，删除章节时置 NULL',
    percent: '课程完成百分比，原生播放记录按章节汇总',
  },
  course_visits: { chapter_id: '最近打开的章节编号', updated_at: '最近访问时间，毫秒精度' },
  chapter_playback: {
    current_time: '最近播放位置，单位秒，可含小数',
    duration: '播放器视频时长，单位秒，可含小数',
    percent: '该章节已记录的最高完成百分比',
  },
  sessions: {
    token: '会话令牌，主键；ascii_bin 排序规则区分大小写',
    expires: '失效时间，Unix 时间戳，单位毫秒',
  },
  reservations: { live_id: '关联直播编号' },
  follows: { teacher: '讲师姓名，参与联合主键；不是讲师表外键' },
  danmaku: {
    at_second: '弹幕出现时间，单位秒，当前数据库使用整数',
    color: '弹幕文字颜色，例如 #ffffff',
    chapter_id: '弹幕所属章节，可空；此表未存储用户编号',
  },
};
Object.assign(labels, {
  admin_accounts: '管理员身份表',
  account_status: '账号状态表',
  admin_articles: '管理文章表',
  comment_moderation: '评论审核表',
  admin_audit: '管理操作审计表',
});
Object.assign(purposes, {
  admin_accounts: '指定用户的管理员身份；仅通过运维授权脚本配置。',
  account_status: '保存账号停用状态，停用时撤销会话。',
  admin_articles: '保存后台编辑的纯文本文章与发布状态，已发布文章可公开阅读。',
  comment_moderation: '保存评论隐藏状态，不删除原始评论。',
  admin_audit: '与管理写入在同一事务记录操作者、动作、目标和时间。',
});
Object.assign(descriptions, {
  admin_accounts: { user_id: '管理员用户编号，主键与外键' },
  account_status: { disabled: '账号停用标志，1 停用，0 正常' },
  admin_articles: {
    summary: '列表摘要',
    source_url: '原文 HTTP(S) 链接，可空字符串',
    content: '纯文本正文，页面转义后展示',
  },
  comment_moderation: {
    comment_id: '评论编号，主键与评论外键',
    hidden: '隐藏标志，1 隐藏，0 可见',
  },
  admin_audit: {
    actor_id: '操作者用户编号',
    action: '管理动作标识',
    target_id: '受操作对象编号；多态目标，不设单一业务表外键',
  },
});
const escape = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const grid = (headers, rows) =>
  '| ' +
  headers.join(' | ') +
  ' |\n| ' +
  headers.map(() => '---').join(' | ') +
  ' |\n' +
  rows.map((row) => '| ' + row.map(escape).join(' | ') + ' |').join('\n') +
  '\n';
const code = (value) => '`' + value + '`';
const defaultText = (c) =>
  c.COLUMN_DEFAULT === null
    ? c.IS_NULLABLE === 'YES'
      ? 'NULL'
      : '— 无默认值'
    : c.COLUMN_DEFAULT === ''
      ? "'' 空字符串"
      : c.DATA_TYPE === 'varchar'
        ? "'" + c.COLUMN_DEFAULT + "'"
        : c.COLUMN_DEFAULT;
const htmlEscape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const db = await mysql.createConnection(mysqlOptions());
try {
  const [[server]] = await db.query('SELECT DATABASE() AS database_name,VERSION() AS version');
  const [tables] = await db.query(
    'SELECT TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_COLLATION,TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME',
  );
  const [columns] = await db.query(
    'SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,DATA_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,COLUMN_KEY,CHARACTER_SET_NAME,COLLATION_NAME,COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION',
  );
  const [indexes] = await db.query(
    'SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART,INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX',
  );
  const [foreignKeys] = await db.query(
    'SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON k.CONSTRAINT_SCHEMA=r.CONSTRAINT_SCHEMA AND k.TABLE_NAME=r.TABLE_NAME AND k.CONSTRAINT_NAME=r.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION',
  );
  const [checks] = await db.query(
    'SELECT t.TABLE_NAME,c.CONSTRAINT_NAME,c.CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS c JOIN information_schema.TABLE_CONSTRAINTS t ON t.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME=c.CONSTRAINT_NAME WHERE t.TABLE_SCHEMA=DATABASE()',
  );
  const [views] = await db.query(
    'SELECT TABLE_NAME,VIEW_DEFINITION,CHECK_OPTION,SECURITY_TYPE FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE()',
  );
  const names = order.filter((name) =>
    tables.some((t) => t.TABLE_NAME === name && t.TABLE_TYPE === 'BASE TABLE'),
  );
  for (const table of tables.filter((t) => t.TABLE_TYPE === 'BASE TABLE'))
    if (!names.includes(table.TABLE_NAME)) names.push(table.TABLE_NAME);
  const keys = (name) =>
    indexes
      .filter((i) => i.TABLE_NAME === name && i.INDEX_NAME === 'PRIMARY')
      .map((i) => i.COLUMN_NAME);
  const captured = new Date().toISOString();
  const snapshot = { ...server, captured, tables, columns, indexes, foreignKeys, checks, views };
  let md = '# 知途课堂数据库表结构说明\n\n';
  md += `本说明依据用户提供的 ER 图及当前 MySQL 数据库 ${code(server.database_name)} 的实际元数据整理，供数据库设计报告与课程展示使用。当前包含 **${names.length} 张基础表、${views.length} 个视图**。字段类型、空值、默认值、主外键、索引和删除规则以实际 MySQL 为准；字段业务含义结合当前后端实现说明。\n\n`;
  md += `MySQL 版本：${server.version}。元数据采集时间：${captured}（UTC）。所有业务表使用 InnoDB；现有表排序规则包含 utf8mb4_unicode_ci 和 utf8mb4_0900_ai_ci，具体以建表定义为准；sessions.token 单列使用 ascii_bin。本文仅导出结构，不包含用户记录、密码摘要值或登录令牌值。\n\n`;
  md += '## 一 ER 图与关系表的对应\n\n';
  md += grid(
    ['ER 图元素', '物理表或字段', '说明'],
    [
      [
        '用户、课程、章节、评论、直播、笔记',
        'users、courses、chapters、comments、live_events、notes',
        '六类核心实体分别落为实体表',
      ],
      [
        '用户发表评论、课程拥有评论',
        'comments.user_id、comments.course_id',
        '两个一对多关系通过评论表外键表达',
      ],
      ['课程包含章节', 'chapters.course_id', '一门课程有多个章节'],
      [
        '用户记录笔记、章节对应笔记',
        'notes.user_id、notes.chapter_id',
        '两个一对多关系；notes.course_id 同时关联课程',
      ],
      [
        '用户收藏、学习、投币课程',
        'favorites、progress、coins',
        '三个多对多关系分别建立关联表，均以 user_id 与 course_id 为联合主键',
      ],
      ['用户预约直播', 'reservations', '多对多关系，以 user_id 与 live_id 为联合主键'],
      [
        '用户登录、注册、设置密码、设置头像',
        'sessions 与 users 的相关字段',
        '这些是操作或功能；登录、注册不直接创建同名字段',
      ],
      [
        '评论删除、笔记创建与删除',
        '操作，不是数据列',
        '创建时间使用 created_at；当前笔记删除为物理删除，没有 deleted_at 字段；用户评论删除接口尚未提供',
      ],
      [
        '图中未展开的辅助功能',
        'course_visits、chapter_playback、follows、danmaku',
        '补充最近学习、章节续播、讲师关注与弹幕',
      ],
    ],
  );
  md += '\n## 二 数据表总览\n\n';
  md += grid(
    ['序号', '表名', '中文名称', '主键', '用途'],
    names.map((name, i) => [
      i + 1,
      code(name),
      labels[name] || name,
      keys(name).join(' + '),
      purposes[name] || '以实际元数据为准',
    ]),
  );
  md +=
    '\n## 三 字段结构\n\n类型中的 UNSIGNED 表示无符号整数；VARCHAR(n) 中 n 为最大字符数，DATETIME(3) 表示毫秒精度。PK 为主键，FK 为外键，联合主键需组合唯一。允许空为“否”的字段具有 NOT NULL 约束；无默认值不等于默认 NULL。业务说明中的 0–100、字符数限制等来自接口，不能视为已建 CHECK 约束。\n\n';
  for (const [i, name] of names.entries()) {
    const cols = columns.filter((c) => c.TABLE_NAME === name),
      pk = keys(name),
      fks = foreignKeys.filter((k) => k.TABLE_NAME === name);
    md += `### 表 ${i + 1} ${labels[name] || name} ${name}\n\n${purposes[name] || ''}\n\n`;
    md += grid(
      ['字段名', '数据类型', '允许空', '键与约束', '默认值', '字段说明'],
      cols.map((c) => {
        const constraints = [];
        if (pk.includes(c.COLUMN_NAME)) constraints.push(pk.length > 1 ? '联合 PK' : 'PK');
        if (c.EXTRA.includes('auto_increment')) constraints.push('自增');
        for (const fk of fks.filter((f) => f.COLUMN_NAME === c.COLUMN_NAME))
          constraints.push('FK → ' + fk.REFERENCED_TABLE_NAME + '.' + fk.REFERENCED_COLUMN_NAME);
        if (c.EXTRA.includes('on update')) constraints.push('更新时自动刷新时间');
        return [
          code(c.COLUMN_NAME),
          c.COLUMN_TYPE.toUpperCase(),
          c.IS_NULLABLE === 'YES' ? '是' : '否',
          constraints.join('；') || '—',
          defaultText(c),
          descriptions[name]?.[c.COLUMN_NAME] || shared[c.COLUMN_NAME] || c.COLUMN_COMMENT || '—',
        ];
      }),
    );
    const groups = new Map();
    for (const index of indexes.filter((x) => x.TABLE_NAME === name)) {
      if (!groups.has(index.INDEX_NAME)) groups.set(index.INDEX_NAME, []);
      groups.get(index.INDEX_NAME).push(index);
    }
    md +=
      '\n索引：' +
      [...groups]
        .map(
          ([index, parts]) =>
            `${code(index)}（${parts[0].NON_UNIQUE ? '普通索引' : index === 'PRIMARY' ? '主键' : '唯一索引'}；${parts.map((p) => p.COLUMN_NAME + (p.SUB_PART ? ' 前缀 ' + p.SUB_PART : '')).join('、')}）`,
        )
        .join('；') +
      '。\n\n';
    if (name === 'users')
      md += [...groups.values()].some(
        (parts) =>
          parts.length === 1 && parts[0].COLUMN_NAME === 'nickname' && !parts[0].NON_UNIQUE,
      )
        ? '当前库的 nickname 具有单列 UNIQUE 约束；注册前检查与数据库唯一约束共同处理同名注册。\n\n'
        : '当前库的 nickname 尚无单列 UNIQUE 约束；应用层预检查不能保证并发唯一。\n\n';
    if (name === 'courses')
      md +=
        'status 是旧字段，published 才是当前后端筛选上架课程的依据；二者并未通过数据库约束自动同步。\n\n';
    if (name === 'progress')
      md +=
        '当前 MySQL 中 chapter_id 已声明指向 chapters.id 的外键，删除规则为 SET NULL。旧 SQLite 文档中的“仅逻辑关联”不适用于本库。\n\n';
  }
  md += '## 四 外键与删除规则\n\n';
  md += grid(
    ['子表字段', '父表字段', '外键名称', '删除规则', '更新规则'],
    foreignKeys.map((k) => [
      k.TABLE_NAME + '.' + k.COLUMN_NAME,
      k.REFERENCED_TABLE_NAME + '.' + k.REFERENCED_COLUMN_NAME,
      k.CONSTRAINT_NAME,
      k.DELETE_RULE,
      k.UPDATE_RULE,
    ]),
  );
  md +=
    '\nCASCADE 表示删除父记录时级联删除对应子记录；SET NULL 表示将子表外键置空；NO ACTION 在本 InnoDB 库中会阻止违反引用完整性的操作。删除课程时还可能被 notes、course_visits 等 NO ACTION 关系阻止，不能仅因部分外键是 CASCADE 就认为整门课程可直接删除。\n\n';
  md +=
    'notes、course_visits 和 progress 的 course_id 与 chapter_id 是分别关联课程、章节的单列外键，未通过组合外键保证“该章节必然属于该课程”；当前后端在相应写入接口中检查这一关系。notes 的用户归属和私有可见性也由接口校验。\n\n';
  md += '## 五 统计视图\n\n';
  for (const view of views) {
    md += `### ${view.TABLE_NAME}\n\n课程评论数量查询视图，不存储独立业务记录。当前视图按课程标题分组，同名课程的评论数量会合并。\n\n`;
    md += grid(
      ['字段', '类型', '允许空', '含义'],
      columns
        .filter((c) => c.TABLE_NAME === view.TABLE_NAME)
        .map((c) => [
          c.COLUMN_NAME,
          c.COLUMN_TYPE.toUpperCase(),
          c.IS_NULLABLE === 'YES' ? '是' : '否',
          c.COLUMN_NAME === '课程' ? '课程名称' : '该课程的评论数量',
        ]),
    );
    md += '\n```sql\n' + view.VIEW_DEFINITION + ';\n```\n\n';
  }
  md += '## 六 实现边界与交付文件\n\n';
  md += `当前库检测到 ${checks.length} 条 CHECK 约束。数据库字段保留现状，包括直播开始时间 VARCHAR、部分带符号主键以及可空会话和预约外键；未为了与概念图一致而修改现有库。\n\n`;
  md +=
    '讲师以姓名文本保存，尚未建立教师表；视频源映射来自项目 JSON 文件，未单独建视频源表。原有精选经验和《提问的智慧》为静态内容；后台新建文章保存在 admin_articles，发布后在发现页展示。管理员身份、账号停用、评论隐藏与操作审计分别使用新增管理表，管理写入由服务端会话和权限校验保护。\n\n';
  md +=
    '- `数据库表结构说明.md`：本说明，可用于报告编写。\n- `数据库表结构说明.html`：浏览器阅读与打印版。\n- `mysql-actual-schema.sql`：由当前库 SHOW CREATE TABLE 导出的空库建表脚本，不含业务数据；保留实际主外键与索引。去掉自增计数起点，视图改为 SQL SECURITY INVOKER 并移除源库限定名，便于导入新的空库。\n- `mysql-structure-snapshot.json`：机器可读元数据，用于复核字段和约束。\n\nSQL 脚本不包含 DROP、不含 INSERT，也不切换数据库。应在新建空库中执行，不要在当前业务库重复执行。\n';
  const ddls = new Map();
  for (const name of names) {
    const [[ddl]] = await db.query('SHOW CREATE TABLE `' + name + '`');
    ddls.set(name, ddl['Create Table'].replace(/ AUTO_INCREMENT=\d+/g, ''));
  }
  // Order by actual FK dependencies, without disabling FK checks.
  const emitted = new Set(),
    sorted = [];
  while (sorted.length < names.length) {
    const next = names.find(
      (n) =>
        !emitted.has(n) &&
        foreignKeys
          .filter((k) => k.TABLE_NAME === n)
          .every((k) => k.REFERENCED_TABLE_NAME === n || emitted.has(k.REFERENCED_TABLE_NAME)),
    );
    if (!next) throw Error('外键存在循环，需要独立导出约束');
    emitted.add(next);
    sorted.push(next);
  }
  let sql = `-- 知途课堂 MySQL 实际结构，源库 ${server.database_name}，${captured}\n-- 仅在已选中的新空库执行；不包含数据、DROP 或 USE。\n-- 自增计数起点已省略；视图使用 SQL SECURITY INVOKER，移除源库限定名。\nSET NAMES utf8mb4;\n\n`;
  sql += sorted.map((name) => ddls.get(name) + ';').join('\n\n') + '\n\n';
  for (const view of views)
    sql +=
      'CREATE SQL SECURITY INVOKER VIEW `' +
      view.TABLE_NAME +
      '` AS ' +
      view.VIEW_DEFINITION.replaceAll('`' + server.database_name + '`.', '') +
      ';\n';
  // A standalone reading/printing version, generated from the same Markdown.
  const inline = (text) =>
    htmlEscape(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  let body = '',
    tableOpen = false,
    inCode = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) {
      if (tableOpen) {
        body += '</tbody></table>';
        tableOpen = false;
      }
      body += inCode ? '</code></pre>' : '<pre><code>';
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      body += htmlEscape(line) + '\n';
      continue;
    }
    if (line.startsWith('|')) {
      if (/^\|[\s|\-]+$/.test(line)) continue;
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (!tableOpen) {
        body +=
          '<table><thead><tr>' +
          cells.map((c) => '<th>' + inline(c) + '</th>').join('') +
          '</tr></thead><tbody>';
        tableOpen = true;
      } else body += '<tr>' + cells.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>';
      continue;
    }
    if (tableOpen) {
      body += '</tbody></table>';
      tableOpen = false;
    }
    const heading = line.match(/^(#{1,3}) (.*)/);
    if (heading) body += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    else if (line.trim()) body += '<p>' + inline(line.replace(/^- /, '• ')) + '</p>';
  }
  const html =
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>知途课堂数据库表结构说明</title><style>body{max-width:1120px;margin:40px auto;padding:0 28px;color:#202822;font:16px/1.8 "Microsoft YaHei",sans-serif;background:#fff}h1{font-size:29px}h2{margin-top:38px;font-size:23px}h3{margin-top:28px;font-size:19px}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.65;margin:16px 0 20px}th,td{border:1px solid #d9d9d9;padding:9px 10px;text-align:left;vertical-align:middle;overflow-wrap:anywhere}th{background:#eaf0ee;color:#162c24}tr:nth-child(even){background:#fafbf9}code{font:0.94em Consolas,monospace;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;padding:15px;background:#f5f6f4}thead{display:table-header-group}@media print{body{margin:0;padding:0;font-size:10pt;max-width:none}table{font-size:8pt}th,td{padding:5px 6px}h1{font-size:20pt}h2{font-size:15pt}h3{font-size:12pt}h1,h2,h3{break-after:avoid}tr{break-inside:avoid}@page{size:A4 landscape;margin:16mm}</style><main>' +
    body +
    '</main></html>';
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, '数据库表结构说明.md'), md);
  await writeFile(join(directory, '数据库表结构说明.html'), html);
  await writeFile(join(directory, 'mysql-actual-schema.sql'), sql);
  await writeFile(
    join(directory, 'mysql-structure-snapshot.json'),
    JSON.stringify(snapshot, null, 2),
  );
  console.log(
    JSON.stringify({
      database: server.database_name,
      tables: names.length,
      fields: columns.filter((c) => names.includes(c.TABLE_NAME)).length,
      foreignKeys: foreignKeys.length,
      views: views.length,
      outputs: [
        '数据库表结构说明.md',
        '数据库表结构说明.html',
        'mysql-actual-schema.sql',
        'mysql-structure-snapshot.json',
      ],
    }),
  );
} finally {
  await db.end();
}
