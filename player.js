import { avatarSource } from './avatar.js';

export async function mountPlayer({
  app,
  id,
  api,
  state,
  toast,
  escapeHtml: esc,
  isCurrent,
  onChapterRoute = () => {},
}) {
  // 请求课程与选择初始章节。
  const data = await api(`/api/courses/${id}`);
  if (!isCurrent()) return () => {};

  const course = data.course,
    chapters = data.chapters;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let current =
    chapters.find((c) => c.id === Number(params.get('chapter'))) ||
    chapters.find((c) => c.id === course.chapter_id) ||
    chapters[0];
  let alive = true,
    cleanupMedia = () => {},
    save = () => Promise.resolve(),
    switching = false;

  // 秒数显示成时间。
  const clock = (value) => {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    return (
      (n >= 3600 ? Math.floor(n / 3600) + ':' : '') +
      String(Math.floor(n / 60) % 60).padStart(2, '0') +
      ':' +
      String(n % 60).padStart(2, '0')
    );
  };
  // 读写浏览器偏好
  const pref = (key, fallback) => {
    try {
      return localStorage.getItem('zhitu-' + key) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const setPref = (key, value) => {
    try {
      localStorage.setItem('zhitu-' + key, value);
    } catch {}
  };

  // 创建页面及初始化。
  app.innerHTML = `<div class="lesson-breadcrumb"><a href="#/courses">课程中心</a><span>/</span>${esc(course.category)}</div>
    <section class="video-meta"><div><em class="eyebrow">YOUR LEARNING SPACE</em><h1>${esc(course.title)}</h1><p>${esc(course.teacher)} · ${esc(course.level)} · ${chapters.length} 个章节</p></div><button id="focus-mode" class="soft-button" aria-pressed="false">进入专注模式</button></section>
    <section class="video-layout"><div class="viewer"><div id="media-host" class="player"></div><div id="source-info" class="source-info"></div>
    <div class="learning-tools"><button id="previous" class="soft-button">← 上一节</button><button id="next" class="soft-button">下一节 →</button><label><input type="checkbox" id="auto-next"> 自动下一节</label><span id="save-status" role="status"></span></div></div>
    <aside class="playlist"><h3>学习目录 <small>${chapters.length} 节</small></h3><div class="chapter-search"><input id="chapter-search" type="search" placeholder="搜索章节标题或序号" aria-label="搜索章节"><small id="chapter-matches" role="status"></small></div><div class="chapter-list">${chapters.map((c, i) => `<button class="chapter" data-chapter="${c.id}"><span>${String(i + 1).padStart(2, '0')}</span><div>${esc(c.title)}<small>${esc(c.duration)} · ${c.playback?.percent >= 99 ? '已完成' : c.video_kind === 'bilibili' ? 'B站课程' : c.is_demo ? '演示视频' : '课程视频'}</small></div></button>`).join('') || '<p class="empty">课程章节尚未发布</p>'}</div><div class="playlist-footer">一次专注，一点进步。</div></aside></section>
    <section class="video-actions"><button id="favorite">${course.favorite ? '★ 已加入书架' : '☆ 加入书架'}</button><button id="follow">${data.followed ? '已关注讲师' : '＋ 关注讲师'}</button><button id="share">分享这门课</button><a id="source-link" target="_blank" rel="noopener noreferrer">在来源站打开 ↗</a></section>
    <section class="detail-grid"><div><article class="description"><h2>关于这门课</h2><p>${esc(course.description)}</p></article>
    <article class="comments"><h2>学习讨论 <small id="comment-count">${data.comments.length}</small></h2><form id="comment-form" class="comment-box"><input id="comment-input" aria-label="讨论内容" maxlength="1000" required placeholder="写下你的问题，或分享一个新发现"><button>发布</button></form><div id="comments-list"></div></article></div>
    <aside class="study-sidebar"><article class="right-info"><h3>学习记录</h3><b id="course-progress">${course.progress}%</b><p id="progress-help">按各章节已播放位置计算；拖动到后面也会更新进度</p><div class="big-progress"><i style="width:${course.progress}%"></i></div></article>
    <article class="notes-panel"><h2>我的时间笔记</h2><p class="helper" id="note-hint">记录此刻的灵感，复习时一键返回。</p><form id="note-form"><label id="manual-time-label" hidden>视频时间（秒，手动填写）<input id="note-time" type="number" min="0" max="86400" value="0" step="1"></label><textarea id="note-input" required maxlength="2000" rows="3" placeholder="这一节，我学到了……" aria-label="学习笔记"></textarea><button class="main-button" id="add-note">保存时间笔记</button></form><div id="notes-list"></div></article></aside></section>`;
  const $ = (selector) => app.querySelector(selector);
  const live = () => alive && isCurrent();

  // 讨论和笔记的渲染、读取与删除。
  const renderComments = () => {
    $('#comments-list').innerHTML = data.comments
      .map(
        (c) =>
          `<div class="comment"><b class="comment-avatar" aria-hidden="true"><span>${esc(Array.from(c.nickname || '学')[0])}</span><img src="${esc(avatarSource(c))}" alt="" loading="lazy" width="36" height="36"></b><p><strong data-original-content>${esc(c.nickname)}</strong><span data-original-content>${esc(c.content)}</span><small>${esc(c.created_at)}</small></p></div>`,
      )
      .join('');
    $('#comments-list')
      .querySelectorAll('.comment-avatar img')
      .forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
    $('#comment-count').textContent = data.comments.length;
  };
  renderComments();
  // 渲染笔记和点击定位
  let notes = [];
  const renderNotes = () => {
    $('#notes-list').innerHTML =
      notes
        .map(
          (n) =>
            `<div class="note"><button class="note-time" data-note="${n.id}">${clock(n.at_second)} · ${esc(chapters.find((c) => c.id === n.chapter_id)?.title || '章节')}</button><p>${esc(n.content)}</p><button class="delete-note" data-delete="${n.id}" aria-label="删除这条笔记">删除</button></div>`,
        )
        .join('') || '<p class="empty">还没有笔记，从一个要点开始。</p>';

    app.querySelectorAll('[data-note]').forEach(
      (button) =>
        (button.onclick = async () => {
          const note = notes.find((n) => n.id === Number(button.dataset.note));
          const chapter = chapters.find((c) => c.id === note.chapter_id);
          if (chapter.video_kind === 'bilibili') {
            await selectChapter(chapter);
            if (live()) {
              $('#note-time').value = Math.floor(note.at_second);
              toast('已切换到笔记章节，请在播放器定位到 ' + clock(note.at_second));
            }
            return;
          }
          await selectChapter(chapter, false, note.at_second);
        }),
    );
    // 删除和加载私人笔记
    app.querySelectorAll('[data-delete]').forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          try {
            await api('/api/notes/' + button.dataset.delete, { method: 'DELETE' });
            if (!live()) return;
            notes = notes.filter((n) => n.id !== Number(button.dataset.delete));
            renderNotes();
          } catch (e) {
            button.disabled = false;
            toast(e.message);
          }
        }),
    );
  };

  const refreshNotes = async () => {
    if (!state.user) {
      $('#notes-list').innerHTML = '<p class="empty">登录后可保存自己的学习笔记。</p>';
      return;
    }
    try {
      notes = await api(`/api/courses/${id}/notes`);
      if (live()) renderNotes();
    } catch (e) {
      if (live()) $('#notes-list').textContent = e.message;
    }
  };

  // 自动下一节与专注模式。
  $('#auto-next').checked = pref('auto-next', 'false') === 'true';
  $('#auto-next').onchange = (e) => setPref('auto-next', e.target.checked);
  $('#focus-mode').onclick = (e) => {
    const focused = app.classList.toggle('focus-mode');
    e.target.textContent = focused ? '退出专注模式' : '进入专注模式';
    e.target.setAttribute('aria-pressed', focused);
  };
  // 收藏课程和关注讲师
  for (const action of ['favorite', 'follow'])
    $('#' + action).onclick = async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      try {
        const result = await api(`/api/courses/${id}/${action}`, {
          method: 'POST',
          body: '{}',
        });
        if (live())
          button.textContent =
            action === 'favorite'
              ? result.active
                ? '★ 已加入书架'
                : '☆ 加入书架'
              : result.active
                ? '已关注讲师'
                : '＋ 关注讲师';
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    };
  // 分享课程和播放位置
  $('#share').onclick = async () => {
    const url = new URL(location.href);
    const video = $('video');
    url.hash =
      `/video/${id}?` +
      new URLSearchParams({
        chapter: current?.id || '',
        ...(video ? { t: Math.floor(video.currentTime) } : {}),
      });
    try {
      await navigator.clipboard.writeText(url.href);
      toast('课程链接已复制');
    } catch {
      app.querySelector('.share-url')?.remove();
      const input = document.createElement('input');
      input.value = url.href;
      input.readOnly = true;
      input.className = 'share-url';
      $('#share').after(input);
      input.select();
      toast('请复制选中的课程链接');
    }
  };
  // 发布讨论
  $('#comment-form').onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter,
      input = $('#comment-input'),
      content = input.value;
    button.disabled = true;
    try {
      await api(`/api/courses/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      const updated = await api(`/api/courses/${id}`);
      if (!live()) return;
      data.comments = updated.comments;
      renderComments();
      input.value = '';
      toast('讨论已发布');
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  };
  // 保存时间笔记
  $('#note-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!current) {
      toast('请选择有视频的章节');
      return;
    }
    const button = e.submitter;
    button.disabled = true;
    const video = $('video');
    try {
      const note = await api(`/api/courses/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({
          chapterId: current.id,
          atSecond: video ? video.currentTime : Number($('#note-time').value),
          content: $('#note-input').value,
        }),
      });
      if (!live()) return;
      notes.unshift(note);
      renderNotes();
      $('#note-input').value = '';
      toast('笔记已保存');
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  };

  // 章节切换：保存旧位置，记录访问，再创建对应片源的播放器。
  async function selectChapter(chapter, autoplay = false, seek) {
    if (switching || !chapter || !live()) return;
    switching = true;
    try {
      await save();
      if (!live()) return;

      let visitSaved = false;
      if (state.user && course.published) {
        try {
          await api('/api/courses/' + id + '/visit', {
            method: 'POST',
            body: JSON.stringify({ chapterId: chapter.id }),
          });
          visitSaved = true;
        } catch (error) {
          toast('章节记录未保存：' + error.message);
        }
      }
      if (!live()) return;
      cleanupMedia();
      save = () => Promise.resolve();
      current = chapter;
      // 路由,目录高亮及列表滚动
      const address = new URLSearchParams({ chapter: String(chapter.id) });
      if (seek !== undefined) address.set('t', String(seek));
      history.replaceState(history.state, '', '#/video/' + id + '?' + address);
      onChapterRoute();

      const index = chapters.indexOf(current),
        embedded = current.video_kind === 'bilibili';
      app.querySelectorAll('.chapter').forEach((b) => {
        b.classList.toggle('playing', Number(b.dataset.chapter) === current.id);
        b.setAttribute('aria-current', Number(b.dataset.chapter) === current.id ? 'true' : 'false');
      });
      const active = app.querySelector('.chapter.playing');
      if (active?.hidden) {
        $('#chapter-search').value = '';
        app.querySelectorAll('.chapter').forEach((b) => (b.hidden = false));
        $('#chapter-matches').textContent = '';
      }
      const list = $('.chapter-list');
      if (active) {
        const delta = active.getBoundingClientRect().top - list.getBoundingClientRect().top;
        if (delta < 0 || delta + active.offsetHeight > list.clientHeight)
          list.scrollTop += delta - list.clientHeight / 2 + active.offsetHeight / 2;
      }
      // 按片源更新按钮与说明
      $('#previous').disabled = index <= 0;
      $('#next').disabled = index === chapters.length - 1;
      $('#auto-next').disabled = embedded;
      $('#source-info').textContent = current.video_label || '本节暂无视频';
      $('#source-link').hidden = !current.source_page;
      if (current.source_page) $('#source-link').href = current.source_page;
      $('#manual-time-label').hidden = !embedded;
      $('#note-hint').textContent = embedded
        ? 'B站不向本页提供播放时间，请手动填写时间点。'
        : '保存当前播放时间，点击笔记可返回对应位置。';
      $('#save-status').textContent = embedded
        ? visitSaved
          ? '已记住本节 · 播放进度由B站管理'
          : state.user
            ? '章节记录未保存，请重试'
            : '登录后可记住章节 · 播放进度由B站管理'
        : state.user
          ? '加载视频后自动保存进度'
          : '游客可播放，登录后同步进度';
      $('#course-progress').textContent = embedded ? '原站记录' : course.progress + '%';
      $('#progress-help').textContent = embedded
        ? '嵌入播放器不提供进度回传，可在此保存笔记和收藏。'
        : '按各章节已播放位置计算；拖动到后面也会更新进度';
      // 创建播放器：嵌入或原生 video。
      $('#media-host').innerHTML = embedded
        ? `<iframe title="${esc(current.title)}" src="${esc(current.embed_url)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
        : current.video_url
          ? `<video id="course-video" controls playsinline preload="metadata" aria-label="${esc(current.title)}"></video><div class="danmaku-layer" id="danmaku"></div><div class="video-error" hidden role="alert"><p>视频暂时无法加载，请检查网络或打开来源站。</p><button id="retry-video">重新加载</button></div>`
          : '<p class="empty">本节视频尚未发布，请选择其他课程。</p>';
      app.querySelector('.direct-tools')?.remove();
      if (embedded) {
        cleanupMedia = () => {
          $('#media-host iframe')?.remove();
        };
        return;
      }
      const video = $('video');
      if (!video) {
        cleanupMedia = () => {};
        return;
      }

      // 创建原生视频工具栏及状态。
      const tools = document.createElement('div');
      tools.className = 'direct-tools';
      tools.innerHTML = `<button id="back-ten" aria-label="后退10秒">↶ 10秒</button><button id="forward-ten" aria-label="前进10秒">10秒 ↷</button><label>倍速 <select id="speed" aria-label="播放速度">${[0.75, 1, 1.25, 1.5, 2].map((n) => `<option value="${n}">${n}×</option>`).join('')}</select></label><button id="pip">画中画</button><label><input type="checkbox" id="dm-toggle"> 弹幕</label><form id="dm-form"><input id="dm-input" maxlength="100" required placeholder="发送课堂弹幕" aria-label="弹幕内容"><button>发送</button></form>`;
      $('#source-info').after(tools);
      let ready = false,
        disposed = false,
        lastSave = 0,
        lastTime = 0,
        queue = Promise.resolve(),
        dmEnabled = pref('danmaku', 'false') === 'true';
      // 倍速,前后跳转,画中画
      $('#speed').value = pref('speed', '1');
      if (!$('#speed').value) $('#speed').value = '1';
      $('#speed').onchange = (e) => {
        video.playbackRate = Number(e.target.value);
        setPref('speed', e.target.value);
      };
      $('#back-ten').onclick = () => {
        if (ready) video.currentTime = Math.max(0, video.currentTime - 10);
      };
      $('#forward-ten').onclick = () => {
        if (ready) video.currentTime = Math.min(video.duration, video.currentTime + 10);
      };
      $('#pip').disabled = !document.pictureInPictureEnabled;
      $('#pip').onclick = async () => {
        try {
          if (document.pictureInPictureElement) await document.exitPictureInPicture();
          else await video.requestPictureInPicture();
        } catch {
          toast('当前浏览器暂不支持此视频的画中画');
        }
      };
      // 弹幕开关与显示
      $('#dm-toggle').checked = dmEnabled;
      $('#dm-toggle').onchange = (e) => {
        dmEnabled = e.target.checked;
        setPref('danmaku', dmEnabled);
        $('#danmaku').replaceChildren();
      };
      const showDanmaku = (content, color) => {
        if (!dmEnabled || disposed) return;
        const span = document.createElement('span');
        span.textContent = content;
        span.style.color = color;
        span.style.top = 10 + Math.random() * 55 + '%';
        $('#danmaku').append(span);
        span.addEventListener('animationend', () => span.remove(), { once: true });
      };
      // 发送弹幕
      $('#dm-form').onsubmit = async (e) => {
        e.preventDefault();
        const button = e.submitter;
        button.disabled = true;
        try {
          const input = $('#dm-input'),
            content = input.value,
            atSecond = video.currentTime;
          await api(`/api/courses/${id}/danmaku`, {
            method: 'POST',
            body: JSON.stringify({ chapterId: chapter.id, content, atSecond }),
          });
          if (disposed) return;
          data.danmaku.push({
            chapter_id: chapter.id,
            content,
            at_second: atSecond,
            color: '#ffffff',
          });
          showDanmaku(content, '#ffffff');
          input.value = '';
        } catch (error) {
          toast(error.message);
        } finally {
          button.disabled = false;
        }
      };
      // 构造进度数据和本地状态。
      save = () => {
        if (
          !ready ||
          disposed ||
          !state.user ||
          !Number.isFinite(video.duration) ||
          video.duration <= 0
        )
          return queue;
        const payload = {
          chapterId: chapter.id,
          currentTime: Math.min(video.currentTime, video.duration),
          duration: video.duration,
        };
        chapter.playback = {
          current_time: payload.currentTime,
          duration: payload.duration,
          percent: Math.max(
            chapter.playback?.percent || 0,
            (payload.currentTime / payload.duration) * 100,
          ),
        };
        // 顺序发送进度与更新界面
        lastSave = Date.now();
        queue = queue.then(async () => {
          try {
            const result = await api(`/api/courses/${id}/progress`, {
              method: 'POST',
              keepalive: true,
              body: JSON.stringify(payload),
            });
            course.progress = result.percent;
            if (live() && !disposed) {
              $('#course-progress').textContent = result.percent + '%';
              $('.big-progress i').style.width = result.percent + '%';
              $('#save-status').textContent = '已同步 · ' + clock(payload.currentTime);
            }
          } catch (error) {
            if (live() && !disposed) $('#save-status').textContent = '保存失败：' + error.message;
          }
        });
        return queue;
      };

      // 媒体就绪后续播。
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        ready = true;
        const position = seek ?? chapter.playback?.current_time ?? 0;
        video.currentTime = Math.min(Math.max(0, position), video.duration);
        video.playbackRate = Number($('#speed').value);
        lastTime = video.currentTime;
        $('.video-error').hidden = true;
        if (autoplay) video.play().catch(() => toast('点击播放器继续播放'));
      };
      video.ontimeupdate = () => {
        if (!ready || disposed) return;
        const time = video.currentTime;
        if (time >= lastTime && time - lastTime < 2) {
          data.danmaku
            .filter(
              (d) => d.chapter_id === chapter.id && d.at_second > lastTime && d.at_second <= time,
            )
            .forEach((d) => showDanmaku(d.content, d.color));
        }
        lastTime = time;
        if (!video.paused && Date.now() - lastSave >= 5000) void save();
      };
      video.onpause = () => void save();
      video.onended = async () => {
        await save();
        if (!disposed && $('#auto-next').checked && chapters[index + 1])
          await selectChapter(chapters[index + 1], true);
      };
      video.onerror = () => {
        if (!disposed) {
          $('.video-error').hidden = false;
          $('#save-status').textContent = '片源加载失败，可重试或打开来源站';
        }
      };
      $('#retry-video').onclick = () => {
        ready = false;
        $('.video-error').hidden = true;
        video.load();
      };

      const visibility = () => {
        if (document.hidden) void save();
      };
      const pagehide = () => void save();
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('pagehide', pagehide);

      // 切换片源或退出页面时移除监听器，并释放旧视频资源。
      cleanupMedia = () => {
        disposed = true;
        video.onpause =
          video.onended =
          video.ontimeupdate =
          video.onloadedmetadata =
          video.onerror =
            null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('pagehide', pagehide);
      };
      video.src = current.video_url;
    } finally {
      switching = false;
    }
  }

  // 8. 目录事件、初次播放，以及提供给路由的退出清理函数。
  $('#chapter-search').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    let count = 0;
    app.querySelectorAll('.chapter').forEach((b) => {
      b.hidden = !b.textContent.toLowerCase().includes(q);
      if (!b.hidden) count++;
    });
    $('#chapter-matches').textContent = q ? '匹配 ' + count + ' 节' : '';
  };
  app
    .querySelectorAll('.chapter')
    .forEach(
      (b) =>
        (b.onclick = () => selectChapter(chapters.find((c) => c.id === Number(b.dataset.chapter)))),
    );
  $('#previous').onclick = () => selectChapter(chapters[chapters.indexOf(current) - 1]);
  $('#next').onclick = () => selectChapter(chapters[chapters.indexOf(current) + 1]);
  if (!current) {
    $('#media-host').innerHTML = '<p class="empty">本课章节尚未发布</p>';
    $('#source-link').hidden = true;
    for (const selector of ['#previous', '#next', '#auto-next', '#add-note'])
      $(selector).disabled = true;
  }
  await selectChapter(
    current,
    false,
    params.has('t') && Number.isFinite(Number(params.get('t')))
      ? Number(params.get('t'))
      : undefined,
  );
  void refreshNotes();
  return async () => {
    const pending = save();
    alive = false;
    cleanupMedia();
    app.classList.remove('focus-mode');
    await pending;
  };
}
