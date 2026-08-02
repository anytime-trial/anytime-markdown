import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import PrivacyBody from './PrivacyBody';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Privacy');
  return {
    title: t('title'),
    description: t('metaDescription'),
    alternates: {
      canonical: '/privacy',
    },
  };
}

export default function PrivacyPolicyPage() {
  return <PrivacyBody />;
}
