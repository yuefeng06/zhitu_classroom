export function avatarSource(user) {
  return /^\/api\/avatars\/[a-f0-9]{40}\.jpg$/.test(user?.avatar || '')
    ? user.avatar
    : '/avatar-cheese.jpg';
}
export function setupAvatarEditor({ state, api, onSaved, toast }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'avatar-editor';
  dialog.className = 'avatar-preview';
  dialog.setAttribute('aria-labelledby', 'avatar-title');
  dialog.innerHTML = `<button class="avatar-preview-close" type="button" aria-label="关闭">×</button><span class="kicker">MAKE IT YOURS</span><h2 id="avatar-title">换一个喜欢的头像</h2><p>选择图片，拖动调整位置。</p>
    <div class="avatar-crop"><img id="avatar-current" data-user-avatar alt="当前头像"><canvas id="avatar-canvas" width="256" height="256" hidden aria-label="头像裁剪预览"></canvas></div>
    <label class="avatar-upload" for="avatar-file">选择图片<input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp"></label><small>支持 JPG、PNG、WebP，最大 4 MB</small>
    <div id="avatar-adjust" hidden><label for="avatar-zoom">缩放</label><input id="avatar-zoom" type="range" min="1" max="3" step="0.05" value="1"><label for="avatar-x">水平位置</label><input id="avatar-x" type="range" min="-100" max="100" value="0"><label for="avatar-y">垂直位置</label><input id="avatar-y" type="range" min="-100" max="100" value="0"></div>
    <p id="avatar-error" role="alert" hidden></p><div class="avatar-editor-actions"><button id="avatar-reset" type="button" class="soft-button">恢复默认头像</button><button id="avatar-save" type="button" class="main-button" disabled>保存头像</button></div>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector('canvas'),
    context = canvas.getContext('2d'),
    fileInput = dialog.querySelector('#avatar-file'),
    save = dialog.querySelector('#avatar-save'),
    error = dialog.querySelector('#avatar-error');
  const zoom = dialog.querySelector('#avatar-zoom'),
    x = dialog.querySelector('#avatar-x'),
    y = dialog.querySelector('#avatar-y');
  let bitmap = null,
    busy = false,
    version = 0,
    owner = null,
    drag = null;
  function draw() {
    if (!bitmap) return;
    const scale = Math.max(256 / bitmap.width, 256 / bitmap.height) * Number(zoom.value),
      w = bitmap.width * scale,
      h = bitmap.height * scale;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 256, 256);
    context.drawImage(
      bitmap,
      (256 - w) / 2 + ((Number(x.value) / 100) * (w - 256)) / 2,
      (256 - h) / 2 + ((Number(y.value) / 100) * (h - 256)) / 2,
      w,
      h,
    );
  }
  [zoom, x, y].forEach((input) => (input.oninput = draw));
  canvas.onpointerdown = (e) => {
    if (busy) return;
    drag = { x: e.clientX, y: e.clientY, ox: Number(x.value), oy: Number(y.value) };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!drag || !bitmap) return;
    const scale = Math.max(256 / bitmap.width, 256 / bitmap.height) * Number(zoom.value),
      ratio = 256 / canvas.clientWidth;
    const dx = (bitmap.width * scale - 256) / 2,
      dy = (bitmap.height * scale - 256) / 2;
    x.value = dx
      ? String(Math.max(-100, Math.min(100, drag.ox + (((e.clientX - drag.x) * ratio) / dx) * 100)))
      : '0';
    y.value = dy
      ? String(Math.max(-100, Math.min(100, drag.oy + (((e.clientY - drag.y) * ratio) / dy) * 100)))
      : '0';
    draw();
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    drag = null;
  };
  fileInput.onchange = async () => {
    const selected = fileInput.files[0],
      revision = ++version;
    fileInput.value = '';
    if (!selected) return;
    error.hidden = true;
    save.disabled = true;
    try {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) ||
        selected.size > 4 * 1024 * 1024
      )
        throw Error('请选择不超过 4 MB 的 JPG、PNG 或 WebP 图片');
      const image = await createImageBitmap(selected);
      if (revision !== version || !dialog.open) {
        image.close();
        return;
      }
      if (image.width * image.height > 40000000) {
        image.close();
        throw Error('图片尺寸过大，请选择较小的图片');
      }
      bitmap?.close();
      bitmap = image;
      zoom.value = '1';
      x.value = y.value = '0';
      canvas.hidden = false;
      dialog.querySelector('#avatar-current').hidden = true;
      dialog.querySelector('#avatar-adjust').hidden = false;
      draw();
      save.disabled = false;
    } catch (e) {
      if (revision === version) {
        error.textContent = e.message;
        error.hidden = false;
      }
    }
  };
  async function persist(reset = false) {
    if (busy || (!reset && !bitmap)) return;
    if (state.user?.id !== owner) {
      dialog.close();
      return;
    }
    busy = true;
    error.hidden = true;
    dialog.setAttribute('aria-busy', 'true');
    dialog.querySelectorAll('button,input').forEach((b) => (b.disabled = true));
    try {
      const data = await api('/api/me/avatar', {
        method: 'POST',
        body: JSON.stringify(
          reset ? { reset: true } : { image: canvas.toDataURL('image/jpeg', 0.88) },
        ),
      });
      if (state.user?.id === owner) {
        onSaved(data.user);
        toast('头像已保存');
      }
      dialog.close();
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    } finally {
      busy = false;
      dialog.removeAttribute('aria-busy');
      dialog.querySelectorAll('button,input').forEach((b) => (b.disabled = false));
      save.disabled = !bitmap;
    }
  }
  save.onclick = () => persist();
  dialog.querySelector('#avatar-reset').onclick = () => persist(true);
  dialog.querySelector('.avatar-preview-close').onclick = () => dialog.close();
  dialog.addEventListener('cancel', (e) => {
    if (busy) e.preventDefault();
  });
  dialog.addEventListener('close', () => {
    version++;
    bitmap?.close();
    bitmap = null;
    drag = null;
  });
  addEventListener('hashchange', () => {
    if (dialog.open && !busy) dialog.close();
  });
  document.addEventListener('zhitu-avatar-edit', () => {
    if (!state.user) {
      document.querySelector('#auth').showModal();
      return;
    }
    owner = state.user.id;
    dialog.querySelector('#avatar-current').src = avatarSource(state.user);
    dialog.querySelector('#avatar-current').hidden = false;
    canvas.hidden = true;
    dialog.querySelector('#avatar-adjust').hidden = true;
    error.hidden = true;
    save.disabled = true;
    dialog.showModal();
  });
}
