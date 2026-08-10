import { cn } from '../../lib/cn';

/** Accessible progress bar. Fills from the inline-start edge in both directions. */
export function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      {/* Teal is the reference's data-viz colour — the gauge and the chart bars.
          A progress fill is a non-text component, so --accent (3.41:1 on white,
          3.10:1 on canvas) is the correct weight rather than --accent-text. */}
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
