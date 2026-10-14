// Convert this thesis draft, including its three diagrams, without a build dependency.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('./', import.meta.url);
const lines = readFileSync(new URL('毕业论文初稿.md', root), 'utf8')
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/);
const escape = (s) =>
  s.replace(
    /[\\{}%&#_$^~]/g,
    (c) =>
      ({
        '\\': '\\textbackslash{}',
        '{': '\\{',
        '}': '\\}',
        '%': '\\%',
        '&': '\\&',
        '#': '\\#',
        '_': '\\_',
        '$': '\\$',
        '^': '\\textasciicircum{}',
        '~': '\\textasciitilde{}',
      })[c],
  );
function inline(s, bibliography = false) {
  const tokens = [];
  const stash = (t) => '\u0000' + (tokens.push(t) - 1) + '\u0000';
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s]+|zhitu-classroom-source\.zip)\)/g,
    (_, label, url) =>
      stash(
        !bibliography && /^\d+$/.test(label)
          ? '\\cite{ref' + label + '}'
          : '\\href{' + url.replace(/%/g, '\\%').replace(/#/g, '\\#') + '}{' + escape(label) + '}',
      ),
  );
  s = s.replace(/[A-Za-z0-9_./:-]{13,}/g, (x) => stash('\\path{' + x + '}'));
  return escape(s).replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[i]);
}
const diagrams = [
  String.raw`
\begin{figure}[htbp]\centering
\begin{tikzpicture}[box/.style={draw=Line,rounded corners=3pt,fill=Paper,align=center,text width=4cm,minimum height=1cm,font=\small},flow/.style={-{Stealth[length=2mm]},draw=Ink}]
\node[box] (ui) at (0,0) {浏览器页面\\课程、学习、发现、个人中心};
\node[box,text width=3.4cm] (local) at (5,0) {浏览器存储\\偏好、搜索、专注计时};
\node[box] (http) at (0,-1.9) {Node.js HTTP 入口\\同源静态资源与 API};
\node[box,text width=3.4cm] (media) at (5,-1.9) {独立媒体来源\\原站 iframe / 原生直链};
\node[box] (api) at (0,-3.8) {业务层\\认证、关系校验、事务};
\node[box,text width=3.4cm] (db) at (-1.9,-5.7) {MySQL\\账户及业务记录};
\node[box,text width=3.4cm] (file) at (3,-5.7) {头像文件目录};
\draw[flow] (ui)--(http);\draw[flow] (http)--(api);\draw[flow] (ui)--(local);
\draw[flow] (ui.east)--++(.45,0)|-(media.west);
\draw[flow] (api)--(db);\draw[flow] (api)--(file);
\end{tikzpicture}
\caption{系统总体架构}\label{fig:architecture}
\end{figure}
`,
  String.raw`
\begin{figure}[htbp]\centering
\begin{tikzpicture}[box/.style={draw=Line,rounded corners=2pt,fill=Paper,align=center,text width=2.35cm,minimum height=.85cm,font=\small},rel/.style={-{Stealth[length=1.7mm]},draw=Ink},every edge quotes/.style={font=\scriptsize,fill=white,inner sep=1pt}]
\node[box] (u) at (0,0) {用户};\node[box] (c) at (8,0) {课程};
\node[box] (f) at (4,0) {收藏};\node[box] (ch) at (8,-2) {章节};
\node[box] (v) at (4,-2) {最近访问};\node[box] (n) at (4,-4) {私有笔记};
\node[box] (p) at (8,-6) {章节播放};\node[box] (d) at (0,-6) {每日打卡};
\draw[rel] (u)--node[above,font=\scriptsize]{1:N}(f);
\draw[rel] (c)--node[above,font=\scriptsize]{1:N}(f);
\draw[rel] (c)--node[right,font=\scriptsize]{1:N}(ch);
\draw[rel] (u.south)--++(0,-1)|-(v.west);
\draw[rel] (u.south)--++(0,-4)--(n.west);
\draw[rel] (u)--node[left,font=\scriptsize]{1:N}(d);
\draw[rel] (u.west)--++(-.5,0)|-([yshift=-.9cm]p.south)--(p.south);
\draw[rel] (c.east)--++(.65,0)|-(v.north east);
\draw[rel] (c.east)--++(1,0)|-(n.south east);
\draw[rel] (ch)--(v);\draw[rel] (ch)--(n);\draw[rel] (ch)--(p);
\end{tikzpicture}
\caption{核心学习数据关系（局部，箭头从父表指向关联记录，均为一对多）}\label{fig:relations}
\end{figure}
`,
  String.raw`
\begin{figure}[htbp]\centering
\begin{tikzpicture}[box/.style={draw=Line,rounded corners=3pt,fill=Paper,align=center,text width=5.2cm,minimum height=.85cm,font=\small},decision/.style={diamond,aspect=3,draw=Line,align=center,font=\small,inner sep=2pt},flow/.style={-{Stealth[length=2mm]},draw=Ink}]
\node[box] (a) at (0,0) {收到打卡请求};
\node[decision] (b) at (0,-1.5) {有效会话且正文为空？};
\node[box,text width=2cm] (x) at (5,-1.5) {返回错误};
\node[box] (c) at (0,-3) {服务器计算北京时间日期};
\node[box] (d) at (0,-4.4) {开启事务并锁定用户行};
\node[decision] (e) at (0,-5.9) {当天记录已存在？};
\node[box,text width=2cm] (f) at (5,-5.9) {插入记录};
\node[box] (h) at (0,-7.5) {提交，查询近 365 天记录};
\node[box] (i) at (0,-8.9) {返回日历与统计};
\draw[flow] (a)--(b);\draw[flow] (b)--node[above,font=\small]{否}(x);
\draw[flow] (b)--node[left,font=\small]{是}(c);\draw[flow] (c)--(d);\draw[flow] (d)--(e);
\draw[flow] (e)--node[above,font=\small]{否}(f);\draw[flow] (e)--node[left,font=\small]{是}(h);
\draw[flow] (f)|-(h);\draw[flow] (h)--(i);
\end{tikzpicture}
\caption{每日打卡处理流程}\label{fig:checkin}
\end{figure}
`,
];
let output = String.raw`% !TEX program = xelatex
% Generated from 毕业论文初稿.md by generate-latex.mjs.
\documentclass[UTF8,12pt,a4paper,oneside,openany]{ctexbook}
\usepackage[margin=2.5cm,headheight=16pt]{geometry}
\usepackage{booktabs,longtable,array,enumitem,xcolor,fancyhdr,tikz,xurl}
\usetikzlibrary{arrows.meta,shapes.geometric,quotes}
\usepackage{hyperref}
\definecolor{Ink}{HTML}{252731}\definecolor{Line}{HTML}{BAA4AD}\definecolor{Paper}{HTML}{FFF8FA}
\hypersetup{colorlinks=true,linkcolor=Ink,citecolor=Ink,urlcolor=Ink,bookmarksnumbered=true,pdftitle={基于 Node.js 与 MySQL 的在线学习平台设计与实现}}
\setlength{\parindent}{2em}\setlength{\parskip}{.3em}\setlength{\emergencystretch}{3em}
\setlist{leftmargin=2em,itemsep=.2em}\renewcommand{\arraystretch}{1.2}
\newcolumntype{P}[1]{>{\raggedright\arraybackslash}p{#1}}
\pagestyle{fancy}\fancyhf{}\fancyhead[L]{\small 知途课堂毕业设计论文初稿}\fancyhead[R]{\small 2026年10月8日}\fancyfoot[C]{\thepage}
\begin{document}
\begin{titlepage}\centering\vspace*{2cm}
{\LARGE 本科毕业设计论文（初稿）\par}\vspace{1.6cm}
{\Huge\bfseries 基于 Node.js 与 MySQL 的\\[.4cm]在线学习平台设计与实现\par}
\vspace{.8cm}{\Large ——以“知途课堂”为例\par}\vfill
\begin{tabular}{rl}作者：&\underline{\hspace{7cm}}\\[.6cm]学号：&\underline{\hspace{7cm}}\\[.6cm]专业：&\underline{\hspace{7cm}}\\[.6cm]指导教师：&\underline{\hspace{7cm}}\end{tabular}
\vspace{1.5cm}\par 2026年10月8日\end{titlepage}
\frontmatter
`;
let started = false,
  main = false,
  bib = false,
  appendix = false,
  figure = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!started) {
    if (line !== '## 摘要') continue;
    started = true;
  }
  if (line.startsWith('```mermaid')) {
    while (++i < lines.length && !lines[i].startsWith('```')) {}
    output += diagrams[figure++] + '\n';
    continue;
  }
  if (/^图\d-\d /.test(line)) continue;
  if (line.startsWith('## ')) {
    const title = line.slice(3);
    if (bib) {
      output += '\\end{thebibliography}\n';
      bib = false;
    }
    if (title === '参考文献') {
      output += '\\begin{thebibliography}{99}\n\\addcontentsline{toc}{chapter}{参考文献}\n';
      bib = true;
      continue;
    }
    if (/^第.+章 /.test(title)) {
      if (!main) {
        output += '\\tableofcontents\n\\mainmatter\n';
        main = true;
      }
      output += '\\chapter{' + inline(title.replace(/^第.+?章 /, '')) + '}\n';
    } else if (/^附录[A-Z] /.test(title)) {
      if (!appendix) {
        output += '\\appendix\n';
        appendix = true;
      }
      output += '\\chapter{' + inline(title.replace(/^附录[A-Z] /, '')) + '}\n';
    } else
      output +=
        '\\chapter*{' +
        inline(title) +
        '}\n\\addcontentsline{toc}{chapter}{' +
        inline(title) +
        '}\n';
    continue;
  }
  if (line.startsWith('### ')) {
    output += '\\section{' + inline(line.slice(4).replace(/^\d+\.\d+ /, '')) + '}\n';
    continue;
  }
  if (/^表\d-\d /.test(line)) {
    output += '\n\\noindent\\textbf{' + inline(line) + '}\n';
    continue;
  }
  if (line.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      const cells = lines[i++]
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (!cells.every((c) => /^[-:]+$/.test(c))) rows.push(cells);
    }
    i--;
    const count = rows[0].length,
      widths = count === 3 ? [0.32, 0.24, 0.32] : Array(count).fill(0.88 / count);
    output +=
      '{\\small\n\\begin{longtable}{' +
      widths.map((w) => 'P{' + w + '\\textwidth}').join('') +
      '}\n\\toprule\n' +
      rows[0].map((x) => inline(x)).join(' & ') +
      ' \\\\\n\\midrule\n\\endhead\n';
    output +=
      rows
        .slice(1)
        .map((r) => r.map((x) => inline(x)).join(' & ') + ' \\\\')
        .join('\n') + '\n\\bottomrule\n\\end{longtable}}\n';
    continue;
  }
  if (bib) {
    const match = line.match(/^\[(\d+)\] (.+)$/);
    if (match) output += '\\bibitem{ref' + match[1] + '} ' + inline(match[2], true) + '\n';
    continue;
  }
  if (/^\d+\. /.test(line)) {
    output += '\\begin{enumerate}\n';
    while (i < lines.length && /^\d+\. /.test(lines[i]))
      output += '\\item ' + inline(lines[i++].replace(/^\d+\. /, '')) + '\n';
    i--;
    output += '\\end{enumerate}\n';
    continue;
  }
  output += line ? inline(line) + '\n\n' : '\n';
}
if (bib) output += '\\end{thebibliography}\n';
if (figure !== 3) throw Error('Expected three diagrams');
output += '\\end{document}\n';
writeFileSync(new URL('毕业论文初稿.tex', root), output);
console.log('Generated thesis LaTeX with', figure, 'diagrams and numbered bibliography.');
