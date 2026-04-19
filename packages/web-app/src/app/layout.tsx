import './globals.css';

import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import { getLocale,getTranslations } from 'next-intl/server';

import { LocaleProvider } from './LocaleProvider';
import { Providers } from './providers';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com'),
  title: 'Anytime Markdown',
  description: 'Spec-Driven Development (SDD) Markdown editor with AI diff highlighting, image annotation, and image prompt support. WYSIWYG editing, Mermaid/PlantUML diagrams, Git integration. Visual Studio Code extension available. ハーネスエンジニアリング',
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
  alternates: {
    languages: {
      en: '/',
      ja: '/',
      'x-default': '/',
    },
  },
  openGraph: {
    title: 'Anytime Markdown',
    description: 'Spec-Driven Development (SDD) Markdown editor with AI diff highlighting, image annotation, and image prompt. WYSIWYG, Mermaid, PlantUML, Git integration.',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com',
    type: 'website',
    siteName: 'Anytime Markdown',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anytime Markdown',
    description: 'Spec-Driven Development (SDD) Markdown editor with AI diff highlighting, image annotation, and image prompt. WYSIWYG, Mermaid, PlantUML, Git integration.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
  ],
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Anytime Markdown',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com',
  description: 'Spec-Driven Development (SDD) Markdown editor with AI diff highlighting, image annotation, and image prompt support. WYSIWYG editing, Mermaid/PlantUML diagrams, Git integration. Visual Studio Code extension available.',
  applicationCategory: 'Productivity',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Spec-Driven Development (SDD)',
    'AI diff highlighting',
    'Image annotation',
    'Image prompt support',
    'WYSIWYG Markdown editing',
    'Mermaid diagrams',
    'PlantUML diagrams',
    'KaTeX math formulas',
    'Screen capture and GIF recording',
    'Git integration',
    'Code review and inline comments',
    'Table editor',
    'Syntax-highlighted code blocks',
    'Dark mode',
    'Visual Studio Code extension',
    'No installation required',
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const t = await getTranslations('Landing');
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang={locale}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <a href="#main-content" className="skip-link">{t('ariaSkipToContent')}</a>
        <LocaleProvider serverLocale={locale}>
          <Providers>
            <main id="main-content">
              {children}
            </main>
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
