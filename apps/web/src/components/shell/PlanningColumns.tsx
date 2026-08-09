import type { ReactNode } from 'react';

/**
 * Two-column planning layout: main content inline-start, pantry rail inline-end.
 * Order is fixed in the DOM; `dir=rtl` on <html> flips the flex row so the rail
 * moves to the left in Arabic with no conditional code (spec §6.2, §7).
 */
export function PlanningColumns({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="w-full shrink-0 lg:w-80">{rail}</div>
    </div>
  );
}
