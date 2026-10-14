import './config.mjs';
import { mysqlOptions } from './config.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';

// Translate only the small, application-owned upsert vocabulary. All values
// remain bound parameters; no user-supplied SQL is accepted here.
export function mysqlSql(sql) {
  if (sql.startsWith('INSERT OR IGNORE INTO reservations'))
    return (
      sql.replace('INSERT OR IGNORE', 'INSERT') + ' ON DUPLICATE KEY UPDATE live_id=VALUES(live_id)'
    );
  return sql
    .replace(/strftime\('%Y-%m-%d %H:%M:%f','now'\)/g, 'UTC_TIMESTAMP(3)')
    .replace(/ON CONFLICT\([^)]*\) DO UPDATE SET/g, 'ON DUPLICATE KEY UPDATE')
    .replace(/excluded\.(\w+)/g, 'VALUES($1)')
    .replace(/MAX\(chapter_playback.percent,/g, 'GREATEST(chapter_playback.percent,')
    .replace(/(?<!`)\bcurrent_time\b(?!`)/g, '`current_time`');
}

export async function openDatabase() {
  const dialect = process.env.DB_CLIENT || 'mysql';
  if (dialect === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    const { initializeSqlite } = await import('./sqlite-bootstrap.mjs');
    const native = new DatabaseSync(
      process.env.DB_PATH || fileURLToPath(new URL('./zhitu.db', import.meta.url)),
    );
    initializeSqlite(native);
    let queue = Promise.resolve();
    return {
      dialect,
      get: async (sql, ...args) => native.prepare(sql).get(...args),
      all: async (sql, ...args) => native.prepare(sql).all(...args),
      run: async (sql, ...args) => native.prepare(sql).run(...args),
      lockUser: async () => {},
      async transaction(fn) {
        native.exec('BEGIN');
        try {
          const result = await fn();
          native.exec('COMMIT');
          return result;
        } catch (error) {
          native.exec('ROLLBACK');
          throw error;
        }
      },
      withRequest(fn) {
        const result = queue.then(fn);
        queue = result.catch(() => {});
        return result;
      },
      close: async () => native.close(),
    };
  }
  if (dialect !== 'mysql') throw new Error('DB_CLIENT 必须是 mysql 或 sqlite');
  const { default: mysql } = await import('mysql2/promise');
  const pool = mysql.createPool({
    ...mysqlOptions(),
    connectionLimit: 8,
    waitForConnections: true,
    queueLimit: 200,
  });
  const context = new AsyncLocalStorage();
  const query = async (sql, args = []) => {
    const connection = context.getStore();
    if (connection) return (await connection.execute(mysqlSql(sql), args))[0];
    const acquired = await pool.getConnection();
    try {
      await acquired.query("SET time_zone='+00:00'");
      return (await acquired.execute(mysqlSql(sql), args))[0];
    } finally {
      acquired.release();
    }
  };
  try {
    await query('SELECT 1');
    const { validateSchema } = await import('./mysql-schema.mjs');
    await validateSchema({ query: async (sql, args) => [await query(sql, args)] });
  } catch (error) {
    await pool.end();
    throw new Error(
      `MySQL 启动失败（${error.code || error.message}）。请检查配置和 npm run db:check；已有业务库按 README 执行对应增量升级，不要直接运行历史迁移。`,
    );
  }
  return {
    dialect,
    get: async (sql, ...args) => (await query(sql, args))[0],
    all: (sql, ...args) => query(sql, args),
    async run(sql, ...args) {
      const result = await query(sql, args);
      return { changes: result.affectedRows, lastInsertRowid: result.insertId };
    },
    lockUser: async (uid) => {
      await query('SELECT id FROM users WHERE id=? FOR UPDATE', [uid]);
    },
    async transaction(fn) {
      if (context.getStore()) return fn();
      const connection = await pool.getConnection();
      try {
        await connection.query("SET time_zone='+00:00'");
        await connection.beginTransaction();
        const result = await context.run(connection, fn);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    withRequest: (fn) => fn(),
    close: () => pool.end(),
  };
}
