import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { CHROME_MAX_FONT_SCALE, radius } from '../theme';

export interface RingProps {
  /** One entry per tick: the colour to paint it, or `null` to leave it blank. */
  readonly ticks: readonly (string | null)[];
  readonly size?: number;
  readonly thickness?: number;
  readonly tickWidth?: number;
  /** Rendered centred inside the ring. */
  readonly children?: ReactNode;
}

/**
 * A segmented donut drawn out of plain views.
 *
 * The app ships no charting library and no `react-native-svg`, and it cannot
 * gain one cheaply: a native module is linked at build time, so adding one
 * would crash every already-installed build until the binary is rebuilt. Each
 * tick is therefore a small rounded bar pinned to the top of a full-size
 * wrapper, and the wrapper is rotated about its own centre — which is where
 * React Native puts the transform origin — so the bar swings around the circle.
 *
 * Segments rather than solid arcs is also the better chart. Solid slices are
 * distinguished by fill colour alone, which is the one thing a colourblind
 * user cannot use; discrete ticks can additionally be *counted*, making this a
 * radial waffle as much as a donut. The legend beside it still carries every
 * value as text, because a chart should never be the only way to read a number.
 *
 * Purely decorative to assistive tech — the legend is the accessible copy, so
 * announcing forty-eight anonymous bars would be pure noise.
 *
 * The diameter tracks the system font scale up to the same ceiling the theme
 * caps chrome text at. The centre label is real text and grows with Dynamic
 * Type, so a fixed diameter would let it spill over the ticks at the larger
 * accessibility sizes. Growing the circle by exactly the factor the label is
 * capped to keeps the two in step, and the ceiling stops the ring crowding out
 * whatever sits beside it.
 */
export function Ring({ ticks, size = 128, thickness = 14, tickWidth = 6, children }: RingProps) {
  const { fontScale } = useWindowDimensions();
  const step = ticks.length > 0 ? 360 / ticks.length : 0;
  const scaled = Math.round(size * Math.min(Math.max(1, fontScale), CHROME_MAX_FONT_SCALE));

  return (
    <View
      style={{
        width: scaled,
        height: scaled,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
      >
        {ticks.map((color, index) =>
          color === null ? null : (
            <View
              key={index}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                start: 0,
                end: 0,
                alignItems: 'center',
                transform: [{ rotate: `${index * step}deg` }],
              }}
            >
              <View
                style={{
                  width: tickWidth,
                  height: thickness,
                  borderRadius: radius.pill,
                  backgroundColor: color,
                }}
              />
            </View>
          ),
        )}
      </View>
      <View style={{ alignItems: 'center' }}>{children}</View>
    </View>
  );
}
