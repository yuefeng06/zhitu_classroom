import '../backend/config.mjs';
import mysql from 'mysql2/promise';
import { mysqlOptions } from '../backend/config.mjs';
import { validateSchema } from '../backend/mysql-schema.mjs';
let connection;
try {
  connection = await mysql.createConnection(mysqlOptions());
  await validateSchema(connection);
  const [[server]] = await connection.query(
    'SELECT VERSION() AS version,DATABASE() AS database_name',
  );
  const [[courses]] = await connection.query(
    'SELECT COUNT(*) AS courses,SUM(lessons) AS chapters FROM courses WHERE published=1',
  );
  console.log(JSON.stringify({ ok: true, driver: 'mysql', ...server, ...courses }, null, 2));
} catch (error) {
  console.error('MySQL 检查失败：', error.code || error.message);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
