import { trainAndEvaluate } from '../recommendation-evaluation.mjs';
import { writeFile } from 'node:fs/promises';
// Clearly labelled synthetic fixture, separate from business training and model store.
const courses = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  published: 1,
  title: '实验课程 ' + i,
  category: '实验',
  subject: '方向' + Math.floor(i / 10),
  teacher: '讲师' + Math.floor(i / 10),
  description: '合成特征',
}));
const signals = Array.from({ length: 40 }, (_, u) =>
  Array.from({ length: 8 }, (_, i) => ({
    userId: u + 1,
    courseId: Math.floor(u / 10) * 10 + ((u + i) % 10) + 1,
    weight: 3,
    at: `2026-09-${String(i + 1).padStart(2, '0')} 00:00:00`,
  })),
).flat();
const { report } = trainAndEvaluate(courses, signals);
const result = {
  date: '2026-10-07',
  source: 'synthetic-cluster-fixture',
  purpose: 'verify evaluation workflow only; not evidence of real learner benefit',
  ...report,
};
await writeFile('thesis/evidence/recommendation-synthetic.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
