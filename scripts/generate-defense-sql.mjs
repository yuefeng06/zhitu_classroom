// Produce teaching annotations without changing any exported DDL or business data.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const dir = new URL('../database/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'utf8');
const source = read('mysql-actual-schema.sql');
const snapshot = JSON.parse(read('mysql-structure-snapshot.json'));
const definitions = new Map();
let current;
for (const line of read('数据库表结构说明.md').split(/\r?\n/)) {
  const heading = line.match(/^### 表 \d+ (.+) (\w+)$/);
  if (heading) {
    current = { label: heading[1], fields: new Map() };
    definitions.set(heading[2], current);
    continue;
  }
  if (current && /^\| `\w+` \|/.test(line)) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((x) => x.trim());
    current.fields.set(cells[0].replaceAll('`', ''), cells.at(-1));
  }
}
const reasons = {
  users: '用户编号稳定地标识一个人；昵称等业务信息可变化，不能用昵称变化牵动全部关联。',
  courses: '课程标题可能重名或修改，使用独立编号稳定地关联章节、收藏、评论和学习记录。',
  chapters: '不同课程都可能有“第一讲”，独立章节编号便于笔记定位和播放记录关联。',
  comments: '同一用户可多次评论同一课程，每条评论需要独立编号供展示和审核。',
  notes: '同一用户在同一课程、同一章节可以写多条笔记，因此每条笔记单独编号。',
  live_events: '唯一标识历史直播；此表仅兼容保留，当前页面不提供直播。',
  danmaku: '同一课程同一时间点可有多条弹幕，时间或正文不能作为唯一标识。',
  admin_articles: '文章标题可重复或修改，用独立编号定位编辑与公开阅读。',
  admin_audit: '同一对象可被反复操作，每次审计记录独立编号，不能按操作者或目标去重。',
  sessions: '按令牌唯一定位一次会话；一个用户可以有多个会话，所以不以 user_id 为主键。',
  favorites: '用户可收藏多门课程，课程可被多人收藏；两列组合保证同一收藏关系不重复。',
  coins: '当前业务每个用户对每门课程最多保留一条投币关系，并非逐次投币流水。',
  progress: '每个用户在每门课程只维护一份当前进度；再次学习更新该记录。',
  course_visits: '每个用户每门课程只保留最近一次访问；这不是追加每次观看的事件日志。',
  chapter_playback: '每个用户每个章节只保存一份原生播放器位置；其他用户的位置独立保存。',
  study_checkins: '日期单独不能区分用户，用户单独不能区分日期；组合限制每人每天最多打卡一次。',
  follows: '同一用户不能重复关注同名讲师；当前没有讲师实体，teacher 不是讲师外键。',
  reservations: '历史上每个用户对同一直播最多一条预约，当前页面不再使用预约功能。',
  account_status: 'user_id 同时是主键和外键：每个已有用户最多一条状态记录，不要求人人都有记录。',
  admin_accounts:
    'user_id 是主键并逻辑关联 users.id：每个用户最多一条管理员身份；授权脚本验证用户存在。',
  history_resets: '每个已有用户最多保留一个最近清除时间，重复清除更新同一行。',
  comment_moderation: 'comment_id 同时是主键和外键：每条已有评论最多一份当前审核状态。',
};
const extra = {
  users: [
    'nickname 的 UNIQUE 是业务唯一性；id 的 PRIMARY KEY 是稳定身份，两者用途不同。',
    '密码字段保存摘要；此脚本不包含真实账号或密码摘要值。',
  ],
  courses: [
    '当前上架依据 published；status 是旧字段，不能假设二者自动同步。',
    'lessons、students 等普通字段不是主键，不保证实时统计含义。',
  ],
  chapters: [
    'UNIQUE(course_id, position) 表示同一课程章节顺序不能重复，不同课程可都从第1节开始。',
    '它是联合唯一索引，不是联合主键；本表主键只有 id。',
  ],
  notes: [
    '用户、课程和章节均为逻辑关联；接口校验存在性以及章节所属课程。',
    '私有笔记的读写权限由服务端会话及用户归属判断。',
  ],
  progress: [
    'chapter_id 可空且逻辑关联章节；已移除 ON DELETE SET NULL，直接删除章节不会自动清理关联。',
  ],
  course_visits: ['章节与课程是否匹配仍需接口校验；访问记录不等于播放完成度。'],
  study_checkins: ['唯一约束只限制重复日期；日期采用服务器北京时间、禁止补签由接口负责。'],
  sessions: [
    '实际旧结构 user_id 允许 NULL；外键仅校验非NULL值，不能声称每行必然关联用户。',
    '会话过期判断由服务端按 expires（Unix毫秒）执行，主键不会自动使会话失效。',
  ],
  follows: ['若需区分同名讲师，应另建讲师实体并迁移至 teacher_id，不能称当前已具备该外键。'],
  admin_audit: [
    'actor_id 外键只证明用户存在；是否有管理员权限由管理接口校验。',
    'target_id 可指向课程、文章、评论或用户，不是一个固定父表，因此当前没有单表外键。',
  ],
  admin_articles: ['文章写入检查管理员权限与行版本；本轮已移除管理审计表，不再保留操作流水。'],
};
const header = [
  '-- 知途课堂：数据库表结构答辩讲解版（MySQL 8.0）',
  `-- 依据实际结构快照：${snapshot.captured}；源库：${snapshot.database_name}。`,
  '-- 本文件保留原导出的全部建表语句，仅增加中文行注释，不改变实际字段与约束。',
  '-- 用法：在 MySQL Workbench 打开，定位到表逐段讲解。',
  '-- 如需执行建表，仅在已选中的新空库运行；不要在 zhitu_classroom 业务库重复执行。',
  '-- 现场查看业务库请改用配套《答辩演示_只读查询.sql》。',
  '--',
  '-- 讲解顺序：users → courses → chapters → favorites → notes → study_checkins → admin_accounts。',
  '-- PRIMARY KEY：唯一且非空地识别一条记录；一张表只能有一个主键。',
  '-- 联合主键：一个主键由多列组成，组合唯一，不要求每列单独唯一。',
  '-- FOREIGN KEY：约束非NULL引用值必须存在于父表；不代替身份权限和全部业务规则。',
  '-- UNIQUE KEY：约束候选业务值不重复；本项目昵称和章节顺序均非NULL。',
  '-- 普通 KEY：辅助查询和逻辑关联，不限制重复；名称含 fk_ 也不表示存在外键。',
  '-- AUTO_INCREMENT：生成编号，可有间隙；主键并不必须自增。',
  '-- 本轮已移除所有物理外键，关联列和查询索引仍保留。',
  '-- 直接 SQL 不再有外键保护；后台仅下架课程或停用账号，接口负责存在性与归属校验。',
  '--',
];
let table = null,
  count = 0;
const out = [...header];
for (const line of source.split(/\r?\n/)) {
  const start = line.match(/^CREATE TABLE `(\w+)`/);
  if (start) {
    table = start[1];
    assert.ok(reasons[table], `Missing explanation: ${table}`);
    out.push(
      '-- ============================================================',
      `-- ${String(++count).padStart(2, '0')}  ${definitions.get(table)?.label || table}（${table}）`,
      `-- 设计理由：${reasons[table]}`,
    );
    for (const text of extra[table] || []) out.push('-- 答辩补充：' + text);
  }
  const column = table && line.match(/^  `(\w+)` /);
  if (column) {
    const desc = definitions.get(table)?.fields.get(column[1]);
    assert.ok(desc, `Missing field: ${table}.${column[1]}`);
    out.push('  -- ' + desc);
  }
  if (table && /^  PRIMARY KEY/.test(line)) out.push('  -- 主键设计：' + reasons[table]);
  if (table && /^  UNIQUE KEY/.test(line))
    out.push(
      '  -- 唯一索引：' +
        (table === 'users'
          ? line.includes('session_token_hash')
            ? '当前会话摘要唯一；NULL 表示未登录，允许多个用户同时为 NULL。'
            : '阻止同名账号并发重复注册，应用预检查不能替代此约束。'
          : '同一课程内章节顺序唯一，不同课程可以采用相同顺序号。'),
    );
  if (table && /^  KEY /.test(line))
    out.push('  -- 普通索引：辅助相关列的查询；不会禁止这些列出现重复值。');
  const constraint = table && line.match(/^  CONSTRAINT `([^`]+)` FOREIGN KEY/);
  if (constraint) {
    const fk = snapshot.foreignKeys.find(
      (f) => f.TABLE_NAME === table && f.CONSTRAINT_NAME === constraint[1],
    );
    assert.ok(fk);
    const nullable =
      snapshot.columns.find((c) => c.TABLE_NAME === table && c.COLUMN_NAME === fk.COLUMN_NAME)
        ?.IS_NULLABLE === 'YES';
    out.push(
      `  -- 外键：${fk.COLUMN_NAME} 引用 ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}，${nullable ? '非NULL的引用值' : '引用值'}必须对应已有父记录。`,
    );
    out.push(
      '  -- 删除规则：' +
        ({
          CASCADE: 'CASCADE，删除父记录时同时删除对应子记录。',
          'SET NULL': 'SET NULL，删除父记录时将本列置空，保留子记录。',
          'NO ACTION': 'NO ACTION，存在子记录引用时阻止删除父记录；未显式书写时此处采用默认规则。',
          RESTRICT: 'RESTRICT，存在引用时阻止删除父记录。',
        }[fk.DELETE_RULE] || fk.DELETE_RULE),
    );
  }
  if (line.startsWith('CREATE SQL SECURITY INVOKER VIEW'))
    out.push(
      '-- 统计视图：不是额外保存数据的基础表，不单独设置主键。',
      '-- 当前旧视图按课程标题分组，同名课程会合并；也未排除被隐藏评论。',
      '-- 此定义按现状保留，不能讲成按课程编号统计公开评论的新接口。',
    );
  out.push(line);
  if (line.startsWith(') ENGINE=')) table = null;
}
const result = out.join('\n');
const withoutComments = (s) =>
  s
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
    .trim();
assert.equal(withoutComments(result), withoutComments(source), 'Annotations must not alter DDL');
assert.equal(count, snapshot.tables.filter((t) => t.TABLE_TYPE === 'BASE TABLE').length);
writeFileSync(new URL('数据库表结构_答辩讲解版.sql', dir), result);
console.log(
  JSON.stringify({
    tables: count,
    foreignKeys: snapshot.foreignKeys.length,
    ddlUnchanged: true,
    output: 'database/数据库表结构_答辩讲解版.sql',
  }),
);
