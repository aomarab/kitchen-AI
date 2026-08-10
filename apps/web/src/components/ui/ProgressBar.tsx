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
      {/* Blue is the kit's data-viz colour — its charts and chat bubbles. A
          progress fill is a non-text component, so --accent (5.72:1 on white,
          4.11:1 on the --muted track) is the correct weight, not --accent-text. */}
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
