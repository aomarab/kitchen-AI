import type { RecipeVideo } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText, YoutubePlayer } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { formatRecipeVideoDuration } from '../../lib/recipe-video-duration';
import { radius, spacing } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export function RecipeVideoCard({ video }: { video: RecipeVideo }) {
  const { t, locale, prefs } = useFormat();
  const { colors } = useTheme();
  const duration =
    video.durationSeconds === null
      ? null
      : formatRecipeVideoDuration(locale, video.durationSeconds, prefs);
  return (
    <View style={{ gap: spacing.sm }}>
      <YoutubePlayer
        youtubeId={video.youtubeId}
        thumbnailUrl={video.thumbnailUrl}
        playLabel={t('mobile.recipe.watchOnYoutube')}
        errorLabel={t('mobile.recipe.videoUnavailable')}
        openLabel={t('mobile.recipe.openInYoutube')}
        thumbnailOverlay={
          duration ? (
            <View
              style={{
                position: 'absolute',
                end: spacing.sm,
                bottom: spacing.sm,
                minHeight: 20,
                justifyContent: 'center',
                paddingHorizontal: spacing.xs,
                borderRadius: radius.none,
                backgroundColor: colors.surfaceInverse,
              }}
            >
              <AppText
                variant="small"
                style={{ color: colors.textInverse, fontVariant: ['tabular-nums'] }}
              >
                {duration}
              </AppText>
            </View>
          ) : undefined
        }
      />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {video.title}
        </AppText>
        <AppText variant="caption" muted>
          {video.channel}
        </AppText>
      </View>
    </View>
  );
}
