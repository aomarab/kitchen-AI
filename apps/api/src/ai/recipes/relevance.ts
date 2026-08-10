import type { Locale } from '@kitchen/contracts';
import { normalizeTokens } from './dish-key.js';

/**
 * Whether a YouTube result is actually the dish.
 *
 * The previous pipeline accepted the first search hit unconditionally, which is
 * how a music video became a meal's photo: the hero image is derived from the
 * video id, so one bad match corrupts both.
 */

export interface Candidate {
  youtubeId: string;
  title: string;
  durationSeconds: number;
  embeddable: boolean;
  categoryId: string | null;
  defaultAudioLanguage: string | null;
}

/** Below this is a Short — the single largest source of irrelevant results. */
export const MIN_DURATION_SECONDS = 60;
/** Above this is a compilation, a livestream or a full cooking show. */
export const MAX_DURATION_SECONDS = 2700;
/** Rejecting this one category would have caught every bad fixture we shipped. */
export const MUSIC_CATEGORY_ID = '10';
/** Howto & Style, where genuine recipe videos live. */
export const HOWTO_CATEGORY_ID = '26';
/** Half the dish's distinctive words must appear, or it is a different dish. */
export const MIN_COVERAGE = 0.5;

const HOWTO_BONUS = 0.15;
const LANGUAGE_BONUS = 0.1;

/**
 * Returns null for a reject, otherwise a score in 0..1.25. Higher wins.
 *
 * Coverage is measured over content tokens only — `normalizeTokens` has already
 * dropped generic words — so a shared "recipe" or "easy" contributes nothing and
 * a match is always on the dish's own distinctive words.
 */
export function scoreCandidate(
  dishTitle: string,
  candidate: Candidate,
  locale: Locale,
): number | null {
  if (candidate.categoryId === MUSIC_CATEGORY_ID) return null;
  if (!candidate.embeddable) return null;
  if (candidate.durationSeconds < MIN_DURATION_SECONDS) return null;
  if (candidate.durationSeconds > MAX_DURATION_SECONDS) return null;

  const dishTokens = normalizeTokens(dishTitle);
  if (dishTokens.length === 0) return null;

  const videoTokens = new Set(normalizeTokens(candidate.title));
  
  // Strip Arabic definite article 'ال' (al-) for matching, since 'الدجاج' (the chicken)
  // and 'دجاج' (chicken) refer to the same ingredient
  const stripArticle = (token: string) => token.startsWith('ال') ? token.slice(2) : token;
  const videoTokensCanonical = new Set(Array.from(videoTokens).map(stripArticle));
  
  const matched = dishTokens.filter((token) => {
    const canonical = stripArticle(token);
    return videoTokensCanonical.has(canonical);
  });

  // MIN_COVERAGE is above zero, so clearing it already guarantees at least one
  // distinctive token matched; no separate check is needed.
  const coverage = matched.length / dishTokens.length;
  if (coverage <= MIN_COVERAGE) return null;

  let score = coverage;
  if (candidate.categoryId === HOWTO_CATEGORY_ID) score += HOWTO_BONUS;
  if (candidate.defaultAudioLanguage?.toLowerCase().startsWith(locale)) score += LANGUAGE_BONUS;
  return score;
}

/**
 * Survivors, best first. Ties keep the order YouTube returned, which is its own
 * relevance ranking and a better tiebreak than anything we can compute here.
 */
export function pickRanked<T extends Candidate>(
  dishTitle: string,
  candidates: T[],
  locale: Locale,
): T[] {
  return candidates
    .map((candidate, index) => ({ candidate, index, score: scoreCandidate(dishTitle, candidate, locale) }))
    .filter((entry): entry is { candidate: T; index: number; score: number } => entry.score !== null)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.candidate);
}
