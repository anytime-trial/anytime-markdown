import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { buildAlternates, localeHref, toLocale } from '../../../lib/localeAlternates';
import { socialTitle } from '../../../lib/siteMetadata';

const TITLE = 'Editor';
/** openGraph / twitter は title.template が効かないため、同じ文言から完全形を導出する */
const SOCIAL_TITLE = socialTitle(TITLE);

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  // description はロケールごとに出し分ける。1 つの文字列へ両言語を詰めると、
  // /en が hreflang で en 版を名乗りながら日本語混じりの説明を返すことになる。
  const t = await getTranslations({ locale, namespace: 'Editor' });
  const description = t('metaDescription');
  const socialDescription = t('socialDescription');

  return {
    title: TITLE,
    description,
    alternates: buildAlternates('/markdown', locale),
    openGraph: {
      title: SOCIAL_TITLE,
      description: socialDescription,
      url: localeHref('/markdown', locale),
    },
    twitter: {
      card: 'summary_large_image',
      title: SOCIAL_TITLE,
      description: socialDescription,
    },
  };
}

export default function MarkdownLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
