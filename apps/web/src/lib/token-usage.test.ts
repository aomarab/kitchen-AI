// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

/**
 * `text-primary` on a native checkbox sets `color`, which native checkboxes
 * ignore. It renders nothing today and would render nothing if changed, so the
 * two occurrences stay. Allowed by exact line rather than by filename, so a
 * genuine offender elsewhere in the same file is still caught.
 */
const INERT_CHECKBOX =
  'className="h-5 w-5 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"';

/**
 * `layout.tsx` sets Next's `themeColor`, which is serialised into a <meta> tag
 * and cannot read a CSS variable. `OAuthButtons.tsx` draws the Google mark,
 * which is a third-party brand asset, not a theme colour.
 */
const HEX_ALLOWED = ['app/layout.tsx', 'components/auth/OAuthButtons.tsx'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) ? [full] : [];
  });
}

const FILES = sourceFiles(SRC).map((full) => ({
  path: full.slice(SRC.length),
  lines: readFileSync(full, 'utf8').split('\n'),
}));

/** Every `path:line` matching `pattern`, minus lines `allow` accepts. */
function offenders(pattern: RegExp, allow: (line: string) => boolean = () => false): string[] {
  return FILES.flatMap((file) =>
    file.lines.flatMap((line, i) =>
      pattern.test(line) && !allow(line.trim()) ? [`${file.path}:${i + 1}`] : [],
    ),
  );
}

describe('token usage', () => {
  it('never uses the blue fill as a text colour', () => {
    // --primary is a fill. As text it lands at 4.59:1 on --primary-soft — over
    // the bar, but with no margin for a future tweak to the tint. Blue text
    // uses --primary-text, which steps darker in light mode (#1d4ed8, 5.96:1
    // on --primary-soft) and lighter in dark mode (#9dc7fc, 7.41:1).
    expect(offenders(/\btext-primary\b(?!-)/, (line) => line === INERT_CHECKBOX)).toEqual([]);
  });

  it('never tints a surface with an opacity utility', () => {
    // Tailwind v4 compiles `/12` to color-mix(in oklab, ...), which is not the
    // sRGB blend the contrast maths assumes. Tints are solid *-soft tokens, so
    // the measured number is the shipped number.
    expect(offenders(/\b(?:bg|border)-(?:primary|success|warning|danger)\/\d+/)).toEqual([]);
  });

  it('keeps colour in the token file', () => {
    const withHex = FILES.filter(
      (file) =>
        !HEX_ALLOWED.includes(file.path) &&
        file.lines.some((line) => /#[0-9a-fA-F]{6}\b/.test(line)),
    ).map((file) => file.path);
    expect(withHex).toEqual([]);
  });
});
