import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
let running = 0;
const queue = [];
async function work(fn) {
  if (running >= 4) {
    if (queue.length >= 16) throw Object.assign(Error('登录繁忙，请稍后重试'), { status: 429 });
    await new Promise((resolve) => queue.push(resolve));
  } else running++;
  try {
    return await fn();
  } finally {
    const next = queue.shift();
    if (next) next();
    else running--;
  }
}
export const hashPassword = (password) =>
  work(async () => {
    const salt = randomBytes(16).toString('hex');
    return `scrypt:${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
  });
export const verifyPassword = (password, stored) =>
  work(async () => {
    const parts = String(stored).split(':');
    if (
      parts[0] !== 'scrypt' ||
      !/^[a-f0-9]{32}$/i.test(parts[1] || '') ||
      !/^[a-f0-9]{128}$/i.test(parts[2] || '')
    )
      return false;
    return timingSafeEqual(await derive(password, parts[1], 64), Buffer.from(parts[2], 'hex'));
  });
export function createAuthLimiter({ now = Date.now, limit = 60, windowMs = 900000 } = {}) {
  const buckets = new Map();
  return (key) => {
    const time = now();
    for (const [k, b] of buckets) if (b.until <= time) buckets.delete(k);
    const b = buckets.get(key) || { count: 0, until: time + windowMs };
    if (!buckets.has(key) && buckets.size >= 10000)
      throw Object.assign(Error('登录繁忙，请稍后重试'), { status: 429 });
    buckets.set(key, b);
    if (++b.count > limit) throw Object.assign(Error('尝试过于频繁，请稍后重试'), { status: 429 });
  };
}
