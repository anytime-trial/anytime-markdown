import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import Script from 'next/script';
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
  openGraph: {
    title: 'Anytime Markdown',
    description: 'A rich markdown editor powered by Tiptap',
    type: 'website',
    siteName: 'Anytime Markdown',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider serverLocale={locale}>
          <Providers>
            {children}
          </Providers>
        </LocaleProvider>
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
              nonce={nonce}
            />
            <Script id="ga-init" strategy="afterInteractive" nonce={nonce}>
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
