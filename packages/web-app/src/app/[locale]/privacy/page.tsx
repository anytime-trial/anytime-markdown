import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { buildAlternates, localeHref, toLocale } from '../../../lib/localeAlternates';
import { socialTitle } from '../../../lib/siteMetadata';
import PrivacyBody from './PrivacyBody';

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations('Privacy');
  const title = t('title');
  return {
    title,
    description: t('metaDescription'),
    alternates: buildAlternates('/privacy', locale),
    // openGraph は title.template の適用対象外。指定しないとルート layout の
    // サイト名がそのまま og:title になり、共有時にページが判別できない。
    openGraph: {
      title: socialTitle(title),
      description: t('metaDescription'),
      url: localeHref('/privacy', locale),
    },
  };
}

export default function PrivacyPolicyPage() {
  return <PrivacyBody />;
}
