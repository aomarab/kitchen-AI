import { View, type ImageSourcePropType, type ViewStyle } from 'react-native';
import { AppText, Bento, BentoColumn, Icon, OrbMascot, Tile } from '../../components';
import { BENTO_GUTTER } from '../../components/tile-layout';
import { useFormat } from '../../hooks/useFormat';
import { formatMinutes, formatQty } from '../../lib/format';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const PRODUCE_TILE_HEIGHT = 250;
const STACKED_TILE_HEIGHT = (PRODUCE_TILE_HEIGHT - BENTO_GUTTER) / 2;
const LOWER_TILE_HEIGHT = 130;

interface WelcomeCollageProps {
  produceImage: ImageSourcePropType;
  saladImage: ImageSourcePropType;
  accessibilityLabel: string;
}

type ChipPosition = 'topEnd' | 'bottomStart';

function chipPosition(position: ChipPosition): ViewStyle {
  if (position === 'topEnd') {
    return { position: 'absolute', top: spacing.md, end: spacing.md };
  }
  return { position: 'absolute', bottom: spacing.md, start: spacing.md };
}

function splitDotLabel(value: string): { label: string; detail?: string } {
  const [label, detail] = value.split(' · ');
  return detail ? { label: label ?? value, detail } : { label: value };
}

function PhotoChip({
  label,
  detail,
  icon,
  position,
}: {
  label: string;
  detail?: string;
  icon?: 'clock';
  position: ChipPosition;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        {
          minHeight: 32,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.surface,
        },
        chipPosition(position),
      ]}
    >
      {icon ? (
        <Icon name={icon} size={15} color={colors.primary} />
      ) : (
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.primary,
          }}
        />
      )}
      <AppText variant="label">{label}</AppText>
      {detail ? (
        <AppText variant="caption" muted>
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

function CenteredOrb() {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        start: 0,
        end: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <OrbMascot size={64} state="idle" />
    </View>
  );
}

function LeafCircle() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
      }}
    >
      <Icon name="leaf" size={22} color={colors.accent} />
    </View>
  );
}

export function WelcomeCollage({
  produceImage,
  saladImage,
  accessibilityLabel,
}: WelcomeCollageProps) {
  const { t, locale, prefs } = useFormat();
  const countSix = formatQty(locale, 6, prefs);
  const countFour = formatQty(locale, 4, prefs);
  const freshDays = formatQty(locale, 5, prefs);
  const tonight = splitDotLabel(
    t('mobile.welcome.collage.tonight', { minutes: formatMinutes(locale, 20, prefs) }),
  );

  return (
    <View accessible accessibilityLabel={accessibilityLabel}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Bento>
          <Tile
            span={1}
            weight={3}
            tint="photo"
            image={produceImage}
            scrim={false}
            height={PRODUCE_TILE_HEIGHT}
            accessibilityLabel={accessibilityLabel}
          >
            <PhotoChip
              label={t('mobile.welcome.collage.tomatoes')}
              detail={countSix}
              position="topEnd"
            />
            <PhotoChip
              label={t('mobile.welcome.collage.carrots')}
              detail={countFour}
              position="bottomStart"
            />
          </Tile>

          <BentoColumn span={1} weight={2}>
            <Tile
              tint="apricot"
              height={STACKED_TILE_HEIGHT}
              accessibilityLabel={accessibilityLabel}
            >
              <CenteredOrb />
            </Tile>
            <Tile
              tint="butter"
              height={STACKED_TILE_HEIGHT}
              count={countSix}
              caption={t('mobile.welcome.collage.itemsSpotted')}
              accessibilityLabel={accessibilityLabel}
            />
          </BentoColumn>

          <Tile
            span={1}
            weight={2}
            tint="sage"
            height={LOWER_TILE_HEIGHT}
            leading={<LeafCircle />}
            accessibilityLabel={accessibilityLabel}
          >
            <AppText variant="bodyStrong">
              {t('mobile.welcome.collage.freshFor', { days: freshDays })}
            </AppText>
          </Tile>

          <Tile
            span={1}
            weight={3}
            tint="photo"
            image={saladImage}
            scrim={false}
            height={LOWER_TILE_HEIGHT}
            accessibilityLabel={accessibilityLabel}
          >
            <PhotoChip
              icon="clock"
              label={tonight.label}
              detail={tonight.detail}
              position="bottomStart"
            />
          </Tile>
        </Bento>
      </View>
    </View>
  );
}
