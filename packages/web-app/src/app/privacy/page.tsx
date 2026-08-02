import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { socialTitle } from '../../lib/siteMetadata';
import PrivacyBody from './PrivacyBody';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Privacy');
  const title = t('title');
  return {
    title,
    description: t('metaDescription'),
    alternates: {
      canonical: '/privacy',
    },
    // openGraph は title.template の適用対象外。指定しないとルート layout の
    // サイト名がそのまま og:title になり、共有時にページが判別できない。
    openGraph: {
      title: socialTitle(title),
      description: t('metaDescription'),
      url: '/privacy',
    },
  };
}

export default function PrivacyPolicyPage() {
  return <PrivacyBody />;
}
