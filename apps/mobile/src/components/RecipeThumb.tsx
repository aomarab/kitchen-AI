import { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme';
import { Icon } from './Icon';
import {
  RECIPE_THUMB_TONE_FOREGROUNDS,
  recipeThumbBranch,
  recipeThumbToneForDish,
} from './recipe-thumb-tones';

const GLYPH_SIZE = 34;

export interface RecipeThumbProps {
  heroImageUrl: string | null;
  dishKey: string;
  title: string;
  accessibilityLabel?: string;
  resizeMode?: ImageResizeMode;
  style?: StyleProp<ViewStyle>;
}

export function RecipeThumb({
  heroImageUrl,
  dishKey,
  title,
  accessibilityLabel,
  resizeMode = 'cover',
  style,
}: RecipeThumbProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [heroImageUrl]);

  const branch = recipeThumbBranch(heroImageUrl, imageFailed);
  const tone = recipeThumbToneForDish(dishKey);
  const foreground = RECIPE_THUMB_TONE_FOREGROUNDS[tone];

  return (
    <View style={[styles.frame, style]}>
      {branch === 'image' ? (
        <Image
          source={{ uri: heroImageUrl! }}
          resizeMode={resizeMode}
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel ?? title}
          onError={() => setImageFailed(true)}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            styles.placeholder,
            { backgroundColor: colors[tone] },
          ]}
        >
          <Icon name="restaurant" size={GLYPH_SIZE} color={colors[foreground]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
