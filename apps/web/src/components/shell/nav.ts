import type { ComponentType, SVGProps } from 'react';
import type { MessageKey } from '@kitchen/i18n';
import {
  ClockIcon,
  DashboardIcon,
  HouseholdIcon,
  KitchenIcon,
  PlansIcon,
  RecipesIcon,
  SettingsIcon,
  ShoppingIcon,
} from '../ui/icons';

export interface NavItem {
  href: string;
  labelKey: MessageKey;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/', labelKey: 'web.nav.dashboard', icon: DashboardIcon },
  { href: '/kitchen', labelKey: 'web.nav.kitchen', icon: KitchenIcon },
  { href: '/plans', labelKey: 'web.nav.plans', icon: PlansIcon },
  { href: '/recipes', labelKey: 'web.nav.recipes', icon: RecipesIcon },
  { href: '/shopping', labelKey: 'web.nav.shopping', icon: ShoppingIcon },
  { href: '/timers', labelKey: 'web.nav.timers', icon: ClockIcon },
];

export const ACCOUNT_NAV: NavItem[] = [
  { href: '/household', labelKey: 'web.nav.household', icon: HouseholdIcon },
  { href: '/settings', labelKey: 'web.nav.settings', icon: SettingsIcon },
];

/** Best-matching nav label for the current path, used as the page heading. */
export function activeLabel(pathname: string): MessageKey {
  const all = [...PRIMARY_NAV, ...ACCOUNT_NAV];
  const match = all
    .filter((n) => (n.href === '/' ? pathname === '/' : pathname.startsWith(n.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.labelKey ?? 'web.nav.dashboard';
}
