import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simplifySchema } from '../scripts/simplify-schema.mjs';

export async function checkSchemaSimplification(db, dir) {
  await db.query('CREATE DATABASE zhitu_simplify_test CHARACTER SET utf8mb4');
  await db.query('USE zhitu_simplify_test');
  try {
    const ddl = await readFile(
      new URL('./fixtures/legacy-platform-schema.sql', import.meta.url),
      'utf8',
    );
    for (const [sql] of ddl.matchAll(/CREATE TABLE `[\s\S]*?;(?=\r?\n|$)/g)) await db.query(sql);
    await db.query(
      "INSERT INTO users(id,nickname,password) VALUES(1,'迁移账户','test-hash'),(2,'停用账户','test-hash')",
    );
    await db.query(
      "INSERT INTO courses(id,title,category,teacher,description,cover,accent,lessons,duration) VALUES(1,'test','test','test','test','test','pink',1,'10:00')",
    );
    await db.query(
      "INSERT INTO chapters(id,course_id,title,duration,position) VALUES(1,1,'chapter','10:00',1)",
    );
    await db.query(
      "INSERT INTO comments(id,user_id,course_id,content) VALUES(1,1,1,'hidden comment')",
    );
    await db.query(
      "INSERT INTO notes(user_id,course_id,chapter_id,at_second,content) VALUES(1,1,1,0,'preserved private note')",
    );
    await db.query('INSERT INTO comment_moderation(comment_id,hidden) VALUES(1,1)');
    await db.query('INSERT INTO account_status(user_id,disabled) VALUES(2,1)');
    await db.query('INSERT INTO coins(user_id,course_id) VALUES(1,1)');
    await db.query("INSERT INTO admin_audit(actor_id,action,target_id) VALUES(1,'test',1)");
    const first = 'a'.repeat(64),
      last = 'b'.repeat(64),
      disabled = 'c'.repeat(64);
    const expiry = Date.now() + 86400000;
    await db.query('INSERT INTO sessions(token,user_id,expires) VALUES(?,1,?),(?,1,?),(?,2,?)', [
      first,
      expiry - 100,
      last,
      expiry,
      disabled,
      expiry,
    ]);
    const before = await simplifySchema(db);
    assert.equal(before.foreignKeys, 30);
    assert.equal(before.removedTables.length, 5);
    assert.equal((await db.query("SHOW COLUMNS FROM users LIKE 'disabled'"))[0].length, 0);
    await assert.rejects(simplifySchema(db, { apply: true }), /maintenance/);
    const backupDir = join(dir, 'simplify-backup');
    await simplifySchema(db, { apply: true, maintenance: true, backupDir });
    const [[u]] = await db.query('SELECT * FROM users WHERE id=1');
    assert.equal(u.session_token_hash, createHash('sha256').update(last).digest('hex'));
    assert.equal(Number(u.session_expires), expiry);
    assert.equal(u.password, 'test-hash');
    const [[d]] = await db.query('SELECT disabled,session_token_hash FROM users WHERE id=2');
    assert.equal(d.disabled, 1);
    assert.equal(d.session_token_hash, null);
    assert.equal((await db.query('SELECT hidden FROM comments WHERE id=1'))[0][0].hidden, 1);
    assert.equal(
      (await db.query('SELECT content FROM notes'))[0][0].content,
      'preserved private note',
    );
    const after = await simplifySchema(db, { apply: true, maintenance: true });
    assert.equal(after.statements, 0);
    assert.equal(after.foreignKeys, 0);
    assert.equal(Object.keys(after.counts).length, 17);
    const rollback = await readFile(join(backupDir, 'rollback.sql'), 'utf8');
    for (const sql of rollback
      .split(/;\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean))
      await db.query(sql);
    const restored = await simplifySchema(db);
    assert.deepEqual(restored.counts, before.counts);
    assert.equal(restored.foreignKeys, 30);
    assert.equal(
      (await db.query("SHOW COLUMNS FROM users LIKE 'session_token_hash'"))[0].length,
      0,
    );
    await simplifySchema(db, {
      apply: true,
      maintenance: true,
      backupDir: join(dir, 'simplify-repeat'),
    });
  } finally {
    await db.query('USE zhitu_test');
  }
}
