import { readFile, writeFile } from 'node:fs/promises';

const specs = [
  [
    15,
    'BV1oh4y1s7Lb',
    '高中语文 · 大题答题模板',
    '高中课程',
    '语文',
    '学过石油的语文老师',
    '语文 · 表达',
    'rose',
    '高考答题',
  ],
  [
    16,
    'BV147411K7xu',
    '高中数学 · 基础与解法全集',
    '高中课程',
    '数学',
    null,
    '数学 · 方法',
    'green',
    '基础与解法',
  ],
  [
    17,
    'BV1D54y1m7Av',
    '高中物理一轮复习 · 运动学',
    '高中课程',
    '物理',
    null,
    '物理 · 运动',
    'blue',
    '一轮复习',
  ],
  [
    18,
    'BV1A5411E7Q1',
    '高中物理一轮复习 · 电场',
    '高中课程',
    '物理',
    null,
    '物理 · 电场',
    'gold',
    '一轮复习',
  ],
  [
    19,
    'BV1Xb4y1Q7Eq',
    '高中物理一轮复习 · 磁场圆周',
    '高中课程',
    '物理',
    null,
    '物理 · 磁场',
    'navy',
    '一轮复习',
  ],
  [
    20,
    'BV1Qi4y1R7tW',
    '高中化学 · 基础与解法全集',
    '高中课程',
    '化学',
    null,
    '化学 · 反应',
    'orange',
    '基础与解法',
  ],
  [
    21,
    'BV1kr4y1v7uf',
    '高中地理 300 讲（上）',
    '高中课程',
    '地理',
    null,
    '地理 · 世界',
    'green',
    '系统学习',
  ],
  [
    22,
    'BV1YC4y1o7E3',
    '高中生物 · 基础与解法全集',
    '高中课程',
    '生物',
    null,
    '生物 · 生命',
    'purple',
    '基础与解法',
  ],
  [
    23,
    'BV1b7411N798',
    '王道计算机考研 · 数据结构',
    '考研课程',
    '408 专业课',
    '王道论坛',
    '408 · 数据结构',
    'navy',
    '考研专业课',
  ],
  [
    24,
    'BV1YE411D7nH',
    '王道计算机考研 · 操作系统',
    '考研课程',
    '408 专业课',
    '王道论坛',
    '408 · 操作系统',
    'blue',
    '考研专业课',
  ],
  [
    25,
    'BV1ps4y1d73V',
    '王道计算机考研 · 计算机组成原理',
    '考研课程',
    '408 专业课',
    '王道论坛',
    '408 · 组成原理',
    'gold',
    '考研专业课',
  ],
  [
    26,
    'BV19E411D78Q',
    '王道计算机考研 · 计算机网络',
    '考研课程',
    '408 专业课',
    '王道论坛',
    '408 · 计算机网络',
    'purple',
    '考研专业课',
  ],
  [
    27,
    'BV13NCrBVEN3',
    '考研线性代数 · 复习课程',
    '考研课程',
    '数学',
    null,
    '线代 · 满分',
    'green',
    '复习强化',
  ],
  [
    28,
    'BV16NhA6sE7J',
    '花生老师 · 言语理解知识点速通',
    '考公课程',
    '言语理解',
    '花生老师',
    '行测 · 言语',
    'rose',
    '知识点速通',
  ],
  [
    29,
    'BV1rH4y1N7BW',
    'MIT · 线性代数公开课',
    '海外公开课',
    '数学',
    'MIT',
    'MIT · 线性代数',
    'green',
    '大学公开课',
  ],
  [
    30,
    'BV1EK411x7TP',
    'Harvard CS50 · SQL 数据库入门',
    '海外公开课',
    '数据库',
    'Harvard CS50',
    'CS50 · SQL',
    'red',
    '中英字幕',
  ],
  [
    31,
    'BV1qh411p7Sa',
    'The Cherno · C++ 系列教程',
    '大学与技术公开课',
    'C++',
    'The Cherno',
    'Cherno · C++',
    'navy',
    '系统学习',
  ],
  [
    32,
    'BV1Eo4y1d7KZ',
    'MIT Missing Semester · Shell 与课程概览',
    '海外公开课',
    '开发工具',
    'MIT',
    'MIT · Shell',
    'gold',
    '系列首讲',
  ],
  [
    33,
    'BV13a411c7Qo',
    'UC Berkeley CS186 · 数据库系统导论',
    '海外公开课',
    '数据库',
    'UC Berkeley',
    'CS186 · 数据库',
    'blue',
    'Fall 2018',
  ],
  [
    34,
    'BV1SMe36KEC2',
    '李宏毅 · 机器学习与深度学习',
    '大学与技术公开课',
    '人工智能',
    '李宏毅',
    'AI · 机器学习',
    'purple',
    '入门与进阶',
  ],
  [
    35,
    'BV1Yt41197sM',
    '尚学堂马士兵 · Java 系列教程',
    '大学与技术公开课',
    'Java',
    '马士兵',
    'Java · 开发',
    'orange',
    '系统学习',
  ],
  [
    36,
    'BV19r4y1b7Aw',
    '哈尔滨工业大学 · 操作系统',
    '大学与技术公开课',
    '操作系统',
    '李治军',
    'OS · 操作系统',
    'navy',
    '大学公开课',
  ],
  [
    37,
    'BV1uW4y1v7xr',
    '考研电路 · 电路原理零基础精讲',
    '考研课程',
    '电路原理',
    null,
    '电路 · 原理',
    'blue',
    '零基础入门',
  ],
  [
    38,
    'BV19N411U7Pc',
    '公务员行测 · 数量关系系统课',
    '考公课程',
    '数量关系',
    null,
    '行测 · 数量',
    'gold',
    '系统学习',
  ],
  [
    39,
    'BV1AuoMBBE2p',
    '2026 考研数学一真题 · 李烈逐题讲解',
    '考研课程',
    '数学',
    '李烈',
    '数一 · 2026 真题',
    'blue',
    '真题精讲',
  ],
  [
    40,
    'BV1a96DYgEYZ',
    '2025 考研数学一真题 · 李烈逐题讲解',
    '考研课程',
    '数学',
    '李烈',
    '数一 · 2025 真题',
    'purple',
    '真题精讲',
  ],
  [
    41,
    'BV1KXeu6tEUy',
    '27 考研数学一 · 真题分类逐题讲解',
    '考研课程',
    '数学',
    null,
    '数一 · 分类真题',
    'navy',
    '分类复习',
  ],
  [
    42,
    'BV1zH4y117JX',
    '概率救命 · 概率知识串讲',
    '考研课程',
    '数学',
    null,
    '概率 · 知识串讲',
    'rose',
    '概率复习',
  ],
];
const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const requestedIds = idsArg ? idsArg.slice(6).split(',').map(Number) : null;
if (requestedIds?.some((id) => !specs.some((s) => s[0] === id))) throw Error('存在未知课程编号');
const selected = requestedIds ? specs.filter((s) => requestedIds.includes(s[0])) : specs;
const file = new URL('../database/video-catalog.json', import.meta.url);
const original = JSON.parse(await readFile(file, 'utf8'));
const updated = [];
const failures = [];
// Keep requests modest and preserve the last working catalog on any failure.
for (let offset = 0; offset < selected.length; offset += 3) {
  const results = await Promise.allSettled(
    selected
      .slice(offset, offset + 3)
      .map(async ([id, bvid, title, category, subject, teacher, cover, accent, level]) => {
        const response = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, {
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw Error(`${bvid}: HTTP ${response.status}`);
        const result = await response.json();
        if (result.code !== 0 || !result.data?.pages?.length)
          throw Error(`${bvid}: ${result.code} ${result.message}`);
        const d = result.data;
        return {
          id,
          bvid,
          title,
          category,
          subject,
          teacher: teacher || d.owner.name,
          cover,
          accent,
          level,
          sourceTitle: d.title,
          uploader: d.owner.name,
          fetchedAt: new Date().toISOString(),
          pages: d.pages.map((p) => ({
            page: p.page,
            cid: p.cid,
            title: p.part,
            seconds: p.duration,
          })),
        };
      }),
  );
  for (const result of results)
    if (result.status === 'fulfilled') {
      updated.push(result.value);
      console.log(
        JSON.stringify({
          id: result.value.id,
          title: result.value.title,
          teacher: result.value.teacher,
          pages: result.value.pages.length,
          first: result.value.pages[0].title,
          last: result.value.pages.at(-1).title,
        }),
      );
    } else {
      failures.push(String(result.reason));
      console.error(String(result.reason));
    }
}
if (failures.length) throw Error('未覆盖原目录：' + failures.join('; '));
const map = new Map(original.map((c) => [c.id, c]));
for (const c of updated) map.set(c.id, c);
const subjects = { 10: 'Python', 11: '政治', 12: '英语', 13: '逻辑判断', 14: 'C++' };
for (const c of map.values()) {
  if (['计算机课程', '海外公开课'].includes(c.category)) c.category = '大学与技术公开课';
  if (c.category === '考研公共课') c.category = '考研课程';
  c.subject ||= subjects[c.id] || '';
}
await writeFile(
  file,
  JSON.stringify(
    [...map.values()].sort((a, b) => a.id - b.id),
    null,
    2,
  ) + '\n',
);
console.log(
  '新接入课程：' +
    updated.length +
    '；新分集：' +
    updated.reduce((sum, c) => sum + c.pages.length, 0),
);
