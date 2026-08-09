import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LocaleProvider } from '../../lib/locale';
import { AuthTabs } from './AuthTabs';

const { pathname } = vi.hoisted(() => ({ pathname: vi.fn() }));

vi.mock('next/navigation', () => ({ usePathname: () => pathname() }));

function renderTabs(at: string) {
  pathname.mockReturnValue(at);
  return render(
    <LocaleProvider locale="en">
      <AuthTabs />
    </LocaleProvider>,
  );
}

describe('AuthTabs', () => {
  it('offers both halves of the panel from either route', () => {
    renderTabs('/sign-in');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/sign-up');
  });

  it.each([
    ['/sign-in', 'Sign in', 'Create account'],
    ['/sign-up', 'Create account', 'Sign in'],
  ])('marks the %s tab as current', (at, current, other) => {
    renderTabs(at);
    expect(screen.getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: other })).not.toHaveAttribute('aria-current');
  });

  /**
   * The active tab is distinguished by a background swap, so the state has to
   * survive in the accessibility tree too — `aria-current` is the only thing a
   * screen reader has to tell the two links apart.
   */
  it('never marks both tabs as current', () => {
    renderTabs('/sign-up');
    expect(screen.getAllByRole('link').filter((el) => el.hasAttribute('aria-current'))).toHaveLength(1);
  });
});
