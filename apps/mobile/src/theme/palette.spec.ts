import { describe, expect, it } from 'vitest';
import { resolveThemeMode, shadowFor } from './index';
import { NATIVE_SWITCH_THUMB, palettes, type Palette, type ThemeMode } from './palettes';
import { contrast } from './contrast';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** Every surface a text colour can land on, in whichever mode is under test. */
const SURFACES = ['bg', 'surface', 'surfaceAlt'] as const;

const STATUSES = ['success', 'warn', 'danger'] as const;

/**
 * Both modes face the identical bar. Appearance follows the phone by default,
 * so "light is accessible" is not a claim worth making on its own.
 */
const ALL: readonly (readonly [string, Palette])[] = (
  Object.keys(palettes) as (keyof typeof palettes)[]
).flatMap((family) =>
  (['light', 'dark'] as ThemeMode[]).map(
    (mode) => [`${family} ${mode}`, palettes[family][mode]] as const,
  ),
);

describe.each(ALL)('%s palette', (_name, palette) => {
  const { colors, scrim } = palette;

  it.each(['text', 'textMuted'] as const)('%s reads on every surface', (token) => {
    for (const surface of SURFACES) {
      expect(
        contrast(colors[token], colors[surface]),
        `${token} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  /**
   * The coral is bright, so its label is ink in both modes. The destructive
   * fill has its own label, `onDanger`: the light-mode red takes white, which
   * `onFill` (ink) would fail on.
   */
  it('button fills carry readable labels', () => {
    expect(contrast(colors.onFill, colors.primary), 'primary').toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.onFill, colors.primaryPressed),
      'primary pressed',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.onDanger, colors.danger), 'danger').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('today plan chips read on the primary fill', () => {
    expect(contrast(colors.onFill, colors.primary), 'today chip').toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * F4's question tile inverts with the mode: `text` becomes the fill and `bg`
   * the label. Ink on cream in light, cream on cocoa in dark.
   */
  it('the inverted question tile reads', () => {
    expect(contrast(colors.bg, colors.text)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('the inverted question tile outline separates', () => {
    expect(contrast(colors.bg, colors.text)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  /**
   * A fill also has to be *seen*, which contrast against its own label cannot
   * tell you. In dark mode this is the live risk: a primary dark enough to
   * carry white text is very nearly the page it sits on.
   */
  it.each(['primary', 'primaryPressed', 'danger'] as const)(
    '%s fill separates from the surface it sits on',
    (fill) => {
      expect(contrast(colors[fill], colors.surface), `${fill} on surface`).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      );
    },
  );

  it('the selected credit pack edge separates from a soft surface', () => {
    expect(
      contrast(colors.primary, colors.surfaceAlt),
      'primary selected edge on surfaceAlt',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('switch tracks separate from their card and native thumb', () => {
    expect(
      contrast(colors.primary, colors.surface),
      'on switch track on surface',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(
      contrast(colors.control, colors.surface),
      'off switch track on surface',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(
      contrast(colors.control, NATIVE_SWITCH_THUMB),
      'off switch track under native white thumb',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('J foreground tokens clear their minimums', () => {
    expect(contrast(colors.onFill, colors.primary), 'onFill on primary').toBeGreaterThanOrEqual(
      AA_TEXT,
    );
    expect(
      contrast(colors.onFill, colors.primaryPressed),
      'onFill on primaryPressed',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colors.onInverse, colors.inverse), 'onInverse').toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.onInverseMuted, colors.inverse),
      'onInverseMuted',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.primaryOnInverse, colors.inverse),
      'primaryOnInverse',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.textMuted, colors.primarySoft),
      'textMuted on primarySoft',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.primaryText, colors.surfaceAlt),
      'primaryText on surfaceAlt',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('J fills and controls separate from their grounds', () => {
    expect(contrast(colors.control, colors.bg), 'control on bg').toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
    expect(contrast(colors.control, colors.surface), 'control on surface').toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
    expect(contrast(colors.primary, colors.bg), 'primary on bg').toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it.each(STATUSES)('%s reads on its own soft chip', (status) => {
    const soft = `${status}Soft` as const;
    expect(contrast(colors[status], colors[soft]), `${status} on ${soft}`).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it.each(STATUSES)('%s separates as a chip border', (status) => {
    for (const surface of ['bg', 'surface'] as const) {
      expect(
        contrast(colors[status], colors[surface]),
        `${status} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('success fills carry a readable tick or label', () => {
    expect(
      contrast(colors.onSuccess, colors.success),
      'onSuccess on success',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('primaryText reads as text on its own soft chip', () => {
    expect(contrast(colors.primaryText, colors.primarySoft)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * DateField's "clear date" is brand-coloured label text on a card.
   *
   * Only `surface` is certified for it: measured against `surfaceAlt` the same
   * brand hue can fall under AA, so a brand label must never be moved onto the
   * alt surface — use `primarySoft` as its backing instead.
   */
  it('primaryText reads as text on a plain surface', () => {
    expect(contrast(colors.primaryText, colors.surface), 'on surface').toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it('primaryText reads as the Home greeting accent on the page background', () => {
    expect(contrast(colors.primaryText, colors.bg), 'on bg').toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(['warn', 'danger'] as const)(
    '%s reads as Use-soon status text on surfaceAlt',
    (status) => {
      expect(
        contrast(colors[status], colors.surfaceAlt),
        `${status} on surfaceAlt`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(['warn', 'danger'] as const)('%s reads as mini-tile status text on surface', (status) => {
    expect(contrast(colors[status], colors.surface), `${status} on surface`).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  it('media surfaces invert legibly', () => {
    expect(contrast(colors.textInverse, colors.surfaceInverse), 'primary').toBeGreaterThanOrEqual(
      AA_TEXT,
    );
    expect(
      contrast(colors.textInverseMuted, colors.surfaceInverse),
      'muted',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * The camera, a photo and the video player are dark in every mode, and they
   * host buttons (the `media` variant). The label on the lifted brand fill is
   * `onPrimaryInverse` and not `text`, because the media surface stays dark
   * even when the app is in dark mode, where `text` is light and would vanish.
   */
  it('media surfaces carry buttons that separate', () => {
    expect(
      contrast(colors.primaryInverse, colors.surfaceInverse),
      'media ghost label',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.primaryInverse, colors.surfaceInverse),
      'primaryInverse fill',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(
      contrast(colors.onPrimaryInverse, colors.primaryInverse),
      'primaryInverse label',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.textInverse, colors.surfaceInverse),
      'light round button fill on media',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(
      contrast(colors.onPrimaryInverse, colors.textInverse),
      'light round button glyph',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /**
   * Badges and secondary controls on a media surface draw their fills from the
   * always-dark group, never the mode-following `surfaceAlt`: in dark mode a
   * "soft" tint is a dark tint and the pair measured 1.08:1. The lift is
   * deliberately gentle, so the border carries the affordance and is held to
   * the full non-text ratio.
   */
  it('media secondary surfaces stay visible against the dark ground', () => {
    expect(
      contrast(colors.surfaceInverseAlt, colors.surfaceInverse),
      'lifted inverse surface',
    ).toBeGreaterThanOrEqual(1.3);
    expect(
      contrast(colors.borderInverse, colors.surfaceInverse),
      'inverse border',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(
      contrast(colors.textInverse, colors.surfaceInverseAlt),
      'label on lifted inverse surface',
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /** The capture shutter is the coral on the viewfinder, in both modes. */
  it('the coral shutter separates from the viewfinder', () => {
    expect(contrast(colors.primary, colors.surfaceInverse)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('capture pins and toast affordances read on inverse media fills', () => {
    expect(
      contrast(colors.onPrimaryInverse, colors.textInverse),
      'pin chip label on textInverse',
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrast(colors.primary, colors.surfaceInverse),
      'shutter primary on surfaceInverse',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(
      contrast(colors.warnInverse, colors.textInverse),
      'warn dot on textInverse',
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  /**
   * Text on a photo sits over the scrim. The worst photo is pure white, so the
   * white label is measured against the scrim composited over white at the
   * lowest alpha text is allowed on.
   */
  describe('photo scrim', () => {
    function alphaAt(position: number): number {
      const { stops } = scrim;
      for (let i = 0; i < stops.length - 1; i += 1) {
        const [[p0, a0], [p1, a1]] = [stops[i]!, stops[i + 1]!];
        if (position >= p0 && position <= p1) {
          return p1 === p0 ? a1 : a0 + ((a1 - a0) * (position - p0)) / (p1 - p0);
        }
      }
      return stops.at(-1)![1];
    }

    function overWhite(hex: string, alpha: number): string {
      const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const mixed = channels.map((c) => Math.round(c * alpha + 255 * (1 - alpha)));
      return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }

    it('white text clears AA at the lowest alpha text may sit on', () => {
      const worst = overWhite(scrim.rgb, scrim.textMinAlpha);
      expect(contrast(colors.textInverse, worst), `on ${worst}`).toBeGreaterThanOrEqual(AA_TEXT);
    });

    /**
     * The trap the knee in the ramp fixes: a single linear ramp to 0.82 only
     * clears 0.70 in the bottom 9% of a tile, too thin for a title and a
     * caption. Text needs the bottom 40%.
     */
    it('gives text the bottom 40% of a tile', () => {
      for (let step = 0; step <= 40; step += 1) {
        const position = 0.6 + (0.4 * step) / 40;
        expect(alphaAt(position), `alpha at ${position}`).toBeGreaterThanOrEqual(
          scrim.textMinAlpha - 1e-9,
        );
      }
    });

    it('leaves the top of the photo clear', () => {
      expect(alphaAt(0)).toBe(0);
      expect(alphaAt(0.35)).toBe(0);
    });
  });

  /**
   * J light cards intentionally share the page fill, so either the edge or the
   * shadow must carry card separation. `surfaceAlt` and borders still need to
   * separate by fill distance because they do not always have a shadow.
   */
  describe('cards stay distinguishable from the ground', () => {
    const MIN_DISTANCE = 12;

    function distance(a: string, b: string): number {
      const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const [x, y] = [toRgb(a), toRgb(b)];
      return Math.hypot(...x.map((c, i) => c - y[i]!));
    }

    it('a card is visibly separate from the page', () => {
      const shadow = shadowFor(palette).card;
      const fillSeparates = distance(colors.surface, colors.bg) >= MIN_DISTANCE;
      const edgeSeparates =
        distance(colors.cardEdge, colors.bg) >= MIN_DISTANCE &&
        distance(colors.cardEdge, colors.surface) >= MIN_DISTANCE;
      const shadowSeparates = shadow.shadowOpacity >= 0.05;
      expect(
        fillSeparates || edgeSeparates || shadowSeparates,
        'card fill, edge or shadow must keep a card visible',
      ).toBe(true);
    });

    it('surfaceAlt remains visibly separate from bg', () => {
      expect(distance(colors.surfaceAlt, colors.bg)).toBeGreaterThanOrEqual(MIN_DISTANCE);
    });

    it('border separates from bg', () => {
      expect(distance(colors.border, colors.bg)).toBeGreaterThanOrEqual(MIN_DISTANCE);
    });

    it('rejects a tint that matches the ground', () => {
      expect(distance(colors.bg, colors.bg)).toBe(0);
    });
  });
});

it('dark mode disables every native shadow', () => {
  const shadows = shadowFor(palettes.coral.dark);
  for (const [name, shadow] of Object.entries(shadows)) {
    expect(shadow.shadowOpacity, `${name} opacity`).toBe(0);
    expect(shadow.elevation, `${name} elevation`).toBe(0);
  }
});

/**
 * Media surfaces are dark in every mode, so the `*Inverse` group must not drift
 * between light and dark — a camera that changes colour with the phone's
 * appearance is a camera that is not showing the photo.
 */
it('media tokens are identical in light and dark', () => {
  const MEDIA = [
    'surfaceInverse',
    'surfaceInverseAlt',
    'borderInverse',
    'textInverse',
    'textInverseMuted',
    'primaryInverse',
    'onPrimaryInverse',
    'warnInverse',
    'mediaButton',
  ] as const;
  for (const token of MEDIA) {
    expect(palettes.coral.dark.colors[token], token).toBe(palettes.coral.light.colors[token]);
  }
});

describe('resolving the mode from the preference', () => {
  it('follows the phone when set to automatic', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
  });

  /**
   * `useColorScheme` returns null on the first tick of a cold start. Treating
   * "unknown" as dark would flash a dark screen on every launch on a light
   * phone, so the unknown case has to land on light specifically.
   */
  it('renders light while the phone has not reported its scheme yet', () => {
    expect(resolveThemeMode('system', null)).toBe('light');
    expect(resolveThemeMode('system', undefined)).toBe('light');
  });

  it('ignores the phone when the user has pinned a mode', () => {
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
    expect(resolveThemeMode('light', 'dark')).toBe('light');
  });
});
