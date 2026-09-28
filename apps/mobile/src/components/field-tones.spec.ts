import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fieldBorder, textareaCountLabel } from './field-tones';

const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');

describe('field border tones', () => {
  it('uses the quiet border at rest', () => {
    expect(fieldBorder({ focused: false })).toEqual({ width: 1, colorToken: 'border' });
  });

  it('uses a 1.5pt text ring when focused', () => {
    expect(fieldBorder({ focused: true })).toEqual({ width: 1.5, colorToken: 'text' });
  });

  it('uses a 1.5pt danger ring for errors', () => {
    expect(fieldBorder({ focused: false, error: 'Required' })).toEqual({
      width: 1.5,
      colorToken: 'danger',
    });
  });

  describe('field source guards', () => {
    it('uses the J 48pt field and 132pt textarea boxes', () => {
      const source = read('./Field.tsx');
      expect(source).toMatch(/minHeight:\s*multiline \? 132 : 48/);
      expect(source).toContain('paddingHorizontal: multiline ? 14 : horizontalPadding');
      expect(source).toContain('paddingVertical: multiline ? 14 : 0');
    });

    it('shows the textarea count only when the caller passes maxLength', () => {
      const source = read('./Field.tsx');
      expect(source).toContain('textareaCountLabel({ multiline, maxLength, text: countText })');
      expect(source).toContain('setDraftText(text)');
      expect(source).toContain('onChangeText?.(text)');
      expect(source).toContain('{countLabel ? (');
      expect(source).not.toContain('FEEDBACK_MESSAGE_MAX');
    });

    it('adds a SearchField with a required mic label when mic is present', () => {
      const source = read('./SearchField.tsx');
      expect(source).toMatch(/minHeight:\s*44/);
      expect(source).toContain('name="search"');
      expect(source).toContain('onMicPress: () => void');
      expect(source).toContain('micAccessibilityLabel: string');
      expect(source).toContain('<IconButton');
    });
  });

  it('lets error colour win over focus while keeping the J ring weight', () => {
    expect(fieldBorder({ focused: true, error: 'Required' })).toEqual({
      width: 1.5,
      colorToken: 'danger',
    });
  });
});

describe('textarea count labels', () => {
  it('is hidden unless the field is multiline and maxLength is provided', () => {
    expect(textareaCountLabel({ multiline: false, maxLength: 10, text: 'abc' })).toBeNull();
    expect(textareaCountLabel({ multiline: true, text: 'abc' })).toBeNull();
  });

  it('counts the current text length for controlled and uncontrolled fields', () => {
    expect(textareaCountLabel({ multiline: true, maxLength: 10, text: 'abc' })).toBe('3/10');
    expect(textareaCountLabel({ multiline: true, maxLength: 10, text: 'abcdef' })).toBe('6/10');
  });
});
