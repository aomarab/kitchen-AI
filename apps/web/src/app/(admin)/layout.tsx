import type { ReactNode } from 'react';
import { AdminGate } from '../../components/admin/AdminGate';
import { AdminNav } from '../../components/admin/AdminNav';

/**
 * Deliberately outside `(app)` — no `AppShell`, no pantry rail, no household
 * switcher. Admin routes are not household-scoped.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGate>
      <div className="min-h-screen bg-canvas p-6">
        <AdminNav />
        {children}
      </div>
    </AdminGate>
  );
}
