import { Icon, type IconProps } from './Icon';
import { isDirectionalIconName } from './glyphs/stroke';
import { useLocale } from '../lib/locale';

/**
 * Renders a direction-implying icon that flips horizontally in RTL. Build every
 * chevron/back/forward affordance from this component rather than flipping ad
 * hoc, so mirroring stays consistent app-wide (spec §7).
 */
export function DirectionalIcon({ name, style, ...rest }: IconProps) {
  const { dir } = useLocale();
  const flip = dir === 'rtl' && isDirectionalIconName(name);
  return (
    <Icon name={name} style={[flip ? { transform: [{ scaleX: -1 }] } : null, style]} {...rest} />
  );
}
