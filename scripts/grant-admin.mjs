import '../config.mjs';
import { openDatabase } from '../database.mjs';
const name = process.argv.find((s) => s.startsWith('--nickname='))?.slice(11);
if (!name) throw Error('需要 --nickname=已注册昵称');
const db = await openDatabase();
try {
  const rows = await db.all('SELECT id FROM users WHERE nickname=?', name);
  if (rows.length !== 1) throw Error('昵称必须精确匹配唯一现有账号');
  if (process.argv.includes('--apply'))
    await db.transaction(async () => {
      await db.lockUser(rows[0].id);
      if (!(await db.get('SELECT 1 FROM admin_accounts WHERE user_id=?', rows[0].id))) {
        await db.run('INSERT INTO admin_accounts(user_id) VALUES(?)', rows[0].id);
      }
    });
  console.log(
    JSON.stringify({ uniqueAccountMatched: true, applied: process.argv.includes('--apply') }),
  );
} finally {
  await db.close();
}
