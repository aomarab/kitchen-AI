import type { ReactNode } from 'react';
import { AppShell } from '../../components/shell/AppShell';
import { AuthGate } from '../../components/auth/AuthGate';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
