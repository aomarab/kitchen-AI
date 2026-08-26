import type { Locale } from '@kitchen/contracts';
import { dishKey, dishTokensInOrder } from './dish-key.js';

export interface RelevanceCandidate {
  title: string;
  categoryId: string | null;
  defaultAudioLanguage: string | null;
  embeddable: boolean;
  durationSeconds: number;
}

export function scoreCandidate(
  dishTitle: string,
  candidate: RelevanceCandidate,
  locale: Locale,
): number | null {
  if (
    candidate.categoryId === '10' ||
    candidate.durationSeconds < 60 ||
    candidate.durationSeconds > 2700 ||
    candidate.embeddable !== true
  ) {
    return null;
  }

  const dishOrdered = dishTokensInOrder(dishTitle, locale);
  const dishTokens = new Set(dishOrdered);
  const candidateTokens = tokenSet(candidate.title, locale);
  const matches = [...dishTokens].filter((token) => matchesAny(token, candidateTokens));
  const coverage = dishTokens.size === 0 ? 1 : matches.length / dishTokens.size;

  if (matches.length === 0) {
    return null;
  }

  // A generated title is descriptive — "soft shakshuka with cream cheese" —
  // while a real video is just "شكشوكة خطيرة". Demanding half the tokens throws
  // away genuine matches because no cook writes the qualifiers into a title.
  // What admits a candidate is a match on the dish itself, and the two
  // languages put it at opposite ends: Arabic is head-initial (`شكشوكة` then
  // its adjectives), English compounds are head-final (`creamy tomato pasta`).
  // Taking either end for both would admit the garnish — a banana cheesecake
  // scored against "toast with cream cheese, honey and banana" — and a wrong
  // video is worse than none.
  const head = locale === 'ar' ? dishOrdered[0] : dishOrdered[dishOrdered.length - 1];
  const headMatched = head !== undefined && matchesAny(head, candidateTokens);

  if (!headMatched && coverage < 0.5) {
    return null;
  }

  return (
    coverage +
    (candidate.categoryId === '26' ? 0.15 : 0) +
    (candidate.defaultAudioLanguage?.startsWith(locale) === true ? 0.1 : 0)
  );
}

/** Below this, a token is too short for containment or a one-edit difference to
 *  mean relatedness rather than coincidence: `صل` sits inside `بصل` (onion). */
const FUZZY_MIN_LENGTH = 4;

/**
 * Exact set membership is too brittle for real recipe titles. Arabic attaches
 * prepositions to the noun without the article (`بصلصة` — "with sauce" — never
 * folds to `صلصة`, and stripping a bare `ب` would destroy `بصل` and `بطاطس`),
 * and the same dish is spelled several ways (`معكرونة` / `مكرونة`). Both are
 * one containment or one edit apart, so comparing loosely recovers the match
 * without corrupting the cache key that identity depends on.
 */
function matchesAny(token: string, candidateTokens: ReadonlySet<string>): boolean {
  if (candidateTokens.has(token)) return true;
  if (token.length < FUZZY_MIN_LENGTH) return false;

  for (const other of candidateTokens) {
    if (other.length < FUZZY_MIN_LENGTH) continue;
    if (other.includes(token) || token.includes(other)) return true;
    if (withinOneEdit(token, other)) return true;
  }

  return false;
}

/** Levenshtein distance <= 1, decided without building the full matrix. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edited = false;

  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (edited) return false;
    edited = true;
    // Same length means a substitution, so both advance; otherwise the extra
    // character belongs to the longer string and only it advances.
    if (shorter.length === longer.length) i += 1;
    j += 1;
  }

  return true;
}

function tokenSet(title: string, locale: Locale): Set<string> {
  const key = dishKey(title, locale);
  const tokens = key.slice(`${locale}:`.length);

  return new Set(tokens.length > 0 ? tokens.split('-') : []);
}
