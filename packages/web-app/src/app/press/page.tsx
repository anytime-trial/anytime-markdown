import type { Metadata } from 'next';

import { PressBody } from './PressBody';

const TITLE = 'Caravan Press · Anytime Markdown';
const DESCRIPTION =
  'A newspaper-press dispatch of Anytime Markdown — slow writing, by design. Browser-only markdown editor for Spec-Driven Development.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/press' },
  openGraph: {
    type: 'website',
    url: '/press',
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

export default function PressPage() {
  return <PressBody />;
}
