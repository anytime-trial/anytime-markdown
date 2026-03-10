import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import Script from 'next/script';
import { Providers } from './providers';
import { LocaleProvider } from './LocaleProvider';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://anytime-markdown.vercel.app'),
  title: 'Anytime Markdown',
  description: 'Free browser-based WYSIWYG Markdown editor with Mermaid/PlantUML diagrams, KaTeX math, diff comparison, merge, tables, and code blocks. No sign-up required. | 無料のブラウザ対応WYSIWYGマークダウンエディタ。Mermaid/PlantUML図、KaTeX数式、マークダウン差分比較、マークダウンマージ、テーブル、コードブロック対応。設計書作成にも最適。登録不要。',
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
    description: 'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, tables. No sign-up required.',
    type: 'website',
    siteName: 'Anytime Markdown',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anytime Markdown',
    description: 'Free WYSIWYG Markdown editor with Mermaid, PlantUML, KaTeX, diff, merge, tables. No sign-up required.',
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
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://anytime-markdown.vercel.app',
  description: 'Free browser-based WYSIWYG Markdown editor with Mermaid/PlantUML diagrams, KaTeX math, diff comparison, merge, tables, and code blocks. No sign-up required.',
  applicationCategory: 'Productivity',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'WYSIWYG Markdown editing',
    'Mermaid diagrams',
    'PlantUML diagrams',
    'KaTeX math formulas',
    'Table editor',
    'Syntax-highlighted code blocks',
    'Markdown diff comparison',
    'Markdown merge',
    'Dark mode',
    'PWA support',
    'YAML frontmatter',
    'Design document creation',
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang={locale}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <a href="#main-content" className="skip-link">Skip to content</a>
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
