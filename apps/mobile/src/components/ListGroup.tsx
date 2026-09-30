import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SectionLabel } from './SectionLabel';
import { spacing } from '../theme';

export interface ListGroupProps {
  children: ReactNode;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ListGroup({ children, title, actionLabel, onAction }: ListGroupProps) {
  return (
    <View style={{ gap: title ? spacing.sm : 0 }}>
      {title ? (
        <SectionLabel actionLabel={actionLabel} onAction={onAction}>
          {title}
        </SectionLabel>
      ) : null}
      <View>{children}</View>
    </View>
  );
}
