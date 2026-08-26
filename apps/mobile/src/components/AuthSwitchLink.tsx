import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { useFormat } from '../hooks/useFormat';
import { hitSlop, spacing } from '../theme';

/** Where each screen sends you, and the prompt that offers it. */
const DESTINATIONS = {
  '/sign-in': 'mobile.auth.haveAccount',
  '/sign-up': 'mobile.auth.noAccount',
} as const;

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

  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={hitSlop}
      onPress={() => router.replace(to)}
      style={{ minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm }}
    >
      <AppText variant="label" center color="primary">
        {t(DESTINATIONS[to])}
      </AppText>
    </Pressable>
  );
}
