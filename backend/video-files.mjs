import { mkdir, open, rename, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

const fail = (message, status = 400) => Object.assign(Error(message), { status });
export const videoPath = /^\/api\/videos\/(\d+)\/([a-f0-9-]{36}\.(?:mp4|webm))$/;
const directory = () => resolve(process.env.VIDEO_DIR || 'data/videos');
export async function uploadVideo(req) {
  const max = Number(process.env.VIDEO_MAX_MB || 512) * 1024 * 1024;
  const length = Number(req.headers['content-length']);
  if (!Number.isSafeInteger(length) || length < 12) throw fail('视频为空或缺少文件长度');
  if (!Number.isFinite(max) || max <= 0 || length > max) throw fail('视频超过上传大小限制', 413);
  const mime = req.headers['content-type']?.split(';')[0];
  if (!['video/mp4', 'video/webm'].includes(mime)) throw fail('仅支持 MP4 或 WebM 视频');
  const ext = mime === 'video/mp4' ? 'mp4' : 'webm';
  await mkdir(directory(), { recursive: true });
  const name = randomUUID() + '.' + ext,
    target = join(directory(), name),
    temp = target + '.part';
  const file = await open(temp, 'wx');
  let size = 0,
    header = Buffer.alloc(0);
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max || size > length) throw fail('视频超过上传大小限制', 413);
      if (header.length < 32)
        header = Buffer.concat([header, chunk.subarray(0, 32 - header.length)]);
      await file.writeFile(chunk);
    }
    if (size !== length) throw fail('视频未完整上传');
    const valid =
      ext === 'mp4'
        ? header.toString('ascii', 4, 8) === 'ftyp'
        : header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!valid) throw fail('文件内容与视频格式不符');
    await file.close();
    await rename(temp, target);
    return { name, size };
  } catch (e) {
    await file.close().catch(() => {});
    await unlink(temp).catch(() => {});
    throw e;
  }
}
export async function discardVideo(name) {
  if (/^[a-f0-9-]{36}\.(mp4|webm)$/.test(name))
    await unlink(join(directory(), name)).catch(() => {});
}
export async function streamVideo(req, res, name) {
  const file = join(directory(), name);
  let info;
  try {
    info = await stat(file);
  } catch (e) {
    if (e.code === 'ENOENT') throw fail('视频文件不存在', 404);
    throw e;
  }
  let start = 0,
    end = info.size - 1;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
      return res.end();
    }
    start = m[1] ? Number(m[1]) : Math.max(0, info.size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), end) : end;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= info.size
    ) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
      return res.end();
    }
  }
  res.writeHead(range ? 206 : 200, {
    'Content-Type': name.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
  });
  if (req.method === 'HEAD') return res.end();
  try {
    await pipeline(createReadStream(file, { start, end }), res);
  } catch (e) {
    if (!req.destroyed && e.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw e;
  }
}
