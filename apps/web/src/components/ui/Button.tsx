import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-press',
  secondary: 'bg-canvas-lavender text-foreground hover:bg-muted',
  ghost: 'bg-transparent text-foreground hover:bg-muted',
  danger: 'bg-danger text-danger-foreground hover:opacity-90',
  outline: 'border-2 border-primary-text bg-transparent text-primary-text hover:bg-primary-soft',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-4 text-[13px] gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2',
};

/** Shared button styling, reused by `<Button>` and by link-as-button (`<Link>`). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex items-center justify-center rounded-full font-bold tracking-button transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function Button({ variant, size, block, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, block, className })} {...props} />;
}
