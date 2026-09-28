import { ImageBackground, View, type ImageSourcePropType, type ViewStyle } from 'react-native';
import { AppText } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatQty } from '../../lib/format';
import { spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const WELCOME_HERO_PHOTO_HEIGHT = 264;
const DETECTION_SIZE = 104;
const DETECTION_CORNER = 18;
const DETECTION_STROKE = 3;

interface WelcomeCollageProps {
  produceImage: ImageSourcePropType;
  accessibilityLabel: string;
}

function cornerStyle(corner: 'topStart' | 'topEnd' | 'bottomStart' | 'bottomEnd'): ViewStyle {
  const vertical = corner.startsWith('top') ? { top: 0 } : { bottom: 0 };
  const horizontal = corner.endsWith('Start') ? { start: 0 } : { end: 0 };
  const verticalBorder = corner.startsWith('top')
    ? { borderTopWidth: DETECTION_STROKE }
    : { borderBottomWidth: DETECTION_STROKE };
  const horizontalBorder = corner.endsWith('Start')
    ? { borderStartWidth: DETECTION_STROKE }
    : { borderEndWidth: DETECTION_STROKE };
  return {
    position: 'absolute',
    width: DETECTION_CORNER,
    height: DETECTION_CORNER,
    ...vertical,
    ...horizontal,
    ...verticalBorder,
    ...horizontalBorder,
  };
}

function DetectionCorners() {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 118,
        end: spacing.xl,
        width: DETECTION_SIZE,
        height: DETECTION_SIZE,
      }}
    >
      {(['topStart', 'topEnd', 'bottomStart', 'bottomEnd'] as const).map((corner) => (
        <View key={corner} style={[cornerStyle(corner), { borderColor: colors.primary }]} />
      ))}
    </View>
  );
}

function TomatoTag({ count }: { count: string }) {
  const { t } = useFormat();
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 92,
        end: 96,
        minHeight: 24,
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
        backgroundColor: colors.primary,
      }}
    >
      <AppText variant="eyebrow" style={{ color: colors.onFill }}>
        {t('mobile.welcome.collage.tomatoes')} · {count}
      </AppText>
    </View>
  );
}

function ItemsSpotted({ count }: { count: string }) {
  const { t } = useFormat();
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: spacing.gutter,
        start: spacing.gutter,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.surface,
      }}
    >
      <AppText variant="numeralSmall">{count}</AppText>
      <AppText variant="caption" muted>
        {t('mobile.welcome.collage.itemsSpotted')}
      </AppText>
    </View>
  );
}

export function WelcomeCollage({ produceImage, accessibilityLabel }: WelcomeCollageProps) {
  const { locale, prefs } = useFormat();
  const tomatoCount = formatQty(locale, 6, prefs);
  const itemCount = formatQty(locale, 12, prefs);

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ImageBackground
          source={produceImage}
          resizeMode="cover"
          style={{ height: WELCOME_HERO_PHOTO_HEIGHT, overflow: 'hidden' }}
        >
          <DetectionCorners />
          <TomatoTag count={tomatoCount} />
          <ItemsSpotted count={itemCount} />
        </ImageBackground>
      </View>
    </View>
  );
}
