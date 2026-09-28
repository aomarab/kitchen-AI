import {
  Children,
  createContext,
  isValidElement,
  useEffect,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  type AccessibilityActionEvent,
  Image,
  Pressable,
  StyleSheet,
  View,
  type ImageStyle,
  type ImageSourcePropType,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { BENTO_GUTTER, bentoRows, type TileSpan } from './tile-layout';
import { radius, spacing, type TintName } from '../theme';
import { scrimGradient } from '../theme/scrim';
import { useTheme } from '../theme/useTheme';

export type { TileSpan } from './tile-layout';
export type TileTint = TintName | 'photo';

export interface TileProps {
  /** Read by `Bento`: a whole row, or half of one. */
  span?: TileSpan;
  /** Read by `Bento`: relative width within a packed row. Defaults to 1. */
  weight?: number;
  tint?: TileTint;
  /** Optional override for compact tiles nested inside a larger card. */
  fill?: 'tint' | 'surfaceAlt';
  /** Mini tile sizing for dense grids; keeps Tile behaviour but tightens the box. */
  compact?: boolean;
  /** The photo under the scrim. Only drawn when `tint` is `'photo'`. */
  image?: ImageSourcePropType;
  /** Photo tiles keep their legibility scrim unless a caller deliberately opts out. */
  scrim?: boolean;
  onPress?: () => void;
  /** The whole sentence a screen reader hears, e.g. "32 items at home". */
  accessibilityLabel: string;
  accessibilityRole?: AccessibilityRole;
  /** Selection or other state announced for the one tile element. */
  accessibilityState?: AccessibilityState;
  /** Screen-reader actions for visual controls nested inside the one tile element. */
  actions?: { name: string; label: string; onPress: () => void }[];
  /** Drawn in a 36pt circle at the top. */
  icon?: IconName;
  /** Drawn at the top-leading position instead of the standard icon circle. */
  leading?: ReactNode;
  /** The trailing chip or arrow at the top. */
  corner?: ReactNode;
  count?: string | number;
  caption?: string;
  /** Extra content in the bottom block, above the count. */
  children?: ReactNode;
  /** Taller kinds (§6.7): 150 for a count tile, 220 for the hero, 168 for review. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** True inside `Bento`, where a tile shares its row or column by flex. */
const InBento = createContext(false);

const photoImageStyle: ImageStyle = {
  width: '100%',
  height: '100%',
};

const TILE_MIN_HEIGHT = 120;
const COMPACT_TILE_MIN_HEIGHT = 112;

/**
 * The bento tile (spec §8.2): radius `xl`, a tint or a photo, and an optional
 * icon, count and caption. It is one accessibility element. Text on a photo
 * sits in the bottom block, which is where the scrim is dark enough for it.
 */
export function Tile({
  tint = 'plain',
  fill: fillMode = 'tint',
  compact = false,
  image,
  scrim = true,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  actions,
  icon,
  leading,
  corner,
  count,
  caption,
  children,
  height,
  style,
  testID,
}: TileProps) {
  const { colors, gradientHero, isDark, shadow, scrim: scrimToken, tintNamed } = useTheme();
  const inBento = useContext(InBento);
  const photo = tint === 'photo';
  const [imageFailed, setImageFailed] = useState(false);
  const hasPhotoImage = photo && image && !imageFailed;
  const showPhotoFallback = photo && (!image || imageFailed);
  const fill = photo
    ? colors.surfaceInverse
    : fillMode === 'surfaceAlt'
      ? colors.surfaceAlt
      : tintNamed(tint).bg;
  const ink = photo ? { color: colors.textInverse } : undefined;
  const accessibilityActions = actions?.map(({ name, label }) => ({ name, label }));
  const onAccessibilityAction = actions
    ? (event: AccessibilityActionEvent) => {
        actions.find((action) => action.name === event.nativeEvent.actionName)?.onPress();
      }
    : undefined;

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  const container: ViewStyle = {
    minHeight: compact ? COMPACT_TILE_MIN_HEIGHT : TILE_MIN_HEIGHT,
    padding: compact ? spacing.md : spacing.lg,
    gap: spacing.sm,
    borderRadius: compact ? radius.lg : radius.xl,
    borderWidth: photo ? 0 : 1,
    borderColor: isDark ? colors.border : fill,
    backgroundColor: fill,
    // iOS clips a shadow with the content, so a photo tile goes without one.
    ...(photo ? { overflow: 'hidden' } : isDark ? null : shadow.card),
    ...(height ? { minHeight: height } : null),
    ...(inBento ? { flex: 1 } : null),
  };

  const body = (
    <>
      {hasPhotoImage ? (
        <>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Image
              source={image}
              resizeMode="cover"
              style={photoImageStyle}
              accessibilityIgnoresInvertColors
              onError={() => setImageFailed(true)}
            />
          </View>
          {scrim ? (
            <LinearGradient {...scrimGradient(scrimToken)} style={StyleSheet.absoluteFill} />
          ) : null}
        </>
      ) : null}
      {showPhotoFallback ? (
        <LinearGradient
          colors={gradientHero as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {leading || icon || corner ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          {leading ? (
            leading
          ) : icon ? (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tint === 'plain' ? colors.surfaceAlt : colors.surface,
              }}
            >
              <Icon name={icon} size={18} color={colors.text} />
            </View>
          ) : (
            <View />
          )}
          {corner}
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      {children}
      {count !== undefined ? (
        <AppText variant="numeral" style={ink}>
          {count}
        </AppText>
      ) : null}
      {caption ? (
        <AppText variant="caption" muted={!photo} style={ink}>
          {caption}
        </AppText>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        testID={testID}
        style={[container, style]}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        container,
        { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

export interface BentoProps {
  children: ReactNode;
  /**
   * Reports each packed row's y-position relative to the Bento container.
   * Screens that need ScrollView coordinates must add the Bento container's
   * own y-position inside the scroll content.
   */
  onRowLayout?: (indices: readonly number[], y: number) => void;
}

/**
 * Lays tiles and columns out on the two-column grid (spec §6.7). Each child's
 * `span` decides whether it takes a row or half of one.
 */
export function Bento({ children, onRowLayout }: BentoProps) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{
    span?: TileSpan;
    weight?: number;
  }>[];
  const rows = bentoRows(items.map((item) => item.props.span ?? 1));
  return (
    <InBento.Provider value>
      <View style={{ gap: BENTO_GUTTER }}>
        {rows.map((row) => (
          <View
            key={row.indices.join('-')}
            onLayout={(event) => onRowLayout?.(row.indices, event.nativeEvent.layout.y)}
            style={{ flexDirection: 'row', gap: BENTO_GUTTER }}
          >
            {row.indices.map((index) => {
              const flex = items[index]?.props.weight ?? 1;
              return (
                <View key={items[index]?.key ?? index} style={{ flex, flexBasis: 0, minWidth: 0 }}>
                  {items[index]}
                </View>
              );
            })}
            {row.filler ? <View style={{ flex: 1, flexBasis: 0, minWidth: 0 }} /> : null}
          </View>
        ))}
      </View>
    </InBento.Provider>
  );
}

export interface BentoColumnProps {
  children: ReactNode;
  /** Read by `Bento`. A column is half a row unless told otherwise. */
  span?: TileSpan;
  /** Read by `Bento`: relative width within a packed row. Defaults to 1. */
  weight?: number;
}

/** Stacks tiles in one half of a row; they split its height evenly. */
export function BentoColumn({ children }: BentoColumnProps) {
  return <View style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: BENTO_GUTTER }}>{children}</View>;
}
