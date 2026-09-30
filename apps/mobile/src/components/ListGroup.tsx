import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from './Card';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';

export interface ListGroupProps {
  /** `ListRow grouped` children, separated by hairlines. */
  children: ReactNode;
}

/**
 * A white group card of rows (spec §9.7), as on Account and Settings. The card
 * carries the fill, edge and shadow once, so the rows inside stay flat.
 */
export function ListGroup({ children }: ListGroupProps) {
  const { colors } = useTheme();
  const rows = Children.toArray(children);
  return (
    <Card style={{ padding: 0, gap: 0 }}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                marginHorizontal: spacing.lg,
                backgroundColor: colors.border,
              }}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </Card>
  );
}
