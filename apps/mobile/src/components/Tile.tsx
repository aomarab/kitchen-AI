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
  Animated,
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
import { Badge } from './Badge';
import { Icon, type IconName } from './Icon';
import { Illustration, type IllustrationName } from './Illustration';
import { usePressFeedback } from './press-feedback';
import {
  BENTO_TILE_GAP,
  bentoGap,
  bentoRowLayout,
  type BentoLayoutDescriptor,
  type BentoVariant,
  type TileSpan,
} from './tile-layout';
import { spacing } from '../theme';
import { scrimGradient } from '../theme/scrim';
import { useTheme } from '../theme/useTheme';

export type { TileSpan } from './tile-layout';
export type TileVariant = 'place' | 'quickAction';

export interface TileProps {
  /** Read by `Bento`: a whole row, or part of one. */
  span?: TileSpan;
  /** Read by `Bento`: relative width within a packed row. Defaults to 1. */
  weight?: number;
  variant?: TileVariant;
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
  icon?: IconName;
  illustration?: IllustrationName;
  /** Drawn at the top-leading position instead of the standard art slot. */
  leading?: ReactNode;
  corner?: ReactNode;
  badgeLabel?: string;
  count?: string | number;
  caption?: string;
  children?: ReactNode;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const InBento = createContext(false);
const photoImageStyle: ImageStyle = { width: '100%', height: '100%' };
const PLACE_TILE_MIN_HEIGHT = 158;
const QUICK_ACTION_MIN_HEIGHT = 80;

function bentoLayoutStyle(layout: BentoLayoutDescriptor): ViewStyle {
  if ('width' in layout) return { width: layout.width, minWidth: 0 };
  return { flex: layout.flex, flexBasis: 0, minWidth: 0 };
}

function tileMinHeight(variant: TileVariant | undefined): number {
  if (variant === 'quickAction') return QUICK_ACTION_MIN_HEIGHT;
  return PLACE_TILE_MIN_HEIGHT;
}

export function Tile({
  variant,
  image,
  scrim = true,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  actions,
  icon,
  illustration,
  leading,
  corner,
  badgeLabel,
  count,
  caption,
  children,
  height,
  style,
  testID,
}: TileProps) {
  const { colors, shadow, scrim: scrimToken } = useTheme();
  const inBento = useContext(InBento);
  const pressFeedback = usePressFeedback();
  const quickAction = variant === 'quickAction';
  const [imageFailed, setImageFailed] = useState(false);
  const hasPhotoImage = !!image && !imageFailed;
  const showPhotoFallback = !!image && imageFailed;
  const fill =
    hasPhotoImage || showPhotoFallback
      ? colors.surfaceInverse
      : quickAction
        ? colors.surfaceAlt
        : colors.surface;
  const ink = hasPhotoImage ? { color: colors.textInverse } : undefined;
  const accessibilityActions = actions?.map(({ name, label }) => ({ name, label }));
  const onAccessibilityAction = actions
    ? (event: AccessibilityActionEvent) => {
        actions.find((action) => action.name === event.nativeEvent.actionName)?.onPress();
      }
    : undefined;
  const baseHeight = height ?? tileMinHeight(variant);
  const pressableStyle: ViewStyle | undefined = inBento ? { flex: 1 } : undefined;

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  const container: ViewStyle = {
    minHeight: baseHeight,
    padding: quickAction ? spacing.md : spacing.lg,
    gap: spacing.sm,
    borderWidth: quickAction || hasPhotoImage || showPhotoFallback ? 0 : 1,
    borderColor: colors.cardEdge,
    backgroundColor: fill,
    ...(hasPhotoImage || showPhotoFallback
      ? { overflow: 'hidden' }
      : quickAction
        ? null
        : shadow.card),
    ...(inBento ? { flex: 1 } : null),
  };

  const art = leading ? (
    leading
  ) : illustration ? (
    <Illustration name={illustration} size={44} />
  ) : icon ? (
    <Icon
      name={icon}
      size={quickAction ? 24 : 24}
      color={hasPhotoImage ? colors.textInverse : colors.text}
    />
  ) : null;

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
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceAlt,
            },
          ]}
        >
          <Illustration name="plate" size={44} />
        </View>
      ) : null}
      {art || corner ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}
        >
          {art ?? <View />}
          {corner}
        </View>
      ) : null}
      {children}
      {count !== undefined ? (
        <AppText variant={quickAction ? 'caption' : 'bodyStrong'} style={ink}>
          {count}
        </AppText>
      ) : null}
      {caption ? (
        <AppText variant="caption" muted={!hasPhotoImage} style={ink}>
          {caption}
        </AppText>
      ) : null}
      {badgeLabel ? <Badge tone="warn" label={badgeLabel} /> : null}
    </>
  );

  const accessibleProps = {
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    accessibilityActions,
    onAccessibilityAction,
  };

  if (!onPress) {
    return (
      <View accessible testID={testID} style={[container, style]} {...accessibleProps}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessible
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={onPress}
      {...pressFeedback.pressHandlers}
      style={pressableStyle}
      testID={testID}
    >
      <Animated.View style={[container, pressFeedback.animatedStyle, style]}>{body}</Animated.View>
    </Pressable>
  );
}

export interface BentoProps {
  children: ReactNode;
  variant?: BentoVariant;
  /**
   * Reports each packed row's y-position relative to the Bento container.
   * Screens that need ScrollView coordinates must add the Bento container's
   * own y-position inside the scroll content.
   */
  onRowLayout?: (indices: readonly number[], y: number) => void;
}

export function Bento({ children, variant = 'tiles', onRowLayout }: BentoProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{
    span?: TileSpan;
    weight?: number;
  }>[];
  const gap = bentoGap(variant);
  const rows = bentoRowLayout(
    items.map((item) => item.props.span ?? 1),
    variant,
    containerWidth,
    items.map((item) => item.props.weight),
  );
  const handleLayout = (width: number) => {
    setContainerWidth((current) => (current === width ? current : width));
  };

  return (
    <InBento.Provider value>
      <View onLayout={(event) => handleLayout(event.nativeEvent.layout.width)} style={{ gap }}>
        {rows.map((row) => {
          const indices = row.cells.map((cell) => cell.index);
          return (
            <View
              key={indices.join('-')}
              onLayout={(event) => onRowLayout?.(indices, event.nativeEvent.layout.y)}
              style={{ flexDirection: 'row', alignItems: 'stretch', gap }}
            >
              {row.cells.map((cell) => {
                const item = items[cell.index];
                return (
                  <View key={item?.key ?? cell.index} style={bentoLayoutStyle(cell.layout)}>
                    {item}
                  </View>
                );
              })}
              {row.fillers.map((filler, index) => (
                <View key={`filler-${index}`} style={bentoLayoutStyle(filler)} />
              ))}
            </View>
          );
        })}
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
  return (
    <View style={{ flex: 1, flexBasis: 0, minWidth: 0, gap: BENTO_TILE_GAP }}>{children}</View>
  );
}
