import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { palettes } from '../theme/palettes';
import { contrast } from '../theme/contrast';
import { badgeTone, progressTone, type BadgeToneName } from './status-tones';
import {
  BENTO_QUICK_ACTION_COLUMNS,
  BENTO_QUICK_ACTION_GAP,
  BENTO_TILE_COLUMNS,
  BENTO_TILE_GAP,
  bentoColumnWidth,
  bentoGap,
  bentoRows,
} from './tile-layout';

const AA_TEXT = 4.5;
const SRC = __dirname;
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

describe('Coral status tones', () => {
  it.each(['light', 'dark'] as const)('keeps badge words readable in %s mode', (mode) => {
    const colors = palettes.coral[mode].colors;
    const tones: BadgeToneName[] = ['success', 'warn', 'danger', 'muted', 'primary'];
    for (const tone of tones) {
      const resolved = badgeTone(colors, tone);
      expect(resolved.dotSize).toBe(6);
      expect(resolved.fill).toBe('transparent');
      expect(contrast(resolved.label, colors.bg), `${tone} on bg`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(resolved.label, colors.surface), `${tone} on surface`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(
        contrast(resolved.label, colors.surfaceAlt),
        `${tone} on surfaceAlt`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('uses primary for active progress and control for paused/idle progress', () => {
    const colors = palettes.coral.light.colors;
    expect(progressTone(colors, 'active')).toEqual({ track: colors.border, fill: colors.primary });
    expect(progressTone(colors, 'paused')).toEqual({ track: colors.border, fill: colors.control });
    expect(progressTone(colors, 'idle')).toEqual({ track: colors.border, fill: colors.control });
  });
});

describe('Coral structure source guards', () => {
  it('renders badges as a dot plus word and counters as primary eyebrow chips', () => {
    const source = read('Badge.tsx');
    expect(source).toContain('width: toneSpec.dotSize');
    expect(source).toContain('height: toneSpec.dotSize');
    expect(source).not.toContain('borderRadius: radius.pill');
    expect(source).toContain('variant="label"');
    expect(source).toContain('variant="eyebrow"');
    expect(source).toContain('colors.primary');
    expect(source).toContain('colors.onFill');
  });

  it('exports the 4pt Progress primitive', () => {
    const source = read('Progress.tsx');
    expect(source).toContain('height: 4');
    expect(source).toContain('accessibilityRole="progressbar"');
    expect(source).toContain('accessibilityValue?: AccessibilityValue');
    expect(source).toContain('accessibilityValue ?? { min: 0, max: 100');
    expect(read('index.ts')).toContain('export { Progress }');
  });

  it('uses the shared Coral banner primitive for offline, sync failure and credits notices', () => {
    expect(read('Banner.tsx')).toContain('paddingVertical: 10');
    expect(read('Banner.tsx')).toContain('paddingHorizontal: 14');
    expect(read('Banner.tsx')).toContain('Icon name={icon} size={18}');
    expect(read('OfflineBanner.tsx')).toContain('<Banner');
    expect(read('SyncFailuresBanner.tsx')).toContain('<Banner');
    const lowBalance = read('../features/credits/LowBalanceNotice.tsx');
    expect(lowBalance).toContain('<Banner');
    expect(lowBalance).toContain('icon="alert"');
    expect(lowBalance).toContain('iconColor="warn"');
  });

  it('turns shared states into Coral illustration and skeleton states', () => {
    const source = read('States.tsx');
    expect(source).not.toContain('ActivityIndicator');
    expect(source).toContain('<Illustration');
    expect(source).toContain('ILLUSTRATION_BOX_SIZE = 88');
    expect(source).toContain('SKELETON_THUMB_SIZE = 56');
    expect(source).toContain('SKELETON_BAR_HEIGHT = 12');
    expect(source).toContain('SKELETON_SMALL_BAR_HEIGHT = 10');
  });

  it('keeps only the insufficient-credit ErrorState branch on the credits upsell path', () => {
    const source = read('States.tsx');
    expect(source).toContain('const outOfCredits = isInsufficientCredits(error);');
    expect(source).toContain("from '../features/credits/OutOfCreditsPanel'");
    expect(source).toContain('<OutOfCreditsPanel');
    expect(source).toContain("title={t('mobile.credits.outOfCreditsTitle')}");
    expect(source).toContain("onGetMore={() => router.push('/buy-credits')}");
    expect(source).toContain('fallbackMessage={t(errorMessageKey(error))}');
    expect(source).toContain('insufficientCreditsDetails(error)');
    expect(source).not.toContain('icon?: IconName');
  });

  it('uses square avatars and an AccountButton press target around a 32pt avatar', () => {
    expect(read('Avatar.tsx')).toContain('size?: 32 | 40 | 56 | 80');
    expect(read('Avatar.tsx')).toContain('backgroundColor: colors.primarySoft');
    expect(read('Avatar.tsx')).toContain('color="primaryText"');
    const button = read('AccountButton.tsx');
    expect(button).toContain('<Avatar');
    expect(button).toContain('size={32}');
    expect(button).not.toContain('<RoundButton');
  });

  it('draws the flat five-slot J tab bar with a centre scan key', () => {
    const source = read('TabBar.tsx');
    expect(source).not.toContain('<Fab');
    expect(source).not.toContain('borderRadius: radius.pill');
    expect(source).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(source).toContain('SCAN_KEY_WIDTH = 52');
    expect(source).toContain('SCAN_KEY_HEIGHT = 40');
    expect(source).toContain('ACTIVE_MARKER_SIZE = 4');
    expect(source).toContain('TABLET_LABEL_BREAKPOINT = 600');
    expect(source).toContain('variant="tab"');
  });

  it('keeps headers, sheets, sections and rows on the square J structure', () => {
    expect(read('TabHeader.tsx')).toContain('minHeight: 64');
    expect(read('TabHeader.tsx')).toContain('paddingHorizontal: spacing.gutter');
    expect(read('Header.tsx')).toContain('minHeight: 52');
    expect(read('Header.tsx')).toContain('<IconButton');
    const sheet = read('Sheet.tsx');
    expect(sheet).toContain('shadow.sheet');
    expect(sheet).toContain('width: 36');
    expect(sheet).toContain('height: 4');
    expect(sheet).toContain('backgroundColor: colors.overlay');
    const section = read('SectionLabel.tsx');
    expect(section).toContain('small?: boolean');
    expect(section).toContain("variant={small ? 'label' : 'heading'}");
    expect(section).not.toContain('uppercase');
    const row = read('ListRow.tsx');
    expect(row).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(row).toContain('borderBottomColor: colors.rowline');
    expect(row).toContain('size={22}');
    expect(read('ListGroup.tsx')).not.toContain('<Card');
  });

  it('keeps QuantityStepper as a one-line number box with units in accessibility only', () => {
    const source = read('QuantityStepper.tsx');
    expect(source).toContain('accessibilityValue={accessible ? { text:');
    expect(source).toContain('unit ? `${display} ${unit}` : display');
    expect(source).toContain('fontVariant: [');
    expect(source).not.toContain('variant="caption" muted center');
    expect(source).not.toContain('{unit ? (');
  });

  it('keeps YoutubePlayer overlays additive and thumbnail-only', () => {
    const source = read('YoutubePlayer.tsx');
    expect(source).toContain('thumbnailOverlay?: ReactNode');
    expect(source).toContain('{thumbnailOverlay}');
    expect(source).toMatch(/playing \? \(\s*<WebView/);
  });

  it('keeps Card and Tile on cardEdge with animated press dimming instead of scale', () => {
    for (const file of ['Card.tsx', 'Tile.tsx']) {
      const source = read(file);
      expect(source).toContain('colors.cardEdge');
      expect(source).toContain('shadow.card');
      expect(source).toContain('usePressFeedback');
      expect(source).not.toContain('scale: pressed');
      expect(source).not.toContain('pressed ? 0.92');
    }
  });

  it('keeps Card and Tile off deleted bridge props', () => {
    const card = read('Card.tsx');
    const tile = read('Tile.tsx');
    expect(card).not.toMatch(/\b(tone|tint|gradient|contentStyle)\?:/);
    expect(tile).not.toMatch(/\b(tint|fill|compact)\?:/);
    expect(tile).not.toContain('gradientHero');
  });

  it('uses plate illustrations for recipe placeholders without recipe-thumb tones', () => {
    const source = read('RecipeThumb.tsx');
    expect(source).not.toContain('recipe-thumb-tones');
    expect(source).toContain('Illustration name="plate"');
    expect(source).toContain('backgroundColor: colors.surfaceAlt');
  });

  it('renders CreditBalance as the J chevron row and AuthLayout without Mama chrome', () => {
    const credit = read('CreditBalance.tsx');
    expect(credit).toContain('Icon name="coins"');
    expect(credit).toContain('mobile.home.creditsLeft');
    expect(credit).toContain('mobile.home.topUp');
    expect(credit).toContain('<DirectionalIcon name="chevron"');
    expect(credit).toContain('const trailing = onTopUp ? (');
    expect(credit).toContain('{trailing}');
    const auth = read('AuthLayout.tsx');
    expect(auth).not.toContain('<OrbMascot');
    expect(auth).toContain('paddingTop: spacing.gutter');
  });

  it('keeps AuthLayout leading and footer slots optional and ordered for C5', () => {
    const auth = read('AuthLayout.tsx');
    expect(auth).toContain('leading?: ReactNode;');
    expect(auth).toContain('footer?: ReactNode;');

    const backIndex = auth.indexOf('canGoBack ? (');
    const leadingIndex = auth.indexOf('{leading}');
    const titleIndex = auth.indexOf('<View style={{ gap: spacing.sm }}>');
    expect(backIndex).toBeGreaterThanOrEqual(0);
    expect(leadingIndex).toBeGreaterThan(backIndex);
    expect(titleIndex).toBeGreaterThan(leadingIndex);

    const footerGateIndex = auth.indexOf('footer ? (');
    const spacerIndex = auth.indexOf('<View style={{ flexGrow: 1 }} />');
    const footerContentIndex = auth.indexOf('<View style={{ gap: spacing.sm }}>{footer}</View>');
    expect(footerGateIndex).toBeGreaterThanOrEqual(0);
    expect(spacerIndex).toBeGreaterThan(footerGateIndex);
    expect(footerContentIndex).toBeGreaterThan(spacerIndex);
  });
});

describe('Coral bento grid maths', () => {
  it('uses 2 columns / 16 gap for place tiles and 3 columns / 10 gap for quick actions', () => {
    expect(BENTO_TILE_COLUMNS).toBe(2);
    expect(BENTO_TILE_GAP).toBe(16);
    expect(BENTO_QUICK_ACTION_COLUMNS).toBe(3);
    expect(BENTO_QUICK_ACTION_GAP).toBe(10);
    expect(bentoGap('tiles')).toBe(16);
    expect(bentoGap('quickActions')).toBe(10);
    expect(bentoColumnWidth(350, 'tiles')).toBe(167);
    expect(bentoColumnWidth(350, 'quickActions')).toBe(110);
  });

  it('still preserves default two-column row packing', () => {
    expect(bentoRows([2, 1, 1, 2])).toEqual([
      { indices: [0], filler: false },
      { indices: [1, 2], filler: false },
      { indices: [3], filler: false },
    ]);
  });
});
