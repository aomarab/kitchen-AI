import type { Metadata, Viewport } from 'next';
import { Inter, Tajawal } from 'next/font/google';
import { directionFor } from '@kitchen/i18n';
import { getRequestLocale } from '../lib/locale.server';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ variable: '--font-latin', subsets: ['latin'], display: 'swap' });

/**
 * Tajawal ships no semibold — its weights run 200/300/400/500/700/800/900.
 * Requesting '600' here is a build-time error in `next/font/google`, so the
 * 600 tier is left to CSS font matching, which resolves it upward to Bold.
 */
const tajawal = Tajawal({
  variable: '--font-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Mama's Kitchen",
  description: 'Turn what is already in your kitchen into a meal plan.',
};

export const viewport: Viewport = {
  // Next serialises these into <meta>, which cannot read a CSS variable, so
  // they are the one place a palette hex is duplicated. palette.test.ts pins
  // them to --canvas in both themes; they had silently drifted before it did.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f8' },
    { media: '(prefers-color-scheme: dark)', color: '#120b24' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const dir = directionFor(locale);

  return (
    <html lang={locale} dir={dir} className={`${inter.variable} ${tajawal.variable}`}>
      <body className="bg-background text-foreground antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
