import '../globals.css';

import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { type Locale, routing } from '../../i18n/routing';
import { toLocale } from '../../lib/localeAlternates';
import {
  SITE_DEFAULT_TITLES,
  SITE_DESCRIPTIONS,
  SITE_NAME,
  TITLE_TEMPLATE,
} from '../../lib/siteMetadata';
import { LocaleProvider } from './LocaleProvider';
import { Providers } from './providers';

/** 静的エクスポート（CAPACITOR_BUILD）で両ロケールを出力するために必要 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  // 未対応ロケール（/xx/...）でも generateMetadata は呼ばれる。本体側の notFound() より先に
  // 走るため、ここで既定ロケールへ丸めないと 404 ページの title/description が undefined になる。
  const locale = toLocale((await params).locale);
  const description = SITE_DESCRIPTIONS[locale];

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com'),
    // 各ページは素のタイトルだけを持ち、サフィックスは template が付ける。
    // 二重付与を避けたいページ（/ と Anytime Trail 系）は title.absolute を使う。
    title: {
      default: SITE_DEFAULT_TITLES[locale],
      template: TITLE_TEMPLATE,
    },
    description,
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
      description,
      url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com',
      type: 'website',
      siteName: SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_NAME,
      description,
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
  ],
};

function buildJsonLd(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.anytime-trial.com',
    description: SITE_DESCRIPTIONS[locale],
    inLanguage: locale,
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
}

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
  // ロケールをリクエストスコープへ固定する。next-intl が静的レンダリングを許すための前提だが、
  // 現状はこの直後の headers()（CSP nonce の取得）が Dynamic API のため、配下は動的レンダリング
  // のままである。静的化を取るなら nonce を必要とする <Script> を子 client component へ切り出し、
  // この layout から headers() を外す必要がある。
  setRequestLocale(locale as Locale);

  const t = await getTranslations('Landing');
  const jsonLd = buildJsonLd(locale as Locale);
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
