import '../backend/config.mjs';
import mysql from 'mysql2/promise';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mysqlOptions } from '../backend/config.mjs';
import { relationships } from '../backend/relationships.mjs';

const removed = ['coins', 'comment_moderation', 'admin_audit', 'sessions', 'account_status'];
const additions = [
  ['users', 'disabled', 'BIGINT NOT NULL DEFAULT 0'],
  [
    'users',
    'session_token_hash',
    'CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL',
  ],
  ['users', 'session_expires', 'BIGINT NULL DEFAULT NULL'],
  ['comments', 'hidden', 'BIGINT NOT NULL DEFAULT 0'],
];
const ident = (s) => '`' + s.replaceAll('`', '``') + '`';

export async function simplifySchema(db, { apply = false, maintenance = false, backupDir } = {}) {
  const [[info]] = await db.query('SELECT DATABASE() AS name');
  if (!info.name) throw Error('请明确选择待迁移数据库');
  const lockName = 'zhitu-simplify:' + info.name;
  const [[lock]] = await db.query('SELECT GET_LOCK(?,5) AS acquired', [lockName]);
  if (lock.acquired !== 1) throw Error('已有结构精简任务运行中');
  try {
    const [tables] = await db.query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'",
    );
    const names = new Set(tables.map((t) => t.name));
    if (!names.has('users') || !names.has('comments'))
      throw Error('缺少 users/comments，拒绝修改非项目库');
    const [columns] = await db.query(
      'SELECT TABLE_NAME AS t,COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()',
    );
    const has = (t, c) => columns.some((v) => v.t === t && v.c === c);
    const [foreignKeys] = await db.query(
      'SELECT TABLE_NAME AS t,CONSTRAINT_NAME AS name FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()',
    );
    const [external] = await db.query(
      'SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND TABLE_SCHEMA<>DATABASE() LIMIT 1',
    );
    if (external.length) throw Error('存在跨库引用，需要单独处理，未修改');
    const checks = [
      ...relationships,
      ['account_status', 'user_id', 'users'],
      ['sessions', 'user_id', 'users'],
      ['comment_moderation', 'comment_id', 'comments'],
    ];
    for (const [child, column, parent] of checks) {
      if (!names.has(child) || !has(child, column)) continue;
      const [[row]] = await db.query(
        `SELECT COUNT(*) AS n FROM ${ident(child)} c LEFT JOIN ${ident(parent)} p ON p.id=c.${ident(column)} WHERE c.${ident(column)} IS NOT NULL AND p.id IS NULL`,
      );
      if (row.n) throw Error(`发现逻辑孤儿：${child}.${column}，需先处理，未自动删除数据`);
    }
    const statements = [];
    const addedColumns = additions.filter(([t, c]) => !has(t, c));
    for (const [t, c, type] of addedColumns)
      statements.push(`ALTER TABLE ${ident(t)} ADD COLUMN ${ident(c)} ${type}`);
    const [indexes] = await db.query('SHOW INDEX FROM users');
    if (
      !indexes.some(
        (i) =>
          i.Column_name === 'session_token_hash' &&
          i.Non_unique === 0 &&
          indexes.filter((x) => x.Key_name === i.Key_name).length === 1,
      )
    )
      statements.push(
        'ALTER TABLE users ADD UNIQUE INDEX uq_users_session_token_hash(session_token_hash)',
      );
    if (names.has('account_status'))
      statements.push(
        'UPDATE users u JOIN account_status s ON s.user_id=u.id SET u.disabled=s.disabled',
      );
    if (names.has('comment_moderation'))
      statements.push(
        'UPDATE comments c JOIN comment_moderation m ON m.comment_id=c.id SET c.hidden=m.hidden',
      );
    if (names.has('sessions'))
      statements.push(`UPDATE users u LEFT JOIN (
      SELECT user_id,token,expires,ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY expires DESC,token DESC) AS rn
      FROM sessions WHERE expires>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)
    ) s ON s.user_id=u.id AND s.rn=1
    SET u.session_token_hash=CASE WHEN u.disabled=0 AND s.token IS NOT NULL THEN SHA2(s.token,256) ELSE NULL END,
        u.session_expires=CASE WHEN u.disabled=0 THEN s.expires ELSE NULL END`);
    for (const fk of foreignKeys)
      statements.push(`ALTER TABLE ${ident(fk.t)} DROP FOREIGN KEY ${ident(fk.name)}`);
    for (const name of removed.filter((n) => names.has(n)))
      statements.push(`DROP TABLE ${ident(name)}`);
    const counts = {};
    for (const name of names)
      counts[name] = Number((await db.query(`SELECT COUNT(*) AS n FROM ${ident(name)}`))[0][0].n);
    const plan = {
      database: info.name,
      applied: false,
      foreignKeys: foreignKeys.length,
      removedTables: removed.filter((n) => names.has(n)),
      counts,
      statements: statements.length,
    };
    if (!apply || !statements.length) return { ...plan, applied: apply };
    if (!maintenance) throw Error('执行前请停止网站写入，并明确传入 --maintenance；预检不需要停机');
    const directory =
      backupDir ||
      fileURLToPath(
        new URL(
          '../database/backups/simplify-' + new Date().toISOString().replace(/[:.]/g, '-') + '/',
          import.meta.url,
        ),
      );
    await mkdir(directory, { recursive: true });
    const backup = { database: info.name, counts, tables: {}, addedColumns };
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    try {
      for (const name of names) {
        const [[ddl]] = await db.query(`SHOW CREATE TABLE ${ident(name)}`);
        const rows = ['users', 'comments', ...removed].includes(name)
          ? (await db.query(`SELECT * FROM ${ident(name)}`))[0]
          : null;
        backup.tables[name] = { ddl: ddl['Create Table'], rows };
      }
      await db.commit();
    } catch (e) {
      await db.rollback();
      throw e;
    }
    // Contains password hashes and old sessions: private, gitignored, never served by HTTP.
    await writeFile(join(directory, 'before.json'), JSON.stringify(backup, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    await writeFile(join(directory, 'apply.sql'), statements.join(';\n') + ';\n', { flag: 'wx' });
    const rollback = [
      '-- 仅用于本次迁移后、网站仍停机且尚无新写入时的恢复。先核对 before.json 与目标库。',
      'USE ' + ident(info.name) + ';',
    ];
    for (const name of removed.filter((n) => names.has(n))) {
      const saved = backup.tables[name];
      rollback.push(
        saved.ddl.replace(/^  CONSTRAINT .*FOREIGN KEY[^\n]*\n?/gm, '').replace(/,\n\)/g, '\n)') +
          ';',
      );
      for (const row of saved.rows)
        rollback.push(
          `INSERT INTO ${ident(name)} (${Object.keys(row).map(ident).join(',')}) VALUES (${Object.values(
            row,
          )
            .map((v) =>
              v === null
                ? 'NULL'
                : typeof v === 'number'
                  ? String(v)
                  : 'CONVERT(0x' + Buffer.from(String(v)).toString('hex') + ' USING utf8mb4)',
            )
            .join(',')});`,
        );
    }
    for (const [t, c] of [...addedColumns].reverse())
      rollback.push(`ALTER TABLE ${ident(t)} DROP COLUMN ${ident(c)};`);
    for (const [name, saved] of Object.entries(backup.tables)) {
      for (const line of saved.ddl.split('\n').filter((l) => /^  CONSTRAINT .*FOREIGN KEY/.test(l)))
        rollback.push(`ALTER TABLE ${ident(name)} ADD ${line.trim().replace(/,$/, '')};`);
    }
    await writeFile(join(directory, 'rollback.sql'), rollback.join('\n') + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    let executed = 0;
    try {
      for (const sql of statements) {
        await db.query(sql);
        executed++;
      }
      for (const name of [...names].filter((n) => !removed.includes(n))) {
        const [[row]] = await db.query(`SELECT COUNT(*) AS n FROM ${ident(name)}`);
        if (Number(row.n) !== counts[name]) throw Error('迁移期间记录数变化：' + name);
      }
      const [[remaining]] = await db.query(
        'SELECT COUNT(*) AS n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()',
      );
      if (remaining.n) throw Error('仍存在未移除的外键');
      await writeFile(
        join(directory, 'result.json'),
        JSON.stringify({ ...plan, applied: true, executed, foreignKeysAfter: 0 }, null, 2),
      );
      return { ...plan, applied: true, backupDirectory: directory, foreignKeysAfter: 0 };
    } catch (e) {
      await writeFile(
        join(directory, 'failure.json'),
        JSON.stringify({ executed, code: e.code || 'verification-failed' }),
      );
      throw Error(
        `迁移未全部完成；DDL 不能事务回滚。已执行 ${executed} 条，恢复材料位于 ${directory}。原因：${e.code || e.message}`,
      );
    }
  } finally {
    await db.query('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let db;
  try {
    db = await mysql.createConnection(mysqlOptions());
    console.log(
      JSON.stringify(
        await simplifySchema(db, {
          apply: process.argv.includes('--apply'),
          maintenance: process.argv.includes('--maintenance'),
        }),
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(e.code || e.message);
    process.exitCode = 1;
  } finally {
    await db?.end();
  }
}
