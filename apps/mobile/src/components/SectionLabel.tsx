import type { ReactNode } from 'react';
import { AppText } from './AppText';

export interface SectionLabelProps {
  children: ReactNode;
}

export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <AppText variant="label" muted>
      {children}
    </AppText>
  );
}
