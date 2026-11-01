import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMedia } from '../backend/media.mjs';
test('管理员片源：无演示回退、并发版本、即时生效与重启持久化', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zhitu-media-'));
  try {
    const file = join(dir, 'media.json');
    await writeFile(
      file,
      JSON.stringify({
        default: { url: 'https://example.com/demo.mp4', label: '演示' },
        chapters: {},
      }),
    );
    const media = loadMedia(file),
      id = 99000001;
    assert.equal(media({ id }).video_url, null);
    const before = media.source(id);
    const source = { kind: 'bilibili', bvid: 'BV1AuoMBBE2p', page: 1, cid: 123, label: '真实来源' };
    const results = await Promise.allSettled([
      media.save(id, source, before.version),
      media.save(id, source, before.version),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
    assert.match(media({ id }).embed_url, /cid=123/);
    assert.equal(loadMedia(file)({ id }).embed_url, media({ id }).embed_url);
    const current = await readFile(file, 'utf8');
    await assert.rejects(
      media.save(
        id,
        { kind: 'direct', url: 'javascript:alert(1)', label: '无效' },
        media.source(id).version,
      ),
      (e) => e.status === 400,
    );
    assert.equal(await readFile(file, 'utf8'), current);
    const local = {
      kind: 'local',
      url: '/api/videos/99000001/11111111-1111-1111-1111-111111111111.webm',
      label: '上传视频',
    };
    await media.save(id, local, media.source(id).version);
    assert.equal(loadMedia(file)({ id }).video_url, local.url);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
