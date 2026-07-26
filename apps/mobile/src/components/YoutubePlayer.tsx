import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Icon } from './Icon';
import { colors, radius } from '../theme';

interface YoutubePlayerProps {
  youtubeId: string;
  thumbnailUrl: string;
  /** Localized label for the play affordance. */
  playLabel: string;
}

/**
 * Embedded YouTube player (spec §6.3): the video plays *inside* the recipe
 * rather than throwing the user out to the YouTube app mid-cook. To keep the
 * screen light we mount the WebView lazily — a tappable thumbnail until the
 * user starts playback, then the iframe with inline autoplay.
 */
export function YoutubePlayer({ youtubeId, thumbnailUrl, playLabel }: YoutubePlayerProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <View
      style={{
        aspectRatio: 16 / 9,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      {playing ? (
        <WebView
          source={{
            uri: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`,
          }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          style={{ flex: 1, backgroundColor: '#000' }}
        />
      ) : (
        <Pressable
          onPress={() => setPlaying(true)}
          accessibilityRole="button"
          accessibilityLabel={playLabel}
          style={{ flex: 1 }}
        >
          <Image
            source={{ uri: thumbnailUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.overlay,
              },
            ]}
          >
            <Icon name="play" size={44} color={colors.textInverse} />
          </View>
        </Pressable>
      )}
    </View>
  );
}
