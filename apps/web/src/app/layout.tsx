import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { directionFor } from '@kitchen/i18n';
import { getRequestLocale } from '../lib/locale.server';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ variable: '--font-latin', subsets: ['latin'], display: 'swap' });

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: '--font-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kitchen AI',
  description: 'Turn what is already in your kitchen into a meal plan.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4ede4' },
    { media: '(prefers-color-scheme: dark)', color: '#140e15' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const dir = directionFor(locale);

  return (
    <html lang={locale} dir={dir} className={`${inter.variable} ${plexArabic.variable}`}>
      <body className="bg-background text-foreground antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
