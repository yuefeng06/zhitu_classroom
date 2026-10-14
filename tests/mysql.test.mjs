import { checkSchemaSimplification } from './schema-simplification.mjs';
import { checkAdminApi } from './admin-scenarios.mjs';
import { syncMysqlCatalog } from '../scripts/sync-mysql-catalog.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import net from 'node:net';
import mysql from 'mysql2/promise';
import { DatabaseSync } from 'node:sqlite';
import { initializeSqlite } from '../sqlite-bootstrap.mjs';
import { schemaTables } from '../mysql-schema.mjs';
import { migrateMysql } from '../scripts/migrate-mysql.mjs';

const executable =
  process.env.MYSQLD_PATH || 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test(
  '真实 MySQL：旧库升级、迁移和全栈持久化',
  { timeout: 180000, skip: !existsSync(executable) && '未安装 mysqld，请设置 MYSQLD_PATH' },
  async (t) => {
    const testRoot = resolve(process.env.MYSQL_TEST_TMP || tmpdir());
    const dir = await mkdtemp(join(testRoot, 'zhitu-mysql-test-'));
    assert.ok(
      resolve(dir).startsWith(testRoot + sep + 'zhitu-mysql-test-'),
      '清理目标必须在测试临时目录内',
    );
    let daemon, server, connection;
    const stop = async (child) => {
      if (child && child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
    };
    t.after(async () => {
      await stop(server);
      if (connection) {
        try {
          await connection.query('SHUTDOWN');
        } catch (error) {
          if (!['PROTOCOL_CONNECTION_LOST', 'ECONNRESET'].includes(error.code)) throw error;
        }
        await connection.end();
        await pause(1000);
      }
      await stop(daemon);
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    });
    const args = [
      '--no-defaults',
      '--basedir=' + dirname(dirname(executable)),
      '--datadir=' + join(dir, 'data'),
    ];
    const init = spawn(executable, [...args, '--initialize-insecure', '--console'], {
      cwd: dir,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let initOutput = '';
    init.stderr.on('data', (b) => (initOutput += b));
    const [initCode] = await once(init, 'exit');
    assert.equal(initCode, 0, initOutput);
    const listener = net.createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const port = listener.address().port;
    await new Promise((r) => listener.close(r));
    daemon = spawn(
      executable,
      [
        ...args,
        '--bind-address=127.0.0.1',
        '--port=' + port,
        '--mysqlx=OFF',
        '--skip-log-bin',
        '--log-error=mysql.log',
      ],
      { cwd: dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let daemonOutput = '';
    daemon.stderr.on('data', (b) => (daemonOutput += b));
    daemon.stdout.on('data', (b) => (daemonOutput += b));
    const options = {
      host: '127.0.0.1',
      port,
      user: 'root',
      password: '',
      dateStrings: true,
      decimalNumbers: true,
    };
    for (let i = 0; i < 100; i++) {
      try {
        connection = await mysql.createConnection(options);
        break;
      } catch {
        if (daemon.exitCode !== null)
          throw Error(
            daemonOutput + ' ' + (await readFile(join(dir, 'mysql.log'), 'utf8').catch(() => '')),
          );
        await pause(200);
      }
    }
    assert.ok(connection, '隔离 MySQL 启动失败');
    Object.assign(process.env, {
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: String(port),
      MYSQL_USER: 'root',
      MYSQL_PASSWORD: '',
      MYSQL_DATABASE: 'zhitu_test',
    });
    await connection.query(
      'CREATE DATABASE zhitu_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    await connection.query('USE zhitu_test');
    await t.test('旧22表精简迁移、预检、恢复与幂等', async () =>
      checkSchemaSimplification(connection, dir),
    );
    // Reproduce the user's old ten-table schema with UNSIGNED parent IDs.
    const added = new Set([
      'course_visits',
      'chapter_playback',
      'notes',
      'reservations',
      'study_checkins',
      'history_resets',
      'admin_accounts',
      'admin_articles',
    ]);
    for (const table of schemaTables.filter((t) => !added.has(t.name))) {
      let sql = table.sql.replace(/BIGINT/g, 'BIGINT UNSIGNED');
      if (table.name === 'courses') sql = sql.replace(/^  `(published|subject)`[^\n]*\n/gm, '');
      if (table.name === 'live_events') sql = sql.replace(/^  `published`[^\n]*\n/gm, '');
      if (table.name === 'danmaku')
        sql = sql
          .replace(/^  `chapter_id`[^\n]*\n/gm, '')
          .replace(/^  KEY `idx_chapter_id`[^\n]*\n/gm, '');
      if (table.name === 'users')
        sql = sql
          .replace('`password`', '`password_hash`')
          .replace('`following`', '`following_count`')
          .replace(/^  `created_at`[^\n]*\n/gm, '');
      if (table.name === 'comments') sql = sql.replace('`content` TEXT', '`content` VARCHAR(500)');
      await connection.query(sql);
    }
    await connection.execute(
      'INSERT INTO users(id,nickname,password_hash,avatar,following_count) VALUES(1,?,?,?,12)',
      ['林同学', '123456', '林'],
    );
    const sourcePath = join(dir, 'source.db');
    const sqlite = new DatabaseSync(sourcePath);
    initializeSqlite(sqlite);
    sqlite
      .prepare(
        'INSERT INTO notes(user_id,course_id,chapter_id,at_second,content) VALUES(1,39,390001,12,?)',
      )
      .run('迁移前的私有笔记');
    sqlite.close();
    await t.test('保留旧账号及 UNSIGNED 关联列，完整迁移可重复执行', async () => {
      const result = await migrateMysql({ sourcePath, backupDir: join(dir, 'backup-1') });
      assert.ok(result.ok);
      assert.equal(result.tables.notes.target, 1);
      const [[type]] = await connection.query(
        "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notes' AND COLUMN_NAME='user_id'",
      );
      assert.equal(type.type, 'bigint unsigned');
      const [[joined]] = await connection.query('SELECT created_at FROM users WHERE id=1');
      assert.ok(joined.created_at);
      await connection.query("UPDATE comments SET created_at='2020-01-01 00:00:00' WHERE id=1");
      assert.ok((await migrateMysql({ sourcePath, backupDir: join(dir, 'backup-2') })).ok);
      const [[retained]] = await connection.query('SELECT created_at FROM comments WHERE id=1');
      assert.ok(retained.created_at.startsWith('2020-01-01'));
      const [[count]] = await connection.query(
        'SELECT COUNT(*) AS n FROM courses WHERE published=1',
      );
      assert.equal(count.n, 33);
    });
    await t.test('冲突中止整个数据事务，不覆盖已有笔记', async () => {
      const changed = new DatabaseSync(sourcePath);
      changed.prepare("UPDATE notes SET content='冲突内容' WHERE id=1").run();
      changed.prepare('INSERT INTO favorites VALUES(1,9,CURRENT_TIMESTAMP)').run();
      changed.close();
      await assert.rejects(
        migrateMysql({ sourcePath, backupDir: join(dir, 'backup-3') }),
        /历史记录冲突/,
      );
      const [[note]] = await connection.query('SELECT content FROM notes WHERE id=1');
      assert.equal(note.content, '迁移前的私有笔记');
      const [favorites] = await connection.query(
        'SELECT 1 FROM favorites WHERE user_id=1 AND course_id=9',
      );
      assert.equal(favorites.length, 0);
    });
    let base,
      cookie = '',
      serverOutput = '';
    const start = async () => {
      server = spawn(process.execPath, ['server.mjs'], {
        env: { ...process.env, AVATAR_DIR: join(dir, 'avatars'), DB_CLIENT: 'mysql', PORT: '0' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('应用启动超时 ' + output)), 10000);
        server.stderr.on('data', (b) => {
          output += b;
          serverOutput += b;
        });
        server.once('exit', () => {
          clearTimeout(timer);
          reject(Error(output));
        });
        server.stdout.on('data', (b) => {
          output += b;
          const m = output.match(/http:\/\/localhost:(\d+)/);
          if (m) {
            base = 'http://localhost:' + m[1];
            clearTimeout(timer);
            resolve();
          }
        });
      });
    };
    const request = async (
      path,
      body,
      status = 200,
      method = body === undefined ? 'GET' : 'POST',
    ) => {
      const res = await fetch(base + path, {
        method,
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json();
      assert.equal(res.status, status, path + ' ' + JSON.stringify(json) + ' ' + serverOutput);
      if (res.headers.has('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      return json;
    };
    await start();
    await t.test('健康检查、中文目录、注册登录和隐私', async () => {
      assert.equal((await request('/api/health')).database, 'mysql');
      assert.equal((await request('/api/catalog')).total, 33);
      assert.equal((await request('/api/courses?q=' + encodeURIComponent('武忠祥'))).length, 0);
      assert.equal((await request('/api/courses/35')).chapters.length, 245);
      await request('/api/auth/login', { nickname: '林同学', password: '123456' });
      assert.equal((await request('/api/me/notes'))[0].content, '迁移前的私有笔记');
      await request('/api/auth/register', {
        nickname: 'MySQL 测试用户 🧀',
        password: 'test-password',
      });
      assert.deepEqual(await request('/api/me/notes'), []);
      assert.equal((await request('/api/home')).recommendationMethod, 'discovery');
      await request('/api/courses/17/favorite', {});
      const recommended = await request('/api/home');
      assert.equal(recommended.recommendationMethod, 'content');
      assert.ok([18, 19].includes(recommended.recommendations[0].id));
      assert.equal(recommended.recommendations.at(-1).id, 17);
      await request('/api/courses/17/favorite', {});
      await request(
        '/api/auth/register',
        { nickname: 'MySQL 测试用户 🧀', password: 'test-password' },
        409,
      );
    });
    await t.test('数学课程同步与下架保留历史', async () => {
      await connection.query('UPDATE courses SET published=1 WHERE id=9');
      await connection.query(
        "INSERT INTO notes(user_id,course_id,chapter_id,at_second,content) VALUES(1,9,9001,0,'下架保留测试')",
      );
      const [[before]] = await connection.query(
        'SELECT COUNT(*) AS n FROM chapters WHERE course_id=9',
      );
      const preview = await syncMysqlCatalog({ ids: [39, 40, 41, 42], unpublishIds: [9] });
      assert.equal(preview.applied, false);
      assert.equal(
        (await connection.query('SELECT published FROM courses WHERE id=9'))[0][0].published,
        1,
      );
      const result = await syncMysqlCatalog({
        ids: [39, 40, 41, 42],
        unpublishIds: [9],
        apply: true,
        backupDir: join(dir, 'math-backup'),
      });
      assert.equal(result.applied, true);
      assert.equal(
        (await connection.query('SELECT published FROM courses WHERE id=9'))[0][0].published,
        0,
      );
      assert.equal(
        (await connection.query('SELECT COUNT(*) AS n FROM chapters WHERE course_id=9'))[0][0].n,
        before.n,
      );
      assert.equal(
        (
          await connection.query(
            "SELECT COUNT(*) AS n FROM notes WHERE course_id=9 AND content='下架保留测试'",
          )
        )[0][0].n,
        1,
      );
      for (const [id, count] of [
        [39, 22],
        [40, 23],
        [41, 55],
        [42, 17],
      ])
        assert.equal((await request('/api/courses/' + id)).chapters.length, count);
    });
    await t.test('打卡真实落库，日期唯一与用户关联列类型匹配', async () => {
      assert.equal((await fetch(base + '/api/me/checkins')).status, 401);
      await request('/api/me/checkins', { date: '2020-01-01' }, 400);
      const rows = await Promise.all(
        Array.from({ length: 6 }, () => request('/api/me/checkins', {})),
      );
      rows.forEach((r) => {
        assert.equal(r.total, 1);
        assert.equal(r.checkedToday, true);
      });
      const [[saved]] = await connection.query('SELECT COUNT(*) AS n FROM study_checkins');
      assert.equal(saved.n, 1);
      const [types] = await connection.query(
        "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='study_checkins' AND COLUMN_NAME='user_id') OR (TABLE_NAME='users' AND COLUMN_NAME='id'))",
      );
      assert.equal(types[0].COLUMN_TYPE, types[1].COLUMN_TYPE);
      const sessionOwner = cookie;
      await request('/api/auth/register', {
        nickname: '独立打卡账号',
        password: 'checkin-password',
      });
      assert.equal((await request('/api/me/checkins')).total, 0);
      cookie = sessionOwner;
      await stop(server);
      await start();
      assert.equal((await request('/api/me/checkins')).total, 1);
    });
    let savedAvatar;
    await t.test('头像上传写入 MySQL 并限制到当前账户', async () => {
      const before = (await request('/api/auth/me')).user;
      const image =
        'data:image/jpeg;base64,' + (await readFile('course-images/9.jpg')).toString('base64');
      const result = await request('/api/me/avatar', { image, userId: 1 });
      savedAvatar = result.user.avatar;
      const [[row]] = await connection.execute('SELECT avatar FROM users WHERE id=?', [before.id]);
      assert.equal(row.avatar, savedAvatar);
      const [[original]] = await connection.execute('SELECT avatar FROM users WHERE id=1');
      assert.equal(original.avatar, '林');
      assert.equal((await fetch(base + savedAvatar)).status, 200);
      await request('/api/me/avatar', { image: 'not-an-image' }, 400);
    });
    let note;
    await t.test('收藏、最近学习、私有笔记、讨论与关注真正落库', async () => {
      assert.equal((await request('/api/courses/39/favorite', {})).active, true);
      await request('/api/courses/39/coin', {}, 404);
      assert.equal((await request('/api/courses/39/follow', {})).active, true);
      await request('/api/courses/39/visit', { chapterId: 390001 });
      await request('/api/courses/39/visit', { chapterId: 390001 });
      assert.equal((await request('/api/home')).continuing.id, 39);
      assert.equal((await request('/api/me/courses')).favorites[0].id, 39);
      note = await request(
        '/api/courses/39/notes',
        { chapterId: 390001, atSecond: 42.5, content: 'MySQL 笔记 🧀' },
        201,
      );
      await request('/api/courses/39/comments', { content: 'MySQL 中文讨论' });
      await request('/api/courses/39/comments', { content: '长评论'.repeat(250) });
      assert.equal((await request('/api/me/overview')).noteCount, 1);
      const [[stored]] = await connection.execute('SELECT content FROM notes WHERE id=?', [
        note.id,
      ]);
      assert.equal(stored.content, 'MySQL 笔记 🧀');
      assert.ok(
        (await request('/api/courses/39')).comments.some((c) => c.content === 'MySQL 中文讨论'),
      );
    });
    await t.test('播放事务、并发切换收藏、历史预约及接口拒绝无效关联', async () => {
      await request('/api/courses/4/progress', { chapterId: 1, currentTime: 25, duration: 100 });
      await request('/api/courses/4/progress', { chapterId: 1, currentTime: 10, duration: 100 });
      assert.equal((await request('/api/courses/4')).chapters[0].playback.percent, 25);
      await Promise.all([
        request('/api/courses/39/favorite', {}),
        request('/api/courses/39/favorite', {}),
      ]);
      assert.equal((await request('/api/courses/39')).course.favorite, true);
      await connection.execute(
        'INSERT INTO live_events(id,title,teacher,starts_at,published) VALUES(10,?,?,?,1)',
        ['测试直播', '老师', '2099-01-01T10:00:00+08:00'],
      );
      await request('/api/lives/10/reservation', {});
      await request('/api/lives/10/reservation', {});
      assert.equal((await request('/api/lives'))[0].reserved, true);
      await request(
        '/api/courses/39/notes',
        { chapterId: 170001, atSecond: 0, content: 'invalid chapter' },
        400,
      );
      const [[fks]] = await connection.query(
        'SELECT COUNT(*) AS n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()',
      );
      assert.equal(fks.n, 0);
    });
    await t.test('服务重启后会话、收藏和笔记保留，删除笔记有归属校验', async () => {
      await stop(server);
      await start();
      assert.equal((await request('/api/auth/me')).user.avatar, savedAvatar);
      assert.equal((await request('/api/me/notes'))[0].id, note.id);
      await request('/api/notes/1', undefined, 404, 'DELETE');
      await request('/api/notes/' + note.id, undefined, 200, 'DELETE');
      assert.deepEqual(await request('/api/me/notes'), []);
      await request('/api/auth/logout', {});
      await request('/api/me/notes', undefined, 401);
    });
    await t.test('清除访问历史保留真实 MySQL 进度与私人数据', async () => {
      await request('/api/me/history', undefined, 401, 'DELETE');
      const { user } = await request('/api/auth/register', {
        nickname: 'MySQL 历史清除',
        password: 'history-test',
      });
      await request('/api/courses/17/visit', { chapterId: 170001 });
      await request('/api/courses/17/favorite', {});
      await request(
        '/api/courses/17/notes',
        { chapterId: 170001, atSecond: 1, content: '不删笔记' },
        201,
      );
      await connection.query(
        'INSERT INTO progress(user_id,course_id,chapter_id,percent) VALUES(?,17,170001,20)',
        [user.id],
      );
      await request('/api/me/history', { userId: 1 }, 400, 'DELETE');
      await request('/api/me/history', undefined, 200, 'DELETE');
      assert.deepEqual((await request('/api/me/courses')).learning, []);
      assert.equal((await request('/api/me/courses')).favorites[0].id, 17);
      assert.equal((await request('/api/me/notes'))[0].content, '不删笔记');
      assert.equal((await request('/api/courses/17')).course.progress, 20);
      await stop(server);
      await start();
      assert.deepEqual((await request('/api/me/courses')).learning, []);
      await request('/api/courses/17/visit', { chapterId: 170001 });
      assert.equal((await request('/api/me/courses')).learning[0].id, 17);
      const [types] = await connection.query(
        "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='history_resets' AND COLUMN_NAME='user_id') OR (TABLE_NAME='users' AND COLUMN_NAME='id'))",
      );
      assert.equal(types[0].COLUMN_TYPE, types[1].COLUMN_TYPE);
    });
    await t.test('增量课程同步保留旧课程关联和笔记，重复执行不复制章节', async () => {
      await connection.query(
        'DELETE FROM chapters WHERE course_id IN (37,38) OR (course_id=31 AND position>1)',
      );
      await connection.query('DELETE FROM courses WHERE id IN (37,38)');
      await connection.query("UPDATE courses SET lessons=1,title='旧 Cherno 第一讲' WHERE id=31");
      await connection.query(
        "INSERT INTO notes(user_id,course_id,chapter_id,at_second,content) VALUES(1,31,310001,12,'原章节笔记保留')",
      );
      await connection.query('INSERT INTO favorites(user_id,course_id) VALUES(1,31)');
      const plan = await syncMysqlCatalog({ ids: [31, 37, 38] });
      assert.equal(plan.applied, false);
      const [[before]] = await connection.query('SELECT lessons FROM courses WHERE id=31');
      assert.equal(before.lessons, 1);
      for (let i = 0; i < 2; i++)
        await syncMysqlCatalog({
          ids: [31, 37, 38],
          apply: true,
          backupDir: join(dir, 'catalog-backup-' + i),
        });
      const [counts] = await connection.query(
        'SELECT course_id,COUNT(*) AS n FROM chapters WHERE course_id IN (31,37,38) GROUP BY course_id ORDER BY course_id',
      );
      assert.deepEqual(
        counts.map((c) => [c.course_id, c.n]),
        [
          [31, 98],
          [37, 78],
          [38, 14],
        ],
      );
      const [[saved]] = await connection.query(
        'SELECT COUNT(*) AS n FROM notes WHERE course_id=31 AND chapter_id=310001',
      );
      assert.equal(saved.n, 1);
      const [[favorite]] = await connection.query(
        'SELECT COUNT(*) AS n FROM favorites WHERE user_id=1 AND course_id=31',
      );
      assert.equal(favorite.n, 1);
      assert.equal((await request('/api/catalog')).total, 33);
      for (const [id, bvid] of [
        [31, 'BV1qh411p7Sa'],
        [37, 'BV1uW4y1v7xr'],
        [38, 'BV19N411U7Pc'],
      ])
        assert.ok(
          (await request('/api/courses/' + id)).chapters.every((c) => c.embed_url.includes(bvid)),
        );
    });
    await t.test('正式后台真实 MySQL 权限、单会话与并发昵称唯一', async () => {
      await checkAdminApi(base, (uid) =>
        connection.query('INSERT INTO admin_accounts(user_id) VALUES(?)', [uid]),
      );
    });
  },
);
