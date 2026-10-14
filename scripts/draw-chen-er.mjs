import fs from 'node:fs';
// Preserve the prior physical overview; the new default is a Chen-style conceptual diagram.
for (const ext of ['svg', 'png'])
  if (fs.existsSync('database/ER.' + ext) && !fs.existsSync('database/ER-physical.' + ext))
    fs.copyFileSync('database/ER.' + ext, 'database/ER-physical.' + ext);
const W = 1760,
  H = 1580;
let edges = [],
  nodes = [];
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
function line(x1, y1, x2, y2, dash = false) {
  edges.push(
    `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="#424242" stroke-width="2"${dash ? ' stroke-dasharray="7 5"' : ''}/>`,
  );
}
function text(x, y, label, size = 22, extra = '') {
  nodes.push(
    `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" ${extra}>${esc(label)}</text>`,
  );
}
function entity(x, y, label) {
  nodes.push(
    `<rect x="${x - 92}" y="${y - 28}" width="184" height="56" fill="white" stroke="#333" stroke-width="2.4"/>`,
  );
  text(x, y + 8, label, 25);
  return { x, y };
}
function attribute(e, x, y, label, key = false) {
  const width = Math.max(124, label.length * 21 + 32);
  const dx = e.x - x,
    dy = e.y - y;
  const scale = Math.max(Math.abs(dx) / (width / 2), Math.abs(dy) / 22);
  const ax = x + dx / scale,
    ay = y + dy / scale;
  const es = Math.max(Math.abs(dx) / 92, Math.abs(dy) / 28);
  line(e.x - dx / es, e.y - dy / es, ax, ay);
  nodes.push(
    `<rect x="${x - width / 2}" y="${y - 22}" width="${width}" height="44" rx="18" fill="white" stroke="#555" stroke-width="1.8"/>`,
  );
  text(x, y + 7, label, 20, key ? 'text-decoration="underline"' : '');
}
function relation(a, b, x, y, label, left = '1', right = 'n') {
  const rx = 64,
    ry = 36;
  for (const [e, card] of [
    [a, left],
    [b, right],
  ]) {
    const dx = e.x - x,
      dy = e.y - y;
    const scale = Math.abs(dx) / rx + Math.abs(dy) / ry;
    const sx = x + dx / scale,
      sy = y + dy / scale;
    const es = Math.max(Math.abs(dx) / 92, Math.abs(dy) / 28);
    const tx = e.x - dx / es,
      ty = e.y - dy / es;
    line(sx, sy, tx, ty);
    const px = tx + (sx - tx) * 0.28,
      py = ty + (sy - ty) * 0.28;
    text(px + (Math.abs(dx) < 60 ? 18 : 0), py - 9, card, 21, 'font-weight="bold"');
  }
  nodes.push(
    `<path d="M${x} ${y - ry} L${x + rx} ${y} L${x} ${y + ry} L${x - rx} ${y} Z" fill="white" stroke="#333" stroke-width="2"/>`,
  );
  text(x, y + 7, label, 21);
}
const user = entity(370, 565, '用户'),
  course = entity(1330, 565, '课程'),
  comment = entity(850, 220, '评论'),
  live = entity(370, 1050, '直播'),
  chapter = entity(1330, 1050, '章节'),
  note = entity(850, 1350, '笔记');
attribute(user, 130, 420, '用户编号', true);
attribute(user, 120, 510, '昵称');
attribute(user, 120, 600, '密码摘要');
attribute(user, 130, 690, '头像');
attribute(user, 370, 390, '注册时间');
attribute(course, 1580, 410, '课程编号', true);
attribute(course, 1590, 490, '课程名称');
attribute(course, 1590, 570, '分类 / 学科');
attribute(course, 1590, 650, '讲师');
attribute(course, 1580, 730, '上架状态');
attribute(course, 1330, 390, '课程简介');
attribute(comment, 625, 110, '评论编号', true);
attribute(comment, 850, 95, '评论内容');
attribute(comment, 1080, 110, '创建时间');
attribute(live, 130, 950, '直播编号', true);
attribute(live, 120, 1040, '直播主题');
attribute(live, 135, 1130, '讲师');
attribute(live, 370, 1220, '开始时间');
attribute(chapter, 1580, 960, '章节编号', true);
attribute(chapter, 1590, 1050, '章节标题');
attribute(chapter, 1580, 1140, '时长');
attribute(chapter, 1340, 1230, '章节顺序');
attribute(note, 545, 1490, '笔记编号', true);
attribute(note, 745, 1490, '笔记内容');
attribute(note, 955, 1490, '视频时间点');
attribute(note, 1165, 1490, '创建时间');
relation(user, comment, 520, 300, '发表');
relation(course, comment, 1180, 300, '拥有');
relation(user, course, 850, 465, '收藏', 'm', 'n');
relation(user, course, 850, 565, '学习', 'm', 'n');
relation(user, course, 850, 665, '投币', 'm', 'n');
relation(user, live, 370, 835, '预约', 'm', 'n');
relation(course, chapter, 1330, 835, '包含');
relation(user, note, 635, 1005, '记录');
relation(chapter, note, 1100, 1220, '对应');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/><g font-family="Microsoft YaHei,Arial,sans-serif" fill="#333"><text x="880" y="42" font-size="29" text-anchor="middle" font-weight="bold">知途课堂系统 E-R 图</text>${edges.join('')}${nodes.join('')}<text x="880" y="1550" text-anchor="middle" font-size="16" fill="#666">矩形：实体　菱形：关系　圆角框：主要属性　下划线：主键　1 / m / n：最大关联基数</text></g></svg>`;
fs.writeFileSync('database/ER.svg', svg);
fs.writeFileSync(
  'database/ER概念图说明.md',
  `# 样例风格 E-R 图

本图按参考样例使用 Chen 表示法：矩形为实体、菱形为联系、圆角框为属性，下划线标识主键，1 / m / n 标识最大关联基数。图中省略最小基数及部分辅助字段，属于核心业务概念图，不是完整物理表结构图。

## 图中联系与实际存储

| 联系 | 基数 | 对应实现 |
| --- | --- | --- |
| 用户发表评论 | 1:n | comments.user_id |
| 课程拥有评论 | 1:n | comments.course_id |
| 用户收藏课程 | m:n | favorites |
| 用户学习课程 | m:n | progress、course_visits；章节播放细分存储于 chapter_playback |
| 用户给课程投币 | m:n | coins |
| 用户预约直播 | m:n | reservations |
| 课程包含章节 | 1:n | chapters.course_id |
| 用户记录笔记 | 1:n | notes.user_id |
| 章节对应笔记 | 1:n | notes.chapter_id；notes.course_id 同时保存所属课程 |

“分类 / 学科”在物理模型中为 category 和 subject 两列。讲师在当前实现中是文本字段，未虚构教师实体；用户密码保存摘要。

登录会话 sessions、讲师关注 follows、弹幕 danmaku 等辅助表未放入核心概念图，以保持与样例相近的清晰度。完整 15 张表及全部字段仍见 ER.mmd、ER说明.md；原分区物理关系图保留为 ER-physical.svg / ER-physical.png。

执行 node scripts/draw-chen-er.mjs 可重新生成 ER.svg；PNG 需要重新渲染。数据库导出脚本只更新物理关系图，不覆盖此概念图。
`,
);
