import { trainAndEvaluate } from '../recommendation-evaluation.mjs';
import '../config.mjs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { openDatabase } from '../database.mjs';
import { readSignals, MODEL_VERSION } from '../recommendations.mjs';
import { modelPath, modelScope } from '../recommendation-store.mjs';
const db = await openDatabase();
try {
  const courses = await db.all('SELECT * FROM courses WHERE published=1');
  const { report, model } = trainAndEvaluate(courses, await readSignals(db));
  const target = modelPath();
  await mkdir(dirname(target), { recursive: true });
  const temp = target + '.' + process.pid + '.tmp';
  await writeFile(
    temp,
    JSON.stringify({
      version: MODEL_VERSION,
      scope: modelScope(),
      trainedAt: new Date().toISOString(),
      report,
      model,
    }),
    { mode: 0o600 },
  );
  await rename(temp, target);
  // Aggregate diagnostics only; user factors stay in the private model file.
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.close();
}
