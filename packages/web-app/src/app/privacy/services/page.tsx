import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import PrivacyServicesBody from './PrivacyServicesBody';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PrivacyServices');
  return {
    title: `${t('title')} - Anytime Markdown`,
    description: t('metaDescription'),
    alternates: {
      canonical: '/privacy/services',
    },
  };
}

export default function PrivacyServicesPage() {
  return <PrivacyServicesBody />;
}
