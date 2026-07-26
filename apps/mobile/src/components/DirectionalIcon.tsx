import { Icon, type IconName, type IconProps } from './Icon';
import { useLocale } from '../lib/locale';

/** Icons whose meaning depends on reading direction and must mirror in RTL. */
const DIRECTIONAL: ReadonlySet<IconName> = new Set<IconName>([
  'chevron',
  'back',
  'arrowForward',
  'swap',
]);

/**
 * Renders a direction-implying icon that flips horizontally in RTL. Build every
 * chevron/back/forward affordance from this component rather than flipping ad
 * hoc, so mirroring stays consistent app-wide (spec §7).
 */
export function DirectionalIcon({ name, style, ...rest }: IconProps) {
  const { dir } = useLocale();
  const flip = dir === 'rtl' && DIRECTIONAL.has(name);
  return <Icon name={name} style={[flip ? { transform: [{ scaleX: -1 }] } : null, style]} {...rest} />;
}
