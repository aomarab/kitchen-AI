import type { RecipeVideo } from '@kitchen/contracts';
import { View } from 'react-native';
import { AppText, YoutubePlayer } from '../../components';
import { useFormat } from '../../hooks/useFormat';
import { spacing } from '../../theme';

export function RecipeVideoCard({ video }: { video: RecipeVideo }) {
  const { t } = useFormat();
  return (
    <View style={{ gap: spacing.sm }}>
      <YoutubePlayer
        youtubeId={video.youtubeId}
        thumbnailUrl={video.thumbnailUrl}
        playLabel={t('mobile.recipe.watchOnYoutube')}
        errorLabel={t('mobile.recipe.videoUnavailable')}
        openLabel={t('mobile.recipe.openInYoutube')}
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
