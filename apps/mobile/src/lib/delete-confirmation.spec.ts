import { describe, expect, it } from 'vitest';
import { deleteConfirmationWord, matchesDeleteConfirmation } from './delete-confirmation';

describe('matchesDeleteConfirmation', () => {
  it('accepts the English word in any case, with surrounding whitespace', () => {
    expect(matchesDeleteConfirmation('DELETE', 'en')).toBe(true);
    expect(matchesDeleteConfirmation('delete', 'en')).toBe(true);
    expect(matchesDeleteConfirmation('  Delete  ', 'en')).toBe(true);
  });

  it('accepts the Arabic word', () => {
    expect(matchesDeleteConfirmation('حذف', 'ar')).toBe(true);
    expect(matchesDeleteConfirmation(' حذف ', 'ar')).toBe(true);
  });

  it('rejects the other locale word, near-misses and empty input', () => {
    expect(matchesDeleteConfirmation('حذف', 'en')).toBe(false);
    expect(matchesDeleteConfirmation('DELETE', 'ar')).toBe(false);
    expect(matchesDeleteConfirmation('DELET', 'en')).toBe(false);
    expect(matchesDeleteConfirmation('', 'en')).toBe(false);
  });

  it('exposes the word so the prompt and the check cannot drift apart', () => {
    expect(deleteConfirmationWord('en')).toBe('DELETE');
    expect(deleteConfirmationWord('ar')).toBe('حذف');
  });
});
