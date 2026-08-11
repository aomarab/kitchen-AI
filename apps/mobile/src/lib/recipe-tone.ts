import { tints } from '../theme';

/** Stable per dish, so a recipe keeps its colour between launches. */
export function toneIndexFor(dishKey: string): number {
  let hash = 0;
  for (let i = 0; i < dishKey.length; i += 1) {
    hash = (hash * 31 + dishKey.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % tints.length;
}
