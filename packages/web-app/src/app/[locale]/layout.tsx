import '../globals.css';

import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { type Locale, routing } from '../../i18n/routing';
import { SITE_DESCRIPTION, SITE_NAME, TITLE_TEMPLATE } from '../../lib/siteMetadata';
import { LocaleProvider } from './LocaleProvider';
import { Providers } from './providers';

/** 静的エクスポート（CAPACITOR_BUILD）で両ロケールを出力するために必要 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com'),
  // 各ページは素のタイトルだけを持ち、サフィックスは template が付ける。
  // 二重付与を避けたいページ（/ と Anytime Trail 系）は title.absolute を使う。
  title: {
    default: `${SITE_NAME} — Browser-based Markdown Editor`,
    template: TITLE_TEMPLATE,
  },
  description: SITE_DESCRIPTION,
  manifest: '/manifest.json',
  icons: [
    { rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' },
    { rel: 'icon', url: '/favicon.ico', sizes: '32x32' },
    { rel: 'apple-touch-icon', url: '/icons/apple-touch-icon.png', sizes: '180x180' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: SITE_NAME,
  },
  // Why not: alternates（canonical / hreflang）をここに置かない。子ルートへ継承されるため、
  // 個別指定を持たないページが一律で同じ URL へ集約されてしまう。ロケール別 URL は
  // 各ルートの generateMetadata が lib/localeAlternates の buildAlternates で組み立てる。
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com',
    type: 'website',
    siteName: SITE_NAME,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
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
  name: SITE_NAME,
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com',
  description: SITE_DESCRIPTION,
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

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: Readonly<LayoutProps>) {
  const { locale } = await params;
  // 未対応のロケールで /xx/... を叩かれたら 404。ここで弾かないと messages が
  // 既定ロケールへ縮退し、存在しない URL が日本語ページとして 200 を返す。
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }
  // 静的レンダリングを有効にする（これが無いと全ページが動的レンダリングへ落ちる）
  setRequestLocale(locale as Locale);

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
