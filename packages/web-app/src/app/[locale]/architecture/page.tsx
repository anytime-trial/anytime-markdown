import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { buildAlternates, localeHref, toLocale } from '../../../lib/localeAlternates';
import { socialTitle } from '../../../lib/siteMetadata';
import ArchitectureBody from './ArchitectureBody';

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations('Architecture');
  const title = t('title');
  const description = t('metaDescription');

  return {
    title,
    description,
    alternates: buildAlternates('/architecture', locale),
    openGraph: {
      title: socialTitle(title),
      description,
      url: localeHref('/architecture', locale),
    },
  };
}

export default function ArchitecturePage() {
  return <ArchitectureBody />;
}
