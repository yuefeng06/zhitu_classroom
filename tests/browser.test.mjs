import { editorialEntries } from '../scripts/editorial-entries.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const edge =
  process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
test(
  process.env.CHECKINS_ONLY === '1'
    ? 'Edge：打卡日历与个人历史'
    : process.env.HANDWRITING_ONLY === '1'
      ? 'Edge：首页书写与品牌字标'
      : process.env.SETTINGS_ONLY === '1'
        ? 'Edge：界面设置主题下拉菜单'
        : process.env.POSTS_ONLY === '1'
          ? 'Edge：双语学习经验与课程搜索入口'
          : process.env.SEARCH_ONLY === '1'
            ? 'Edge：搜索提示与历史交互'
            : process.env.COURSE_AVATAR_ONLY === '1'
              ? 'Edge：课程更新与评论头像专项回归'
              : 'Edge 浏览器前后端联调',
  { skip: !existsSync(edge), timeout: 120000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'zhitu-browser-'));
    await writeFile(join(dir, 'media.json'), JSON.stringify({ chapters: {} }));
    const server = spawn(process.execPath, ['server.mjs'], {
      env: {
        ...process.env,
        AVATAR_DIR: join(dir, 'avatars'),
        VIDEO_DIR: join(dir, 'videos'),
        COURSE_COVER_DIR: join(dir, 'covers'),
        MEDIA_CONFIG_PATH: join(dir, 'media.json'),
        DB_CLIENT: 'sqlite',
        PORT: '0',
        DB_PATH: join(dir, 'test.db'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let browser, ws;
    t.after(async () => {
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
        await new Promise((r) => setTimeout(r, 500));
      }
      ws?.close();
      for (const process of [browser, server])
        if (process && process.exitCode === null) {
          const ended = once(process, 'exit');
          process.kill();
          await ended;
        }
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    });
    const listen = async (stream, pattern) =>
      new Promise((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(Error('启动超时 ' + output)), 15000);
        stream.on('data', (x) => {
          output += x;
          const m = output.match(pattern);
          if (m) {
            clearTimeout(timer);
            resolve(m[1]);
          }
        });
      });
    const port = await listen(server.stdout, /localhost:(\d+)/);
    const editorial = await editorialEntries();
    const articleDb = new DatabaseSync(join(dir, 'test.db'));
    for (const a of editorial)
      articleDb
        .prepare(
          'INSERT INTO admin_articles(title,summary,content,source_url,published) VALUES(?,?,?,?,1)',
        )
        .run(a.title, a.summary, a.content, a.source_url);
    articleDb.close();
    browser = spawn(
      edge,
      [
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--remote-debugging-port=0',
        '--user-data-dir=' + join(dir, 'profile'),
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    let endpoint;
    for (let i = 0; i < 200; i++) {
      try {
        const [port, path] = (await readFile(join(dir, 'profile', 'DevToolsActivePort'), 'utf8'))
          .trim()
          .split(/\r?\n/);
        endpoint = 'ws://127.0.0.1:' + port + path;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    if (!endpoint) throw Error('Edge 调试端口文件未生成');
    const debugURL = new URL(endpoint);
    const targets = await (await fetch('http://' + debugURL.host + '/json/list')).json();
    endpoint = targets.find((t) => t.type === 'page').webSocketDebuggerUrl;
    ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('WebSocket 连接超时 ' + endpoint)), 10000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(Error('WebSocket 连接失败'));
      });
    });
    t.diagnostic('浏览器调试已连接');
    let counter = 0;
    const pending = new Map(),
      errors = [];
    ws.addEventListener('message', (event) => {
      const m = JSON.parse(event.data);
      if (m.id) {
        const job = pending.get(m.id);
        if (!job) return;
        pending.delete(m.id);
        if (m.error) job.reject(Error(m.error.message));
        else job.resolve(m.result);
      }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    });
    const call = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = ++counter;
        const timer = setTimeout(
          () => reject(Error('调试命令超时 ' + method)),
          method === 'Page.captureScreenshot' ? 20000 : 10000,
        );
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    const sessionId = undefined;
    await call('Runtime.enable', {}, sessionId);
    t.diagnostic('浏览器页面已准备');
    const evaluate = async (expression) => {
      const result = await call(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      );
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const checkEditorialReader = async () => {
      await until("document.querySelectorAll('[data-article]').length===10");
      assert.equal(
        await evaluate(
          "document.querySelectorAll('[data-post-topic],.post-filters,.post-bilingual-badge').length",
        ),
        0,
      );
      await evaluate("document.querySelector('.published-feature img').decode()");
      await screenshot('database-articles');
      await evaluate("document.querySelector('.published-feature').click()");
      await until("document.querySelector('.published-reader')?.open");
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.published-body h1,.published-body h2,.published-body h3').length",
        ),
        41,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.published-body').textContent.includes('特别有价值的建议和改进。')",
        ),
        true,
      );
      await evaluate('document.querySelector(\'.published-body a[href="#smart-鸣谢"]\').click()');
      assert.equal(await evaluate('location.hash'), '#/explore');
      assert.equal(await evaluate('document.activeElement.id'), 'smart-鸣谢');
      assert.ok(await evaluate("document.querySelector('.published-reader').scrollTop>1000"));
      await evaluate("document.querySelector('.published-reader').scrollTop=0");
      await screenshot('database-full-article');
      await evaluate("document.querySelector('.published-reader button').click()");
      for (const entry of editorial.slice(0, 9)) {
        await evaluate(
          'Array.from(document.querySelectorAll("[data-article]")).find(b=>b.querySelector("h3").textContent===' +
            JSON.stringify(entry.title) +
            ').click()',
        );
        await until("document.querySelector('.published-reader')?.open");
        const content = await evaluate("document.querySelector('.published-body').textContent");
        assert.ok(
          content.includes('原文摘录：') &&
            content.includes('中文译文：') &&
            content.includes('练习建议：'),
        );
        assert.equal(
          await evaluate("document.querySelector('.published-reader > a').href"),
          entry.source_url,
        );
        assert.equal(
          await evaluate(
            "document.querySelector('.published-reader').scrollWidth<=document.querySelector('.published-reader').clientWidth",
          ),
          true,
        );
        await evaluate("document.querySelector('.published-reader button').click()");
      }
    };
    const screenshot = async (name) => {
      if (process.env.SCREENSHOT_DIR) {
        await new Promise((r) => setTimeout(r, 600));
        await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        const image = await call(
          'Page.captureScreenshot',
          { format: 'png', captureBeyondViewport: false },
          sessionId,
        );
        await writeFile(
          join(process.env.SCREENSHOT_DIR, name + '.png'),
          Buffer.from(image.data, 'base64'),
        );
      }
    };
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    const until = async (expression, timeout = 10000) => {
      for (let i = 0; i < timeout / 50; i++) {
        if (await evaluate(expression)) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw Error(
        '页面等待超时 ' +
          expression +
          ' ' +
          JSON.stringify(
            await evaluate(
              "({route:location.hash,cards:document.querySelectorAll('.card').length,nav:document.querySelector('#primary-nav')?.className,sliders:[...document.querySelectorAll('.segment-slider')].map(e=>({x:e.getBoundingClientRect().x,transform:e.style.transform,host:e.parentElement.className,active:e.parentElement.querySelector('.on')?.getBoundingClientRect().x})),dialogs:[...document.querySelectorAll('dialog')].map(d=>({open:d.open,text:d.innerText.slice(-400),invalid:[...d.querySelectorAll(':invalid')].map(e=>e.name)})),text:document.querySelector('#app')?.innerText.slice(0,180)})",
            ),
          ),
      );
    };
    await call('Page.navigate', { url: 'http://localhost:' + port }, sessionId);
    await until("document.querySelectorAll('.card').length===6");
    await evaluate('new Promise(r=>setTimeout(r,600))');
    await screenshot('home-desktop');
    if (process.env.NAVIGATION_ONLY === '1') {
      const locationOf = (selector) =>
        evaluate(
          `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
        );
      const aligned = (nav, link) =>
        `(()=>{const p=document.querySelector('${nav} .nav-slider').getBoundingClientRect(),a=document.querySelector(${JSON.stringify(link)}).getBoundingClientRect();return Math.abs(p.x-a.x)<0.75&&Math.abs(p.y-a.y)<0.75&&Math.abs(p.width-a.width)<0.75})()`;
      const move = (point) => call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      const press = (point) =>
        call('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          button: 'left',
          clickCount: 1,
          ...point,
        });
      const release = (point) =>
        call('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          button: 'left',
          clickCount: 1,
          ...point,
        });
      // A held mouse click exposes the focus-before-click regression that an
      // instantaneous click followed by a final-position assertion would miss.
      for (const width of [1440, 840, 1024]) {
        await call('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await move({ x: 10, y: 200 });
        await evaluate("location.hash='#/'");
        await until("document.querySelector('#primary-nav a.active')?.getAttribute('href')==='#/'");
        const selector = '#primary-nav a[href="#/courses"]',
          point = await locationOf(selector);
        await move(point);
        await until(aligned('#primary-nav', selector));
        await press(point);
        const samples = await evaluate(
          `new Promise(resolve=>{const samples=[];const end=performance.now()+400;function frame(){samples.push(${aligned('#primary-nav', selector)});if(performance.now()<end)requestAnimationFrame(frame);else resolve(samples)}requestAnimationFrame(frame)})`,
        );
        assert.ok(samples.length > 2 && samples.every(Boolean), '按住鼠标时滑块不能回退或偏离目标');
        assert.equal(
          await evaluate(
            "document.querySelector('#primary-nav [aria-current=page]').getAttribute('href')",
          ),
          '#/',
        );
        await screenshot('navigation-held-' + width);
        await release(point);
        await until(
          "location.hash==='#/courses'&&document.querySelector('#primary-nav a.active')?.getAttribute('href')==='#/courses'",
        );
        await until(aligned('#primary-nav', selector));
        const other = '#primary-nav a[href="#/explore"]';
        await move(await locationOf(other));
        await until(aligned('#primary-nav', other));
        await move({ x: 10, y: 200 });
        await until(aligned('#primary-nav', selector));
      }
      await evaluate('document.querySelector(\'#primary-nav a[href="#/courses"]\').focus()');
      await call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'ArrowRight',
        code: 'ArrowRight',
        windowsVirtualKeyCode: 39,
      });
      await call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'ArrowRight',
        code: 'ArrowRight',
        windowsVirtualKeyCode: 39,
      });
      assert.equal(await evaluate("document.activeElement.getAttribute('href')"), '#/learning');
      await call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      });
      await call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      });
      await until("location.hash==='#/learning'");
      await until(aligned('#primary-nav', '#primary-nav a.active'));
      await call('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      await move(await locationOf('#primary-nav a[href="#/explore"]'));
      await until(aligned('#primary-nav', '#primary-nav a[href="#/explore"]'));
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('#primary-nav .nav-slider')).transitionDuration",
        ),
        '0s',
      );
      await call('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await call('Emulation.setTouchEmulationEnabled', { enabled: true });
      await call('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [await locationOf('#mobile-nav a[href="#/profile"]')],
      });
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await until("location.hash==='#/profile'");
      await until(aligned('#mobile-nav', '#mobile-nav a.selected'));
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await screenshot('navigation-mobile-fixed');
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.FAVORITES_ONLY === '1') {
      await evaluate(
        "fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'章节收藏浏览器',password:'chapter-browser-test'})}).then(r=>r.json())",
      );
      await call('Page.reload', {}, sessionId);
      await until("document.querySelectorAll('.card').length===6");
      await evaluate("location.hash='#/video/39?chapter=390001'");
      await until("document.querySelector('.chapter.playing')?.dataset.chapter==='390001'");
      await evaluate("document.querySelector('#favorite').click()");
      await until("document.querySelector('#favorite')?.getAttribute('aria-pressed')==='true'");
      await evaluate("document.querySelector('#next').click()");
      await until("document.querySelector('.chapter.playing')?.dataset.chapter==='390002'");
      assert.equal(
        await evaluate("document.querySelector('#favorite').getAttribute('aria-pressed')"),
        'false',
      );
      await evaluate("document.querySelector('#favorite').click()");
      await until("document.querySelector('#favorite')?.getAttribute('aria-pressed')==='true'");
      await evaluate("location.hash='#/favorites'");
      await until("document.querySelectorAll('[data-favorite-chapter]').length===2");
      const titles = await evaluate(
        "[...document.querySelectorAll('[data-favorite-chapter] h3')].map(e=>e.textContent)",
      );
      assert.equal(new Set(titles).size, 2);
      await evaluate("document.querySelector('#study-list').scrollIntoView({block:'center'})");
      await screenshot('chapter-favorites-desktop');
      await evaluate('document.querySelector(\'[data-favorite-chapter="390001"] .card\').click()');
      await until("document.querySelector('.chapter.playing')?.dataset.chapter==='390001'");
      assert.equal(
        await evaluate("document.querySelector('#favorite').getAttribute('aria-pressed')"),
        'true',
      );
      await evaluate("location.hash='#/favorites'");
      await until("document.querySelectorAll('[data-favorite-chapter]').length===2");
      await evaluate('document.querySelector(\'[data-shelf="390001"]\').click()');
      await until("document.querySelectorAll('[data-favorite-chapter]').length===1");
      assert.equal(
        await evaluate("document.querySelector('[data-favorite-chapter]').dataset.favoriteChapter"),
        '390002',
      );
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await evaluate("document.querySelector('#study-list').scrollIntoView({block:'center'})");
      await screenshot('chapter-favorites-mobile');
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.LEARNING_ADMIN_ONLY === '1') {
      const member = await evaluate(
        `fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'学习维护浏览器用户',password:'member-browser-pass'})}).then(r=>r.json())`,
      );
      await evaluate(
        `(async()=>{for(const [url,body] of [['/api/courses/39/visit',{chapterId:390001}],['/api/courses/39/favorite',{chapterId:390001,active:true}],['/api/courses/39/follow',{active:true}],['/api/me/checkins',{}],['/api/courses/39/notes',{chapterId:390001,atSecond:3,content:'浏览器私密笔记'}],['/api/courses/39/danmaku',{chapterId:390001,content:'浏览器章节弹幕',atSecond:3}]])await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});})()`,
      );
      const registered = await evaluate(
        `fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'学习维护浏览器管理员',password:'admin-browser-pass'})}).then(r=>r.json())`,
      );
      const fixture = new DatabaseSync(join(dir, 'test.db'));
      fixture.prepare('INSERT INTO admin_accounts(user_id) VALUES(?)').run(registered.user.id);
      fixture
        .prepare(
          'INSERT INTO chapter_playback(user_id,chapter_id,current_time,duration,percent) VALUES(?,390001,3,60,5)',
        )
        .run(member.user.id);
      fixture.close();
      await call('Page.reload', {}, sessionId);
      await until("document.querySelectorAll('.card').length===6");
      await evaluate(`location.hash='#/admin/learning?userId=${member.user.id}'`);
      await until("document.querySelectorAll('.admin-record-list article').length===1");
      assert.equal(
        await evaluate("document.querySelector('.admin-record-filters [name=userId]').value"),
        String(member.user.id),
      );
      await screenshot('learning-admin-history-desktop');
      await evaluate(
        "window.confirm=()=>false;document.querySelector('[data-record-action=delete]').click()",
      );
      assert.equal(
        await evaluate("document.querySelectorAll('.admin-record-list article').length"),
        1,
      );
      await evaluate(
        "window.confirm=()=>true;document.querySelector('[data-record-action=delete]').click()",
      );
      await until("document.querySelectorAll('.admin-record-list article').length===0");
      await evaluate("document.querySelector('[data-record-kind=favorites]').click()");
      await until("document.querySelectorAll('.admin-record-list article').length===1");
      await evaluate("document.querySelector('[data-record-action=delete]').click()");
      await until("document.querySelectorAll('.admin-record-list article').length===0");
      await evaluate("document.querySelector('[data-record-kind=checkins]').click()");
      await until("document.querySelectorAll('.admin-checkin-grid .checked').length===1");
      await screenshot('learning-admin-checkins-desktop');
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await evaluate(
        "document.querySelector('.admin-checkin-calendar').scrollIntoView({block:'center'})",
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await screenshot('learning-admin-checkins-mobile');
      assert.equal(await evaluate('innerWidth'), 390);
      await evaluate("document.querySelector('[data-record-action=delete]').click()");
      await until("document.querySelectorAll('.admin-checkin-grid .checked').length===0");
      const calendarFixture = new DatabaseSync(join(dir, 'test.db'));
      for (let i = 1; i <= 31; i++)
        calendarFixture
          .prepare('INSERT INTO study_checkins(user_id,checkin_date) VALUES(?,?)')
          .run(member.user.id, '2026-01-' + String(i).padStart(2, '0'));
      calendarFixture.close();
      await evaluate(
        "(()=>{const f=document.querySelector('.admin-record-filters');f.elements.month.value='2026-01';f.requestSubmit();})()",
      );
      await until(
        "document.querySelectorAll('.admin-checkin-grid .checked').length===31 && document.querySelectorAll('.admin-record-list article').length===30",
      );
      await evaluate("document.querySelector('[data-record-next]').click()");
      await until(
        "document.querySelectorAll('.admin-record-list article').length===1 && document.querySelectorAll('.admin-checkin-grid .checked').length===31",
      );
      for (const kind of ['playback', 'notes', 'follows']) {
        await evaluate(`document.querySelector('[data-record-kind=${kind}]').click()`);
        await until("document.querySelectorAll('.admin-record-list article').length===1");
        if (kind !== 'follows')
          assert.equal(
            await evaluate("document.querySelectorAll('[data-record-action]').length"),
            0,
          );
        assert.equal(
          await evaluate(
            "document.querySelector('[data-record-results]').textContent.includes('浏览器私密笔记')",
          ),
          false,
        );
      }
      await evaluate("location.hash='#/admin/danmaku'");
      await until(
        "document.querySelector('.admin-record-list')?.textContent.includes('浏览器章节弹幕')",
      );
      await evaluate(
        "(()=>{const f=document.querySelector('.admin-record-filters');f.elements.q.value='浏览器章节弹幕';f.requestSubmit();})()",
      );
      await until("document.querySelectorAll('.admin-record-list article').length===1");
      await evaluate("document.querySelector('[data-record-action=hide]').click()");
      await until("document.querySelector('[data-record-action=restore]')!==null");
      assert.equal(
        (await evaluate("fetch('/api/courses/39/danmaku?chapterId=390001').then(r=>r.json())"))
          .length,
        0,
      );
      await screenshot('learning-admin-danmaku-mobile');
      await evaluate("document.querySelector('[data-record-action=restore]').click()");
      await until("document.querySelector('[data-record-action=hide]')!==null");
      await evaluate("document.querySelector('[data-record-action=delete]').click()");
      await until("document.querySelectorAll('.admin-record-list article').length===0");
      await evaluate("location.hash='#/admin/users'");
      await until(`document.querySelector('[data-user-detail="${member.user.id}"]')!==null`);
      await evaluate(`document.querySelector('[data-user-detail="${member.user.id}"]').click()`);
      await until("document.querySelector('[data-reset-password]')!==null");
      await evaluate(
        "(()=>{const f=document.querySelector('[data-reset-password]');f.elements.newPassword.value='new-browser-pass';f.elements.repeatPassword.value='different';f.requestSubmit();})()",
      );
      await until(
        "document.querySelector('[data-password-status]').textContent.includes('不一致')",
      );
      await evaluate(
        "(()=>{const f=document.querySelector('[data-reset-password]');f.elements.repeatPassword.value='new-browser-pass';f.requestSubmit();})()",
      );
      await until(
        "document.querySelector('[data-password-status]').textContent.includes('密码已重置')",
      );
      await evaluate(
        "document.querySelector('[data-reset-password]').scrollIntoView({block:'center'})",
      );
      await screenshot('learning-admin-password-mobile');
      assert.equal(
        await evaluate("document.querySelector('[data-reset-password] [name=newPassword]').value"),
        '',
      );
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.COMMENTS_ONLY === '1') {
      const registered = await evaluate(
        `fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'章节讨论浏览器',password:'comment-browser-test'})}).then(r=>r.json())`,
      );
      const fixture = new DatabaseSync(join(dir, 'test.db'));
      fixture.prepare('INSERT INTO admin_accounts(user_id) VALUES(?)').run(registered.user.id);
      fixture.close();
      await call('Page.reload', {}, sessionId);
      await until("document.querySelectorAll('.card').length===6");
      await evaluate("location.hash='#/video/39?chapter=390001'");
      await until(
        "document.querySelector('.chapter.playing')?.dataset.chapter==='390001' && document.querySelector('#comment-status').textContent===''",
      );
      await evaluate(
        "document.querySelector('#comment-input').value='第一集独立讨论';document.querySelector('#comment-form').requestSubmit(document.querySelector('#comment-form button'))",
      );
      await until(
        "document.querySelector('#comments-list').textContent.includes('第一集独立讨论')",
      );
      await evaluate(
        "document.querySelector('#comment-input').value='第一集草稿';document.querySelector('#next').click()",
      );
      await until(
        "document.querySelector('.chapter.playing')?.dataset.chapter==='390002' && document.querySelector('#comment-status').textContent===''",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#comments-list').textContent.includes('第一集独立讨论')",
        ),
        false,
      );
      assert.equal(await evaluate("document.querySelector('#comment-input').value"), '');
      await evaluate(
        "document.querySelector('#comment-input').value='第二集独立讨论';document.querySelector('#comment-form').requestSubmit(document.querySelector('#comment-form button'))",
      );
      await until(
        "document.querySelector('#comments-list').textContent.includes('第二集独立讨论')",
      );
      await evaluate("document.querySelector('#previous').click()");
      await until(
        "document.querySelector('.chapter.playing')?.dataset.chapter==='390001' && document.querySelector('#comments-list').textContent.includes('第一集独立讨论')",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#comments-list').textContent.includes('第二集独立讨论')",
        ),
        false,
      );
      assert.equal(await evaluate("document.querySelector('#comment-input').value"), '第一集草稿');
      await evaluate("document.querySelector('.comments').scrollIntoView({block:'center'})");
      await screenshot('chapter-comments-player');
      await evaluate("location.hash='#/admin/comments'");
      await until("document.querySelector('#admin-comment-course')?.options.length>1");
      // Choose through the themed menu, then exercise keyboard selection for chapters.
      await evaluate(
        "document.querySelector('#admin-comment-course-trigger').click();document.querySelector('#admin-comment-course-option-'+[...document.querySelector('#admin-comment-course').options].findIndex(o=>o.value==='39')).click()",
      );
      await until(
        "[...document.querySelector('#admin-comment-chapter').options].some(o=>o.value==='390001')",
      );
      await evaluate("document.querySelector('#admin-comment-chapter-trigger').focus()");
      for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter']) {
        await call('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key,
          code: key,
          windowsVirtualKeyCode: key === 'Enter' ? 13 : 40,
        });
        await call('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key,
          code: key,
          windowsVirtualKeyCode: key === 'Enter' ? 13 : 40,
        });
      }
      await until(
        "document.querySelector('#admin-comment-chapter').value==='390001' && document.querySelectorAll('.admin-comment-item').length===1",
      );
      assert.equal(
        await evaluate("document.querySelector('.admin-comment-text').textContent"),
        '第一集独立讨论',
      );
      assert.equal(
        await evaluate("document.querySelectorAll('#admin-filters .select-menu').length"),
        3,
      );
      await screenshot('chapter-comments-admin-desktop');
      await evaluate('document.querySelector(\'[data-hidden="1"]\').click()');
      await until('document.querySelector(\'[data-hidden="0"]\')?.disabled===false');
      assert.equal(
        (await evaluate("fetch('/api/courses/39/comments?chapterId=390001').then(r=>r.json())"))
          .length,
        0,
      );
      await evaluate('document.querySelector(\'[data-hidden="0"]\').click()');
      await until('document.querySelector(\'[data-hidden="0"]\')?.disabled===true');
      assert.equal(
        (await evaluate("fetch('/api/courses/39/comments?chapterId=390001').then(r=>r.json())"))
          .length,
        1,
      );
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await evaluate("document.querySelector('#admin-comment-chapter-trigger').click()");
      await screenshot('chapter-comments-admin-mobile');
      await evaluate(
        "document.querySelector('#admin-comment-chapter-trigger').click();window.confirm=()=>true;document.querySelector('[data-delete]').click()",
      );
      await until("document.querySelectorAll('.admin-comment-item').length===0");
      assert.equal(
        (await evaluate("fetch('/api/courses/39/comments?chapterId=390001').then(r=>r.json())"))
          .length,
        0,
      );
      await evaluate("document.querySelector('#admin-filters').reset()");
      await until(
        "document.querySelector('#admin-comment-course').value==='' && document.querySelectorAll('.admin-comment-item').length>1",
      );
      await evaluate(
        "document.querySelector('#admin-comment-chapter-trigger').click();document.querySelector('#admin-comment-chapter-option-1').click()",
      );
      await until(
        "document.querySelector('.admin-comment-list').textContent.includes('历史课程评论（未绑定章节）') && !document.querySelector('.admin-comment-list').textContent.includes('第二集独立讨论')",
      );
      assert.equal(
        await evaluate("document.querySelectorAll('#admin-filters .select-menu').length"),
        3,
      );
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.ADMIN_ONLY === '1') {
      const registered = await evaluate(
        `fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'后台界面测试',password:'admin-test'})}).then(r=>r.json())`,
      );
      const fixture = new DatabaseSync(join(dir, 'test.db'));
      fixture.prepare('INSERT INTO admin_accounts(user_id) VALUES(?)').run(registered.user.id);
      fixture.close();
      await call('Page.reload', {}, sessionId);
      await until("document.querySelectorAll('.card').length===6");
      await evaluate("location.hash='#/admin'");
      await until("document.querySelectorAll('.metric-grid article').length===4");
      await screenshot('admin-real-dashboard');
      await evaluate("location.hash='#/admin/courses'");
      await until("document.querySelector('#admin-create')!==null");
      await evaluate("document.querySelector('#admin-create').click()");
      await until("document.querySelector('.admin-dialog[open]')!==null");
      await evaluate(
        `(()=>{const f=document.querySelector('.admin-dialog form');for(const [k,v] of Object.entries({title:'后台新增课程回归',teacher:'演示讲师',subject:'编程',description:'新增课程界面验证'}))f.elements[k].value=v;f.requestSubmit(f.querySelector('[data-open-chapters]'));})()`,
      );
      await until(
        "document.querySelector('.admin-table').textContent.includes('后台新增课程回归')",
      );
      await until("document.querySelector('[data-new]')!==null");
      assert.equal(
        await evaluate(
          "document.querySelector('.admin-chapters').textContent.includes('还没有章节')",
        ),
        true,
      );
      await evaluate("document.querySelector('[data-close]').click()");
      await evaluate("document.querySelector('[data-cover]').click()");
      await until("document.querySelector('[name=coverfile]')!==null");
      await evaluate(
        `(async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='#cb416d';ctx.fillRect(0,0,320,180);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'cover.png',{type:'image/png'}));document.querySelector('[name=coverfile]').files=dt.files;document.querySelector('.admin-dialog form').requestSubmit();})()`,
      );
      await until("document.querySelector('.admin-dialog[open]')===null");
      await evaluate("document.querySelector('[data-edit]').click()");
      await screenshot('admin-course-upload-entry');
      await evaluate(
        "(()=>{const f=document.querySelector('.admin-dialog form');f.elements.description.value='上传前保存的课程简介';f.requestSubmit(f.querySelector('[data-open-chapters]'));})()",
      );
      await until("document.querySelector('[data-new]')!==null");
      assert.equal(
        await evaluate(
          "fetch('/api/admin/courses?q='+encodeURIComponent('后台新增课程回归')).then(r=>r.json()).then(d=>d.rows[0].description)",
        ),
        '上传前保存的课程简介',
      );
      await evaluate("document.querySelector('[data-new]').click()");
      await evaluate(
        "(()=>{const f=document.querySelector('.admin-dialog form');f.elements.title.value='第一节';f.elements.duration.value='12:00';f.requestSubmit();})()",
      );
      await until("document.querySelector('#admin-video-file')!==null");
      await until("document.querySelector('.admin-dialog [name=bvid]')!==null");
      await screenshot('admin-source-editor');
      // Produce a real browser-decodable video; API header fixtures alone cannot prove playback.
      await evaluate(`(async()=>{
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
        const ctx=canvas.getContext('2d');const stream=canvas.captureStream(10);
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});const chunks=[];
        recorder.ondataavailable=e=>chunks.push(e.data);
        const done=new Promise(resolve=>recorder.onstop=resolve);
        recorder.start();let n=0;const tick=setInterval(()=>{ctx.fillStyle='#cb416d';ctx.fillRect(0,0,320,180);ctx.fillStyle='white';ctx.font='22px sans-serif';ctx.fillText('Upload playback '+n++,35,95);},100);
        await new Promise(r=>setTimeout(r,1200));recorder.stop();await done;clearInterval(tick);stream.getTracks().forEach(t=>t.stop());
        const dt=new DataTransfer();dt.items.add(new File(chunks,'lesson.webm',{type:'video/webm'}));
        document.querySelector('#admin-video-file').files=dt.files;document.querySelector('#admin-video-upload').click();
      })()`);
      await until(
        "document.querySelector('#admin-upload-status')?.textContent.includes('上传成功')",
      );
      assert.equal(await evaluate("document.querySelector('[name=kind]').value"), 'local');
      await screenshot('admin-video-uploaded');
      await evaluate("document.querySelector('.admin-dialog').close()");
      const newCourseId = await evaluate(`(async()=>{
        const data=await fetch('/api/admin/courses?q='+encodeURIComponent('后台新增课程回归')).then(r=>r.json());const c=data.rows[0];
        const r=await fetch('/api/admin/courses/'+c.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c,published:1})});
        if(!r.ok)throw Error(await r.text());return c.id;
      })()`);
      await evaluate(`location.hash='#/video/${newCourseId}'`);
      await until("document.querySelector('#course-video')?.readyState>=2");
      assert.equal(await evaluate("document.querySelector('#course-video').videoWidth"), 320);
      await evaluate(
        "(()=>{const v=document.querySelector('#course-video');v.muted=true;return v.play();})()",
      );
      await until("document.querySelector('#course-video')?.currentTime>0");
      await screenshot('uploaded-video-playing');
      await evaluate("location.hash='#/admin/courses'");
      await until('document.querySelector(\'[data-edit="17"]\')!==null');
      await evaluate('document.querySelector(\'[data-edit="17"]\').click()');
      await until("document.querySelector('.admin-dialog[open]')!==null");
      await evaluate(
        "document.querySelector('.admin-dialog [name=title]').value='物理界面编辑测试';document.querySelector('.admin-dialog form').requestSubmit()",
      );
      await until(
        "document.querySelector('.admin-table').textContent.includes('物理界面编辑测试')",
      );
      await evaluate("location.hash='#/admin/articles'");
      await until("document.querySelector('.admin-heading h1')?.textContent==='文章管理'");
      await evaluate("document.querySelector('#admin-create').click()");
      await evaluate(
        `document.querySelector('[name=title]').value='原创学习随笔';document.querySelector('[name=summary]').value='接口与页面一起验证';document.querySelector('[name=content]').value='<script>window.unsafe=true</script>这是纯文本';document.querySelector('[name=published]').value='1';document.querySelector('.admin-dialog form').requestSubmit()`,
      );
      await until("document.querySelector('.admin-table').textContent.includes('原创学习随笔')");
      await screenshot('admin-real-articles');
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await screenshot('admin-real-mobile');
      await evaluate("location.hash='#/explore'");
      await until("document.querySelector('[data-article]')!==null");
      await evaluate("document.querySelector('[data-article]').click()");
      await until("document.querySelector('.published-reader[open]')!==null");
      assert.equal(
        await evaluate(
          "window.unsafe===undefined&&document.querySelector('.published-body').textContent.includes('<script>')",
        ),
        true,
      );
      await screenshot('published-reader-mobile');
      await evaluate(
        "document.querySelector('.published-reader button').click();location.hash='#/admin/audit'",
      );
      await until("document.querySelector('.metric-grid')!==null");
      assert.equal(
        await evaluate('document.querySelector(\'a[href="#/admin/audit"]\')===null'),
        true,
      );
      const detailUser = await evaluate(
        `fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'用户详情回归',password:'detail-test-123'})}).then(r=>r.json())`,
      );
      const userFixture = new DatabaseSync(join(dir, 'test.db'));
      const firstChapter = userFixture
        .prepare('SELECT id FROM chapters WHERE course_id=17 ORDER BY position,id LIMIT 1')
        .get();
      userFixture
        .prepare(
          'INSERT INTO notes(user_id,course_id,chapter_id,at_second,content) VALUES(?,17,?,10,?)',
        )
        .run(detailUser.id, firstChapter.id, '后台不应显示的笔记内容');
      userFixture
        .prepare('INSERT INTO follows(user_id,teacher) SELECT ?,teacher FROM courses WHERE id=17')
        .run(detailUser.id);
      userFixture
        .prepare(
          'INSERT INTO favorites(user_id,chapter_id,created_at) VALUES(?,?,CURRENT_TIMESTAMP)',
        )
        .run(detailUser.id, firstChapter.id);
      userFixture.close();
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      await evaluate("location.hash='#/admin/users'");
      await until(`document.querySelector('[data-user-detail="${detailUser.id}"]')!==null`);
      await evaluate(`document.querySelector('[data-user-detail="${detailUser.id}"]').click()`);
      await until("document.querySelector('[data-stat=notes]')?.textContent==='1'");
      assert.equal(
        await evaluate("document.querySelector('[data-stat=follows]').textContent"),
        '1',
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.admin-user-dialog').textContent.includes('后台不应显示的笔记内容')",
        ),
        false,
      );
      await screenshot('admin-user-details');
      await evaluate("document.querySelector('[data-edit-avatar]').click()");
      assert.equal(
        await evaluate("document.activeElement===document.querySelector('[data-avatar-file]')"),
        true,
      );
      await screenshot('admin-user-avatar-entry');
      await evaluate(
        `(async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='#cb416d';ctx.fillRect(0,0,320,180);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'avatar.png',{type:'image/png'}));const input=document.querySelector('[data-avatar-file]');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`,
      );
      await until("document.querySelector('[data-save-avatar]')?.disabled===false");
      await evaluate(
        "window.__originalConfirm=window.confirm;window.confirm=()=>false;document.querySelector('[data-save-avatar]').click()",
      );
      assert.equal(
        await evaluate(
          `fetch('/api/admin/users/${detailUser.id}').then(r=>r.json()).then(u=>u.avatar)`,
        ),
        detailUser.avatar,
      );
      await evaluate(
        "window.confirm=()=>true;document.querySelector('[data-save-avatar]').click()",
      );
      await until("document.querySelector('[data-avatar-status]')?.textContent==='头像已保存'");
      assert.equal(
        await evaluate(
          "document.querySelector('.admin-user-identity img').getAttribute('src').startsWith('/api/avatars/')",
        ),
        true,
      );
      await until("document.querySelector('.admin-user-identity img').naturalWidth===256");
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      assert.equal(
        await evaluate(
          "(()=>{const d=document.querySelector('.admin-user-dialog');return d.scrollWidth<=d.clientWidth+1;})()",
        ),
        true,
      );
      await screenshot('admin-user-mobile');
      await evaluate("document.querySelector('[data-reset-avatar]').click()");
      await until(
        "document.querySelector('.admin-user-identity img')?.getAttribute('src')==='/avatar-cheese.jpg'",
      );
      await until("document.querySelector('[data-avatar-status]')?.textContent==='头像已保存'");
      await evaluate(
        "window.confirm=window.__originalConfirm;delete window.__originalConfirm;document.querySelector('.admin-user-dialog [data-close]').click()",
      );
      await evaluate(
        `document.querySelector('[data-user-detail="${registered.user.id}"]').click()`,
      );
      await until("document.querySelector('.admin-user-identity')!==null");
      assert.equal(await evaluate("document.querySelector('[data-avatar-file]')===null"), true);
      await evaluate("document.querySelector('.admin-user-dialog [data-close]').click()");
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.HISTORY_ONLY === '1') {
      await call(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
        sessionId,
      );
      const registered = await evaluate(
        `fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'历史界面测试',password:'history-test'})}).then(async r=>({status:r.status,data:await r.json()}))`,
      );
      assert.equal(registered.status, 200, JSON.stringify(registered));
      const me = await evaluate(`fetch('/api/auth/me').then(r=>r.json())`);
      assert.ok(me.user, JSON.stringify(me));
      const visits = await evaluate(
        `Promise.all([10,14,16,17,18,19].map(id=>fetch('/api/courses/'+id+'/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapterId:id*10000+1})}).then(async r=>({status:r.status,data:await r.json()}))))`,
      );
      assert.ok(
        visits.every((r) => r.status === 200),
        JSON.stringify(visits),
      );
      await call(
        'Page.navigate',
        { url: 'http://localhost:' + port + '/#/profile?section=history' },
        sessionId,
      );
      await call('Page.reload', {}, sessionId);
      await until("document.querySelectorAll('#profile-history .card').length===6");
      assert.equal(
        await evaluate(
          "document.querySelector('.history-timeline').scrollWidth>document.querySelector('.history-timeline').clientWidth",
        ),
        true,
      );
      await evaluate("document.querySelector('[data-history-next]').click()");
      await until("document.querySelector('.history-timeline').scrollLeft>100");
      assert.equal(
        await evaluate("document.querySelectorAll('.history-point time[datetime]').length"),
        6,
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#profile-history input,#profile-history select').length",
        ),
        0,
      );
      await screenshot('history-timeline-desktop');
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await evaluate(
        "document.querySelector('#profile-history').scrollIntoView({block:'start',behavior:'instant'})",
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await evaluate("document.querySelector('.history-timeline').focus()");
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End' }, sessionId);
      await until("document.querySelector('[data-history-next]').disabled");
      await screenshot('history-timeline-mobile');
      await evaluate("document.querySelector('#history-clear').click()");
      assert.equal(
        await evaluate(
          "document.querySelector('.history-confirm').open&&document.activeElement.hasAttribute('data-cancel')",
        ),
        true,
      );
      await screenshot('history-clear-confirm');
      await evaluate("document.querySelector('.history-confirm [data-cancel]').click()");
      assert.equal(await evaluate("document.querySelectorAll('#profile-history .card').length"), 6);
      await evaluate(
        "document.querySelector('#history-clear').click();document.querySelector('.history-confirm [data-confirm]').click()",
      );
      await until(
        "document.querySelectorAll('#profile-history .card').length===0&&document.querySelector('#history-clear').disabled",
      );
      assert.equal(
        await evaluate("document.querySelector('#history-shortcut b').textContent"),
        '0',
      );
      await call('Page.reload', {}, sessionId);
      await until("!!document.querySelector('.history-empty')");
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.CHECKINS_ONLY === '1') {
      await evaluate("location.hash='#/learning'");
      await until("!!document.querySelector('#checkin-action')");
      assert.equal(
        await evaluate("document.querySelector('#checkin-action').textContent"),
        '登录后打卡',
      );
      await evaluate(
        "document.querySelector('#checkin-action').click();document.querySelector('#nickname').value='林同学';document.querySelector('#password').value='123456';document.querySelector('#auth-form').requestSubmit()",
      );
      await until("document.querySelectorAll('.checkin-day').length===365");
      assert.equal(await evaluate("document.querySelectorAll('.checkin-day.checked').length"), 0);
      await evaluate("document.querySelector('#checkin-action').click()");
      await until(
        "document.querySelector('#checkin-action').disabled&&document.querySelectorAll('.checkin-day.checked').length===1",
      );
      await evaluate("document.querySelector('.checkin-day.today').focus()");
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft' }, sessionId);
      assert.equal(
        await evaluate(
          "document.activeElement.classList.contains('checkin-day')&&!document.activeElement.classList.contains('today')",
        ),
        true,
      );
      await evaluate(
        "fetch('/api/courses/39/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapterId:390001})}).then(r=>r.json())",
      );
      await evaluate(
        "fetch('/api/courses/39/favorite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapterId:390001})}).then(r=>r.json())",
      );
      await call('Page.reload', {}, sessionId);
      await until(
        "document.querySelectorAll('.checkin-day.checked').length===1&&document.querySelectorAll('#study-list .card').length===1",
      );
      assert.equal(await evaluate("document.querySelector('.study-dashboard .tabs')===null"), true);
      await screenshot('checkin-desktop');
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await screenshot('checkin-mobile');
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      assert.equal(
        await evaluate(
          "document.querySelector('.checkin-scroll').scrollWidth>document.querySelector('.checkin-scroll').clientWidth",
        ),
        true,
      );
      await evaluate("location.hash='#/profile?section=history'");
      await until("document.querySelectorAll('#profile-history .card').length===1");
      assert.equal(await evaluate("document.querySelector('#study-checkins')===null"), true);
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#profile-history input,#profile-history select,#profile-history .select-menu,#profile-history [data-shelf],#profile-history #study-clear').length",
        ),
        0,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#profile-history .study-visited').textContent.length>0",
        ),
        true,
      );
      await screenshot('profile-history-mobile');
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      await screenshot('profile-history-desktop');
      await evaluate("location.hash='#/learning'");
      await until("document.querySelectorAll('.checkin-day.checked').length===1");
      await evaluate(
        "document.querySelector('#appearance-button').click();document.querySelector('#interface-language').value='en';document.querySelector('#interface-language').dispatchEvent(new Event('change'));document.querySelector('#appearance-done').click()",
      );
      await until("document.querySelector('#checkin-action').textContent==='Checked in today'");
      assert.equal(await evaluate("document.querySelectorAll('.checkin-day').length"), 365);
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.MATH_ONLY === '1') {
      await evaluate("location.hash='#/courses'");
      await until("document.querySelectorAll('#course-list .card').length===33");
      assert.equal(
        await evaluate('document.querySelector(\'#course-list [data-id="9"]\')===null'),
        true,
      );
      for (const [id, bvid, count] of [
        [39, 'BV1AuoMBBE2p', 22],
        [40, 'BV1a96DYgEYZ', 23],
        [41, 'BV1KXeu6tEUy', 55],
        [42, 'BV1zH4y117JX', 17],
      ]) {
        assert.equal(await evaluate("fetch('/course-images/" + id + ".jpg').then(r=>r.ok)"), true);
        await evaluate("location.hash='#/video/" + id + "'");
        await until(
          "document.querySelectorAll('.chapter').length===" +
            count +
            "&&document.querySelector('iframe')?.src.includes('" +
            bvid +
            "')",
        );
        await evaluate("document.querySelector('.chapter:last-child').click()");
        await until(
          "new URL(document.querySelector('iframe').src).searchParams.get('page')==='" +
            count +
            "'",
        );
        assert.equal(
          await evaluate(
            "Number(new URL(document.querySelector('iframe').src).searchParams.get('cid'))>0",
          ),
          true,
        );
      }
      await evaluate("location.hash='#/courses?category='+encodeURIComponent('考研课程')");
      await until("document.querySelectorAll('#course-list .card').length===12");
      await screenshot('math-courses-desktop');
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await screenshot('math-courses-mobile');
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.HANDWRITING_ONLY === '1') {
      assert.equal(await evaluate("document.querySelector('.home-category-bar')===null"), true);
      assert.equal(
        await evaluate(
          "document.querySelector('.home-motto').nextElementSibling.classList.contains('spotlight')",
        ),
        true,
      );
      const initialHomeIds = await evaluate(
        "[...document.querySelectorAll('#home-course-grid .card')].map(e=>e.dataset.id).join(',')",
      );
      await evaluate("document.querySelector('#home-refresh').click()");
      assert.notEqual(
        await evaluate(
          "[...document.querySelectorAll('#home-course-grid .card')].map(e=>e.dataset.id).join(',')",
        ),
        initialHomeIds,
      );

      assert.equal(await evaluate("document.querySelector('.brand-logo').naturalWidth>0"), true);
      assert.equal(
        await evaluate(
          "[...document.querySelectorAll('.motto-character')].map(e=>e.dataset.character).join('')",
        ),
        '按自己的节奏学习',
      );
      await evaluate("document.querySelector('.motto-replay').click()");
      await evaluate('new Promise(r=>setTimeout(r,1000))');
      assert.equal(
        await evaluate(
          "[...document.querySelectorAll('.motto-character:first-child .writing-stroke')].every(e=>parseFloat(getComputedStyle(e).strokeDashoffset)===0)",
        ),
        true,
      );
      assert.equal(
        await evaluate(
          "[...document.querySelectorAll('.motto-character:last-child .writing-stroke')].every(e=>parseFloat(getComputedStyle(e).strokeDashoffset)>0)",
        ),
        true,
      );
      await screenshot('handwriting-in-progress');
      await until("document.querySelector('.home-motto').dataset.writing==='complete'");
      await screenshot('handwriting-desktop');
      await evaluate(
        "document.querySelector('.motto-replay').click();window.detachedMotto=document.querySelector('.home-motto');location.hash='#/courses'",
      );
      await until("!!document.querySelector('#course-list')");
      assert.equal(await evaluate('window.detachedMotto.getAnimations({subtree:true}).length'), 0);
      await call(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
        sessionId,
      );
      await evaluate("location.hash='#/'");
      await until("!!document.querySelector('.writing-ready')");
      assert.equal(
        await evaluate("document.querySelector('.home-motto').dataset.writing"),
        'complete',
      );
      assert.equal(await evaluate("document.querySelector('.motto-replay').hidden"), true);
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await screenshot('handwriting-mobile');
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true);
      assert.equal(
        await evaluate(
          "document.querySelector('.motto-drawing').getBoundingClientRect().right<=innerWidth",
        ),
        true,
      );
      await call(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] },
        sessionId,
      );
      await evaluate("document.querySelector('.motto-replay').click()");
      assert.equal(
        await evaluate("document.querySelector('.home-motto').dataset.writing"),
        'active',
      );
      await call(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
        sessionId,
      );
      await until("document.querySelector('.home-motto').dataset.writing==='complete'", 1500);
      assert.deepEqual(errors, []);
      t.diagnostic('逐字笔画、重播、离页清理、减少动态效果和移动端验证通过');
      return;
    }
    if (process.env.SETTINGS_ONLY === '1') {
      await evaluate("document.querySelector('#appearance-button').click()");
      assert.equal(
        await evaluate("document.querySelectorAll('#appearance-dialog .select-menu').length"),
        3,
      );
      assert.equal(
        await evaluate(
          "Array.from(document.querySelectorAll('#appearance-dialog select')).every(s=>getComputedStyle(s).display==='none')",
        ),
        true,
      );
      for (const id of ['interface-language', 'navigation-style', 'reading-size']) {
        await evaluate("document.querySelector('#" + id + "-trigger').click()");
        assert.equal(
          await evaluate(
            "document.querySelector('#" + id + "-trigger').getAttribute('aria-expanded')",
          ),
          'true',
        );
        await screenshot('settings-' + id);
        await call(
          'Input.dispatchKeyEvent',
          { type: 'keyDown', key: 'Escape', code: 'Escape' },
          sessionId,
        );
        assert.equal(
          await evaluate(
            "document.querySelector('#appearance-dialog').open&&document.querySelector('#" +
              id +
              "-options').hidden",
          ),
          true,
        );
      }
      await evaluate(
        "document.querySelector('#interface-language-trigger').click();document.querySelector('#interface-language-option-1').click()",
      );
      await until(
        "document.documentElement.lang==='en'&&document.querySelector('#navigation-style-value').textContent==='Soft gradient'",
      );
      await evaluate("document.querySelector('#navigation-style-trigger').click()");
      await call(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' },
        sessionId,
      );
      await call(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'Enter', code: 'Enter' },
        sessionId,
      );
      assert.equal(await evaluate("document.body.classList.contains('solid-navigation')"), true);
      await evaluate(
        "document.querySelector('#reading-size-trigger').click();document.querySelector('#reading-size-option-1').click()",
      );
      assert.equal(await evaluate("document.body.classList.contains('reading-comfort')"), true);
      await evaluate(
        "document.querySelector('#interface-language-trigger').click();document.querySelector('#interface-language-option-0').click()",
      );
      await until(
        "document.querySelector('#navigation-style-value').textContent==='简洁纯色'&&document.querySelector('#reading-size-value').textContent==='舒适'",
      );
      await evaluate("document.querySelector('#appearance-done').click()");
      await call('Page.reload', {}, sessionId);
      await until(
        "document.querySelectorAll('.card').length===6&&document.querySelector('#reading-size-trigger')!==null",
      );
      await evaluate("document.querySelector('#appearance-button').click()");
      assert.equal(
        await evaluate("document.querySelector('#reading-size-value').textContent"),
        '舒适',
      );
      assert.equal(
        await evaluate("document.querySelector('#navigation-style-value').textContent"),
        '简洁纯色',
      );
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 640, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await evaluate(
        "document.querySelector('#reading-size-trigger').scrollIntoView({block:'center'});document.querySelector('#reading-size-trigger').click()",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#appearance-dialog').scrollWidth<=document.querySelector('#appearance-dialog').clientWidth",
        ),
        true,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#reading-size-options').getBoundingClientRect().bottom<=document.querySelector('#appearance-dialog').getBoundingClientRect().bottom&&document.querySelector('#reading-size-options').getBoundingClientRect().right<=innerWidth",
        ),
        true,
      );
      await screenshot('settings-mobile-dropdown');
      await evaluate("document.querySelector('#appearance-reset').click()");
      await until(
        "document.querySelector('#reading-size-value').textContent==='标准'&&document.querySelector('#navigation-style-value').textContent==='柔和渐变'",
      );
      assert.equal(
        await evaluate("JSON.parse(localStorage.getItem('zhitu-appearance')).reading"),
        'standard',
      );
      await evaluate(
        "document.querySelector('#appearance-done').click();document.querySelector('#appearance-button').click()",
      );
      assert.equal(
        await evaluate(
          "Array.from(document.querySelectorAll('#appearance-dialog .select-options')).every(e=>e.hidden)",
        ),
        true,
      );
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.POSTS_ONLY === '1') {
      await evaluate("location.hash='#/courses?q='+encodeURIComponent('电路')");
      await until("document.querySelectorAll('#course-list .card').length===1");
      assert.equal(
        await evaluate(
          "document.querySelector('.course-head input')===null&&document.querySelector('#search').value==='电路'",
        ),
        true,
      );
      assert.equal(
        await evaluate("document.querySelector('#course-query-text').textContent"),
        '电路',
      );
      await evaluate("document.querySelector('#clear-course-query').click()");
      await until("document.querySelectorAll('#course-list .card').length===33");
      assert.equal(
        await evaluate(
          "document.querySelector('#active-course-query').hidden&&document.querySelector('#search').value===''",
        ),
        true,
      );
      await screenshot('catalog-single-search');
      await evaluate("document.querySelector('[data-course-view=list]').click()");
      const noOverlap =
        "Array.from(document.querySelectorAll('#course-list .card')).every(c=>{const cover=c.querySelector('.cover').getBoundingClientRect();return ['h3','p'].every(selector=>c.querySelector(selector).getBoundingClientRect().left>=cover.right+8)&&cover.width<=201&&c.getBoundingClientRect().right<=innerWidth})";
      await until(noOverlap);
      await evaluate(
        "document.querySelector('#course-list').scrollIntoView({behavior:'instant',block:'start'})",
      );
      await screenshot('list-layout-desktop');
      await evaluate(
        "document.querySelector('#course-sort-trigger').scrollIntoView({behavior:'instant',block:'center'});document.querySelector('#course-sort-trigger').click()",
      );
      assert.equal(
        await evaluate("getComputedStyle(document.querySelector('#course-sort')).display"),
        'none',
      );
      await screenshot('catalog-themed-sort');
      await call(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' },
        sessionId,
      );
      await call(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'Enter', code: 'Enter' },
        sessionId,
      );
      await until(
        "document.querySelector('#course-sort').value==='lessons'&&Array.from(document.querySelectorAll('.course-group')).every(g=>{const counts=Array.from(g.querySelectorAll('.card p>span:last-child'),e=>parseInt(e.textContent));return counts.every((n,i)=>!i||counts[i-1]>=n)})",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#course-sort-trigger').getAttribute('aria-expanded')",
        ),
        'false',
      );
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await until(noOverlap);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
      await evaluate(
        "document.querySelector('#course-list').scrollIntoView({behavior:'instant',block:'start'})",
      );
      await screenshot('list-layout-mobile');
      await evaluate("document.querySelector('#course-sort-trigger').click()");
      assert.equal(
        await evaluate(
          "document.querySelector('#course-sort-options').getBoundingClientRect().right<=innerWidth",
        ),
        true,
      );
      await call(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key: 'Escape', code: 'Escape' },
        sessionId,
      );
      assert.equal(await evaluate("document.querySelector('#course-sort-options').hidden"), true);
      await evaluate("document.querySelector('[data-course-view=cards]').click()");
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      await evaluate("location.hash='#/explore'");
      await checkEditorialReader();
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await checkEditorialReader();
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.SEARCH_ONLY === '1') {
      await until("!!document.querySelector('.search-teaser')?.dataset.courseId");
      assert.equal(
        await evaluate("document.querySelector('#search').hasAttribute('placeholder')"),
        false,
      );
      const firstTeaser = await evaluate(
        "document.querySelector('.search-teaser').dataset.courseId",
      );
      await until(
        "document.querySelector('.search-teaser').dataset.courseId!==" +
          JSON.stringify(firstTeaser),
        7000,
      );
      await screenshot('search-rolling-title');
      const featuredId = await evaluate(
        "(()=>{const id=document.querySelector('.search-teaser').dataset.courseId;document.querySelector('#search-submit').click();return id})()",
      );
      await until(
        "location.hash.split('?')[0]==='#/video/" +
          featuredId +
          "'&&!!document.querySelector('.video-meta h1')",
      );
      await evaluate("location.hash='#/'");
      await until("document.querySelectorAll('#home-course-grid .card').length===6");
      await call(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
        sessionId,
      );
      const staticTitle = await evaluate(
        "document.querySelector('.search-teaser').dataset.courseId",
      );
      await evaluate('new Promise(r=>setTimeout(r,5300))');
      assert.equal(
        await evaluate("document.querySelector('.search-teaser').dataset.courseId"),
        staticTitle,
      );
      await call(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] },
        sessionId,
      );
      const type = async (value) =>
        evaluate(
          "document.querySelector('#search').focus();document.querySelector('#search').value=" +
            JSON.stringify(value) +
            ";document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}))",
        );
      const key = async (value) => {
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: value });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: value });
      };
      assert.equal(await evaluate("document.querySelector('.brand-logo').naturalWidth>0"), true);
      await type('');
      await until("!document.querySelector('#search-panel').hidden");
      assert.equal(
        await evaluate("document.querySelector('#search-panel').textContent.includes('输入课程')"),
        true,
      );
      await type('Cherno');
      assert.equal(await evaluate("document.querySelector('.search-teaser').hidden"), true);
      await until("document.querySelector('#search-option-0')?.textContent.includes('C++')");
      await screenshot('search-suggestions-desktop');
      await key('ArrowDown');
      assert.equal(
        await evaluate("document.querySelector('#search').getAttribute('aria-activedescendant')"),
        'search-option-0',
      );
      await key('Enter');
      await until(
        "location.hash.startsWith('#/video/31')&&document.querySelectorAll('.chapter').length===98",
      );
      assert.equal(await evaluate("document.querySelector('#search-panel').hidden"), true);
      await type('');
      await until("document.querySelector('#search-option-0')?.textContent.includes('Cherno')");
      await evaluate("document.querySelector('#search-option-0').click()");
      await until(
        "document.querySelector('#course-query-text')?.textContent==='Cherno'&&document.querySelectorAll('#course-list .card').length===1",
      );
      await call('Page.reload', {}, sessionId);
      await until("document.querySelector('#course-query-text')?.textContent==='Cherno'");
      await type('');
      await until("document.querySelector('#search-option-0')?.textContent.includes('Cherno')");
      assert.equal(
        await evaluate("document.querySelectorAll('#search-options [role=option]').length"),
        1,
      );
      await screenshot('search-history-desktop');
      await key('Escape');
      assert.equal(
        await evaluate("document.querySelector('#search').getAttribute('aria-expanded')"),
        'false',
      );
      await type('不存在的课程');
      await until(
        "document.querySelector('#search-panel').textContent.includes('没有找到匹配课程')",
      );
      await type('Python');
      await type('电路');
      await until("document.querySelector('#search-option-0')?.textContent.includes('电路')");
      assert.equal(
        await evaluate("document.querySelector('#search-options').textContent.includes('Python')"),
        false,
      );
      await evaluate("document.querySelector('#search-clear').click()");
      await until(
        "document.querySelector('#search').value===''&&!document.querySelector('#search-panel').hidden",
      );
      await evaluate("document.querySelector('#search-history-clear').click()");
      assert.equal(
        await evaluate("document.querySelectorAll('#search-options [role=option]').length"),
        0,
      );
      await evaluate(
        "document.querySelector('#search').dispatchEvent(new CompositionEvent('compositionstart'));document.querySelector('#search').value='数学';document.querySelector('#search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))",
      );
      assert.equal(
        await evaluate("new URLSearchParams(location.hash.split('?')[1]).get('q')"),
        'Cherno',
      );
      await evaluate(
        "document.querySelector('#search').dispatchEvent(new CompositionEvent('compositionend'))",
      );
      await until("document.querySelectorAll('#search-options [role=option]').length>0");
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await type('电路');
      await until("document.querySelector('#search-option-0')?.textContent.includes('电路')");
      await screenshot('search-suggestions-mobile');
      assert.equal(
        await evaluate(
          "document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#search-panel').getBoundingClientRect().right<=innerWidth",
        ),
        true,
      );
      await evaluate("document.querySelector('#search-all').click()");
      await until("document.querySelector('#course-query-text')?.textContent==='电路'");
      await type('');
      await until("document.querySelector('#search-option-0')?.textContent.includes('电路')");
      await evaluate(
        "document.querySelector('#appearance-button').click();document.querySelector('#interface-language').value='en';document.querySelector('#interface-language').dispatchEvent(new Event('change'));document.querySelector('#appearance-done').click()",
      );
      await type('');
      await until(
        "document.querySelector('#search-panel').textContent.includes('Recent searches')",
      );
      await evaluate("document.querySelector('#search-history-clear').click()");
      await type('<img src=x onerror=alert(1)>');
      await evaluate("document.querySelector('.search').requestSubmit()");
      await until("document.querySelector('#course-query-text')?.textContent.startsWith('<img')");
      await type('');
      assert.equal(
        await evaluate(
          "document.querySelector('#search-panel img')===null&&document.querySelector('#search-option-0').textContent.includes('<img')",
        ),
        true,
      );
      await evaluate(
        "document.querySelector('#search-history-clear').click();document.querySelector('#search').blur()",
      );
      await type('guest-only');
      await evaluate("document.querySelector('.search').requestSubmit()");
      await until("document.querySelector('#course-query-text')?.textContent==='guest-only'");
      await evaluate(
        "document.querySelector('#auth-entry').click();document.querySelector('#nickname').value='林同学';document.querySelector('#password').value='123456';document.querySelector('#auth-form').requestSubmit()",
      );
      await until(
        "document.querySelector('#account').dataset.signedIn==='true'&&!document.querySelector('#auth').open",
      );
      await type('');
      assert.equal(
        await evaluate(
          "document.querySelector('#search-panel').textContent.includes('guest-only')",
        ),
        false,
      );
      assert.deepEqual(errors, []);
      return;
    }
    if (process.env.COURSE_AVATAR_ONLY === '1') {
      await evaluate(
        "document.querySelector('#auth-entry').click();document.querySelector('#nickname').value='林同学';document.querySelector('#password').value='123456';document.querySelector('#auth-form').requestSubmit()",
      );
      await until(
        "document.querySelector('#account').dataset.signedIn==='true'&&!document.querySelector('#auth').open",
      );
      for (const [id, bvid, count] of [
        [31, 'BV1qh411p7Sa', 98],
        [37, 'BV1uW4y1v7xr', 78],
        [38, 'BV19N411U7Pc', 14],
      ]) {
        await evaluate("location.hash='#/video/" + id + "'");
        await until(
          "document.querySelectorAll('.chapter').length===" +
            count +
            "&&document.querySelector('iframe')?.src.includes('" +
            bvid +
            "')",
        );
        await evaluate("document.querySelector('.chapter:last-child').click()");
        await until(
          "new URL(document.querySelector('iframe').src).searchParams.get('page')==='" +
            count +
            "'",
        );
        assert.ok(
          await evaluate(
            "Number(new URL(document.querySelector('iframe').src).searchParams.get('cid'))>0",
          ),
        );
      }
      await evaluate("location.hash='#/courses'");
      await until("document.querySelectorAll('#course-list .card').length===33");
      for (const id of [31, 37, 38]) {
        await evaluate(
          'document.querySelector(\'.card[data-id="' +
            id +
            "\"]').scrollIntoView({behavior:'instant',block:'center'})",
        );
        await until('document.querySelector(\'.card[data-id="' + id + '"] img\')?.naturalWidth>0');
      }
      await evaluate("location.hash='#/profile'");
      await until("document.querySelector('.avatar-preview-trigger')!==null");
      await call(
        'Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
        sessionId,
      );
      await evaluate("document.querySelector('.avatar-preview-trigger').click()");
      await until("document.querySelector('.avatar-preview[open]')!==null");
      await screenshot('avatar-editor');
      await evaluate(
        "(async()=>{const c=document.createElement('canvas');c.width=400;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='#ed85ac';ctx.fillRect(0,0,400,240);ctx.fillStyle='#786ab5';ctx.fillRect(200,0,200,240);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const data=new DataTransfer();data.items.add(new File([blob],'my-avatar.png',{type:'image/png'}));document.querySelector('#avatar-file').files=data.files;document.querySelector('#avatar-file').dispatchEvent(new Event('change'))})()",
      );
      await until("!document.querySelector('#avatar-save').disabled");
      await evaluate(
        "document.querySelector('#avatar-zoom').value='1.5';document.querySelector('#avatar-zoom').dispatchEvent(new Event('input'));document.querySelector('#avatar-x').value='60';document.querySelector('#avatar-x').dispatchEvent(new Event('input'))",
      );
      await screenshot('avatar-crop');
      await evaluate("document.querySelector('#avatar-save').click()");
      await until(
        "!document.querySelector('#avatar-editor').open&&document.querySelector('#account img').getAttribute('src').startsWith('/api/avatars/')",
      );
      const savedAvatar = await evaluate(
        "document.querySelector('#account img').getAttribute('src')",
      );
      assert.equal(
        await evaluate("document.querySelector('.profile-avatar img').getAttribute('src')"),
        savedAvatar,
      );
      await call('Page.reload', {}, sessionId);
      await until(
        "document.querySelector('.profile-avatar img')?.getAttribute('src')==='" +
          savedAvatar +
          "'",
      );
      await evaluate("location.hash='#/video/37'");
      await until("document.querySelectorAll('.chapter').length===78");
      await evaluate(
        "document.querySelector('#comment-input').value='头像图片显示回归检查';document.querySelector('#comment-form button').click()",
      );
      await until(
        "document.querySelector('.comment p')?.textContent.includes('头像图片显示回归检查')",
      );
      await evaluate(
        "document.querySelector('.comments').scrollIntoView({behavior:'instant',block:'center'})",
      );
      await until(
        "document.querySelector('.comment-avatar img')?.getAttribute('src')==='" +
          savedAvatar +
          "'&&document.querySelector('.comment-avatar img')?.naturalWidth>0",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#comments-list').innerText.includes('/api/avatars/')",
        ),
        false,
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
      await evaluate(
        "document.querySelector('.comments').scrollIntoView({behavior:'instant',block:'center'})",
      );
      await screenshot('comment-avatar-fixed');
      await evaluate(
        "document.querySelector('.comment-avatar img').dispatchEvent(new Event('error'))",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.comment-avatar img')===null&&document.querySelector('.comment-avatar').textContent.length>0",
        ),
        true,
      );

      assert.deepEqual(errors, []);
      return;
    }

    await evaluate("document.querySelector('#auth-entry').click()");
    await screenshot('auth-login');
    await evaluate(
      "document.querySelector('[data-auth-mode=register]').click();document.querySelector('#nickname').value='表单验证';document.querySelector('#password').value='password';document.querySelector('#confirm-password').value='different';document.querySelector('#auth-form').requestSubmit()",
    );
    await until("document.querySelector('#auth-error').textContent.includes('不一致')");
    await screenshot('auth-register');
    await evaluate("document.querySelector('#password-visibility').click()");
    assert.equal(await evaluate("document.querySelector('#password').type"), 'text');
    await evaluate(
      "document.querySelector('[data-auth-mode=login]').click();document.querySelector('#auth .close').click()",
    );
    await until("document.querySelector('#password').value==='' ");
    assert.equal(
      await evaluate("document.querySelector('#app').innerText.includes('直播')"),
      false,
    );
    assert.equal(
      await evaluate("document.querySelector('.home-study-tips a').getAttribute('href')"),
      '#/explore',
    );
    // Reference redesign keeps real catalog data behind every new control.
    const firstSlide = await evaluate(
      "document.querySelector('.spotlight-action').getAttribute('href')",
    );
    await evaluate("document.querySelector('#spotlight-next').click()");
    assert.notEqual(
      await evaluate("document.querySelector('.spotlight-action').getAttribute('href')"),
      firstSlide,
    );
    await evaluate("document.querySelector('#spotlight-prev').click()");
    assert.equal(
      await evaluate("document.querySelector('.spotlight-action').getAttribute('href')"),
      firstSlide,
    );
    const initialIds = await evaluate(
      "Array.from(document.querySelectorAll('#home-course-grid .card'),c=>c.dataset.id).join(',')",
    );
    await evaluate("document.querySelector('#home-refresh').click()");
    assert.notEqual(
      await evaluate(
        "Array.from(document.querySelectorAll('#home-course-grid .card'),c=>c.dataset.id).join(',')",
      ),
      initialIds,
    );
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
      sessionId,
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    assert.equal(
      await evaluate("getComputedStyle(document.querySelector('#auth-entry')).display==='none'"),
      false,
    );
    await screenshot('home-guest-mobile');
    await evaluate("document.querySelector('#auth-entry').click()");
    assert.equal(
      await evaluate(
        "document.querySelector('#auth').scrollWidth<=document.querySelector('#auth').clientWidth",
      ),
      true,
    );
    await screenshot('auth-mobile');
    await evaluate("document.querySelector('#auth .close').click()");
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await evaluate("window.scrollTo({top:750,behavior:'instant'})");
    await until(
      "new DOMMatrix(getComputedStyle(document.querySelector('.landscape-image')).transform).m42<0",
    );
    await until("document.querySelector('#back-to-top').classList.contains('visible')");
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await screenshot('landscape-scrolled');
    await evaluate("document.querySelector('#back-to-top').click()");
    await until('window.scrollY<3');
    await evaluate(
      "document.querySelector('#account').click();document.querySelector('#account-session').click();document.querySelector('#nickname').value='林同学';document.querySelector('#password').value='123456';document.querySelector('#password').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))",
    );
    await until(
      "document.querySelector('#account').dataset.signedIn==='true'&&!document.querySelector('#auth').open",
    );
    await evaluate("location.hash='#/video/4'");
    await until("document.querySelectorAll('.chapter').length===5");
    assert.equal(await evaluate("document.querySelector('.chapter.playing').dataset.chapter"), '3');
    await until("document.querySelector('video')?.readyState>=1", 30000);
    await evaluate(
      "document.querySelector('video').muted=true;document.querySelector('video').play()",
    );
    await until("document.querySelector('video').currentTime>1");
    await evaluate("document.querySelector('video').pause()");
    await until("document.querySelector('#save-status').textContent.includes('已同步')");
    await evaluate(
      "document.querySelector('#note-input').value='浏览器时间笔记';document.querySelector('#add-note').click()",
    );
    await until("document.querySelector('.note p')?.textContent==='浏览器时间笔记'");
    await evaluate(
      "document.querySelector('#speed').value='1.5';document.querySelector('#speed').dispatchEvent(new Event('change'));document.querySelector('#focus-mode').click()",
    );
    assert.equal(await evaluate("document.querySelector('video').playbackRate"), 1.5);
    assert.equal(
      await evaluate("document.querySelector('#app').classList.contains('focus-mode')"),
      true,
    );
    await evaluate("document.querySelector('#focus-mode').click()");
    await screenshot('player-desktop');
    await evaluate(
      "document.querySelector('#comment-input').value='<img src=x onerror=alert(1)>';document.querySelector('#comment-form button').click()",
    );
    await until("document.querySelector('.comment p')?.textContent.includes('<img src=x')");
    assert.equal(await evaluate("document.querySelectorAll('.comment p img').length"), 0);
    await evaluate(
      "document.querySelector('#search').value='Python';document.querySelector('.search button').click()",
    );
    await until("document.querySelectorAll('#course-list .card').length===1");
    assert.equal(
      await evaluate("new URLSearchParams(location.hash.split('?')[1]).get('q')"),
      'Python',
    );
    await evaluate("location.hash='#/video/8'");
    await until("document.querySelector('#media-host')?.textContent.includes('尚未发布')");
    await evaluate("location.hash='#/video/39'");
    await until("document.querySelector('iframe')?.src.includes('BV1AuoMBBE2p')");
    assert.equal(await evaluate("document.querySelector('#manual-time-label').hidden"), false);
    await evaluate('new Promise(r=>setTimeout(r,1200))');
    if (process.env.VERIFY_EMBED) {
      await new Promise((r) => setTimeout(r, 12000));
      const targets = await call('Target.getTargets');
      for (const frame of targets.targetInfos.filter(
        (t) => t.type === 'iframe' && t.url.includes('bilibili'),
      )) {
        const attached = await call('Target.attachToTarget', {
          targetId: frame.targetId,
          flatten: true,
        });
        const detail = await call(
          'Runtime.evaluate',
          { expression: 'document.body.innerText.slice(0,2000)', returnByValue: true },
          attached.sessionId,
        );
        t.diagnostic('B站播放器内容：' + detail.result.value);
        const playing = await call(
          'Runtime.evaluate',
          {
            expression:
              "(async()=>{const v=document.querySelector('video');if(!v)return {error:'no video'};v.muted=true;await v.play();await new Promise(r=>setTimeout(r,2500));v.pause();return {time:v.currentTime,duration:v.duration}})()",
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
          },
          attached.sessionId,
        );
        assert.ok(playing.result.value?.time > 0, 'B站视频应实际播放');
        t.diagnostic('B站实际播放秒数：' + playing.result.value.time);
      }
    }
    await screenshot('bilibili-course');
    for (const [id, bvid, count] of [
      [10, 'BV1Ydv8BFEer', 35],
      [11, 'BV15ocBzQEJJ', 37],
      [12, 'BV1VD5x6NE7a', 18],
      [13, 'BV1TFdFBUE9r', 1],
      [14, 'BV16P4y1o7No', 33],
      [16, 'BV147411K7xu', 198],
      [17, 'BV1D54y1m7Av', 15],
      [23, 'BV1b7411N798', 104],
      [33, 'BV13a411c7Qo', 217],
      [34, 'BV1SMe36KEC2', 59],
      [35, 'BV1Yt41197sM', 245],
      [36, 'BV19r4y1b7Aw', 32],
      [31, 'BV1qh411p7Sa', 98],
      [37, 'BV1uW4y1v7xr', 78],
      [38, 'BV19N411U7Pc', 14],
    ]) {
      await evaluate("location.hash='#/video/" + id + "'");
      await until(
        "document.querySelectorAll('.chapter').length===" +
          count +
          "&&document.querySelector('iframe')?.src.includes('" +
          bvid +
          "')",
      );
      await evaluate("document.querySelector('.chapter:last-child').click()");
      await until(
        "new URL(document.querySelector('iframe').src).searchParams.get('page')==='" + count + "'",
      );
      assert.ok(
        await evaluate(
          "Number(new URL(document.querySelector('iframe').src).searchParams.get('cid'))>0",
        ),
      );
      assert.equal(
        await evaluate(
          "new URL(document.querySelector('#source-link').href).searchParams.get('p')",
        ),
        String(count),
      );
    }
    await evaluate("location.hash='#/courses'");
    await until("document.querySelectorAll('#course-list .card').length===33");
    assert.equal(await evaluate("document.querySelectorAll('[data-tab]').length"), 5);
    await evaluate("location.hash='#/courses?category='+encodeURIComponent('海外公开课')");
    await until("document.querySelectorAll('#course-list .card').length===10");
    assert.equal(
      await evaluate("document.querySelector('[data-tab].on').dataset.tab"),
      '大学与技术公开课',
    );
    await screenshot('university-tech-catalog');
    await evaluate("location.hash='#/courses'");
    await until("document.querySelectorAll('#course-list .card').length===33");
    await evaluate("window.scrollTo({top:950,behavior:'instant'})");
    await until('window.scrollY===950');
    await evaluate("document.querySelector('.card').click()");
    await until("document.querySelector('iframe')!==null");
    await until('window.scrollY===0');
    await evaluate("document.querySelector('#page-back').click()");
    await until("document.querySelectorAll('#course-list .card').length===33");
    await until('Math.abs(window.scrollY-950)<5');
    await evaluate("window.scrollTo({top:0,behavior:'instant'})");
    await evaluate('new Promise(r=>setTimeout(r,600))');
    await evaluate(
      "Promise.all([...document.querySelectorAll('.course-photo')].map(img=>{img.loading='eager';return img.decode()}))",
    );
    assert.equal(await evaluate("document.querySelectorAll('.course-photo').length"), 30);
    await screenshot('catalog-desktop');
    assert.equal(
      await evaluate('getComputedStyle(document.body).backgroundColor'),
      'rgb(244, 245, 247)',
    );
    await evaluate('document.querySelector(\'[data-tab="高中课程"]\').click()');
    await until("document.querySelectorAll('#course-list .card').length===8");
    await until(
      "Math.abs(document.querySelector('.segment-slider').getBoundingClientRect().x-document.querySelector('[data-tab].on').getBoundingClientRect().x)<2",
    );
    await screenshot('high-school-catalog');
    await evaluate('document.querySelector(\'[data-subject="物理"]\').click()');
    await until("document.querySelectorAll('#course-list .card').length===3");
    assert.deepEqual(
      await evaluate("Array.from(document.querySelectorAll('.card'),c=>Number(c.dataset.id))"),
      [17, 18, 19],
    );
    await evaluate("location.hash='#/video/16'");
    await until(
      "document.querySelectorAll('.chapter').length===198&&document.querySelector('iframe')?.src.includes('BV147411K7xu')&&document.querySelector('.chapter.playing')!==null",
    );
    await evaluate(
      "document.querySelector('#chapter-search').value='一数指南';document.querySelector('#chapter-search').dispatchEvent(new Event('input'))",
    );
    await until("document.querySelectorAll('.chapter:not([hidden])').length===1");
    await evaluate("document.querySelector('.chapter:not([hidden])').click()");
    await until("document.querySelector('.chapter.playing')?.dataset.chapter==='160001'");
    await evaluate("document.querySelector('#next').click()");
    await until("document.querySelector('.chapter.playing')?.dataset.chapter==='160002'");
    assert.equal(await evaluate("document.querySelector('#chapter-search').value"), '');
    assert.equal(
      await evaluate("new URLSearchParams(location.hash.split('?')[1]).get('chapter')"),
      '160002',
    );
    await evaluate("location.hash='#/video/39'");
    await until("document.querySelector('iframe')?.src.includes('BV1AuoMBBE2p')");
    await evaluate("document.querySelector('#favorite').click()");
    await until("document.querySelector('#favorite').textContent.includes('已加入')");
    await evaluate("location.hash='#/favorites'");
    await until("document.querySelector('.card')?.dataset.id==='39'");
    assert.equal(await evaluate("document.querySelector('.empty-state')===null"), true);
    await evaluate("location.hash='#/learning'");
    await until("document.querySelector('.block h1')?.textContent==='我的学习'");
    await until("document.querySelectorAll('.checkin-day').length===365");
    const historyCount = await evaluate(
      "fetch('/api/me/courses').then(r=>r.json()).then(d=>d.learning.length)",
    );
    await evaluate("location.hash='#/profile?section=history'");
    await until("document.querySelectorAll('#profile-history .card').length===" + historyCount);
    assert.equal(
      await evaluate("document.querySelectorAll('.study-grid .card').length"),
      historyCount,
    );
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('.study-grid .card')).every(c=>Number(c.dataset.id)>=9)",
      ),
      true,
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.study-dashboard .path-card').length"),
      0,
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('#profile-history input,#profile-history select,#profile-history .select-menu,#profile-history [data-shelf],#profile-history #study-clear').length",
      ),
      0,
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('#profile-history .cover')].every(c=>{const r=c.getBoundingClientRect();return r.width<=156.5&&Math.abs(r.width/r.height-16/9)<0.03})",
      ),
      true,
    );
    const shelfCount = await evaluate(
      "fetch('/api/me/courses').then(r=>r.json()).then(d=>d.favorites.length)",
    );
    await evaluate("location.hash='#/favorites'");
    await until("document.querySelector('#study-q')!==null");
    await evaluate(
      "document.querySelector('#study-q').value='高中';document.querySelector('#study-q').dispatchEvent(new Event('input'))",
    );
    assert.ok((await evaluate("document.querySelectorAll('.study-grid .card').length")) < 17);
    await evaluate(
      "document.querySelector('#study-q').value='不存在的课程';document.querySelector('#study-q').dispatchEvent(new Event('input'))",
    );
    assert.equal(await evaluate("document.querySelectorAll('.study-grid .card').length"), 0);
    await evaluate("document.querySelector('#study-clear').click()");
    assert.equal(
      await evaluate("document.querySelectorAll('.study-grid .card').length"),
      shelfCount,
    );
    await evaluate('document.querySelector(\'[data-shelf="39"]\').click()');
    await until('document.querySelector(\'[data-shelf="39"]\')===null');
    assert.equal(
      await evaluate("document.querySelectorAll('.study-grid .card').length"),
      shelfCount - 1,
    );
    await evaluate(
      "fetch('/api/courses/39/favorite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapterId:390001})}).then(r=>r.json())",
    );
    await evaluate("document.querySelector('#study-category-trigger').click()");
    assert.equal(
      await evaluate(
        "document.querySelector('#study-category-trigger').getAttribute('aria-expanded')",
      ),
      'true',
    );
    await screenshot('themed-direction-menu');
    await call(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' },
      sessionId,
    );
    await call(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'Enter', code: 'Enter' },
      sessionId,
    );
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' }, sessionId);
    assert.equal(await evaluate("document.querySelector('#study-category').value"), '高中课程');
    assert.equal(
      await evaluate(
        "document.querySelector('#study-category-trigger').getAttribute('aria-expanded')",
      ),
      'false',
    );
    await evaluate(
      "document.querySelector('#study-clear').click();document.querySelector('#study-sort-trigger').click()",
    );
    await screenshot('themed-sort-menu');
    await call(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'Escape', code: 'Escape' },
      sessionId,
    );
    assert.equal(await evaluate('document.activeElement.id'), 'study-sort-trigger');
    assert.equal(
      await evaluate("document.querySelector('#study-sort-trigger').getAttribute('aria-expanded')"),
      'false',
    );
    await evaluate("document.querySelector('#study-category-trigger').click()");
    await call(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      sessionId,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('#study-category-trigger').getAttribute('aria-expanded')",
      ),
      'false',
    );
    assert.equal(await evaluate('document.activeElement.id'), 'study-sort-trigger');
    await evaluate("location.hash='#/live'");
    await until(
      "location.hash==='#/courses'&&document.querySelectorAll('#course-list .card').length===33",
    );
    assert.equal(await evaluate("document.querySelectorAll('[data-live]').length"), 0);
    assert.equal(await evaluate('document.querySelectorAll(\'a[href="#/live"]\').length'), 0);
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
      sessionId,
    );
    await evaluate("location.hash='#/'");
    await until("document.querySelectorAll('.card').length===6");
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true);
    await screenshot('home-mobile');
    await evaluate("location.hash='#/courses?category='+encodeURIComponent('高中课程')");
    await until("document.querySelectorAll('#course-list .card').length===8");
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true);
    await screenshot('catalog-mobile');
    await evaluate("location.hash='#/video/4'");
    await until("document.querySelector('video')?.readyState>=2");
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true);
    await evaluate("location.hash='#/video/39'");
    await until("document.querySelector('iframe')!==null");
    await screenshot('player-mobile');
    await call(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
      sessionId,
    );
    await evaluate("location.hash='#/'");
    await until("document.querySelectorAll('.card').length===6");
    await evaluate("window.scrollTo({top:800,behavior:'instant'})");
    await until('window.scrollY>450');
    assert.equal(
      await evaluate(
        "Array.from(document.querySelectorAll('.card')).every(c=>c.getAnimations().length===0)",
      ),
      true,
    );
    assert.equal(
      await evaluate("getComputedStyle(document.querySelector('.landscape-image')).transform"),
      'none',
    );
    await evaluate("document.querySelector('#back-to-top').click()");
    await until('window.scrollY===0');
    await call(
      'Page.navigate',
      { url: 'http://localhost:' + port + '/?direct=1#/video/39' },
      sessionId,
    );
    await until("document.querySelector('iframe')!==null");
    assert.equal(
      await evaluate("document.querySelector('#page-back').textContent"),
      '← 返回课程列表',
    );
    await evaluate("document.querySelector('#page-back').click()");
    await until("document.querySelectorAll('#course-list .card').length===33");
    await evaluate("document.querySelector('#page-parent').click()");
    await until("document.querySelector('#page-navigation').hidden");

    await evaluate("location.hash='#/explore'");
    await until("document.querySelectorAll('.discovery-card').length===4");
    assert.equal(
      await evaluate("document.querySelector('#mobile-nav a.selected').getAttribute('href')"),
      '#/explore',
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await evaluate(
      "Promise.all([...document.querySelectorAll('.photo-direction img')].map(i=>{i.loading='eager';return i.decode()}))",
    );
    await evaluate('document.querySelector(\'[data-pick="3"]\').click()');
    assert.equal(
      await evaluate("document.querySelector('.starter-course').getAttribute('href')"),
      '#/video/10',
    );
    await evaluate("document.querySelector('.guide-questions summary').click()");
    assert.equal(await evaluate("document.querySelector('.guide-questions details').open"), true);
    await screenshot('discovery-mobile');
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await screenshot('discovery-redesigned');
    await checkEditorialReader();
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
      sessionId,
    );
    await evaluate(
      "fetch('/api/courses/39/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapterId:390001,atSecond:15,content:'个人笔记库搜索验证'})}).then(r=>r.json())",
    );
    await evaluate("location.hash='#/profile'");
    await until("document.querySelector('.profile-card')!==null");
    assert.ok((await evaluate("document.querySelectorAll('.notebook-entry').length")) > 0);
    assert.equal(
      await evaluate("document.querySelector('.profile-page').innerText.includes('直播')"),
      false,
    );
    await evaluate(
      "document.querySelector('#notes-q').value='没有此条笔记';document.querySelector('#notes-q').dispatchEvent(new Event('input'))",
    );
    assert.equal(await evaluate("document.querySelector('#export-notes').disabled"), true);
    await evaluate(
      "document.querySelector('#notes-q').value='搜索验证';document.querySelector('#notes-q').dispatchEvent(new Event('input'))",
    );
    assert.equal(await evaluate("document.querySelectorAll('.notebook-entry').length"), 1);
    await evaluate(
      "window.exportBlob=null;const originalURL=URL.createObjectURL,originalClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.exportBlob=b;return originalURL(b)};HTMLAnchorElement.prototype.click=function(){window.exportName=this.download};document.querySelector('#export-notes').click();URL.createObjectURL=originalURL;HTMLAnchorElement.prototype.click=originalClick",
    );
    assert.ok((await evaluate('window.exportBlob.text()')).includes('个人笔记库搜索验证'));
    assert.ok((await evaluate('window.exportName')).endsWith('.md'));
    assert.equal(
      await evaluate("document.querySelector('.notebook-entry>a').getAttribute('href')"),
      '#/video/39?chapter=390001&t=15',
    );
    await evaluate(
      "document.querySelector('#notes-q').value='';document.querySelector('#notes-q').dispatchEvent(new Event('input'))",
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth<=390'), true);
    await screenshot('profile-mobile');
    await until("document.querySelector('#account img').naturalWidth>0");
    await evaluate("document.querySelector('#account').click()");
    assert.equal(
      await evaluate("document.querySelector('#account').getAttribute('aria-expanded')"),
      'true',
    );
    await screenshot('account-menu-mobile');
    await evaluate(
      "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
    );
    assert.equal(await evaluate("document.querySelector('#account-panel').hidden"), true);
    await evaluate(
      "document.querySelector('[data-minutes=\"15\"]').click();document.querySelector('#focus-toggle').click()",
    );
    await until("document.querySelector('#focus-clock').textContent<'15:00'");
    await evaluate("document.querySelector('#focus-toggle').click()");
    const pausedClock = await evaluate("document.querySelector('#focus-clock').textContent");
    await call('Page.reload', {}, sessionId);
    await until("document.querySelector('#focus-clock')!==null");
    assert.equal(await evaluate("document.querySelector('#focus-clock').textContent"), pausedClock);
    await evaluate("document.querySelector('#focus-reset').click()");
    assert.equal(await evaluate("document.querySelector('#focus-clock').textContent"), '15:00');
    await evaluate("document.querySelector('.avatar-preview-trigger').click()");
    await until("document.querySelector('.avatar-preview[open]')!==null");
    await screenshot('avatar-editor');
    await evaluate(
      "(async()=>{const c=document.createElement('canvas');c.width=400;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='#ed85ac';ctx.fillRect(0,0,400,240);ctx.fillStyle='#786ab5';ctx.fillRect(200,0,200,240);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const data=new DataTransfer();data.items.add(new File([blob],'my-avatar.png',{type:'image/png'}));document.querySelector('#avatar-file').files=data.files;document.querySelector('#avatar-file').dispatchEvent(new Event('change'))})()",
    );
    await until("!document.querySelector('#avatar-save').disabled");
    await evaluate(
      "document.querySelector('#avatar-zoom').value='1.5';document.querySelector('#avatar-zoom').dispatchEvent(new Event('input'));document.querySelector('#avatar-x').value='60';document.querySelector('#avatar-x').dispatchEvent(new Event('input'))",
    );
    await screenshot('avatar-crop');
    await evaluate("document.querySelector('#avatar-save').click()");
    await until(
      "!document.querySelector('#avatar-editor').open&&document.querySelector('#account img').getAttribute('src').startsWith('/api/avatars/')",
    );
    const savedAvatar = await evaluate(
      "document.querySelector('#account img').getAttribute('src')",
    );
    assert.equal(
      await evaluate("document.querySelector('.profile-avatar img').getAttribute('src')"),
      savedAvatar,
    );
    await call('Page.reload', {}, sessionId);
    await until(
      "document.querySelector('.profile-avatar img')?.getAttribute('src')==='" + savedAvatar + "'",
    );
    await evaluate("location.hash='#/video/37'");
    await until("document.querySelectorAll('.chapter').length===78");
    await evaluate(
      "document.querySelector('#comment-input').value='头像图片显示回归检查';document.querySelector('#comment-form button').click()",
    );
    await until(
      "document.querySelector('.comment p')?.textContent.includes('头像图片显示回归检查')",
    );
    await evaluate(
      "document.querySelector('.comments').scrollIntoView({behavior:'instant',block:'center'})",
    );
    await until(
      "document.querySelector('.comment-avatar img')?.getAttribute('src')==='" +
        savedAvatar +
        "'&&document.querySelector('.comment-avatar img')?.naturalWidth>0",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('#comments-list').innerText.includes('/api/avatars/')",
      ),
      false,
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await evaluate(
      "document.querySelector('.comments').scrollIntoView({behavior:'instant',block:'center'})",
    );
    await screenshot('comment-avatar-fixed');
    await evaluate(
      "document.querySelector('.comment-avatar img').dispatchEvent(new Event('error'))",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.comment-avatar img')===null&&document.querySelector('.comment-avatar').textContent.length>0",
      ),
      true,
    );
    await evaluate("location.hash='#/profile'");
    await until("document.querySelector('.avatar-preview-trigger')!==null");
    await evaluate(
      "document.querySelector('.avatar-preview-trigger').click();document.querySelector('#avatar-reset').click()",
    );
    await until("!document.querySelector('#avatar-editor').open");
    assert.equal(
      await evaluate("document.querySelector('#account img').getAttribute('src')"),
      '/avatar-cheese.jpg',
    );

    await evaluate("location.hash='#/admin'");
    await until("document.querySelector('#app').textContent.includes('需要管理员权限')");
    const account = await evaluate("fetch('/api/auth/me').then(r=>r.json())");
    const adminFixture = new DatabaseSync(join(dir, 'test.db'));
    adminFixture.prepare('INSERT INTO admin_accounts(user_id) VALUES(?)').run(account.user.id);
    adminFixture.close();
    await evaluate("location.hash='#/admin/dashboard'");
    await until("document.querySelectorAll('.metric-grid article').length===4");
    await screenshot('admin-dashboard');
    await evaluate("location.hash='#/admin/courses'");
    await until("document.querySelectorAll('.admin-table tbody tr').length>0");
    await evaluate("location.hash='#/admin/lives'");
    await until(
      "location.hash==='#/admin'&&document.querySelectorAll('.metric-grid article').length===4",
    );

    await evaluate("location.hash='#/'");
    await until("document.querySelectorAll('.card').length===6");
    await evaluate(
      "document.querySelector('#appearance-button').click();document.querySelector('#interface-language').value='en';document.querySelector('#interface-language').dispatchEvent(new Event('change'))",
    );
    assert.equal(await evaluate('document.documentElement.lang'), 'en');
    assert.equal(await evaluate("document.querySelector('header nav a').textContent"), 'Home');
    await evaluate(
      "document.querySelector('#reading-size').value='comfort';document.querySelector('#reading-size').dispatchEvent(new Event('change'));document.querySelector('#parallax-toggle').click()",
    );
    assert.equal(
      await evaluate(
        "document.body.classList.contains('reading-comfort')&&document.body.classList.contains('still-background')",
      ),
      true,
    );
    await screenshot('appearance-settings');
    await evaluate("document.querySelector('#appearance-done').click()");
    await until("!document.querySelector('#toast').classList.contains('show')");
    await screenshot('home-english');
    await evaluate("location.hash='#/courses'");
    await until("document.querySelectorAll('#course-list .card').length===33");
    await evaluate('document.querySelector(\'[data-tab="高中课程"]\').click()');
    await until("document.querySelectorAll('#course-list .card').length===8");
    await evaluate('document.querySelector(\'[data-tab="全部"]\').click()');
    await until("document.querySelectorAll('#course-list .card').length===33");
    await evaluate("document.querySelector('[data-course-view=list]').click()");
    assert.equal(
      await evaluate(
        "document.querySelector('[data-course-view=list]').getAttribute('aria-pressed')",
      ),
      'true',
    );
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
      sessionId,
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await screenshot('catalog-english-list');
    await evaluate("document.querySelector('#appearance-button').click()");
    assert.equal(
      await evaluate(
        "document.querySelector('#appearance-dialog').scrollWidth<=document.querySelector('#appearance-dialog').clientWidth",
      ),
      true,
    );
    await screenshot('appearance-mobile');
    await evaluate("document.querySelector('#appearance-done').click()");
    await call('Page.reload', {}, sessionId);
    await until("document.querySelectorAll('#course-list .card').length===33");
    assert.equal(
      await evaluate(
        "document.documentElement.lang==='en'&&document.body.classList.contains('catalog-list-view')&&document.body.classList.contains('reading-comfort')",
      ),
      true,
    );
    await evaluate("location.hash='#/video/39'");
    await until("document.querySelector('iframe')!==null");
    await evaluate(
      "window.savedFrame=document.querySelector('iframe');document.querySelector('#note-input').value='保留这条未保存的笔记';document.querySelector('#appearance-button').click();document.querySelector('#interface-language').value='zh-CN';document.querySelector('#interface-language').dispatchEvent(new Event('change'))",
    );
    assert.equal(await evaluate("window.savedFrame===document.querySelector('iframe')"), true);
    assert.equal(
      await evaluate("document.querySelector('#note-input').value"),
      '保留这条未保存的笔记',
    );
    assert.equal(
      await evaluate("document.querySelector('#favorite').textContent.includes('书架')"),
      true,
    );
    await evaluate(
      "document.querySelector('#appearance-reset').click();document.querySelector('#appearance-done').click()",
    );
    assert.equal(
      await evaluate(
        "document.body.classList.contains('catalog-list-view')||document.body.classList.contains('reading-comfort')||document.body.classList.contains('still-background')",
      ),
      false,
    );
    await evaluate("location.hash='#/profile'");
    await until("document.querySelector('#focus-clock')!==null");
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await screenshot('profile-rich-desktop');
    await evaluate(
      "document.querySelector('#account').click();document.querySelector('#account-appearance').click()",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('#appearance-dialog').open&&document.querySelector('#account-panel').hidden",
      ),
      true,
    );
    await evaluate(
      "document.querySelector('#appearance-done').click();window.confirm=()=>true;document.querySelector('#account').click();document.querySelector('#account-session').click()",
    );
    await until(
      "document.querySelector('#account').dataset.signedIn==='false'&&document.querySelector('#focus-clock')?.textContent==='25:00'",
    );
    assert.equal(await evaluate("document.querySelector('#focus-clock').textContent"), '25:00');
    await evaluate(
      "document.querySelector('#account').click();document.querySelector('#account-session').click();document.querySelector('#nickname').value='头像测试账号';document.querySelector('#register').click();document.querySelector('#password').value='password';document.querySelector('#confirm-password').value='password';document.querySelector('#auth-form').requestSubmit()",
    );
    await until(
      "document.querySelector('#account').dataset.signedIn==='true'&&document.querySelector('#focus-clock')?.textContent==='25:00'",
    );
    assert.equal(await evaluate("document.querySelector('#focus-clock').textContent"), '25:00');

    await call(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] },
      sessionId,
    );
    await evaluate("location.hash='#/'");
    await until(
      "document.querySelectorAll('.card').length===6&&document.querySelector('#primary-nav').classList.contains('slider-ready')",
    );
    await evaluate('new Promise(r=>setTimeout(r,400))');
    const initialSlider = await evaluate(
      "document.querySelector('#primary-nav .nav-slider').getBoundingClientRect().x",
    );
    await evaluate('document.querySelector(\'#primary-nav a[href="#/courses"]\').click()');
    await until("document.querySelectorAll('#course-list .card').length===33");
    await until(
      "Math.abs(document.querySelector('#primary-nav .nav-slider').getBoundingClientRect().x-document.querySelector('#primary-nav a.active').getBoundingClientRect().x)<2",
    );
    assert.ok(
      (await evaluate(
        "document.querySelector('#primary-nav .nav-slider').getBoundingClientRect().x",
      )) > initialSlider,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('#primary-nav a.active').getAttribute('aria-current')",
      ),
      'page',
    );
    await evaluate(
      "const link=document.querySelector('#primary-nav a.active');link.focus();link.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))",
    );
    assert.equal(
      await evaluate("document.activeElement.getAttribute('href')"),
      '#/profile?section=history',
    );
    await evaluate("document.querySelector('#primary-nav a.active').focus()");
    assert.ok(
      (await evaluate(
        "parseFloat(getComputedStyle(document.querySelector('#primary-nav a')).fontSize)",
      )) >= 15,
    );
    await screenshot('sliding-navigation-desktop');
    await evaluate(
      "document.querySelector('#appearance-button').click();document.querySelector('#interface-language').value='en';document.querySelector('#interface-language').dispatchEvent(new Event('change'));document.querySelector('#navigation-style').value='solid';document.querySelector('#navigation-style').dispatchEvent(new Event('change'));document.querySelector('#appearance-done').click()",
    );
    await until(
      "Math.abs(document.querySelector('#primary-nav .nav-slider').getBoundingClientRect().width-document.querySelector('#primary-nav a.active').getBoundingClientRect().width)<2",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('#primary-nav .nav-slider')).backgroundImage",
      ),
      'none',
    );
    await call('Page.reload', {}, sessionId);
    await until(
      "document.body.classList.contains('solid-navigation')&&document.querySelectorAll('#course-list .card').length===33",
    );
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await evaluate('new Promise(r=>setTimeout(r,450))');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=1024'), true);
    await screenshot('sliding-navigation-tablet');
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
      sessionId,
    );
    await evaluate("location.hash='#/profile'");
    await until("document.querySelector('#focus-clock')!==null");
    await until(
      "Math.abs(document.querySelector('#mobile-nav .nav-slider').getBoundingClientRect().x-document.querySelector('#mobile-nav a.selected').getBoundingClientRect().x)<2",
    );
    assert.equal(await evaluate('document.documentElement.scrollWidth<=390'), true);
    await screenshot('sliding-navigation-mobile');
    await call(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
      sessionId,
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('#mobile-nav .nav-slider')).transitionDuration",
      ),
      '0s',
    );
    await until("document.querySelector('.logo img').naturalWidth>0");
    assert.equal(
      await evaluate("document.querySelector('link[rel=icon]').getAttribute('href')"),
      '/logo-mark.svg',
    );
    assert.deepEqual(errors, []);
    const brandSvg = await readFile('frontend/assets/logo.svg', 'utf8');
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 800, height: 300, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await call(
      'Page.navigate',
      {
        url:
          'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<html><head><meta charset="utf-8"></head><body style="margin:0;min-height:100vh;background:#f4f2e9;display:grid;place-items:center"><div style="width:450px">' +
              brandSvg.replace('width="300" height="72"', 'width="450" height="108"') +
              '</div></body></html>',
          ),
      },
      sessionId,
    );
    await screenshot('logo-preview');
  },
);
