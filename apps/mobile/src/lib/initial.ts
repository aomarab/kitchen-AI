/**
 * The avatar's glyph: the first character of a display name, or null when there
 * is none to show. `Array.from` walks code points, so an emoji comes out whole
 * rather than as half a surrogate pair. Arabic has no case, so upper-casing is
 * a no-op there.
 */
export function initialOf(name: string | null | undefined): string | null {
  const first = Array.from(name?.trim() ?? '')[0];
  return first ? first.toUpperCase() : null;
}
