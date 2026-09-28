import { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Illustration } from './Illustration';
import { useTheme } from '../theme/useTheme';

export type RecipeThumbSize = 56 | 72 | 196;

export interface RecipeThumbProps {
  heroImageUrl: string | null;
  /** @deprecated J: removed in C16. Placeholder art no longer varies by dish. */
  dishKey: string;
  title: string;
  accessibilityLabel?: string;
  resizeMode?: ImageResizeMode;
  size?: RecipeThumbSize;
  onImageLoad?: () => void;
  onImageError?: () => void;
  style?: StyleProp<ViewStyle>;
}

function recipeThumbBranch(heroImageUrl: string | null | undefined, imageFailed = false) {
  return heroImageUrl && !imageFailed ? 'image' : 'placeholder';
}

function plateSize(size: RecipeThumbSize): number {
  if (size === 196) return 72;
  return Math.round(size * 0.72);
}

export function RecipeThumb({
  heroImageUrl,
  title,
  accessibilityLabel,
  resizeMode = 'cover',
  size,
  onImageLoad,
  onImageError,
  style,
}: RecipeThumbProps) {
  const { colors } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [heroImageUrl]);

  const branch = recipeThumbBranch(heroImageUrl, imageFailed);
  const frameSize = size ? { width: size, height: size } : null;
  const artSize = plateSize(size ?? 72);

  return (
    <View
      style={[
        {
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: colors.surfaceAlt,
        },
        frameSize,
        style,
      ]}
    >
      {branch === 'image' ? (
        <Image
          source={{ uri: heroImageUrl! }}
          resizeMode={resizeMode}
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel ?? title}
          onLoad={onImageLoad}
          onError={() => {
            setImageFailed(true);
            onImageError?.();
          }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
        >
          <Illustration name="plate" size={artSize} />
        </View>
      )}
    </View>
  );
}

export const recipeThumbState = { recipeThumbBranch, plateSize };
