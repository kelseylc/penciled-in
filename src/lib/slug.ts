/** Short, human-shareable random slug for groups. */
export function randomSlug() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}
