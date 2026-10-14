import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mysql = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe';
const loginPath = process.env.MYSQL_LOGIN_PATH || 'zhitu-verify';
const connectionArgs = process.env.MYSQL_VERIFY_USER
  ? ['--no-defaults', '--user=' + process.env.MYSQL_VERIFY_USER, '--host=localhost']
  : ['--login-path=' + loginPath];
const run = (sql) =>
  spawnSync(
    mysql,
    [
      ...connectionArgs,
      '--connect-timeout=5',
      '--default-character-set=utf8mb4',
      '--batch',
      '--raw',
      '--skip-column-names',
    ],
    {
      input: sql,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
function execute(sql) {
  const r = run(sql);
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(r.stderr.trim() || 'MySQL 命令失败');
  return r.stdout.trim();
}
const checks = [];
const report = {
  checkedAt: new Date().toISOString(),
  status: 'running',
  database: null,
  server: null,
  checks,
};
const out = join(root, 'database/mysql-verification.json');
try {
  if (!existsSync(mysql)) throw Error('未找到 MySQL 客户端，请设置 MYSQL_BIN');
  report.server = execute('SELECT VERSION();');
  const name =
    'zhitu_verify_' +
    new Date().toISOString().replace(/\D/g, '').slice(0, 17) +
    '_' +
    Math.random().toString(16).slice(2, 8);
  assert.match(name, /^zhitu_verify_[a-z0-9_]+$/);
  report.database = name;
  let sql = readFileSync(join(root, 'database/zhitu_mysql.sql'), 'utf8');
  assert.equal((sql.match(/CREATE DATABASE IF NOT EXISTS zhitu_classroom/g) || []).length, 1);
  assert.equal((sql.match(/USE zhitu_classroom;/g) || []).length, 1);
  sql = sql
    .replace('CREATE DATABASE IF NOT EXISTS zhitu_classroom', 'CREATE DATABASE `' + name + '`')
    .replace('USE zhitu_classroom;', 'USE `' + name + '`;');
  execute(sql);
  checks.push({ name: '建表及数据导入', ok: true });
  const query = (s) => execute('USE `' + name + '`;\n' + s);
  assert.equal(
    Number(
      query(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE';",
      ),
    ),
    15,
  );
  assert.equal(query('SELECT COUNT(*),SUM(published=1) FROM courses;'), '28\t28');
  assert.equal(query('SELECT COUNT(*) FROM chapters;'), '1900');
  checks.push({ name: '15 张表、28 门上架课程、1900 个章节', ok: true });
  assert.equal(query("SELECT COUNT(*) FROM courses WHERE category='高中课程';"), '8');
  assert.match(query('SELECT title FROM courses WHERE id=9;'), /武忠祥/);
  checks.push({ name: '中文数据与分类', ok: true });
  const sqlite = new DatabaseSync(join(root, 'zhitu.db'), { readOnly: true });
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all();
  let foreignKeys = 0;
  for (const { name: table } of tables) {
    const fields = sqlite.prepare('PRAGMA table_info(' + table + ')').all();
    assert.equal(
      query(
        "SELECT GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ',') FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='" +
          table +
          "';",
      ),
      fields.map((f) => f.name).join(','),
    );
    foreignKeys += sqlite.prepare('PRAGMA foreign_key_list(' + table + ')').all().length;
  }
  sqlite.close();
  assert.equal(
    Number(
      query(
        'SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND referenced_table_name IS NOT NULL;',
      ),
    ),
    foreignKeys,
  );
  checks.push({ name: '字段与 ' + foreignKeys + ' 项外键对齐实际 SQLite 结构', ok: true });
  const positive = query(`START TRANSACTION;
    INSERT INTO users(id,nickname,password) VALUES(-900001,'验证用户','not-a-login-credential');
    INSERT INTO course_visits(user_id,course_id,chapter_id) VALUES(-900001,9,9001);
    INSERT INTO notes(user_id,course_id,chapter_id,at_second,content) VALUES(-900001,9,9001,12.5,'验证笔记');
    INSERT INTO live_events(id,title,teacher,starts_at) VALUES(-900001,'验证直播','验证讲师','2026-09-25T19:00:00+08:00');
    INSERT INTO reservations(user_id,live_id) VALUES(-900001,-900001);
    SELECT COUNT(*) FROM notes WHERE user_id=-900001;
    ROLLBACK;
    SELECT COUNT(*) FROM users WHERE id=-900001;
    SELECT COUNT(*) FROM notes WHERE user_id=-900001;`);
  assert.equal(positive, '1\n0\n0');
  checks.push({ name: '写入、默认时间值、直播预约与事务回滚', ok: true });
  for (const [label, statement, code] of [
    ['外键拒绝孤儿记录', 'INSERT INTO favorites(user_id,course_id) VALUES(-900002,9);', '1452'],
    [
      '唯一昵称约束',
      "INSERT INTO users(id,nickname,password) VALUES(-900002,'唯一性验证','placeholder'),(-900003,'唯一性验证','placeholder');",
      '1062',
    ],
    [
      '联合主键约束',
      "INSERT INTO users(id,nickname,password) VALUES(-900002,'联合主键验证','placeholder'); INSERT INTO favorites(user_id,course_id) VALUES(-900002,9),(-900002,9);",
      '1062',
    ],
  ]) {
    const r = run('USE `' + name + '`;START TRANSACTION;' + statement + 'ROLLBACK;');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, new RegExp('ERROR ' + code + '\\b'));
    checks.push({ name: label, ok: true });
  }
  assert.equal(query('SELECT COUNT(*) FROM users;'), '0');
  assert.equal(query('SELECT COUNT(*) FROM notes;'), '0');
  assert.equal(query('SELECT COUNT(*) FROM reservations;'), '0');
  checks.push({ name: '测试个人记录无残留；验证库仅保留课程导入结果', ok: true });
  report.status = 'passed';
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.error(error.message);
  process.exitCode = 1;
}
