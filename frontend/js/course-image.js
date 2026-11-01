// Original catalog covers and category fallbacks are bundled local assets.
export function courseImage(course) {
  if (/^\/api\/course-covers\/\d+\/[a-f0-9-]{36}\.(jpg|png)$/.test(course.cover || ''))
    return course.cover;
  if (Number(course.id) >= 9 && Number(course.id) <= 42) return `/course-images/${course.id}.jpg`;
  const themes = { '高中课程': 'high-school', '考研课程': 'graduate', '考公课程': 'civil' };
  return `/discovery-images/${themes[course.category] || 'technology'}.jpg`;
}
