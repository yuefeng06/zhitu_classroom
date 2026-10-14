import { fitBpr, rankCourses } from './recommendations.mjs';
const score = (model, u, i) =>
  model.users[u] && model.items[i]
    ? model.users[u].reduce((s, x, d) => s + x * model.items[i][d], 0)
    : 0;
export function chronologicalSplit(signals) {
  const rows = signals.map((s) => ({
    ...s,
    time: Date.parse(String(s.at).replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(s.at) ? '' : 'Z')),
  }));
  if (rows.some((r) => !Number.isFinite(r.time))) return null;
  const times = [...new Set(rows.map((s) => s.time))].sort((a, b) => a - b);
  if (times.length < 5) return null;
  const valStart = times[Math.floor(times.length * 0.6)],
    testStart = times[Math.floor(times.length * 0.8)];
  return {
    train: rows.filter((s) => s.time < valStart),
    validation: rows.filter((s) => s.time >= valStart && s.time < testStart),
    test: rows.filter((s) => s.time >= testStart),
    valStart,
    testStart,
  };
}
export function evaluateRanking(courses, training, held, model) {
  const users = new Map();
  for (const s of held) {
    if (!users.has(s.userId)) users.set(s.userId, new Set());
    users.get(s.userId).add(s.courseId);
  }
  const results = {};
  for (const type of ['popularity', 'content', 'bpr', 'hybrid']) {
    let count = 0,
      hit = 0,
      recall = 0,
      ndcg = 0;
    const covered = new Set();
    for (const [uid, relevant] of users) {
      const seen = new Set(training.filter((s) => s.userId === uid).map((s) => s.courseId));
      const candidates = courses.filter(
        (c) => Number(c.published) === 1 && !seen.has(Number(c.id)),
      );
      const truth = new Set(
        [...relevant].filter((id) => candidates.some((c) => Number(c.id) === id)),
      );
      if (!truth.size) continue;
      let rows;
      if (type === 'bpr')
        rows = [...candidates].sort(
          (a, b) => score(model, uid, b.id) - score(model, uid, a.id) || a.id - b.id,
        );
      else
        rows = rankCourses(courses, training, type === 'popularity' ? 0 : uid, {
          model: type === 'hybrid' ? model : null,
        }).rows.filter((c) => !seen.has(Number(c.id)));
      const top = rows.slice(0, 5);
      let found = 0,
        gain = 0;
      for (const [i, c] of top.entries()) {
        covered.add(Number(c.id));
        if (truth.has(Number(c.id))) {
          found++;
          gain += 1 / Math.log2(i + 2);
        }
      }
      const ideal = Array.from(
        { length: Math.min(5, truth.size) },
        (_, i) => 1 / Math.log2(i + 2),
      ).reduce((s, x) => s + x, 0);
      count++;
      hit += found > 0 ? 1 : 0;
      recall += found / truth.size;
      ndcg += gain / ideal;
    }
    results[type] = {
      users: count,
      hitRateAt5: count ? hit / count : 0,
      recallAt5: count ? recall / count : 0,
      ndcgAt5: count ? ndcg / count : 0,
      coverageAt5:
        covered.size / Math.max(1, courses.filter((c) => Number(c.published) === 1).length),
    };
  }
  return results;
}
export function trainAndEvaluate(courses, signals) {
  const active = courses.filter((c) => Number(c.published) === 1),
    ids = active.map((c) => Number(c.id));
  signals = signals.filter((s) => ids.includes(s.courseId));
  const report = {
    users: new Set(signals.map((s) => s.userId)).size,
    interactions: signals.length,
    courses: ids.length,
    enabled: false,
    reason: 'insufficient-data',
    evaluation: null,
  };
  if (report.users < 10 || signals.length < 50 || ids.length < 3) return { report, model: null };
  const split = chronologicalSplit(signals);
  if (!split) {
    report.reason = 'insufficient-timestamps';
    return { report, model: null };
  }
  if (
    new Set(split.train.map((s) => s.userId)).size < 5 ||
    new Set(split.validation.map((s) => s.userId)).size < 5 ||
    new Set(split.test.map((s) => s.userId)).size < 5
  ) {
    report.reason = 'insufficient-split-users';
    return { report, model: null };
  }
  const candidate = fitBpr(ids, split.train);
  const validation = evaluateRanking(active, split.train, split.validation, candidate);
  // Fixed parameters; validation decides deployment. Test results are reported once,
  // never used to tune parameters or repeat selection. Full-data refit is for serving.
  report.enabled =
    validation.hybrid.ndcgAt5 >
      Math.max(validation.content.ndcgAt5, validation.popularity.ndcgAt5) &&
    validation.hybrid.hitRateAt5 >=
      Math.max(validation.content.hitRateAt5, validation.popularity.hitRateAt5);
  const fitted = fitBpr(ids, [...split.train, ...split.validation]);
  const test = evaluateRanking(active, [...split.train, ...split.validation], split.test, fitted);
  report.evaluation = {
    protocol: 'global-time-split-of-latest-pair-snapshot',
    splitSizes: {
      train: split.train.length,
      validation: split.validation.length,
      test: split.test.length,
    },
    validation,
    test,
    parameters: { dimensions: 8, epochs: 160, seed: 42, mlWeight: 0.25 },
  };
  report.reason = report.enabled ? 'validation-gate-passed' : 'baseline-not-improved';
  return { report, model: report.enabled ? fitBpr(ids, signals) : null };
}
