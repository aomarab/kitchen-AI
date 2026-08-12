import type { Locale } from '@kitchen/contracts';
import { dishKey } from './dish-key.js';

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

  const dishTokens = tokenSet(dishTitle, locale);
  const candidateTokens = tokenSet(candidate.title, locale);
  const matches = [...dishTokens].filter((token) => candidateTokens.has(token));
  const coverage = dishTokens.size === 0 ? 1 : matches.length / dishTokens.size;

  if (coverage < 0.5 || matches.length === 0) {
    return null;
  }

  return (
    coverage +
    (candidate.categoryId === '26' ? 0.15 : 0) +
    (candidate.defaultAudioLanguage?.startsWith(locale) === true ? 0.1 : 0)
  );
}

function tokenSet(title: string, locale: Locale): Set<string> {
  const key = dishKey(title, locale);
  const tokens = key.slice(`${locale}:`.length);

  return new Set(tokens.length > 0 ? tokens.split('-') : []);
}
