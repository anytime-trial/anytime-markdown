import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { buildAlternates, localeHref, toLocale } from '../../lib/localeAlternates';
import { PressBody } from './press/PressBody';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'press' });
  const title = t('meta.title');
  const description = t('meta.description');

  return {
    // ランディングは独自のブランド表記を使うため、ルート layout の template を適用しない
    title: { absolute: title },
    description,
    alternates: buildAlternates('/', locale),
    openGraph: {
      type: 'website',
      url: localeHref('/', locale),
      title,
      description,
      siteName: 'Anytime Markdown',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function Page() {
  return <PressBody />;
}
