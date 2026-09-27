import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AccountButton } from './AccountButton';
import { AppText } from './AppText';
import { spacing } from '../theme';

export interface TabHeaderProps {
  title: string;
  /** Accent text that follows the title on the same line, such as a first name. */
  titleAccent?: string;
  /** A small line above the title, as in Home's "Thursday evening". */
  caption?: string;
  /** One action before the avatar, such as Plan's `+`. */
  action?: ReactNode;
}

/**
 * The header of a tab screen (spec §8.6): a `display` title, then one optional
 * action and the avatar at the trailing end. Pushed screens use `Header`.
 */
export function TabHeader({ title, titleAccent, caption, action }: TabHeaderProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        {caption ? (
          <AppText variant="caption" muted>
            {caption}
          </AppText>
        ) : null}
        <AppText variant="display" accessibilityRole="header">
          {title}
          {titleAccent ? (
            <>
              {' '}
              <AppText variant="display" color="primaryText">
                {titleAccent}
              </AppText>
            </>
          ) : null}
        </AppText>
      </View>
      {action}
      <AccountButton />
    </View>
  );
}
