import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = () =>
  process.env.AVATAR_DIR || fileURLToPath(new URL('./data/avatars/', import.meta.url));
export const avatarPath = /^\/api\/avatars\/([a-f0-9]{40})\.jpg$/;
// Only small JPEGs are served, with a fixed content type and no user filenames.
export function decodeAvatar(value) {
  const invalid = () => {
    throw Object.assign(Error('请选择有效的头像图片'), { status: 400 });
  };
  if (
    typeof value !== 'string' ||
    value.length > 280000 ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    invalid();
  const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
  if (
    bytes.length < 20 ||
    bytes.length > 200 * 1024 ||
    bytes.readUInt16BE(0) !== 0xffd8 ||
    bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    invalid();
  let offset = 2,
    dimensions = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) invalid();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) invalid();
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) invalid();
      const height = bytes.readUInt16BE(offset + 3),
        width = bytes.readUInt16BE(offset + 5);
      if (!height || !width || height > 1024 || width > 1024) invalid();
      dimensions = true;
    }
    offset += length;
  }
  if (!dimensions) invalid();
  return bytes;
}
export async function saveAvatar(bytes) {
  await mkdir(directory(), { recursive: true });
  const name = randomBytes(20).toString('hex') + '.jpg';
  await writeFile(join(directory(), name), bytes, { flag: 'wx' });
  return '/api/avatars/' + name;
}
export async function discardAvatar(path) {
  const match = path.match(avatarPath);
  if (match) await unlink(join(directory(), match[1] + '.jpg')).catch(() => {});
}
export async function readAvatar(path) {
  const match = path.match(avatarPath);
  return match ? readFile(join(directory(), match[1] + '.jpg')) : null;
}
