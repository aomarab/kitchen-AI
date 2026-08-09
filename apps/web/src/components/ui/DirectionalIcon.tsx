import type { ComponentType, SVGProps } from 'react';
import { cn } from '../../lib/cn';

/**
 * Wraps a direction-implying glyph (chevron, back arrow) so it mirrors in RTL.
 * The flip is CSS-only via the `.dir-flip` rule keyed off `<html dir>`, so it
 * works in server components and stays correct after a locale switch — no
 * conditional per-locale rendering anywhere in the tree (spec §7).
 */
export function DirectionalIcon({
  icon: Icon,
  className,
  ...props
}: { icon: ComponentType<SVGProps<SVGSVGElement>> } & SVGProps<SVGSVGElement>) {
  return <Icon className={cn('dir-flip', className)} {...props} />;
}
