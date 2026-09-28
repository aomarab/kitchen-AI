import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { useFormat } from '../hooks/useFormat';
import { hitSlop, spacing } from '../theme';

/** Where each screen sends you, and the prompt that offers it. */
const DESTINATIONS = {
  '/sign-in': 'mobile.auth.haveAccount',
  '/sign-up': 'mobile.auth.noAccount',
} as const;

function splitSwitchText(text: string): { caption: string; link: string } {
  const match = /[?؟]/.exec(text);
  if (!match) return { caption: '', link: text };
  const splitAt = match.index + match[0].length;
  return { caption: text.slice(0, splitAt), link: text.slice(splitAt).trim() };
}

export interface AuthSwitchLinkProps {
  to: keyof typeof DESTINATIONS;
}

/**
 * The way across between signing in and creating an account.
 *
 * This replaces a segmented control that sat above the form. Two tabs implied
 * the panel below would swap in place, but each tab is its own route, so
 * tapping one slid a whole new screen in — the control moved and the content
 * it appeared to switch went with it. A single closing link is the ordinary
 * pattern for this pair, and it leaves exactly one primary button on screen.
 *
 * `replace` keeps the two halves from stacking in history: there is no "back"
 * between them, only across.
 */
export function AuthSwitchLink({ to }: AuthSwitchLinkProps) {
  const { t } = useFormat();
  const router = useRouter();
  const text = t(DESTINATIONS[to]);
  const { caption, link } = splitSwitchText(text);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={text}
      hitSlop={hitSlop}
      onPress={() => router.replace(to)}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
          paddingVertical: spacing.sm,
        }}
      >
        {caption ? (
          <AppText variant="caption" muted>
            {caption}
          </AppText>
        ) : null}
        <AppText variant="label" color="primaryText">
          {link}
        </AppText>
      </View>
    </Pressable>
  );
}
