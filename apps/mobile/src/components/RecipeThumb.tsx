import { Image, View } from 'react-native';
import { AppText } from './AppText';
import { useLocale } from '../lib/locale';
import { toneIndexFor } from '../lib/recipe-tone';
import { spacing, tintFor } from '../theme';

/**
 * A recipe's image, or an honest stand-in for it.
 *
 * The app previously showed whatever image it had, which is how a music-video
 * thumbnail became a meal photo. When nothing verified resolves, this renders
 * the dish's own name on a palette tint instead of a picture of something else.
 */
export function RecipeThumb({
  src,
  title,
  dishKey,
  height,
  borderRadius = 0,
}: {
  src: string | null;
  title: string;
  dishKey: string;
  height: number;
  /** Match the call site: the recipe hero is full-bleed, the entry card rounds. */
  borderRadius?: number;
}) {
  const { t } = useLocale();

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        accessibilityLabel={title}
        style={{ width: '100%', height, borderRadius }}
      />
    );
  }

  const tint = tintFor(toneIndexFor(dishKey));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('mobile.recipe.noPhoto', { dish: title })}
      style={{
        width: '100%',
        height,
        borderRadius,
        backgroundColor: tint.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
      }}
    >
      {/* AppText is the app's only text primitive — it carries the locale-aware
          scale and Arabic line-height. The tint's own validated foreground is
          passed as a style override because `color` takes a ColorToken. */}
      <AppText variant="bodyStrong" center numberOfLines={3} style={{ color: tint.fg }}>
        {title}
      </AppText>
    </View>
  );
}
