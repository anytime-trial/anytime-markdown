import type { Metadata, Viewport } from 'next';
import { getLocale } from 'next-intl/server';
import { Providers } from './providers';
import { LocaleProvider } from './LocaleProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anytime Markdown',
  description: 'A rich markdown editor powered by Tiptap',
  manifest: '/manifest.json',
  icons: [
    { rel: 'icon', url: '/favicon.ico', sizes: '32x32' },
    { rel: 'apple-touch-icon', url: '/icons/apple-touch-icon.png', sizes: '180x180' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Anytime Markdown',
  },
};

export const viewport: Viewport = {
  themeColor: '#121212',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider serverLocale={locale}>
          <Providers>
            {children}
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
