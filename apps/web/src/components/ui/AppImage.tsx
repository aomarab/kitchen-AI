import Image from 'next/image';
import { cn } from '../../lib/cn';

/**
 * Remote image inside a fixed-aspect box. Uses next/image `fill` so callers only
 * pick an aspect ratio via `className` (e.g. `aspect-video`).
 */
export function AppImage({
  src,
  alt,
  className,
  sizes = '(max-width: 768px) 100vw, 400px',
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  );
}
