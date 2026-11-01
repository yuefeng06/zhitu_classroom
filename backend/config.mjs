import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Explicit process environment (including isolated tests) takes precedence.
try {
  loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

export function mysqlOptions({ database = true } = {}) {
  const name = process.env.MYSQL_DATABASE || 'zhitu_classroom';
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('MYSQL_DATABASE 只能包含字母、数字和下划线');
  const port = Number(process.env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MYSQL_PORT 无效');
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    ...(database ? { database: name } : {}),
    charset: 'utf8mb4',
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    connectTimeout: 5000,
    multipleStatements: false,
  };
}
