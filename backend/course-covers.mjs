import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
const directory = () => resolve(process.env.COURSE_COVER_DIR || 'data/course-covers');
export const coverPath = /^\/api\/course-covers\/(\d+)\/([a-f0-9-]{36}\.(?:jpg|png))$/;
const fail = (message, status = 400) => Object.assign(Error(message), { status });
export async function saveCover(req) {
  const type = req.headers['content-type'];
  if (!['image/jpeg', 'image/png'].includes(type)) throw fail('封面仅支持 JPEG 或 PNG');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw fail('封面不能超过 2 MB', 413);
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  const valid =
    type === 'image/png'
      ? data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (data.length < 12 || !valid) throw fail('封面文件格式无效');
  const name = randomUUID() + (type === 'image/png' ? '.png' : '.jpg');
  await mkdir(directory(), { recursive: true });
  try {
    await writeFile(join(directory(), name), data, { flag: 'wx' });
  } catch (e) {
    await discardCover(name);
    throw e;
  }
  return name;
}
export async function discardCover(name) {
  await unlink(join(directory(), name)).catch(() => {});
}
export async function readCover(name) {
  try {
    return await readFile(join(directory(), name));
  } catch (e) {
    if (e.code === 'ENOENT') throw fail('封面不存在', 404);
    throw e;
  }
}
