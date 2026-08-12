import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Icon } from './Icon';
import { AppText } from './AppText';
import {
  buildEmbedHtml,
  EMBED_BASE_URL,
  isAllowedEmbedUrl,
  WEBVIEW_ORIGIN_WHITELIST,
} from '../lib/youtube';
import { colors, radius, spacing } from '../theme';

interface YoutubePlayerProps {
  youtubeId: string;
  thumbnailUrl: string;
  /** Localized label for the play affordance. */
  playLabel: string;
  /** Localized message shown when the embed cannot be displayed. */
  errorLabel: string;
}


/**
 * Embedded YouTube player (spec §6.3): the video plays *inside* the recipe
 * rather than throwing the user out to the YouTube app mid-cook. To keep the
 * screen light we mount the WebView lazily — a tappable thumbnail until the
 * user starts playback, then the iframe with inline autoplay.
 */
export function YoutubePlayer({
  youtubeId,
  thumbnailUrl,
  playLabel,
  errorLabel,
}: YoutubePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const embedHtml = buildEmbedHtml(youtubeId);
  const showError = failed || embedHtml === null;

  return (
    <View
      style={{
        aspectRatio: 16 / 9,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      {showError ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.md,
          }}
        >
          <AppText variant="caption" style={{ color: colors.textInverse, textAlign: 'center' }}>
            {errorLabel}
          </AppText>
        </View>
      ) : playing ? (
        <WebView
          // Loaded as a document rather than by URL: pointing the WebView at
          // the embed URL leaves the player with no referrer, which YouTube
          // now rejects outright (error 153). See EMBED_BASE_URL.
          source={{ html: embedHtml ?? '', baseUrl: EMBED_BASE_URL }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          // The whitelist is intentionally wide and the real check is in
          // onShouldStartLoadWithRequest — see WEBVIEW_ORIGIN_WHITELIST. A
          // narrow whitelist would send blocked URLs to the system browser
          // instead of cancelling them.
          originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
          onShouldStartLoadWithRequest={(request) => isAllowedEmbedUrl(request.url)}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
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
