import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Icon } from './Icon';
import { AppText } from './AppText';
import {
  buildEmbedHtml,
  EMBED_BASE_URL,
  isAllowedEmbedUrl,
  parseEmbedMessage,
  watchOnYoutubeUrl,
  WEBVIEW_ORIGIN_WHITELIST,
} from '../lib/youtube';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

interface YoutubePlayerProps {
  youtubeId: string;
  thumbnailUrl: string;
  /** Localized label for the play affordance. */
  playLabel: string;
  /** Localized message shown when the embed cannot be displayed. */
  errorLabel: string;
  /** Localized label for the escape hatch out to the YouTube app. */
  openLabel: string;
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
  openLabel,
}: YoutubePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const { colors } = useTheme();

  const embedHtml = buildEmbedHtml(youtubeId);
  const watchUrl = watchOnYoutubeUrl(youtubeId);
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
            gap: spacing.sm,
          }}
        >
          <AppText variant="caption" style={{ color: colors.textInverse, textAlign: 'center' }}>
            {errorLabel}
          </AppText>
          {/*
            An embed can fail for reasons no client can fix — a rights holder
            disallowing it, a country block — so a dead black rectangle is not
            an acceptable resting state. The video exists on YouTube either
            way, and the recipe is the point.
          */}
          {watchUrl ? (
            <Pressable
              onPress={() => void Linking.openURL(watchUrl)}
              accessibilityRole="button"
              accessibilityLabel={openLabel}
              hitSlop={spacing.sm}
            >
              <AppText
                variant="bodyStrong"
                style={{ color: colors.textInverse, textDecorationLine: 'underline' }}
              >
                {openLabel}
              </AppText>
            </Pressable>
          ) : null}
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
          // The player reports its own failures — a WebView that loaded fine
          // still shows YouTube's error card inside itself, which `onError`
          // never sees.
          onMessage={(event) => {
            const message = parseEmbedMessage(event.nativeEvent.data);
            if (message?.type === 'error') setFailed(true);
          }}
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
