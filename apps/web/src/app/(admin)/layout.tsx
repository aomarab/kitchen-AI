import type { ReactNode } from 'react';
import { AdminGate } from '../../components/admin/AdminGate';

/**
 * Deliberately outside `(app)` — no `AppShell`, no pantry rail, no household
 * switcher. Admin routes are not household-scoped.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <div className="min-h-screen bg-background p-6">{children}</div>
    </AdminGate>
  );
}
