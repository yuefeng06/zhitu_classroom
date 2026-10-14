export const studyDate = (now = new Date()) =>
  new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const shiftDate = (date, days) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export function checkinSummary(dates, today = studyDate()) {
  const start = shiftDate(today, -364),
    unique = new Set(dates.filter((d) => d >= start && d <= today));
  let cursor = unique.has(today) ? today : shiftDate(today, -1),
    streak = 0;
  while (unique.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return {
    today,
    start,
    timeZone: 'Asia/Shanghai',
    dates: [...unique].sort(),
    total: unique.size,
    streak,
    checkedToday: unique.has(today),
  };
}
