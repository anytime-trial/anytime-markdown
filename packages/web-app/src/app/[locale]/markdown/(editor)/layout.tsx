import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { buildAlternates, localeHref, toLocale } from '../../../../lib/localeAlternates';
import { socialTitle } from '../../../../lib/siteMetadata';
import { MarkdownGuide } from '../MarkdownGuide';

/**
 * `/markdown`（エディタ本体）専用の layout。
 *
 * `(editor)` はルートグループなので URL には現れない（パスは `/markdown` のまま）。
 * この 1 段を挟んでいるのは、下の `MarkdownGuide` と metadata を **`/markdown` だけ**へ
 * 閉じ込めるため。`markdown/layout.tsx` に置くと `/markdown/mermaid` 等の LP へも継承され、
 * 全 LP の下に同じ解説本文が出て（重複コンテンツ）、canonical も `/markdown` に固定される。
 */

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

export default function MarkdownEditorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // 本文はここ（server component）で描画する。page.tsx は 'use client' のため、
  // そこからでは server component の本文を SSR できない。
  return (
    <>
      {children}
      <MarkdownGuide />
    </>
  );
}
