import type { ReactNode } from 'react';
import { AuthGate } from '../../components/auth/AuthGate';

/**
 * The kitchen screen is a full-bleed kiosk — it deliberately does *not* wrap in
 * the app sidebar/header chrome, so it reads from across the room. It still
 * gates on auth because it shows a household's real reminder settings.
 */
export default function ScreenLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
