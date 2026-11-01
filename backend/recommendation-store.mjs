import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { MODEL_VERSION } from './recommendations.mjs';
export const modelPath = () =>
  resolve(process.env.RECOMMENDATION_MODEL_PATH || 'data/recommendations/model.json');
export function modelScope() {
  const scope =
    (process.env.DB_CLIENT || 'mysql') === 'sqlite'
      ? ['sqlite', resolve(process.env.DB_PATH || 'zhitu.db')]
      : [
          'mysql',
          process.env.MYSQL_HOST || '127.0.0.1',
          process.env.MYSQL_PORT || '3306',
          process.env.MYSQL_DATABASE || 'zhitu_classroom',
        ];
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}
export function validModel(envelope, now = Date.now()) {
  if (
    !envelope ||
    envelope.version !== MODEL_VERSION ||
    envelope.scope !== modelScope() ||
    !envelope.report?.enabled ||
    !envelope.model
  )
    return false;
  const age = now - Date.parse(envelope.trainedAt);
  if (!Number.isFinite(age) || age < 0 || age > 7 * 86400000) return false;
  const { users, items } = envelope.model;
  if (!users || !items || typeof users !== 'object' || typeof items !== 'object') return false;
  return [users, items].every(
    (group) =>
      Object.entries(group).length > 0 &&
      Object.entries(group).every(
        ([key, v]) =>
          /^[1-9]\d*$/.test(key) &&
          Array.isArray(v) &&
          v.length === 8 &&
          v.every((x) => Number.isFinite(x) && Math.abs(x) < 100),
      ),
  );
}
export async function loadRecommendationModel() {
  // Tests must never accidentally load business-user factors.
  if (process.env.DB_CLIENT === 'sqlite' && !process.env.RECOMMENDATION_MODEL_PATH) return null;
  try {
    const raw = await readFile(modelPath(), 'utf8');
    if (raw.length > 5_000_000) return null;
    const value = JSON.parse(raw);
    return validModel(value) ? value : null;
  } catch {
    return null;
  }
}
