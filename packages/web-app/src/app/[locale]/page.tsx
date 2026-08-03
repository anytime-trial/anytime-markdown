import type { Metadata } from 'next';

import { buildAlternates, localeHref, toLocale } from '../../lib/localeAlternates';
import { PressBody } from './press/PressBody';

const TITLE = 'Caravan Press · Anytime Markdown';
const DESCRIPTION =
  'A newspaper-press dispatch of Anytime Markdown — slow writing, by design. Browser-only markdown editor for Spec-Driven Development.';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).locale);

  return {
    // ランディングは独自のブランド表記を使うため、ルート layout の template を適用しない
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: buildAlternates('/', locale),
    openGraph: {
      type: 'website',
      url: localeHref('/', locale),
      title: TITLE,
      description: DESCRIPTION,
      siteName: 'Anytime Markdown',
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
    },
  };
}

export default function Page() {
  return <PressBody />;
}
